/**
 * capacitor-shim.js
 *
 * Bridges the gap between:
 *  - Capacitor Android runtime: injects native-bridge.js which sets up window.Capacitor
 *  - Capacitor plugin UMD files: expect window.capacitorExports (set by capacitor-core.js)
 *
 * Load order in HTML:
 *   1. (native-bridge.js is injected automatically by Android WebView at runtime)
 *   2. js/plugins/capacitor-core.js   ← sets up capacitorExports + window.Capacitor for browser
 *   3. js/plugins/capacitor-shim.js   ← this file: merges the two
 *   4. js/plugins/local-notifications.js ← registers LocalNotifications
 *
 * After this runs:
 *   window.capacitorExports        is available for plugin UMD files
 *   window.capacitorLocalNotifications.LocalNotifications  is the usable plugin handle
 */
(function () {
  'use strict';

  // Case 1: Running on Android — native-bridge.js was injected before any script.
  //   window.Capacitor exists and has .registerPlugin(), .nativePromise(), .Plugins etc.
  //   capacitor-core.js may have also run and set window.capacitorExports already.
  //   If capacitorExports is missing, alias it to window.Capacitor so plugin UMDs work.
  if (window.Capacitor && !window.capacitorExports) {
    window.capacitorExports = window.Capacitor;
  }

  // Case 2: Running in a browser (no native bridge) and capacitor-core.js ran.
  //   window.capacitorExports is already set by capacitor-core.js. Nothing to do.

  // Case 3: Neither exists — notifications will gracefully degrade to Web Notification API.

  // Synapse shim — required by @capacitor/geolocation plugin UMD (not used for notifications,
  // but prevents ReferenceError if geolocation plugin is ever loaded).
  if (!window.synapse && !window.outsystemsSynapse) {
    window.synapse = { exposeSynapse: function () {} };
  } else if (!window.synapse && window.outsystemsSynapse) {
    window.synapse = window.outsystemsSynapse;
  }

  // Log environment for debugging
  var isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  console.log('[CapacitorShim] Environment:', isNative ? 'Native Android/iOS' : 'Web Browser');
  console.log('[CapacitorShim] capacitorExports ready:', !!window.capacitorExports);
})();

