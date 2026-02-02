(function () {
  'use strict';

  // Thin facade kept for backwards compatibility.
  // Real implementation lives in:
  // - bl.menu.core.js
  // - bl.menu.registry.js
  // - bl.module.installer.js
  // - bl.module.extfilters.js

  var BL = window.BL = window.BL || {};
  BL.PluginsInstaller = BL.PluginsInstaller || {};

  var API = BL.PluginsInstaller;

  var STATE = {
    inited: false,
    opts: null
  };

  function safe(fn, fallback) { try { return fn(); } catch (_) { return fallback; } }

  function core() {
    try { return (window.BL && BL.MenuCore) ? BL.MenuCore : null; } catch (_) { return null; }
  }

  API.init = function (opts) {
    STATE.opts = opts || STATE.opts || {};

    try {
      var c = core();
      if (c && typeof c.init === 'function') c.init(STATE.opts);
      STATE.inited = true;
    } catch (_) { }
  };

  API.refresh = function () {
    try {
      var c = core();
      if (c && typeof c.refresh === 'function') return c.refresh();
    } catch (_) { }
  };

  API.open = function (route, payload, focusIndex) {
    try {
      if (!STATE.inited) API.init(STATE.opts || {});
      var c = core();
      if (c && typeof c.open === 'function') return c.open(String(route || 'root'), payload || null, focusIndex);
    } catch (_) { }
  };

  API.dispose = function () {
    // Optional: Lampa.Settings.listener.follow() does not provide an official unsubscriber in all builds.
    // Keep this as a no-op for compatibility.
  };

  API.getSettingsFocusIndexSafe = function () {
    return safe(function () {
      var c = core();
      if (c && typeof c.getSettingsFocusIndexSafe === 'function') return c.getSettingsFocusIndexSafe() || 0;
      return 0;
    }, 0);
  };
})();

