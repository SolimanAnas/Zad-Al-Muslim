// js/background-audio.js - Background Audio for Radio/Quran Playback
// Works with Capacitor Native Audio plugin

(function() {
  'use strict';

  const AUDIO_ASSET_ID = 'streamAudio';
  let isPlaying = false;

  // Initialize on device ready
  document.addEventListener('deviceready', initAudio, false);

  async function initAudio() {
    if (!window.NativeAudio) {
      console.log('⚠️ NativeAudio not available, using web fallback');
      return;
    }

    try {
      await window.NativeAudio.configure({
        backgroundPlayback: true,
        showNotification: true
      });
      console.log('✅ Background audio configured');
    } catch (e) {
      console.error('❌ Audio config error:', e);
    }
  }

  // ===== PUBLIC FUNCTIONS =====

  // Play radio stream (call this when clicking a station)
  window.playRadioStream = async function(url, stationName) {
    if (!window.NativeAudio) {
      // Fallback to web audio
      return playWebAudio(url);
    }

    try {
      // Stop any current stream first
      await stopRadioStream();

      // Play new stream
      await window.NativeAudio.playOnce({
        assetId: AUDIO_ASSET_ID,
        assetPath: url,
        isUrl: true,
        autoPlay: true
      });

      isPlaying = true;
      console.log('✅ Playing:', stationName);
      
      // Update UI if stationName provided
      if (stationName && typeof updateRadioUI === 'function') {
        updateRadioUI(stationName);
      }
      
    } catch (error) {
      console.error('❌ Play error:', error);
      // Fallback to web audio
      playWebAudio(url);
    }
  };

  // Stop radio stream
  window.stopRadioStream = async function() {
    if (!window.NativeAudio) {
      stopWebAudio();
      return;
    }

    try {
      await window.NativeAudio.stop({ assetId: AUDIO_ASSET_ID });
      isPlaying = false;
      console.log('✅ Audio stopped');
      
      if (typeof clearRadioUI === 'function') {
        clearRadioUI();
      }
    } catch (e) {
      console.log('Stop error:', e);
    }
  };

  // Check if audio is playing
  window.isAudioPlaying = function() {
    return isPlaying;
  };

  // ===== WEB AUDIO FALLBACK =====
  let webAudioEl = null;
  let webAudioSrc = null;

  function playWebAudio(url) {
    stopWebAudio();
    
    webAudioEl = new Audio(url);
    webAudioEl.crossOrigin = 'anonymous';
    webAudioEl.play().then(() => {
      isPlaying = true;
      console.log('✅ Web audio playing');
    }).catch(e => {
      console.error('❌ Web audio error:', e);
    });
  }

  function stopWebAudio() {
    if (webAudioEl) {
      webAudioEl.pause();
      webAudioEl.src = '';
      webAudioEl = null;
      isPlaying = false;
    }
  }

  // Auto-init
  if (document.readyState === 'complete') {
    initAudio();
  } else {
    document.addEventListener('DOMContentLoaded', initAudio);
  }

})();