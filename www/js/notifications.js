// js/notifications.js — Capacitor v4.0
// Islamic Notification System for @capacitor/local-notifications
// Falls back to Web Notification API when running in a browser.

const NotificationSystem = {

  // ========== CONFIG ==========
  config: {
    preReminderMinutes: 10,
    quietHoursStart: 23,
    quietHoursEnd: 5,
    scheduleDays: 7          // schedule notifications for next N days at a time
  },

  // ========== SETTINGS ==========
  // All default to true for maximum notifications — user can opt-out
  // quietHours defaults to false so users don't miss prayers at night
  settings: {
    enabled: true,
    prayerTimes: true,
    azkarMorning: true,
    azkarEvening: true,
    fridayKahf: true,
    preReminders: true,
    quietHours: false,         // Changed from true - let notifications through at night
    autoLocation: true,
    streakReminders: true,
    pushEnabled: false
  },

  // ========== STATE ==========
  state: {
    streak: 0,
    lastActive: null,
    triggers: {}             // used for web-mode dedup only
  },

  defaultTimes: {
    fajr:    { hour: 5,  minute: 0,  name: 'الفجر'  },
    dhuhr:   { hour: 12, minute: 30, name: 'الظهر'  },
    asr:     { hour: 15, minute: 30, name: 'العصر'  },
    maghrib: { hour: 18, minute: 30, name: 'المغرب' },
    isha:    { hour: 20, minute: 0,  name: 'العشاء' }
  },

  prayerTimes: null,
  isNative: false,           // true when running inside Capacitor Android/iOS
  LN: null,                  // LocalNotifications plugin handle
  checkInterval: null,

  // ========== INIT ==========
  async init() {
    console.log('🔔 NotificationSystem v4.0 — init');

    // prayerTimes can't be spread in object literal (this is undefined there)
    if (!this.prayerTimes) this.prayerTimes = { ...this.defaultTimes };

    this.detectEnvironment();
    this.loadState();
    this.updateStreak();

    if (this.isNative && this.LN) {
      await this.initNativeMode();
    } else {
      await this.initWebMode();
    }
    console.log('✅ NotificationSystem ready');
  },

  // ========== ENVIRONMENT DETECTION ==========
  detectEnvironment() {
    // isNativePlatform() returns true when inside Capacitor Android/iOS
    this.isNative = !!(
      window.Capacitor &&
      window.Capacitor.isNativePlatform &&
      window.Capacitor.isNativePlatform()
    );

    // LocalNotifications plugin handle (set by @capacitor/local-notifications UMD)
    this.LN = window.capacitorLocalNotifications
            ? window.capacitorLocalNotifications.LocalNotifications
            : null;

    // Also try window.Capacitor.Plugins.LocalNotifications as fallback
    if (!this.LN && window.Capacitor && window.Capacitor.Plugins) {
      this.LN = window.Capacitor.Plugins.LocalNotifications || null;
    }

    console.log('📱 isNative:', this.isNative, '| LocalNotifications:', !!this.LN);
  },

  // ========== NATIVE (CAPACITOR) MODE ==========
  async initNativeMode() {
    console.log('📱 Native notification mode (LocalNotifications)');

    // Request permission
    try {
      const perm = await this.LN.requestPermissions();
      if (perm.display !== 'granted') {
        console.warn('⚠️ Notification permission denied');
        this.settings.enabled = false;
        this.saveState();
        return;
      }
    } catch (e) {
      console.warn('⚠️ requestPermissions failed:', e.message);
    }

    // Create Android notification channels
    await this.createChannels();

    // Calculate prayer times then schedule
    await this.initPrayerTimes();
    if (this.settings.enabled) {
      await this.scheduleAllNotifications();
    }
  },

  async createChannels() {
    if (!this.LN.createChannel) return;
    const channels = [
      {
        id: 'prayer',
        name: 'أوقات الصلاة',
        description: 'تنبيهات الأذان',
        importance: 5,
        vibration: true,
        visibility: 1
      },
      {
        id: 'azkar',
        name: 'الأذكار اليومية',
        description: 'تذكيرات أذكار الصباح والمساء',
        importance: 4,
        vibration: true
      },
      {
        id: 'reminders',
        name: 'تذكيرات عامة',
        description: 'تذكيرات يومية متنوعة',
        importance: 3
      }
    ];
    for (const ch of channels) {
      try {
        await this.LN.createChannel(ch);
      } catch (e) {
        // channel may already exist — not a fatal error
      }
    }
    console.log('✅ Notification channels ready');
  },

  // ========== WEB (BROWSER) MODE ==========
  async initWebMode() {
    console.log('🌐 Web notification mode (Notification API)');
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
      await Notification.requestPermission();
    }
    await this.initPrayerTimes();
    // Poll every 30s to fire browser notifications
    if (this.checkInterval) clearInterval(this.checkInterval);
    this.checkInterval = setInterval(() => this.checkAndNotifyWeb(), 30000);
    this.checkAndNotifyWeb();
  },

  // ========== PRAYER TIME CALCULATION ==========
  async initPrayerTimes() {
    // Try main app coords first, then qibla coords
    let lat = parseFloat(localStorage.getItem('prayer_lat'));
    let lng = parseFloat(localStorage.getItem('prayer_lng'));

    // Fallback to qibla location if main coords missing
    if (isNaN(lat) || isNaN(lng) || lat === 0) {
      lat = parseFloat(localStorage.getItem('last_lat'));
      lng = parseFloat(localStorage.getItem('last_lng'));
    }

    if (lat && lng) {
      this.calcWithAdhan(lat, lng);
      return;
    }

    // Try to get location if autoLocation is on
    if (this.settings.autoLocation) {
      await this.detectAndSaveLocation();
    }

    // Load from cache if adhan calc didn't produce fresh times
    if (!this.prayerTimes._fresh) {
      const cached = localStorage.getItem('prayerTimes');
      if (cached) {
        try { this.prayerTimes = { ...this.defaultTimes, ...JSON.parse(cached) }; } catch (e) {}
      }
    }
  },

  // Use adhan.js (loaded globally in the page) for precise prayer time calculation
  calcWithAdhan(lat, lng, forDate) {
    if (!window.adhan) { console.warn('⚠️ adhan.js not loaded'); return false; }
    try {
      const date   = forDate || new Date();
      const coords = new adhan.Coordinates(lat, lng);
      const params = this.adhanParams();
      const pt     = new adhan.PrayerTimes(coords, date, params);

      const snap = {
        fajr:    { hour: pt.fajr.getHours(),    minute: pt.fajr.getMinutes(),    name: 'الفجر'  },
        dhuhr:   { hour: pt.dhuhr.getHours(),   minute: pt.dhuhr.getMinutes(),   name: 'الظهر'  },
        asr:     { hour: pt.asr.getHours(),     minute: pt.asr.getMinutes(),     name: 'العصر'  },
        maghrib: { hour: pt.maghrib.getHours(), minute: pt.maghrib.getMinutes(), name: 'المغرب' },
        isha:    { hour: pt.isha.getHours(),     minute: pt.isha.getMinutes(),    name: 'العشاء' },
        _fresh:  true
      };

      if (!forDate) {
        this.prayerTimes = snap;
        localStorage.setItem('prayerTimes', JSON.stringify(snap));
      }
      return snap;
    } catch (e) {
      console.error('❌ adhan.js error:', e);
      return null;
    }
  },

  adhanParams() {
    const map = { MWL: 'MuslimWorldLeague', UmmAlQura: 'UmmAlQura', Egypt: 'Egyptian', Karachi: 'Karachi' };
    const method = map[localStorage.getItem('calcMethod') || 'MWL'] || 'MuslimWorldLeague';
    const params = adhan.CalculationMethod[method]();
    params.madhab = adhan.Madhab.Shafi;
    return params;
  },

  async detectAndSaveLocation() {
    // Use standard navigator.geolocation (works in Capacitor WebView too)
    if (!navigator.geolocation) return;
    try {
      const pos = await new Promise((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true, timeout: 8000
        })
      );
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      localStorage.setItem('prayer_lat', lat);
      localStorage.setItem('prayer_lng', lng);
      this.calcWithAdhan(lat, lng);
    } catch (e) {
      console.warn('⚠️ Geolocation failed:', e.message);
    }
  },

  // ========== SCHEDULE ALL NATIVE NOTIFICATIONS ==========
  async scheduleAllNotifications() {
    if (!this.settings.enabled || !this.LN) return;

    await this.cancelAllNotifications();

    let lat = parseFloat(localStorage.getItem('prayer_lat'));
    let lng = parseFloat(localStorage.getItem('prayer_lng'));
    // Fallback to qibla location if main coords missing
    if (isNaN(lat) || isNaN(lng) || lat === 0) {
      lat = parseFloat(localStorage.getItem('last_lat'));
      lng = parseFloat(localStorage.getItem('last_lng'));
    }
    const hasCoords = !isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0;
    const notifications = [];
    const now = new Date();

    for (let day = 0; day < this.config.scheduleDays; day++) {
      const date = new Date(now);
      date.setDate(date.getDate() + day);
      date.setHours(0, 0, 0, 0);

      // Calculate prayer times for this day
      let dayTimes;
      if (hasCoords && window.adhan) {
        dayTimes = this.calcWithAdhan(lat, lng, date);
      }
      dayTimes = dayTimes || this.prayerTimes;

      // ── Prayer time notifications ──────────────────────────────
      if (this.settings.prayerTimes) {
        const prayerOrder = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
        for (const key of prayerOrder) {
          const prayer = dayTimes[key];
          if (!prayer) continue;

          const prayerAt = new Date(date);
          prayerAt.setHours(prayer.hour, prayer.minute, 0, 0);
          if (prayerAt <= now) continue;   // skip past times

          // Skip quiet hours for non-Fajr prayers (Fajr at dawn is intentional)
          if (key !== 'fajr' && this.isDuringQuietHours(prayerAt)) continue;

          notifications.push({
            id: this.notifId('prayer', key, day),
            title: `🕌 حان وقت ${prayer.name}`,
            body: `الآن وقت صلاة ${prayer.name} — حي على الصلاة`,
            schedule: { at: prayerAt, allowWhileIdle: true },
            channelId: 'prayer',
            smallIcon: 'ic_stat_icon_config_sample',
            iconColor: '#10B981',
            extra: { type: 'prayer', prayer: key }
          });

          // Pre-prayer reminder (10 min before)
          if (this.settings.preReminders) {
            const preAt = new Date(prayerAt.getTime() - this.config.preReminderMinutes * 60000);
            if (preAt > now) {
              notifications.push({
                id: this.notifId('pre', key, day),
                title: `⏰ تذكير: ${prayer.name}`,
                body: `باقي ${this.config.preReminderMinutes} دقائق على أذان ${prayer.name}`,
                schedule: { at: preAt, allowWhileIdle: true },
                channelId: 'prayer',
                smallIcon: 'ic_stat_icon_config_sample',
                iconColor: '#10B981',
                extra: { type: 'prayer_pre', prayer: key }
              });
            }
          }
        }
      }

      // ── Morning azkar (6:30 AM) ────────────────────────────────
      if (this.settings.azkarMorning) {
        const at = new Date(date); at.setHours(6, 30, 0, 0);
        if (at > now) {
          notifications.push({
            id: this.notifId('azkar', 'morning', day),
            title: '🌅 أذكار الصباح',
            body: 'اللهم بك أصبحنا — ابدأ يومك بالأذكار',
            schedule: { at, allowWhileIdle: true },
            channelId: 'azkar',
            smallIcon: 'ic_stat_icon_config_sample',
            iconColor: '#10B981',
            extra: { type: 'azkar_morning', url: 'azkar.html?type=morning' }
          });
        }
      }

      // ── Evening azkar (4:30 PM) ────────────────────────────────
      if (this.settings.azkarEvening) {
        const at = new Date(date); at.setHours(16, 30, 0, 0);
        if (at > now) {
          notifications.push({
            id: this.notifId('azkar', 'evening', day),
            title: '🌙 أذكار المساء',
            body: 'اللهم بك أمسينا — اختتم يومك بالأذكار',
            schedule: { at, allowWhileIdle: true },
            channelId: 'azkar',
            smallIcon: 'ic_stat_icon_config_sample',
            iconColor: '#10B981',
            extra: { type: 'azkar_evening', url: 'azkar.html?type=night' }
          });
        }
      }

      // ── Friday Kahf reminder (9:00 AM on Fridays) ─────────────
      if (this.settings.fridayKahf && date.getDay() === 5) {
        const at = new Date(date); at.setHours(9, 0, 0, 0);
        if (at > now) {
          notifications.push({
            id: this.notifId('friday', 'kahf', day),
            title: '🕋 يوم الجمعة المبارك',
            body: 'لا تنسَ قراءة سورة الكهف اليوم',
            schedule: { at, allowWhileIdle: true },
            channelId: 'reminders',
            smallIcon: 'ic_stat_icon_config_sample',
            iconColor: '#10B981',
            extra: { type: 'friday_kahf', url: 'quran.html?surah=18' }
          });
        }
      }

      // ── Daily streak reminder (9:00 PM) ───────────────────────
      if (this.settings.streakReminders) {
        const at = new Date(date); at.setHours(21, 0, 0, 0);
        if (at > now) {
          notifications.push({
            id: this.notifId('streak', 'day', day),
            title: '🔥 حافظ على استمراريتك!',
            body: `لديك ${this.state.streak} يوم متتالي — افتح التطبيق الآن`,
            schedule: { at, allowWhileIdle: true },
            channelId: 'reminders',
            smallIcon: 'ic_stat_icon_config_sample',
            iconColor: '#10B981',
            extra: { type: 'streak', url: 'index.html' }
          });
        }
      }
    }

    if (notifications.length === 0) {
      console.log('ℹ️ No notifications to schedule (all past or disabled)');
      return;
    }

    try {
      await this.LN.schedule({ notifications });
      console.log(`✅ Scheduled ${notifications.length} notifications for next ${this.config.scheduleDays} days`);
    } catch (e) {
      console.error('❌ schedule() failed:', e);
    }
  },

  // Unique integer ID per notification slot (Capacitor requires integer IDs)
  notifId(type, key, day) {
    const typeCode = { prayer: 1, pre: 2, azkar: 3, friday: 4, streak: 5 }[type] || 9;
    const keyCode  = { fajr: 0, dhuhr: 1, asr: 2, maghrib: 3, isha: 4,
                       morning: 5, evening: 6, kahf: 7, day: 8 }[key] || 9;
    return day * 100 + typeCode * 10 + keyCode;   // max = 6*100+9*10+9 = 699
  },

  async cancelAllNotifications() {
    if (!this.LN) return;
    try {
      const { notifications } = await this.LN.getPending();
      if (notifications && notifications.length > 0) {
        await this.LN.cancel({ notifications });
        console.log(`🗑️ Cancelled ${notifications.length} pending notifications`);
      }
    } catch (e) {
      console.warn('⚠️ cancelAllNotifications failed:', e.message);
    }
  },

  // ========== WEB MODE — POLLING FALLBACK ==========
  checkAndNotifyWeb() {
    if (!this.settings.enabled) return;
    if (Notification.permission !== 'granted') return;

    const now  = new Date();
    const h    = now.getHours();
    const cur  = h * 60 + now.getMinutes();

    // Prayer times
    if (this.settings.prayerTimes && this.prayerTimes) {
      for (const [key, prayer] of Object.entries(this.prayerTimes)) {
        if (key === '_fresh') continue;
        const pm = prayer.hour * 60 + prayer.minute;
        if (this.settings.preReminders && cur === pm - this.config.preReminderMinutes && this.shouldTrigger(`pre-${key}`)) {
          this.webNotify(`⏰ تذكير: ${prayer.name}`, `باقي ${this.config.preReminderMinutes} دقائق على أذان ${prayer.name}`);
          this.markTriggered(`pre-${key}`);
        }
        if (cur === pm && this.shouldTrigger(key)) {
          this.webNotify(`🕌 حان وقت ${prayer.name}`, `الآن وقت صلاة ${prayer.name}`);
          this.markTriggered(key);
        }
      }
    }
    if (this.settings.azkarMorning && h >= 4 && h < 8 && this.shouldTrigger('azkar-morning')) {
      this.webNotify('🌅 أذكار الصباح', 'ابدأ يومك بالأذكار');
      this.markTriggered('azkar-morning');
    }
    if (this.settings.azkarEvening && h >= 15 && h < 18 && this.shouldTrigger('azkar-evening')) {
      this.webNotify('🌙 أذكار المساء', 'اختتم يومك بالأذكار');
      this.markTriggered('azkar-evening');
    }
    if (this.settings.fridayKahf && now.getDay() === 5 && h >= 6 && h < 10 && this.shouldTrigger('friday-kahf')) {
      this.webNotify('🕋 يوم الجمعة المبارك', 'اقرأ سورة الكهف اليوم');
      this.markTriggered('friday-kahf');
    }
  },

  webNotify(title, body) {
    if (this.isQuietHours()) return;
    try { new Notification(title, { body, icon: './icons/icon-192.png', tag: 'zad-muslim' }); }
    catch (e) { console.warn('webNotify failed:', e); }
  },

  // ========== QUIET HOURS ==========
  isQuietHours() {
    if (!this.settings.quietHours) return false;
    const h = new Date().getHours();
    return h >= this.config.quietHoursStart || h < this.config.quietHoursEnd;
  },

  isDuringQuietHours(date) {
    if (!this.settings.quietHours) return false;
    const h = date.getHours();
    return h >= this.config.quietHoursStart || h < this.config.quietHoursEnd;
  },

  // ========== TRIGGER DEDUP (web mode only) ==========
  shouldTrigger(key) {
    return this.state.triggers[key] !== new Date().toDateString();
  },
  markTriggered(key) {
    this.state.triggers[key] = new Date().toDateString();
    this.saveState();
  },

  // ========== STATE ==========
  loadState() {
    try {
      const s = localStorage.getItem('notificationSettings');
      if (s) {
        this.settings = { ...this.settings, ...JSON.parse(s) };
      } else {
        // First time user - save defaults
        this.saveState();
      }

      const t = localStorage.getItem('prayerTimes');
      if (t) this.prayerTimes = { ...this.defaultTimes, ...JSON.parse(t) };

      const st = localStorage.getItem('notificationState');
      if (st) this.state = { ...this.state, ...JSON.parse(st) };
    } catch (e) {
      console.warn('⚠️ State load failed:', e);
    }
  },

  saveState() {
    localStorage.setItem('notificationSettings', JSON.stringify(this.settings));
    localStorage.setItem('notificationState',    JSON.stringify(this.state));
  },

  updateStreak() {
    const today = new Date().toDateString();
    if (this.state.lastActive === today) return;
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    this.state.streak = (this.state.lastActive === yesterday.toDateString())
      ? (this.state.streak || 0) + 1
      : (this.state.lastActive ? 1 : this.state.streak || 1);
    this.state.lastActive = today;
    this.saveState();
  },

  // ========== PUBLIC API ==========
  toggleSetting(key, value) {
    if (!(key in this.settings)) return;
    this.settings[key] = value;
    this.saveState();
    // Reschedule native notifications whenever a setting changes
    if (this.isNative && this.LN) {
      this.scheduleAllNotifications().catch(console.error);
    }
  },

  async refreshPrayerTimes() {
    let lat = parseFloat(localStorage.getItem('prayer_lat'));
    let lng = parseFloat(localStorage.getItem('prayer_lng'));
    // Fallback to qibla location
    if (isNaN(lat) || isNaN(lng) || lat === 0) {
      lat = parseFloat(localStorage.getItem('last_lat'));
      lng = parseFloat(localStorage.getItem('last_lng'));
    }
    if (!isNaN(lat) && !isNaN(lng) && lat !== 0) {
      this.calcWithAdhan(lat, lng);
    } else {
      await this.detectAndSaveLocation();
    }
    if (this.isNative && this.LN) {
      await this.scheduleAllNotifications();
    }
  },

  // showNotification: fire one immediate notification (test / manual trigger)
  async showNotification(title, options = {}) {
    if (!this.settings.enabled) return;
    if (this.isQuietHours() && !options.forceQuiet) return;

    if (this.isNative && this.LN) {
      try {
        await this.LN.schedule({
          notifications: [{
            id: Math.floor(Math.random() * 9000) + 1000,
            title,
            body: options.body || '',
            schedule: { at: new Date(Date.now() + 500), allowWhileIdle: true },
            channelId: options.channelId || 'reminders',
            smallIcon: 'ic_stat_icon_config_sample',
            iconColor: '#10B981',
            extra: options.data || {}
          }]
        });
      } catch (e) { console.error('showNotification (native) failed:', e); }
    } else {
      this.webNotify(title, options.body || '');
    }
  },

  // ========== DEBUG ==========
  async checkStatus() {
    const status = {
      isNative:      this.isNative,
      LN_available:  !!this.LN,
      settings:      this.settings,
      streak:        this.state.streak,
      prayer_lat:    localStorage.getItem('prayer_lat'),
      prayer_lng:    localStorage.getItem('prayer_lng'),
      prayerTimes:   this.prayerTimes
    };
    if (this.LN) {
      try {
        const perm    = await this.LN.checkPermissions();
        const pending = await this.LN.getPending();
        status.permission    = perm.display;
        status.pendingCount  = pending.notifications ? pending.notifications.length : 0;
      } catch (e) {}
    }
    console.table(status);
    return status;
  },

  testPush() {
    return this.showNotification('🧪 اختبار الإشعارات', {
      body: 'نظام الإشعارات يعمل بكفاءة! ✅',
      forceQuiet: true,
      data: { type: 'test' }
    });
  }
};

// ========== BOOT ==========
// Capacitor fires 'deviceready' via cordova compat layer.
// We listen for it; if it fires we know native plugins are ready.
// Also init on DOMContentLoaded so it works in browser too.

let _initiated = false;
function _bootNotifications() {
  if (_initiated) return;
  _initiated = true;
  NotificationSystem.init().catch(e => console.error('NotificationSystem init error:', e));
}

document.addEventListener('deviceready', _bootNotifications, false);

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function () {
    // Small delay so native-bridge + plugin UMDs are fully initialised
    setTimeout(_bootNotifications, 300);
  });
} else {
  setTimeout(_bootNotifications, 300);
}

// ========== DEV CONSOLE ==========
window.NotificationDebug = {
  status:   () => NotificationSystem.checkStatus(),
  test:     () => NotificationSystem.testPush(),
  times:    () => NotificationSystem.prayerTimes,
  settings: () => NotificationSystem.settings,
  state:    () => NotificationSystem.state,
  schedule: () => NotificationSystem.scheduleAllNotifications()
};
