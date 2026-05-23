```markdown
# 🛠️ Native App Fixes Checklist (Zad Al-Muslim)

This checklist covers all the Native/Android specific adjustments required after wrapping the PWA with Capacitor.

---

## 📦 1. Install Required Native Plugins
To interact with Android hardware (Back button, Location, Dialogs), install these core Capacitor plugins in your terminal (`cli` folder):
```bash
npm install @capacitor/app @capacitor/dialog @capacitor/geolocation
npx cap sync android

```
## 🔐 2. Fix Permissions (Location & Notifications)
**Issue:** Location not requested, Notifications blocked by Android 13+.
**Fix:** Open android/app/src/main/AndroidManifest.xml and add these lines just before the </manifest> tag:
```xml
    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
    
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>
    <uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" />

```
## 🧭 3. Fix Hardware Back Button & Exit Confirmation
**Issue:** Back button exits immediately. Exit confirmation is missing.
**Fix:** In your js/capacitor-notifications.js (or a new native-init.js linked to all pages), add this Vanilla JS logic:
```javascript
import { App } from '@capacitor/app';
import { Dialog } from '@capacitor/dialog';

App.addListener('backButton', async ({ canGoBack }) => {
    // If we are not on the homepage, go back in history
    if (window.location.pathname !== '/' && window.location.pathname !== '/index.html') {
        window.history.back();
    } else {
        // If on homepage, show native exit confirmation
        const { value } = await Dialog.confirm({
            title: 'الخروج من التطبيق',
            message: 'هل تريد الخروج من زاد المسلم؟',
            okButtonTitle: 'نعم',
            cancelButtonTitle: 'إلغاء'
        });
        
        if (value) {
            App.exitApp();
        }
    }
});

```
## 📏 4. Fix UI Padding (Safe Area)
**Issue:** Content hidden behind status bar in azkar, audio, and masbaha.
**Fix:** Android native apps draw *behind* the status bar. Add this CSS to your css/style.css:
```css
/* Target the body or main container of those specific pages */
body {
    /* Uses the native OS safe area, defaults to 20px/40px if not available */
    padding-top: env(safe-area-inset-top, 40px) !important;
    padding-bottom: env(safe-area-inset-bottom, 20px) !important;
}

/* Optional: Fix faded SVG icons */
.svg-icon, .nav-icon {
    fill: currentColor; /* Inherits the text color */
    opacity: 1 !important;
    width: 24px;
    height: 24px;
}

```
## 💾 5. Fix Notification Toggle State (Persist State)
**Issue:** Toggle shows as deactivated on reopen.
**Fix:** In notifications.html (or its JS file), you must read the saved state from localStorage when the page loads.
```javascript
document.addEventListener('DOMContentLoaded', () => {
    const toggleInput = document.getElementById('notification-toggle');
    
    // 1. Read state on load
    const isEnabled = localStorage.getItem('notificationsEnabled') === 'true';
    toggleInput.checked = isEnabled;
    
    // 2. Save state on change
    toggleInput.addEventListener('change', (e) => {
        localStorage.setItem('notificationsEnabled', e.target.checked);
        // Call your activation/deactivation function here
    });
});

```
## 🌍 6. Fix Geolocation (Qibla Setup)
**Issue:** Qibla page cannot access location.
**Fix:** Before asking for coordinates in your Qibla JS, explicitly request Native permissions:
```javascript
import { Geolocation } from '@capacitor/geolocation';

async function getNativeLocation() {
    // 1. Request Permission explicitly
    const permission = await Geolocation.requestPermissions();
    
    if (permission.location === 'granted') {
        // 2. Get Location
        const coordinates = await Geolocation.getCurrentPosition();
        console.log('Lat:', coordinates.coords.latitude);
        console.log('Lng:', coordinates.coords.longitude);
        // Pass to your Qibla calculation function
    } else {
        alert("يرجى تفعيل إذن الموقع لمعرفة اتجاه القبلة");
    }
}

```
## 🔙 7. Add Missing Back Button (Qibla UI)
**Issue:** No way to go back from Qibla HTML.
**Fix:** Add your standard top navbar inside qibla.html body:
```html
<header class="top-header">
    <button onclick="window.history.back()" class="back-btn">
        <svg viewBox="0 0 24 24" width="24" height="24"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" fill="currentColor"/></svg>
    </button>
    <h1>القبلة</h1>
</header>

```
### 🔄 Final Step
After making these changes to HTML/CSS/JS and AndroidManifest.xml, always run:
```bash
npx cap sync android
cd android
.\gradlew.bat assembleDebug

```
```

