(function () {
  'use strict';

  var BL = window.BL = window.BL || {};
  BL.Storage = BL.Storage || {};
  BL.Storage.Guards = BL.Storage.Guards || {};

  function lsGet(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, String(v)); } catch (_) { } }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (_) { } }

  var LS_GUARDED_LEGACY_KEY = '__ap_bl_guarded';
  var LS_GUARDED_KEY = 'blacklampa_ap_bl_guarded_v1';

  (function migrateGuardedKeyOnce() {
    try {
      var legacy = lsGet(LS_GUARDED_LEGACY_KEY);
      if (legacy === null || legacy === undefined) return;
      var cur = lsGet(LS_GUARDED_KEY);
      if (cur === null || cur === undefined) lsSet(LS_GUARDED_KEY, legacy);
      lsDel(LS_GUARDED_LEGACY_KEY);
    } catch (_) { }
  })();

  BL.Storage.lsGet = lsGet;
  BL.Storage.lsSet = lsSet;
  BL.Storage.lsDel = lsDel;

  // Centralized config (single source of truth).
  var cfg = null;
  try { cfg = (BL.Config && typeof BL.Config.get === 'function') ? BL.Config.get() : BL.Config; } catch (_) { cfg = BL.Config; }
  cfg = cfg || {};
  var storageCfg = (cfg.storage && typeof cfg.storage === 'object') ? cfg.storage : {};
  var LS_PLUGINS_BLACKLIST_KEY = String(storageCfg.pluginsBlacklistKey || '');
  var LS_PLUGINS_BLACKLIST_EMPTY = String(storageCfg.pluginsBlacklistEmpty || ''); // важно: обычно там JSON-строка массива
  var LS_PLUGINS_BLACKLIST_WATCHDOG_MS = (typeof storageCfg.pluginsBlacklistWatchdogMs === 'number') ? storageCfg.pluginsBlacklistWatchdogMs : 0;

  function logCall(log, method, source, message, extra) {
    try {
      if (!log) return;
      var fn = log[method];
      if (typeof fn === 'function') fn.call(log, source, message, extra);
    } catch (_) { }
  }

  function getLogModeFast() {
    try { if (BL.cfg && typeof BL.cfg.LOG_MODE === 'number') return BL.cfg.LOG_MODE || 0; } catch (_) { }
    try { if (BL.Log && typeof BL.Log.mode === 'function') return BL.Log.mode() || 0; } catch (_) { }
    return 0;
  }

  // Logging is always recorded (ring buffer). Mode only affects auto-popup/UI.
  function isLogEnabledFast() { return true; }

  function clearPluginsBlacklist(reason, log) {
    try {
      if (!LS_PLUGINS_BLACKLIST_KEY) return;
      if (!LS_PLUGINS_BLACKLIST_EMPTY) return;
      var cur = null;
      try { cur = localStorage.getItem(LS_PLUGINS_BLACKLIST_KEY); } catch (_) { }
      if (cur !== null && cur !== LS_PLUGINS_BLACKLIST_EMPTY) {
        try { localStorage.setItem(LS_PLUGINS_BLACKLIST_KEY, LS_PLUGINS_BLACKLIST_EMPTY); } catch (_) { }
        if (isLogEnabledFast()) logCall(log, 'showOk', 'LS', 'plugins_blacklist cleared', String(reason || ''));
      } else if (cur === null) {
        // если ключа нет — создаём пустой, чтобы код, ожидающий строку, не падал
        try { localStorage.setItem(LS_PLUGINS_BLACKLIST_KEY, LS_PLUGINS_BLACKLIST_EMPTY); } catch (_) { }
        if (isLogEnabledFast()) logCall(log, 'showDbg', 'LS', 'plugins_blacklist seeded', String(reason || ''));
      }
    } catch (_) { }
  }

  function installPluginsBlacklistGuard(log) {
    // This guard is intentionally aggressive:
    // - `plugins_blacklist` must always be empty
    // - some environments/plugins try to rewrite it frequently (including from other tabs/frames)
    // поэтому: wipe on boot + patch setItem/removeItem/clear + storage-event + watchdog.

    // 1) очистить сразу (even if already installed)
    clearPluginsBlacklist('boot', log);

    // idempotency: this can be called from PHASE 0 boot and later from AutoPlugin.
    if (BL.Storage.Guards.__pluginsBlacklistGuardInstalled) return;
    BL.Storage.Guards.__pluginsBlacklistGuardInstalled = true;

    // 2) перехват setItem/removeItem/clear
    try {
      if (window.localStorage) {
        try {
          var curGuard = lsGet(LS_GUARDED_KEY);
          if (curGuard === null || curGuard === undefined) lsSet(LS_GUARDED_KEY, '1');
        } catch (_) { }

        var _setItem = localStorage.setItem;
        var _removeItem = localStorage.removeItem;
        var _clear = localStorage.clear;

        // setItem guard
        localStorage.setItem = function (k, v) {
	          try {
	            if (String(k) === LS_PLUGINS_BLACKLIST_KEY) {
	              // игнорируем любые попытки записать не пустое
	              if (String(v) !== LS_PLUGINS_BLACKLIST_EMPTY) {
	                if (isLogEnabledFast()) {
	                  try { logCall(log, 'showWarn', 'LS', 'blocked write plugins_blacklist', String(v)); } catch (_) { }
	                }
	              }
	              return _setItem.call(localStorage, LS_PLUGINS_BLACKLIST_KEY, LS_PLUGINS_BLACKLIST_EMPTY);
	            }
	          } catch (_) { }
          return _setItem.apply(localStorage, arguments);
        };

        // removeItem guard (не даём удалить, всегда держим пустым)
        localStorage.removeItem = function (k) {
          try {
            if (String(k) === LS_PLUGINS_BLACKLIST_KEY) {
              if (isLogEnabledFast()) logCall(log, 'showWarn', 'LS', 'blocked remove plugins_blacklist', '');
              return _setItem.call(localStorage, LS_PLUGINS_BLACKLIST_KEY, LS_PLUGINS_BLACKLIST_EMPTY);
            }
          } catch (_) { }
          return _removeItem.apply(localStorage, arguments);
        };

        // clear guard (после clear() возвращаем пустой ключ)
        localStorage.clear = function () {
          var r = _clear.apply(localStorage, arguments);
          try { _setItem.call(localStorage, LS_PLUGINS_BLACKLIST_KEY, LS_PLUGINS_BLACKLIST_EMPTY); } catch (_) { }
          if (isLogEnabledFast()) logCall(log, 'showWarn', 'LS', 'localStorage.clear detected', 're-seeded plugins_blacklist');
          return r;
        };

        if (isLogEnabledFast()) logCall(log, 'showOk', 'LS', 'plugins_blacklist guard installed', 'setItem/removeItem/clear');
      }
    } catch (_) { }

    // 2.1) Также перехватываем Storage.prototype.* (защита от обхода через prototype.call)
    try {
      if (window.Storage && Storage.prototype) {

        var _spSetItem = Storage.prototype.setItem;
        var _spRemoveItem = Storage.prototype.removeItem;
        var _spClear = Storage.prototype.clear;

        Storage.prototype.setItem = function (k, v) {
	          try {
	            if (this === localStorage && String(k) === LS_PLUGINS_BLACKLIST_KEY) {
	              if (String(v) !== LS_PLUGINS_BLACKLIST_EMPTY) {
	                if (isLogEnabledFast()) {
	                  try { logCall(log, 'showWarn', 'LS', 'blocked write plugins_blacklist (proto)', String(v)); } catch (_) { }
	                }
	              }
	              return _spSetItem.call(this, LS_PLUGINS_BLACKLIST_KEY, LS_PLUGINS_BLACKLIST_EMPTY);
	            }
	          } catch (_) { }
          return _spSetItem.apply(this, arguments);
        };

        Storage.prototype.removeItem = function (k) {
          try {
            if (this === localStorage && String(k) === LS_PLUGINS_BLACKLIST_KEY) {
              if (isLogEnabledFast()) logCall(log, 'showWarn', 'LS', 'blocked remove plugins_blacklist (proto)', '');
              return _spSetItem.call(this, LS_PLUGINS_BLACKLIST_KEY, LS_PLUGINS_BLACKLIST_EMPTY);
            }
          } catch (_) { }
          return _spRemoveItem.apply(this, arguments);
        };

        Storage.prototype.clear = function () {
          var r = _spClear.apply(this, arguments);
          try {
            if (this === localStorage) _spSetItem.call(this, LS_PLUGINS_BLACKLIST_KEY, LS_PLUGINS_BLACKLIST_EMPTY);
          } catch (_) { }
          if (this === localStorage && isLogEnabledFast()) logCall(log, 'showWarn', 'LS', 'Storage.clear detected (proto)', 're-seeded plugins_blacklist');
          return r;
        };
      }
    } catch (_) { }

    // 3) storage-event (если меняется из другого контекста)
    try {
      if (!BL.Storage.Guards.__pluginsBlacklistStorageListenerInstalled) {
        BL.Storage.Guards.__pluginsBlacklistStorageListenerInstalled = true;
        window.addEventListener('storage', function (e) {
          try {
            if (!e) return;
            if (String(e.key || '') !== LS_PLUGINS_BLACKLIST_KEY) return;
            clearPluginsBlacklist('storage-event', log);
          } catch (_) { }
        });
      }
    } catch (_) { }

		    // 4) страховка (на ТВ иногда пишут мимо наших хуков)
		    try {
		      // IMPORTANT:
		      // Watchdog is the heaviest part of the guard (timer + periodic localStorage reads).
		      // Keep it configurable and install it only once.
		      if (LS_PLUGINS_BLACKLIST_WATCHDOG_MS > 0 && !window.__ap_bl_watchdog) {
		        window.__ap_bl_watchdog = setInterval(function () {
		          clearPluginsBlacklist('watchdog', log);
		        }, LS_PLUGINS_BLACKLIST_WATCHDOG_MS);
		      }
		    } catch (_) { }
	  }

  BL.Storage.Guards.LS_PLUGINS_BLACKLIST_KEY = LS_PLUGINS_BLACKLIST_KEY;
  BL.Storage.Guards.LS_PLUGINS_BLACKLIST_EMPTY = LS_PLUGINS_BLACKLIST_EMPTY;
  BL.Storage.Guards.clearPluginsBlacklist = clearPluginsBlacklist;
  BL.Storage.Guards.installPluginsBlacklistGuard = installPluginsBlacklistGuard;
})();
