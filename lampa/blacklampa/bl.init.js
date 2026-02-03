(function () {
  'use strict';


  var BL = window.BL = window.BL || {};
  BL.ctx = BL.ctx || {};
  BL.Init = BL.Init || {};

  if (BL.Init.__blInitLoaded) return;
  BL.Init.__blInitLoaded = true;

  // ============================================================================
  // Interface size extension (xsmall/xxsmall) without editing app.min.js
  //
  // Mechanism in app.min.js:
  // - Layer.size() uses a local map: {normal:1, small:0.9, bigger:1.05}
  // - Then reads: fs = sz[Storage.field('interface_size')]
  //
  // We extend it safely by:
  // - defining non-enumerable Object.prototype.xsmall / xxsmall so sz[...] resolves via prototype chain
  // - extending Lampa.Params.values.interface_size so items appear in Settings UI
  // - sanitizing unknown values via a wrapper around Lampa.Storage.field('interface_size')
  // ============================================================================
	  (function interfaceSizeExtV1() {
	    try {
	      var KEY = '__blacklampa_interface_size_ext_v1';
	      if (window[KEY]) return;
	      window[KEY] = true;

	      var BOOT_REAL = null;
	      try { BOOT_REAL = window.localStorage && window.localStorage.getItem ? window.localStorage.getItem('interface_size') : null; } catch (_) { BOOT_REAL = null; }
	      var BOOT_NEED = (BOOT_REAL === 'xsmall' || BOOT_REAL === 'xxsmall');
	      var BOOT_SCALE = (BOOT_REAL === 'xsmall') ? 0.8 : (BOOT_REAL === 'xxsmall') ? 0.7 : 1;
	      var bootRemapActive = BOOT_NEED;
	      var bootReapplied = false;

	      function bootLog(msg) {
	        try {
	          if (window.console && console.log) console.log('[BL][UI][BOOT] ' + String(msg || ''));
	        } catch (_) { }
	      }

	      function uiWarn(msg) {
	        try { if (window.BL && BL.Log && BL.Log.showWarn) return BL.Log.showWarn('UI', String(msg || ''), ''); } catch (_) { }
	        try { if (window.console && console.warn) console.warn('[BlackLampa] WRN UI: ' + String(msg || '')); } catch (_) { }
	      }

      function defineProtoScale(k, v) {
        try {
          if (!Object || !Object.prototype) return false;
          if (Object.prototype[k] === v) return true;
        } catch (_) { }
        try {
          if (Object && Object.defineProperty) {
            Object.defineProperty(Object.prototype, k, { value: v, writable: false, configurable: true });
            return true;
          }
        } catch (_) { }
        try {
          Object.prototype[k] = v;
          return Object.prototype[k] === v;
        } catch (_) { }
        return false;
      }

      var protoOk = true;
      if (!defineProtoScale('xsmall', 0.8)) protoOk = false;
      if (!defineProtoScale('xxsmall', 0.7)) protoOk = false;

	      var patchedValues = false;
	      var patchedField = false;
	      var patchedListener = false;
	      var warned = {};

	      function patchStorageFieldOnce(lampa) {
	        try {
	          if (patchedField) return true;
	          if (!lampa || !lampa.Storage || typeof lampa.Storage.field !== 'function') return false;

	          patchedField = true;
	          var origField = lampa.Storage.field;
	          if (origField && origField.__blInterfaceSizeWrappedV1) return true;

	          lampa.Storage.field = function (name) {
	            var val = origField.apply(this, arguments);
	            if (String(name || '') !== 'interface_size') return val;

	            var s = (val === undefined || val === null) ? '' : String(val);

	            if (bootRemapActive && (s === 'xsmall' || s === 'xxsmall')) {
	              bootRemapActive = false;
	              bootLog('interface_size bootstrap remap: ' + s + ' → small');
	              return 'small';
	            }

	            if (s === 'normal' || s === 'small' || s === 'bigger') return s;

	            if (s === 'xsmall' || s === 'xxsmall') {
	              if (!protoOk) {
	                if (!warned[s]) { warned[s] = 1; uiWarn('unsupported interface_size value: ' + s); }
	                return 'small';
	              }
	              return s;
	            }

	            if (s && !warned[s]) { warned[s] = 1; uiWarn('unsupported interface_size value: ' + s); }
	            return 'normal';
	          };
	          lampa.Storage.field.__blInterfaceSizeWrappedV1 = true;
	          return true;
	        } catch (_) {
	          return false;
	        }
	      }

	      function attachBootstrapReapplyOnce(lampa) {
	        try {
	          if (!BOOT_NEED) return true;
	          if (bootReapplied) return true;
	          if (!lampa || !lampa.Listener || typeof lampa.Listener.follow !== 'function') return false;

	          lampa.Listener.follow('app', function (e) {
	            try {
	              if (bootReapplied) return;
	              if (!e || String(e.type || '') !== 'ready') return;
	              bootReapplied = true;
	              bootRemapActive = false;
	              try { window.blacklampa_interface_size_bootstrap_fixed_v1 = true; } catch (_) { }

	              if (lampa.Storage && typeof lampa.Storage.set === 'function') {
	                try { lampa.Storage.set('interface_size', BOOT_REAL); } catch (_) { }
	              }

	              bootLog('interface_size reapplied: ' + String(BOOT_REAL) + ' (' + String(BOOT_SCALE) + ')');
	            } catch (_) { }
	          });
	          return true;
	        } catch (_) {
	          return false;
	        }
	      }

	      function hookLampaAssignmentOnce() {
	        try {
	          var called = false;
	          function onLampa(l) {
	            if (!l || called) return;
	            called = true;
	            try { patchStorageFieldOnce(l); } catch (_) { }
	            try { attachBootstrapReapplyOnce(l); } catch (_) { }
	          }

	          if (window.Lampa) return onLampa(window.Lampa);

	          var existing = null;
	          try { existing = Object.getOwnPropertyDescriptor(window, 'Lampa'); } catch (_) { existing = null; }
	          if (existing && existing.configurable === false) return;

	          var v = null;
	          Object.defineProperty(window, 'Lampa', {
	            configurable: true,
	            enumerable: true,
	            get: function () { return v; },
	            set: function (val) { v = val; onLampa(val); }
	          });
	        } catch (_) { }
	      }

	      hookLampaAssignmentOnce();

	      function patchLampaRuntime() {
	        try {
	          if (!window.Lampa) return false;

          // Settings UI: add 2 items to the existing select list
          if (!patchedValues && Lampa.Params && Lampa.Params.values && Lampa.Params.values.interface_size && typeof Lampa.Params.values.interface_size === 'object') {
            patchedValues = true;
            try {
              var cur = Lampa.Params.values.interface_size || {};
              var next = {
                xxsmall: 'Минимальный',
                xsmall: 'Очень маленький',
                small: cur.small || '#{settings_param_interface_size_small}',
                normal: cur.normal || '#{settings_param_interface_size_normal}',
                bigger: cur.bigger || '#{settings_param_interface_size_bigger}'
              };
              Lampa.Params.values.interface_size = next;
            } catch (_) { }
	          }

	          // Field wrapper is installed via early Lampa assignment hook (for first load correctness).
	          if (!patchedField && window.Lampa) {
	            try { patchStorageFieldOnce(window.Lampa); } catch (_) { }
	          }

	          // Cleanup classes for extended values + warn on unsupported selections
	          if (!patchedListener && Lampa.Storage && Lampa.Storage.listener && typeof Lampa.Storage.listener.follow === 'function') {
            patchedListener = true;
            try {
              Lampa.Storage.listener.follow('change', function (e) {
                try {
                  if (!e || String(e.name || '') !== 'interface_size') return;

                  var raw = null;
                  try { raw = window.localStorage && window.localStorage.getItem ? window.localStorage.getItem('interface_size') : null; } catch (_) { raw = null; }
                  if (raw === null || raw === undefined) raw = e.value;
                  if (raw !== null && raw !== undefined) {
                    var vv = String(raw);
                    if (vv !== 'normal' && vv !== 'small' && vv !== 'bigger' && vv !== 'xsmall' && vv !== 'xxsmall') {
                      if (!warned[vv]) { warned[vv] = 1; uiWarn('unsupported interface_size value: ' + vv); }
                    }
                  }

                  // Ensure only one size--* class remains (app.min.js only removes 3 base ones)
                  try {
                    var body = document && document.body;
                    if (!body || !body.classList) return;
                    body.classList.remove('size--small', 'size--normal', 'size--bigger', 'size--xsmall', 'size--xxsmall');
                    var cur = null;
                    try { cur = (window.Lampa && Lampa.Storage && Lampa.Storage.field) ? String(Lampa.Storage.field('interface_size') || '') : ''; } catch (_) { cur = ''; }
                    if (cur) body.classList.add('size--' + cur);
                  } catch (_) { }
                } catch (_) { }
              });
            } catch (_) { }
          }

          return patchedValues && patchedField && patchedListener;
        } catch (_) {
          return false;
        }
      }

      var tries = 0;
      var t = setInterval(function () {
        tries++;
        if (patchLampaRuntime()) {
          clearInterval(t);
          return;
        }
        if (tries >= 80) clearInterval(t);
      }, 250);
    } catch (_) { }
  })();

  BL.UA = BL.UA || {};

	  var K = (BL.Keys || BL.LocalStorageKeys || {});
	  var LS_UA_ORIGINAL = K.ua_original_v1 || 'blacklampa_ua_original_v1';
	  var LS_UA_PRESET_ID = K.ua_preset_id_v1 || 'blacklampa_ua_preset_id_v1';
	  var LS_UA_CUSTOM = K.ua_custom_v1 || 'blacklampa_ua_custom_v1';
	  var LS_UA_HDR_SUPPORTED = K.ua_header_override_supported_v1 || 'blacklampa_ua_header_override_supported_v1';
	  var LS_UA_ENABLED_V1 = K.ua_enabled_v1 || 'blacklampa_ua_enabled_v1';

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

	  function hasLegacyUaKeys() {
	    try {
	      return (uaGetAny('bl_ua_enabled') !== null)
	        || (uaGetAny('bl_ua_mode') !== null)
	        || (uaGetAny('bl_ua_custom') !== null)
	        || (uaGetAny('bl_ua_preset') !== null);
	    } catch (_) { return false; }
	  }

	  function seedUaDefaultsIfMissing() {
	    try {
	      var cur = uaGetAny(LS_UA_PRESET_ID);
	      if (cur) return false;
	      if (hasLegacyUaKeys()) return false;
	      uaSetAny(LS_UA_PRESET_ID, 'win_firefox');
	      try {
	        var en = uaGetAny(LS_UA_ENABLED_V1);
	        if (en === null || en === undefined || en === '') uaSetAny(LS_UA_ENABLED_V1, '1');
	      } catch (_) { }
	      return true;
	    } catch (_) {
	      return false;
	    }
	  }

	  function migrateLegacyUaOnce() {
	    try {
	      var cur = uaGetAny(LS_UA_PRESET_ID);
	      if (cur) {
	        try { localStorage.removeItem('bl_ua_enabled'); localStorage.removeItem('bl_ua_mode'); localStorage.removeItem('bl_ua_custom'); localStorage.removeItem('bl_ua_preset'); } catch (_) { }
	        return;
	      }

	      if (seedUaDefaultsIfMissing()) return;

	      var enabled = false;
	      try { enabled = String(uaGetAny('bl_ua_enabled') || '0') === '1'; } catch (_) { enabled = false; }
	      if (!enabled) {
	        uaSetAny(LS_UA_PRESET_ID, 'original_system');
	        try {
	          var en2 = uaGetAny(LS_UA_ENABLED_V1);
	          if (en2 === null || en2 === undefined || en2 === '') uaSetAny(LS_UA_ENABLED_V1, '0');
	        } catch (_) { }
	        return;
	      }

	      try {
	        var en3 = uaGetAny(LS_UA_ENABLED_V1);
	        if (en3 === null || en3 === undefined || en3 === '') uaSetAny(LS_UA_ENABLED_V1, '1');
	      } catch (_) { }

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
      try { localStorage.removeItem('bl_ua_enabled'); localStorage.removeItem('bl_ua_mode'); localStorage.removeItem('bl_ua_custom'); localStorage.removeItem('bl_ua_preset'); } catch (_) { }
    } catch (_) { }
  }

	  function getSelectedPresetId() {
	    try { migrateLegacyUaOnce(); } catch (_) { }
	    var id = uaGetAny(LS_UA_PRESET_ID);
	    if (!id) {
	      id = 'win_firefox';
	      uaSetAny(LS_UA_PRESET_ID, id);
	      try {
	        var en = uaGetAny(LS_UA_ENABLED_V1);
	        if (en === null || en === undefined || en === '') uaSetAny(LS_UA_ENABLED_V1, '1');
	      } catch (_) { }
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

    try {
      var stored = uaLsGet(LS_UA_HDR_SUPPORTED);
      if (stored === '0' || stored === '1') {
        try { BL.UA.headerOverrideSupported = (stored === '1'); } catch (_) { }
        return stored === '1';
      }
    } catch (_) { }

    var ok = false;

    try {
      if (typeof Request !== 'undefined') {
        var req = null;
        try { req = new Request(location.href, { headers: { 'User-Agent': 'BlackLampa-UA-Test' } }); } catch (_) { req = null; }
        if (req && req.headers && typeof req.headers.get === 'function') {
          var got = null;
          try { got = req.headers.get('User-Agent'); } catch (_) { got = null; }
          ok = String(got || '') === 'BlackLampa-UA-Test';
        }
      }
    } catch (_) { ok = false; }

    try {
      if (ok && window.XMLHttpRequest) {
        var x = new XMLHttpRequest();
        try { x.open('GET', location.href, true); } catch (_) { x.open('GET', '/', true); }
        try {
          x.setRequestHeader('User-Agent', 'BlackLampa-UA-Test');
          ok = true;
        } catch (_) { ok = false; }
      }
    } catch (_) { ok = false; }

    try { BL.UA.headerOverrideSupported = ok; } catch (_) { }
    try { uaLsSet(LS_UA_HDR_SUPPORTED, ok ? '1' : '0'); } catch (_) { }

    try {
      var ev = {
        ts: Date.now(),
        type: 'ua',
        action: 'override',
        channel: 'xhr',
        from: 'User-Agent header',
        to: ok ? 'supported' : 'unsupported',
        rule: LS_UA_HDR_SUPPORTED,
        dedupMs: 0
      };

      if (BL.Log && typeof BL.Log.push === 'function') BL.Log.push(ev);
      else BL.UA.__pendingHdrSupportLog = ev;
    } catch (_) { }

    return ok;
  }

  function disableUaHeaderOverride(reason) {
    try { BL.UA.headerOverrideSupported = false; } catch (_) { }
    try { uaLsSet(LS_UA_HDR_SUPPORTED, '0'); } catch (_) { }
    try { BL.UA.headerOverrideUnsupportedReason = String(reason || ''); } catch (_) { }
  }

  function applyHeadersToXhr(xhr) {
    try {
      if (!xhr || !xhr.setRequestHeader) return;
      if (!ensureUaHeaderSupportOnce()) return;
      var eff = (BL.UA && BL.UA.effective) ? BL.UA.effective : null;
      var ua = eff && eff.ua ? String(eff.ua) : '';
      if (!ua) return;
      try { xhr.setRequestHeader('User-Agent', ua); } catch (e) { disableUaHeaderOverride('xhr'); }
    } catch (_) { }
  }

  function applyHeadersToFetch(input, init) {
    try {
      if (!ensureUaHeaderSupportOnce()) return { input: input, init: init };

      var eff = (BL.UA && BL.UA.effective) ? BL.UA.effective : null;
      var ua = eff && eff.ua ? String(eff.ua) : '';
      if (!ua) return { input: input, init: init };

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
      disableUaHeaderOverride('fetch');
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
      var oUa = '';
      try { oUa = String(UA_ORIG.userAgent || ''); } catch (_) { oUa = ''; }
      var eUa = '';
      try { eUa = String(eff && eff.ua ? eff.ua : ''); } catch (_) { eUa = ''; }

      if (oUa && eUa && eUa !== oUa) {
        if (!BL.UA.__navOverrideLogged) {
          BL.UA.__pendingNavOverrideLog = {
            ts: Date.now(),
            type: 'ua',
            action: 'override',
            channel: 'other',
            from: oUa,
            to: eUa,
            rule: (eff && eff.id) ? String(eff.id) : null,
            dedupMs: 0
          };
        }

        if (!BL.UA.__navOverrideLogged && BL.Log && typeof BL.Log.push === 'function' && BL.UA.__pendingNavOverrideLog) {
          BL.Log.push(BL.UA.__pendingNavOverrideLog);
          BL.UA.__navOverrideLogged = true;
          BL.UA.__pendingNavOverrideLog = null;
        }
      } else if (!BL.UA.__navOverrideLogged) {
        BL.UA.__pendingNavOverrideLog = null;
      }
    } catch (_) { }

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
  BL.UA.canOverrideHeaders = function () { try { return !!ensureUaHeaderSupportOnce(); } catch (_) { return false; } };
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

  try { applyUAOverride(); } catch (_) { }

  function baseDir() {
    try {
      var s = document.currentScript && document.currentScript.src ? String(document.currentScript.src) : '';
      if (!s) return '';
      return s.slice(0, s.lastIndexOf('/') + 1);
    } catch (_) { return ''; }
  }

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

  var phase0Promise = null;

	  BL.Init.phase0 = function () {
	    if (phase0Promise) return phase0Promise;

	    phase0Promise = new Promise(function (resolve) {
	      try { applyUAOverride(); } catch (_) { }

	      loadSeq([
	        'bl.config.js',
	        'bl.core.js',
	        'bl.ui.log.js',
	        'bl.policy.network.js'
			      ], function () {
			        try {
			          if (BL.Log && BL.Log.init) BL.Log.init();
			        } catch (_) { }

		        try {
		          if (BL.UA && BL.UA.__pendingHdrSupportLog && BL.Log && typeof BL.Log.push === 'function') {
		            BL.Log.push(BL.UA.__pendingHdrSupportLog);
		            BL.UA.__pendingHdrSupportLog = null;
		          }
		          if (BL.UA && !BL.UA.__navOverrideLogged && BL.UA.__pendingNavOverrideLog && BL.Log && typeof BL.Log.push === 'function') {
		            BL.Log.push(BL.UA.__pendingNavOverrideLog);
		            BL.UA.__navOverrideLogged = true;
		            BL.UA.__pendingNavOverrideLog = null;
		          }
		          if (BL.__pendingKeyMigrationLog && BL.Log && typeof BL.Log.push === 'function') {
		            BL.Log.push(BL.__pendingKeyMigrationLog);
		            BL.__pendingKeyMigrationLog = null;
		          }
		        } catch (_) { }

	        try { if (BL.PolicyNetwork && BL.PolicyNetwork.install) BL.PolicyNetwork.install(BL.Log); } catch (e1) { log('ERR', 'Policy', 'install failed', e1 && e1.message ? e1.message : e1); }

        loadSeq(['bl.storage.guards.js'], function () {
          try { if (BL.Storage && BL.Storage.Guards && BL.Storage.Guards.installPluginsBlacklistGuard) BL.Storage.Guards.installPluginsBlacklistGuard(BL.Log); } catch (e2) { log('ERR', 'Guards', 'install failed', e2 && e2.message ? e2.message : e2); }

          log('INF', 'Boot', 'phase0 installed', 'policy + guards are active pre-auth');
          resolve(true);
        });
      });
	    });

    return phase0Promise;
  };

  var phase1Promise = null;

  BL.Init.phase1 = function () {
    if (phase1Promise) return phase1Promise;

    phase1Promise = new Promise(function (resolve) {
	      loadSeq([
	        'bl.preload.js',
	        'bl.ui.filescanner.js',
	        'bl.backup.js',
	        'bl.ext.filters.js',
	        'bl.i18n.ru.js',
	        'bl.i18n.core.js',
	        'bl.menu.registry.js',
	        'bl.menu.core.js',
	        'bl.module.installer.js',
	        'bl.module.extfilters.js',
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
		          }).then(function (r) { try { if (BL.migrateKeysOnce) BL.migrateKeysOnce(); } catch (_) { } return r; });
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

  var startPromise = null;

  BL.Init.start = function () {
    if (startPromise) return startPromise;

    startPromise = new Promise(function (resolve) {
      BL.Init.phase0().then(function () {
        loadSeq(['bl.auth.js'], function () {
          if (!BL.Auth || !BL.Auth.start) {
            log('ERR', 'Boot', 'missing BL.Auth', '');
            return resolve(false);
          }

          log('INF', 'Auth', 'start', 'waiting for password');

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
