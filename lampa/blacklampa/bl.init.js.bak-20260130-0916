(function () {
  'use strict';

  // ============================================================================
  // BlackLampa init (early bootstrap)
  //
  // PHASED DESIGN (hard contract):
  //   PHASE 0 (early, pre-auth, pre-user)
  //     - logger
  //     - network policy (fetch/xhr/beacon/ws + CUB blacklist override)
  //     - localStorage guards (plugins_blacklist wipe/guard/watchdog + storage-event)
  //
  //   PHASE 1 (user-gated, only AFTER auth success)
  //     - preload localStorage from JSON
  //     - autoplugin install/enable/inject + settings UI + flags + reload
  //
  // NOTE:
  // - All install/patch functions must be idempotent (safe to call multiple times).
  // - Auth UI code is NOT rewritten (TV/PC/mobile focus/input behavior must stay 1:1).
  // ============================================================================

  var BL = window.BL = window.BL || {};
  BL.ctx = BL.ctx || {};
  BL.Init = BL.Init || {};

  if (BL.Init.__blInitLoaded) return;
  BL.Init.__blInitLoaded = true;

  // ----------------------------------------------------------------------------
  // User-Agent override (JS runtime only; does NOT change HTTP User-Agent header)
  // ----------------------------------------------------------------------------
  BL.UA = BL.UA || {};

  var UA_PRESETS = {
    chrome_win_latest: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    edge_win_latest: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 Edg/123.0.0.0',
    firefox_win_latest: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
    chrome_android_latest: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Mobile Safari/537.36',
    safari_ios_latest: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
  };

  var UA_META = {
    chrome_win_latest: { platform: 'Win32', vendor: 'Google Inc.', uadPlatform: 'Windows', mobile: false },
    edge_win_latest: { platform: 'Win32', vendor: 'Google Inc.', uadPlatform: 'Windows', mobile: false },
    firefox_win_latest: { platform: 'Win32', vendor: '', uadPlatform: 'Windows', mobile: false },
    chrome_android_latest: { platform: 'Linux armv8l', vendor: 'Google Inc.', uadPlatform: 'Android', mobile: true },
    safari_ios_latest: { platform: 'iPhone', vendor: 'Apple Computer, Inc.', uadPlatform: 'iOS', mobile: true }
  };

  function uaLsGet(k) { try { return localStorage.getItem(String(k)); } catch (_) { return null; } }
  function uaLsSet(k, v) { try { localStorage.setItem(String(k), String(v)); } catch (_) { } }
  function uaStorageGet(k) { try { if (window.Lampa && Lampa.Storage && Lampa.Storage.get) return Lampa.Storage.get(String(k)); } catch (_) { } return uaLsGet(k); }
  function uaStorageSet(k, v) { try { if (window.Lampa && Lampa.Storage && Lampa.Storage.set) return Lampa.Storage.set(String(k), String(v)); } catch (_) { } uaLsSet(k, v); }

  var __uaDefaultsEnsured = false;
  function uaSetIfMissing(k, def) {
    try {
      var v = uaStorageGet(k);
      if (v === undefined || v === null) uaStorageSet(k, def);
    } catch (_) { }
  }

  function uaEnsureDefaultsOnce() {
    if (__uaDefaultsEnsured) return;
    __uaDefaultsEnsured = true;
    uaSetIfMissing('bl_ua_enabled', '0');
    uaSetIfMissing('bl_ua_mode', 'preset');
    uaSetIfMissing('bl_ua_preset', 'chrome_win_latest');
    uaSetIfMissing('bl_ua_custom', '');
    uaSetIfMissing('bl_ua_apply_scope', 'all');
    uaSetIfMissing('bl_ua_reload_on_change', '1');
    uaSetIfMissing('bl_ua_add_header', '0');
  }

  function uaGetBool(k, def) {
    try {
      var v = uaStorageGet(k);
      if (v == null || v === '') return !!def;
      var s = String(v).toLowerCase();
      if (s === '0' || s === 'false' || s === 'off' || s === 'no') return false;
      return true;
    } catch (_) { return !!def; }
  }

  function uaGetStr(k, def) {
    try {
      var v = uaStorageGet(k);
      if (v === undefined || v === null) return String(def || '');
      return String(v);
    } catch (_) { return String(def || ''); }
  }

  function uaDeriveMetaFromString(ua) {
    var out = { platform: '', vendor: '', uadPlatform: '', mobile: null };
    ua = String(ua || '');
    var low = ua.toLowerCase();

    try { out.platform = String(navigator && navigator.platform ? navigator.platform : '') || ''; } catch (_) { out.platform = ''; }
    try { out.vendor = String(navigator && navigator.vendor ? navigator.vendor : '') || ''; } catch (_) { out.vendor = ''; }
    try {
      if (navigator && navigator.userAgentData) {
        try { out.uadPlatform = String(navigator.userAgentData.platform || '') || ''; } catch (_) { out.uadPlatform = ''; }
        try { out.mobile = !!navigator.userAgentData.mobile; } catch (_) { out.mobile = null; }
      }
    } catch (_) { }

    if (low.indexOf('windows nt') !== -1) { out.platform = 'Win32'; out.uadPlatform = 'Windows'; out.mobile = false; }
    else if (low.indexOf('android') !== -1) { out.platform = 'Linux armv8l'; out.uadPlatform = 'Android'; out.mobile = true; }
    else if (low.indexOf('iphone') !== -1 || low.indexOf('ipad') !== -1) { out.platform = 'iPhone'; out.uadPlatform = 'iOS'; out.mobile = true; }

    if (low.indexOf('firefox') !== -1) out.vendor = '';
    else if (low.indexOf('safari') !== -1 && low.indexOf('chrome') === -1 && (low.indexOf('iphone') !== -1 || low.indexOf('ipad') !== -1)) out.vendor = 'Apple Computer, Inc.';
    else if (low.indexOf('chrome') !== -1 || low.indexOf('edg') !== -1) out.vendor = 'Google Inc.';

    return out;
  }

  function tryDefineGetter(obj, prop, getter, enumerable) {
    try {
      if (!obj || typeof Object.defineProperty !== 'function') return false;
      Object.defineProperty(obj, prop, { configurable: true, enumerable: enumerable ? true : false, get: getter });
      return true;
    } catch (_) {
      return false;
    }
  }

  function defineNavigatorGetter(prop, getter) {
    try {
      if (tryDefineGetter(navigator, prop, getter, true)) return true;
    } catch (_) { }
    try {
      var proto = null;
      try { proto = (navigator && (navigator.__proto__ || Object.getPrototypeOf(navigator))) ? (navigator.__proto__ || Object.getPrototypeOf(navigator)) : null; } catch (_) { proto = null; }
      if (proto && tryDefineGetter(proto, prop, getter, true)) return true;
    } catch (_) { }
    return false;
  }

  function applyUAOverride() {
    try { uaEnsureDefaultsOnce(); } catch (_) { }

    var enabled = uaGetBool('bl_ua_enabled', false);
    if (!enabled) {
      try { BL.UA.enabled = false; BL.UA.uaString = ''; } catch (_) { }
      return;
    }

    var mode = uaGetStr('bl_ua_mode', 'preset');
    if (mode !== 'custom' && mode !== 'preset') mode = 'preset';

    var preset = uaGetStr('bl_ua_preset', 'chrome_win_latest');
    if (!UA_PRESETS[preset]) preset = 'chrome_win_latest';

    var ua = '';
    if (mode === 'custom') ua = String(uaGetStr('bl_ua_custom', '') || '').trim();
    else ua = String(UA_PRESETS[preset] || '');

    if (!ua) return;

    var meta = UA_META[preset] || null;
    if (!meta || mode === 'custom') meta = uaDeriveMetaFromString(ua);

    var platform = meta && meta.platform ? String(meta.platform) : '';
    var vendor = meta && (meta.vendor !== undefined) ? String(meta.vendor) : '';
    var uadPlatform = meta && meta.uadPlatform ? String(meta.uadPlatform) : '';
    var mobile = (meta && typeof meta.mobile === 'boolean') ? !!meta.mobile : null;

    try { BL.UA.enabled = true; } catch (_) { }
    try { BL.UA.uaString = ua; } catch (_) { }
    try { BL.UA.platform = platform; } catch (_) { }
    try { BL.UA.vendor = vendor; } catch (_) { }
    try { BL.UA.uadPlatform = uadPlatform; } catch (_) { }
    try { if (mobile !== null) BL.UA.mobile = mobile; } catch (_) { }

    try { defineNavigatorGetter('userAgent', function () { return ua; }); } catch (_) { }
    try { defineNavigatorGetter('appVersion', function () { return ua; }); } catch (_) { }
    if (platform) { try { defineNavigatorGetter('platform', function () { return platform; }); } catch (_) { } }
    if (vendor !== null) { try { defineNavigatorGetter('vendor', function () { return vendor; }); } catch (_) { } }

    // userAgentData (Chromium) – best effort only
    try {
      var uad = navigator && navigator.userAgentData ? navigator.userAgentData : null;
      if (uad) {
        try { if (uadPlatform) tryDefineGetter(uad, 'platform', function () { return uadPlatform; }, true); } catch (_) { }
        try { if (mobile !== null) tryDefineGetter(uad, 'mobile', function () { return !!mobile; }, true); } catch (_) { }

        try {
          if (!uad.__blUaPatched && typeof uad.getHighEntropyValues === 'function') {
            uad.__blUaPatched = true;
            var origGhev = uad.getHighEntropyValues.bind(uad);
            uad.getHighEntropyValues = function (hints) {
              try {
                return Promise.resolve(origGhev(hints)).then(function (obj) {
                  try {
                    if (obj && typeof obj === 'object') {
                      if (uadPlatform && obj.platform) obj.platform = uadPlatform;
                      if (mobile !== null && obj.mobile !== undefined) obj.mobile = !!mobile;
                    }
                  } catch (_) { }
                  return obj;
                });
              } catch (_) {
                return origGhev(hints);
              }
            };
          }
        } catch (_) { }
      }
    } catch (_) { }
  }

  try { BL.UA.apply = applyUAOverride; } catch (_) { }

  function baseDir() {
    try {
      var s = document.currentScript && document.currentScript.src ? String(document.currentScript.src) : '';
      if (!s) return '';
      return s.slice(0, s.lastIndexOf('/') + 1);
    } catch (_) { return ''; }
  }

  // Base directory for all BlackLampa assets (js/json).
  (function () {
    var dir = baseDir();
    if (dir) BL.ctx.base = dir;
    else BL.ctx.base = BL.ctx.base || '';
  })();

  function abs(u) {
    try { return String(new URL(String(u), BL.ctx.base || location.href).href); }
    catch (_) { return String(u); }
  }

		  function consoleLine(level, module, message, extra) {
		    try {
		      var line = '[BlackLampa] ' + String(level) + ' ' + String(module) + ': ' + String(message) + (extra ? (' | ' + String(extra)) : '');
		      if (BL.Console) {
		        if (level === 'ERR' && BL.Console.error) return BL.Console.error(line);
		        if (level === 'WRN' && BL.Console.warn) return BL.Console.warn(line);
	        if (level === 'DBG' && BL.Console.debug) return BL.Console.debug(line);
	        if (level === 'INF' && BL.Console.info) return BL.Console.info(line);
	        if (BL.Console.log) return BL.Console.log(line);
	      }
	    } catch (_) { }
	  }

	  function log(level, module, message, extra) {
	    try {
	      if (!BL.Log) throw 0;
	      if (level === 'ERR' && BL.Log.showError) return BL.Log.showError(module, message, extra);
	      if (level === 'WRN' && BL.Log.showWarn) return BL.Log.showWarn(module, message, extra);
	      if (level === 'OK' && BL.Log.showOk) return BL.Log.showOk(module, message, extra);
      if (level === 'INF' && BL.Log.showInfo) return BL.Log.showInfo(module, message, extra);
      if (level === 'DBG' && BL.Log.showDbg) return BL.Log.showDbg(module, message, extra);
    } catch (_) { }
    consoleLine(level, module, message, extra);
  }

  // ----------------------------------------------------------------------------
  // Script loader (ES5, sequential, non-blocking).
  // ----------------------------------------------------------------------------
  var _loaded = {};

  function loadScriptOnce(src, cb) {
    try {
      var url = abs(src);
      if (_loaded[url]) return cb && cb(null);
      _loaded[url] = 1;

      var head = document.head || document.getElementsByTagName('head')[0] || document.documentElement;
      var s = document.createElement('script');
      s.async = false; // keep execution order for sequential loads
      s.src = url;
      s.onload = function () { cb && cb(null); };
      s.onerror = function () { cb && cb(new Error('load fail: ' + url)); };
      head.appendChild(s);
    } catch (e) {
      cb && cb(e);
    }
  }

  function loadSeq(list, cb) {
    var i = 0;
    function next() {
      if (i >= list.length) return cb && cb(null);
      loadScriptOnce(list[i++], function (err) {
        if (err) log('WRN', 'Boot', 'script load fail', err && err.message ? err.message : err);
        setTimeout(next, 0);
      });
    }
    next();
  }

  // ----------------------------------------------------------------------------
  // PHASE 0 (pre-auth): logger + policy + guards
  // ----------------------------------------------------------------------------
  var phase0Promise = null;

	  BL.Init.phase0 = function () {
	    if (phase0Promise) return phase0Promise;

	    phase0Promise = new Promise(function (resolve) {
	      // UA override must happen as early as possible (pre-auth, before hooks/plugins).
	      try { applyUAOverride(); } catch (_) { }

	      // Load only what is allowed pre-auth: logging + protection layers.
	      loadSeq([
	        'bl.config.js',
	        'bl.core.js',
	        'bl.ui.log.js',
	        'bl.storage.guards.js',
	        'bl.policy.network.js'
		      ], function () {
		        // Logger init (idempotent).
		        try {
		          if (BL.Log && BL.Log.init) BL.Log.init();
		        } catch (_) { }

        // Install protection layers as early as possible.
        try { if (BL.PolicyNetwork && BL.PolicyNetwork.install) BL.PolicyNetwork.install(BL.Log); } catch (e1) { log('ERR', 'Policy', 'install failed', e1 && e1.message ? e1.message : e1); }
        try { if (BL.Storage && BL.Storage.Guards && BL.Storage.Guards.installPluginsBlacklistGuard) BL.Storage.Guards.installPluginsBlacklistGuard(BL.Log); } catch (e2) { log('ERR', 'Guards', 'install failed', e2 && e2.message ? e2.message : e2); }

        log('INF', 'Boot', 'phase0 installed', 'policy + guards are active pre-auth');
        resolve(true);
      });
    });

    return phase0Promise;
  };

  // ----------------------------------------------------------------------------
  // PHASE 1 (post-auth): preload + autoplugin
  // ----------------------------------------------------------------------------
  var phase1Promise = null;

  BL.Init.phase1 = function () {
    if (phase1Promise) return phase1Promise;

    phase1Promise = new Promise(function (resolve) {
      // PHASE 1 is user-gated. It must NEVER run before auth success.
      loadSeq([
        'bl.preload.js',
        'bl.ui.filescanner.js',
        'bl.backup.js',
        'bl.plugins.installer.js',
        'bl.autoplugin.js'
      ], function () {
        var p = Promise.resolve(true);

		        if (BL.Preload && BL.Preload.apply) {
		          p = p.then(function () {
		            var cfg = null;
		            try { cfg = (BL.Config && typeof BL.Config.get === 'function') ? BL.Config.get() : BL.Config; } catch (_) { cfg = BL.Config; }
		            cfg = cfg || {};
		            var preloadCfg = cfg.preload || {};
		            log('INF', 'Preload', 'apply', String(preloadCfg.jsonFile || ''));
		            return BL.Preload.apply({ base: BL.ctx.base });
		          });
		        }

		        if (BL.Autoplugin && BL.Autoplugin.start) {
		          p = p.then(function () {
		            var cfg = null;
		            try { cfg = (BL.Config && typeof BL.Config.get === 'function') ? BL.Config.get() : BL.Config; } catch (_) { cfg = BL.Config; }
		            cfg = cfg || {};
		            var apCfg = cfg.autoplugin || {};
		            log('INF', 'AutoPlugin', 'start', String(apCfg.jsonFile || ''));
		            return BL.Autoplugin.start({ base: BL.ctx.base });
		          });
		        }

        p.then(function () {
          log('OK', 'Boot', 'phase1 done', '');
          resolve(true);
        }).catch(function (e) {
          log('ERR', 'Boot', 'phase1 error', e && e.message ? e.message : e);
          resolve(false);
        });
      });
    });

    return phase1Promise;
  };

  // ----------------------------------------------------------------------------
  // Orchestrator
  // ----------------------------------------------------------------------------
  var startPromise = null;

  BL.Init.start = function () {
    if (startPromise) return startPromise;

    startPromise = new Promise(function (resolve) {
      // phase0 starts immediately (does not wait for auth).
      BL.Init.phase0().then(function () {
        // Auth is the gate for any "user" actions (PHASE 1).
        loadSeq(['bl.auth.js'], function () {
          if (!BL.Auth || !BL.Auth.start) {
            log('ERR', 'Boot', 'missing BL.Auth', '');
            return resolve(false);
          }

          log('INF', 'Auth', 'start', 'waiting for password');

	          // Auth allow-list is read from a fixed path inside BlackLampa.
	          // Any "user" activity (PHASE 1) must remain strictly gated by successful auth.
	          var cfg = null;
	          try { cfg = (BL.Config && typeof BL.Config.get === 'function') ? BL.Config.get() : BL.Config; } catch (_) { cfg = BL.Config; }
	          cfg = cfg || {};
	          var authCfg = cfg.auth || {};
	          BL.Auth.start({ authJson: String(authCfg.authJson || '') }).then(function () {
	            log('OK', 'Auth', 'ok', 'unlocked');
	            return BL.Init.phase1();
	          }).then(function () {
            resolve(true);
          }).catch(function (e) {
            log('ERR', 'Auth', 'error', e && e.message ? e.message : e);
            resolve(false);
          });
        });
      }).catch(function (e0) {
        log('ERR', 'Boot', 'phase0 error', e0 && e0.message ? e0.message : e0);
        resolve(false);
      });
    });

    return startPromise;
  };
})();
