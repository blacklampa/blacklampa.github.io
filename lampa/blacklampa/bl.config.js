(function () {
  'use strict';

  // Centralized configuration for the whole BlackLampa subsystem.
  // All tunables (timeouts, flags, keys, limits) must live here and be read via BL.Config.

  var BL = window.BL = window.BL || {};
  BL.Config = BL.Config || {};

  // Preferred accessor (kept stable for all BL modules).
  // NOTE: BL.Config is both an object (storage) and a namespace for helpers.
  if (typeof BL.Config.get !== 'function') {
    BL.Config.get = function () { return BL.Config; };
  }

  function ensureObj(root, key) {
    try {
      var v = root[key];
      if (v && typeof v === 'object' && !Array.isArray(v)) return v;
    } catch (_) { }
    root[key] = {};
    return root[key];
  }

  function setDefault(obj, key, value) {
    try {
      if (obj[key] === undefined || obj[key] === null) obj[key] = value;
    } catch (_) { }
  }

  var cfg = BL.Config;

  var ui = ensureObj(cfg, 'ui');
  var log = ensureObj(cfg, 'log');
  var auth = ensureObj(cfg, 'auth');
  var preload = ensureObj(cfg, 'preload');
  var autoplugin = ensureObj(cfg, 'autoplugin');
  var storage = ensureObj(cfg, 'storage');

  // UI (popup logger)
  setDefault(ui, 'popupZIndex', 2147483647);
  setDefault(ui, 'popupInsetPx', 5);
  setDefault(ui, 'popupBorderRadiusPx', 12);
  setDefault(ui, 'popupProgressHeightPx', 2);
  setDefault(ui, 'popupScrollTolPx', 40);

  // Logging
  // Legacy numeric alias for popup mode (0=silent, 1=popup).
  // Runtime value is updated by BL.Log.setMode()/init() from localStorage['bl_log_mode_v1'].
  // IMPORTANT: LOG_MODE must NOT be used as "logging enabled" gate; logs are always recorded.
  setDefault(cfg, 'LOG_MODE', 0);
  setDefault(log, 'titlePrefix', 'BlackLampa log');
  setDefault(log, 'popupMs', 5000);
  setDefault(log, 'maxLines', 120);
  // IMPORTANT:
  // - showThrottleMs controls ONLY popup lifetime re-arming on bursts.
  // - for instant log visibility it must be 0 (no throttling).
  setDefault(log, 'showThrottleMs', 0);
  // When true, each log line is appended to DOM immediately (no queue/flush).
  setDefault(log, 'domImmediate', true);

  // Legacy aliases (kept for older code paths).
  setDefault(ui, 'popupMs', log.popupMs);
  setDefault(log, 'immediate', log.domImmediate);

  // Auth
  // NOTE: key name is legacy; kept for compatibility (do not change without migration).
  setDefault(auth, 'key', 'msx_fake_auth_ok_v2');
  setDefault(auth, 'authJson', '/lampa/blacklampa/bl.auth.json');

  // Preload
  setDefault(preload, 'jsonFile', 'bl.preload.json');
  // NOTE: keys are legacy; kept for compatibility.
  setDefault(preload, 'appliedFlagKey', 'msx_preload_applied_v1');
  setDefault(preload, 'fallbackJsonKey', 'msx_preload_json_v1');

  // AutoPlugin
  setDefault(autoplugin, 'jsonFile', 'bl.autoplugin.json');
  setDefault(autoplugin, 'doneFallbackMs', 30000);
  var apFlags = ensureObj(autoplugin, 'flags');
  setDefault(apFlags, 'done', 'ap_installer_done_v1');
  setDefault(apFlags, 'sig', 'ap_installer_sig_v1');
  setDefault(apFlags, 'ts', 'ap_installer_ts_v1');

  // AutoPlugin Settings UI (component ids must be stable for navigation)
  var apUi = ensureObj(autoplugin, 'settings');
  setDefault(apUi, 'componentId', 'bl_autoplugin');
  setDefault(apUi, 'extrasComponentId', 'bl_autoplugin_extras');
  setDefault(apUi, 'extraPluginComponentPrefix', 'bl_autoplugin_extras_plugin_');

  // Plugins Installer Settings UI (separate from AutoPlugin business logic)
  var pluginsInstaller = ensureObj(cfg, 'pluginsInstaller');
  var piUi = ensureObj(pluginsInstaller, 'settings');
  // By default keep the same componentId to avoid extra top-level settings пункты.
  setDefault(piUi, 'componentId', apUi.componentId);
  setDefault(piUi, 'name', 'BlackLampa Installer');
  setDefault(piUi, 'icon', '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm1 14.5h-2v-2h2v2zm0-4h-2V6h2v6.5z" fill="currentColor"/></svg>');

  // Storage guards
  setDefault(storage, 'pluginsBlacklistKey', 'plugins_blacklist');
  setDefault(storage, 'pluginsBlacklistEmpty', '[]');
  setDefault(storage, 'pluginsBlacklistWatchdogMs', 2000);

  // ============================================================================
  // Performance / diagnostics flags (disabled by default)
  //
  // NET_HOOK_WS:
  // - 0 (default): do NOT hook WebSocket at all (best perf, safest)
  // - 1: allow WebSocket hook (optional, off by default)
  //
  // PERF_DEBUG:
  // - 0 (default): no perf timers/prints
  // - 1: periodic perf stats to clean console (every ~2s)
  // ============================================================================
  setDefault(cfg, 'NET_HOOK_WS', 0);
  setDefault(cfg, 'PERF_DEBUG', 0);

  // Short alias: BL.cfg.* (LOG_MODE is legacy popup-mode numeric; do NOT use as "logging enabled" gate).
  try { BL.cfg = cfg; } catch (_) { }
})();
