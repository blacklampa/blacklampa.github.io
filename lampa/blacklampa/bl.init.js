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
  // User-Agent override (JS runtime + best-effort request headers)
  // ----------------------------------------------------------------------------
  BL.UA = BL.UA || {};

  var LS_UA_ORIGINAL = 'bl_ua_original_v1';
  var LS_UA_PRESET_ID = 'bl_ua_preset_id_v1';
  var LS_UA_CUSTOM = 'bl_ua_custom_v1';

  function uaLsGet(k) { try { return localStorage.getItem(String(k)); } catch (_) { return null; } }
  function uaLsSet(k, v) { try { localStorage.setItem(String(k), String(v)); } catch (_) { } }
  function uaGetAny(k) {
    var v = null;
    try { v = uaLsGet(k); } catch (_) { v = null; }
    if (v === undefined || v === null) {
      try { if (window.Lampa && Lampa.Storage && Lampa.Storage.get) v = Lampa.Storage.get(String(k)); } catch (_) { v = null; }
    }
    if (v === undefined || v === null) return null;
    return String(v);
  }
  function uaSetAny(k, v) {
    try { uaLsSet(k, v); } catch (_) { }
    try { if (window.Lampa && Lampa.Storage && Lampa.Storage.set) Lampa.Storage.set(String(k), String(v)); } catch (_) { }
  }

  // Capture ORIGINAL values before any overrides.
  var UA_ORIG = {
    userAgent: '',
    appVersion: '',
    platform: '',
    vendor: '',
    uadPlatform: '',
    mobile: null
  };

  (function captureOriginalUaOnce() {
    try { UA_ORIG.userAgent = String(navigator && navigator.userAgent ? navigator.userAgent : '') || ''; } catch (_) { UA_ORIG.userAgent = ''; }
    try { UA_ORIG.appVersion = String(navigator && navigator.appVersion ? navigator.appVersion : '') || UA_ORIG.userAgent; } catch (_) { UA_ORIG.appVersion = UA_ORIG.userAgent; }
    try { UA_ORIG.platform = String(navigator && navigator.platform ? navigator.platform : '') || ''; } catch (_) { UA_ORIG.platform = ''; }
    try { UA_ORIG.vendor = String(navigator && navigator.vendor ? navigator.vendor : '') || ''; } catch (_) { UA_ORIG.vendor = ''; }
    try {
      if (navigator && navigator.userAgentData) {
        try { UA_ORIG.uadPlatform = String(navigator.userAgentData.platform || '') || ''; } catch (_) { UA_ORIG.uadPlatform = ''; }
        try { UA_ORIG.mobile = !!navigator.userAgentData.mobile; } catch (_) { UA_ORIG.mobile = null; }
      }
    } catch (_) { }
  })();

  function ensureOriginalStored() {
    try {
      var cur = uaLsGet(LS_UA_ORIGINAL);
      if (cur === undefined || cur === null || cur === '') uaLsSet(LS_UA_ORIGINAL, String(UA_ORIG.userAgent || ''));
    } catch (_) { }
  }

  // Must happen before any UA override is applied.
  ensureOriginalStored();

  var UA_PRESETS = [
    { id: 'original_system', title: 'Original (system)', desc: 'Device native UA (stored on first run)', ua: '' },
    { id: 'win_chrome', title: 'Windows Chrome', desc: 'Desktop-like for compatibility', ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36' },
    { id: 'win_edge', title: 'Windows Edge', desc: 'Desktop-like for compatibility', ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 Edg/123.0.0.0' },
    { id: 'win_firefox', title: 'Windows Firefox', desc: 'Desktop-like for compatibility', ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0' },
    { id: 'android_chrome', title: 'Android Chrome', desc: 'Mobile UA for compatibility', ua: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Mobile Safari/537.36' },
    { id: 'ios_safari', title: 'iOS Safari', desc: 'Mobile UA for compatibility', ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' },
    { id: 'custom', title: 'Custom', desc: 'Custom UA string (advanced)', ua: '' }
  ];

  var UA_META = {
    win_chrome: { platform: 'Win32', vendor: 'Google Inc.', uadPlatform: 'Windows', mobile: false },
    win_edge: { platform: 'Win32', vendor: 'Google Inc.', uadPlatform: 'Windows', mobile: false },
    win_firefox: { platform: 'Win32', vendor: '', uadPlatform: 'Windows', mobile: false },
    android_chrome: { platform: 'Linux armv8l', vendor: 'Google Inc.', uadPlatform: 'Android', mobile: true },
    ios_safari: { platform: 'iPhone', vendor: 'Apple Computer, Inc.', uadPlatform: 'iOS', mobile: true }
  };

  function getPresetById(id) {
    id = String(id || '');
    for (var i = 0; i < UA_PRESETS.length; i++) {
      if (UA_PRESETS[i] && String(UA_PRESETS[i].id || '') === id) return UA_PRESETS[i];
    }
    return null;
  }

  function readOriginalUaStored() {
    var v = '';
    try { v = String(uaLsGet(LS_UA_ORIGINAL) || ''); } catch (_) { v = ''; }
    if (!v) v = String(UA_ORIG.userAgent || '');
    return v;
  }

  function uaDeriveMetaFromString(ua) {
    var out = { platform: '', vendor: '', uadPlatform: '', mobile: null };
    ua = String(ua || '');
    var low = ua.toLowerCase();

    // Default to ORIGINAL runtime values (not current navigator.* which may already be patched).
    try { out.platform = String(UA_ORIG.platform || ''); } catch (_) { out.platform = ''; }
    try { out.vendor = String(UA_ORIG.vendor || ''); } catch (_) { out.vendor = ''; }
    try { out.uadPlatform = String(UA_ORIG.uadPlatform || ''); } catch (_) { out.uadPlatform = ''; }
    try { out.mobile = (typeof UA_ORIG.mobile === 'boolean') ? !!UA_ORIG.mobile : null; } catch (_) { out.mobile = null; }

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

  function normalizePresetId(id) {
    id = String(id || '');
    if (id && getPresetById(id)) return id;
    return 'original_system';
  }

  function legacyPresetMap(oldId) {
    oldId = String(oldId || '');
    if (oldId === 'chrome_win_latest') return 'win_chrome';
    if (oldId === 'edge_win_latest') return 'win_edge';
    if (oldId === 'firefox_win_latest') return 'win_firefox';
    if (oldId === 'chrome_android_latest') return 'android_chrome';
    if (oldId === 'safari_ios_latest') return 'ios_safari';
    return '';
  }

  function migrateLegacyUaOnce() {
    try {
      var cur = uaGetAny(LS_UA_PRESET_ID);
      if (cur) return;

      var enabled = false;
      try { enabled = String(uaGetAny('bl_ua_enabled') || '0') === '1'; } catch (_) { enabled = false; }
      if (!enabled) {
        uaSetAny(LS_UA_PRESET_ID, 'original_system');
        return;
      }

      var mode = 'preset';
      try { mode = String(uaGetAny('bl_ua_mode') || 'preset'); } catch (_) { mode = 'preset'; }
      mode = mode.toLowerCase();

      if (mode === 'custom') {
        var cu = '';
        try { cu = String(uaGetAny('bl_ua_custom') || ''); } catch (_) { cu = ''; }
        cu = String(cu || '').trim();
        if (cu) uaSetAny(LS_UA_CUSTOM, cu);
        uaSetAny(LS_UA_PRESET_ID, 'custom');
        return;
      }

      var pid = '';
      try { pid = legacyPresetMap(String(uaGetAny('bl_ua_preset') || '')); } catch (_) { pid = ''; }
      if (!pid) pid = 'win_chrome';
      uaSetAny(LS_UA_PRESET_ID, pid);
    } catch (_) { }
  }

  function getSelectedPresetId() {
    try { migrateLegacyUaOnce(); } catch (_) { }
    var id = uaGetAny(LS_UA_PRESET_ID);
    if (!id) {
      id = 'original_system';
      uaSetAny(LS_UA_PRESET_ID, id);
    }
    return normalizePresetId(id);
  }

  function setSelectedPresetId(id) {
    id = normalizePresetId(id);
    uaSetAny(LS_UA_PRESET_ID, id);
  }

  function getCustomUa() {
    var s = '';
    try { s = String(uaGetAny(LS_UA_CUSTOM) || ''); } catch (_) { s = ''; }
    if (!s) {
      // Legacy fallback (read-only).
      try { s = String(uaGetAny('bl_ua_custom') || ''); } catch (_) { s = ''; }
    }
    return String(s || '').trim();
  }

  function setCustomUa(ua) {
    ua = String(ua || '').trim();
    uaSetAny(LS_UA_CUSTOM, ua);
  }

  function computeEffective() {
    var id = getSelectedPresetId();
    var preset = getPresetById(id) || getPresetById('original_system');
    if (!preset) preset = { id: 'original_system', title: 'Original (system)', desc: '', ua: '' };

    var ua = '';
    if (id === 'original_system') ua = readOriginalUaStored();
    else if (id === 'custom') ua = getCustomUa() || readOriginalUaStored();
    else ua = String(preset.ua || '');

    ua = String(ua || '').trim();
    if (!ua) ua = readOriginalUaStored();

    var meta = (id && UA_META[id]) ? UA_META[id] : null;
    if (!meta || id === 'custom' || id === 'original_system') meta = uaDeriveMetaFromString(ua);

    var platform = meta && meta.platform ? String(meta.platform) : String(UA_ORIG.platform || '');
    var vendor = (meta && meta.vendor !== undefined) ? String(meta.vendor) : String(UA_ORIG.vendor || '');
    var uadPlatform = meta && meta.uadPlatform ? String(meta.uadPlatform) : String(UA_ORIG.uadPlatform || '');
    var mobile = (meta && typeof meta.mobile === 'boolean') ? !!meta.mobile : ((typeof UA_ORIG.mobile === 'boolean') ? !!UA_ORIG.mobile : null);

    return {
      id: String(preset.id || id),
      title: String(preset.title || id),
      desc: String(preset.desc || ''),
      ua: ua,
      platform: platform,
      vendor: vendor,
      uadPlatform: uadPlatform,
      mobile: mobile
    };
  }

  function ensureUaHeaderSupportOnce() {
    try {
      if (typeof BL.UA.headerOverrideSupported === 'boolean') return !!BL.UA.headerOverrideSupported;
    } catch (_) { }
    var ok = false;
    try {
      if (window.XMLHttpRequest) {
        var x = new XMLHttpRequest();
        try { x.open('GET', location.href, true); } catch (_) { x.open('GET', '/', true); }
        try {
          x.setRequestHeader('User-Agent', 'BlackLampa-UA-Test');
          ok = true;
        } catch (_) { ok = false; }
      }
    } catch (_) { ok = false; }
    try { BL.UA.headerOverrideSupported = ok; } catch (_) { }
    return ok;
  }

  function applyHeadersToXhr(xhr) {
    try {
      if (!xhr || !xhr.setRequestHeader) return;
      if (!ensureUaHeaderSupportOnce()) return;
      var eff = (BL.UA && BL.UA.effective) ? BL.UA.effective : null;
      var ua = eff && eff.ua ? String(eff.ua) : '';
      if (!ua) return;
      try { xhr.setRequestHeader('User-Agent', ua); } catch (e) { try { BL.UA.headerOverrideSupported = false; } catch (_) { } }
    } catch (_) { }
  }

  function applyHeadersToFetch(input, init) {
    try {
      if (!ensureUaHeaderSupportOnce()) return { input: input, init: init };

      var eff = (BL.UA && BL.UA.effective) ? BL.UA.effective : null;
      var ua = eff && eff.ua ? String(eff.ua) : '';
      if (!ua) return { input: input, init: init };

      // Best-effort only: some environments strip forbidden headers silently.
      init = init || {};
      if (typeof Headers !== 'undefined') {
        var h = null;
        try { h = init.headers ? new Headers(init.headers) : new Headers(); } catch (_) { h = null; }
        if (h) {
          try { h.set('User-Agent', ua); } catch (_) { }
          init.headers = h;
        }
      } else if (init && init.headers && typeof init.headers === 'object') {
        try { init.headers['User-Agent'] = ua; } catch (_) { }
      } else if (init) {
        try { init.headers = { 'User-Agent': ua }; } catch (_) { }
      }

      return { input: input, init: init };
    } catch (_) {
      try { BL.UA.headerOverrideSupported = false; } catch (__e) { }
      return { input: input, init: init };
    }
  }

  function applyUAOverride() {
    try { ensureOriginalStored(); } catch (_) { }

    var eff = computeEffective();
    try { BL.UA.original = UA_ORIG; } catch (_) { }
    try { BL.UA.originalStored = readOriginalUaStored(); } catch (_) { }
    try { BL.UA.presetId = String(eff.id || ''); } catch (_) { }
    try { BL.UA.uaString = String(eff.ua || ''); } catch (_) { }
    try { BL.UA.platform = String(eff.platform || ''); } catch (_) { }
    try { BL.UA.vendor = String(eff.vendor || ''); } catch (_) { }
    try { BL.UA.uadPlatform = String(eff.uadPlatform || ''); } catch (_) { }
    try { BL.UA.mobile = eff.mobile; } catch (_) { }
    try { BL.UA.effective = eff; } catch (_) { }

    try {
      defineNavigatorGetter('userAgent', function () {
        try { return (BL.UA && BL.UA.effective && BL.UA.effective.ua) ? String(BL.UA.effective.ua) : String(UA_ORIG.userAgent || ''); } catch (_) { return String(UA_ORIG.userAgent || ''); }
      });
    } catch (_) { }
    try {
      defineNavigatorGetter('appVersion', function () {
        try { return (BL.UA && BL.UA.effective && BL.UA.effective.ua) ? String(BL.UA.effective.ua) : String(UA_ORIG.appVersion || UA_ORIG.userAgent || ''); } catch (_) { return String(UA_ORIG.appVersion || UA_ORIG.userAgent || ''); }
      });
    } catch (_) { }
    try {
      defineNavigatorGetter('platform', function () {
        try { return (BL.UA && BL.UA.effective && BL.UA.effective.platform) ? String(BL.UA.effective.platform) : String(UA_ORIG.platform || ''); } catch (_) { return String(UA_ORIG.platform || ''); }
      });
    } catch (_) { }
    try {
      defineNavigatorGetter('vendor', function () {
        try { return (BL.UA && BL.UA.effective && BL.UA.effective.vendor !== undefined) ? String(BL.UA.effective.vendor) : String(UA_ORIG.vendor || ''); } catch (_) { return String(UA_ORIG.vendor || ''); }
      });
    } catch (_) { }

    // userAgentData (Chromium) – best effort only (must not crash).
    try {
      var uad = navigator && navigator.userAgentData ? navigator.userAgentData : null;
      if (uad) {
        try {
          tryDefineGetter(uad, 'platform', function () {
            try { return (BL.UA && BL.UA.effective && BL.UA.effective.uadPlatform) ? String(BL.UA.effective.uadPlatform) : String(UA_ORIG.uadPlatform || ''); } catch (_) { return String(UA_ORIG.uadPlatform || ''); }
          }, true);
        } catch (_) { }
        try {
          tryDefineGetter(uad, 'mobile', function () {
            try {
              if (BL.UA && BL.UA.effective && typeof BL.UA.effective.mobile === 'boolean') return !!BL.UA.effective.mobile;
              if (typeof UA_ORIG.mobile === 'boolean') return !!UA_ORIG.mobile;
            } catch (_) { }
            return false;
          }, true);
        } catch (_) { }

        try {
          if (!uad.__blUaPatched && typeof uad.getHighEntropyValues === 'function') {
            uad.__blUaPatched = true;
            var origGhev = uad.getHighEntropyValues.bind(uad);
            uad.getHighEntropyValues = function (hints) {
              try {
                return Promise.resolve(origGhev(hints)).then(function (obj) {
                  try {
                    var eff2 = (BL.UA && BL.UA.effective) ? BL.UA.effective : null;
                    if (obj && typeof obj === 'object' && eff2) {
                      if (eff2.uadPlatform && obj.platform) obj.platform = String(eff2.uadPlatform);
                      if (typeof eff2.mobile === 'boolean' && obj.mobile !== undefined) obj.mobile = !!eff2.mobile;
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

  BL.UA.apply = applyUAOverride;
  BL.UA.ensureOriginalStored = ensureOriginalStored;
  BL.UA.ensureHeaderSupport = ensureUaHeaderSupportOnce;
  BL.UA.applyHeadersToXhr = applyHeadersToXhr;
  BL.UA.applyHeadersToFetch = applyHeadersToFetch;

  BL.UA.getOriginalUa = function () { return readOriginalUaStored(); };
  BL.UA.getSelectedPresetId = function () { return getSelectedPresetId(); };
  BL.UA.setSelectedPresetId = function (id) { setSelectedPresetId(id); };
  BL.UA.setCustomUa = function (ua) { setCustomUa(ua); };
  BL.UA.getCustomUa = function () { return getCustomUa(); };

  BL.UA.getPresets = function () {
    var out = [];
    for (var i = 0; i < UA_PRESETS.length; i++) {
      var p = UA_PRESETS[i];
      if (!p) continue;
      var id = String(p.id || '');
      var ua = '';
      if (id === 'original_system') ua = readOriginalUaStored();
      else if (id === 'custom') ua = getCustomUa();
      else ua = String(p.ua || '');
      out.push({ id: id, title: String(p.title || id), desc: String(p.desc || ''), ua: String(ua || '') });
    }
    return out;
  };

  // Apply once ASAP (PHASE 0 will call applyUAOverride again, but it's idempotent).
  try { applyUAOverride(); } catch (_) { }

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
	        'bl.policy.network.js'
		      ], function () {
		        // Logger init (idempotent).
		        try {
		          if (BL.Log && BL.Log.init) BL.Log.init();
		        } catch (_) { }

        // Install NETWORK policy immediately after it is loaded (must be early).
        try { if (BL.PolicyNetwork && BL.PolicyNetwork.install) BL.PolicyNetwork.install(BL.Log); } catch (e1) { log('ERR', 'Policy', 'install failed', e1 && e1.message ? e1.message : e1); }

        // Guards can load/install after the policy (still PHASE 0).
        loadSeq(['bl.storage.guards.js'], function () {
          try { if (BL.Storage && BL.Storage.Guards && BL.Storage.Guards.installPluginsBlacklistGuard) BL.Storage.Guards.installPluginsBlacklistGuard(BL.Log); } catch (e2) { log('ERR', 'Guards', 'install failed', e2 && e2.message ? e2.message : e2); }

          log('INF', 'Boot', 'phase0 installed', 'policy + guards are active pre-auth');
          resolve(true);
        });
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
