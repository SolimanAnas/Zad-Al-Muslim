// js/native-init.js - Native App Initialization
// Hardware back button, dialogs, geolocation for Capacitor

(function() {
  'use strict';

  // Wait for Capacitor to be ready
  document.addEventListener('deviceready', onDeviceReady, false);

  function onDeviceReady() {
    console.log('📱 Device ready - initializing native features');
    initBackButton();
  }

  // ========== BACK BUTTON HANDLER ==========
  function initBackButton() {
    // Check if Capacitor App plugin is available
    if (!window.App) {
      console.log('⚠️ App plugin not available');
      return;
    }

    window.App.addListener('backButton', handleBackButton);
    console.log('✅ Back button listener registered');
  }

  async function handleBackButton() {
    const canGoBack = window.history.length > 1;
    const currentPage = window.location.pathname;
    const isHomePage = currentPage === '/' || 
                      currentPage === '/index.html' || 
                      currentPage.endsWith('index.html');

    // If not on homepage, go back in history
    if (!isHomePage && canGoBack) {
      window.history.back();
      return;
    }

    // If on homepage, show exit confirmation
    if (window.Dialog) {
      try {
        const result = await window.Dialog.confirm({
          title: 'الخروج من التطبيق',
          message: 'هل تريد الخروج من زاد المسلم؟',
          okButtonTitle: 'نعم',
          cancelButtonTitle: 'إلغاء'
        });

        if (result.value === true) {
          window.App.exitApp();
        }
      } catch (e) {
        // Fallback if dialog fails
        const confirmExit = confirm('هل تريد الخروج من زاد المسلم؟');
        if (confirmExit && window.App) {
          window.App.exitApp();
        }
      }
    } else {
      // Web fallback
      const confirmExit = confirm('هل تريد الخروج من زاد المسلم؟');
      if (confirmExit) {
        window.history.back();
      }
    }
  }

  // ========== GEOLOCATION HELPERS ==========
  window.getNativeLocation = async function() {
    if (!window.Geolocation) {
      console.log('⚠️ Geolocation plugin not available');
      return null;
    }

    try {
      // Request permission explicitly
      const perm = await window.Geolocation.requestPermissions();
      
      if (perm.location !== 'granted') {
        alert('يرجى تفعيل إذن الموقع لمعرفة اتجاه القبلة');
        return null;
      }

      // Get current position
      const position = await window.Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 10000
      });

      return {
        lat: position.coords.latitude,
        lng: position.coords.longitude
      };
    } catch (e) {
      console.error('Location error:', e);
      alert('تعذر الحصول على الموقع: ' + e.message);
      return null;
    }
  };

  // ========== NOTIFICATION TOGGLE STATE ==========
  window.saveNotificationState = function(enabled) {
    localStorage.setItem('notificationsEnabled', enabled ? 'true' : 'false');
  };

  window.loadNotificationState = function() {
    return localStorage.getItem('notificationsEnabled') === 'true';
  };

  // Initialize notification toggle on page load
  document.addEventListener('DOMContentLoaded', function() {
    const toggle = document.getElementById('notification-toggle');
    if (toggle) {
      // Load saved state
      toggle.checked = window.loadNotificationState();
      
      // Save on change
      toggle.addEventListener('change', function(e) {
        window.saveNotificationState(e.target.checked);
      });
    }
  });

  console.log('✅ Native initialization complete');
})();
