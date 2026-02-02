(function () {
  'use strict';

  var BL = window.BL = window.BL || {};
  BL.Preload = BL.Preload || {};

  // Single source of truth: BL.Config.preload.*
  var cfg = null;
  try { cfg = (BL.Config && typeof BL.Config.get === 'function') ? BL.Config.get() : BL.Config; } catch (_) { cfg = BL.Config; }
  cfg = cfg || {};
  var preloadCfg = cfg.preload || {};
  var FLAG = String(preloadCfg.appliedFlagKey || '');
  var FALLBACK_KEY = String(preloadCfg.fallbackJsonKey || '');
  var PRELOAD_JSON_FILE = String(preloadCfg.jsonFile || '');

  function lsGet(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, String(v)); } catch (_) { } }

		  // Preload must be executed only AFTER successful auth (PHASE 1).
		  // It modifies localStorage to set default settings/state.
		  function log(level, message, extra) {
		    try {
		      if (BL.Log) {
		        if (level === 'ERR' && BL.Log.showError) return BL.Log.showError('Preload', message, extra);
		        if (level === 'WRN' && BL.Log.showWarn) return BL.Log.showWarn('Preload', message, extra);
        if (level === 'OK' && BL.Log.showOk) return BL.Log.showOk('Preload', message, extra);
        if (level === 'INF' && BL.Log.showInfo) return BL.Log.showInfo('Preload', message, extra);
        if (level === 'DBG' && BL.Log.showDbg) return BL.Log.showDbg('Preload', message, extra);
      }
	    } catch (_) { }
	    try {
	      var line = '[BlackLampa] ' + String(level) + ' Preload: ' + String(message) + (extra ? (' | ' + String(extra)) : '');
	      if (BL.Console) {
	        if (level === 'ERR' && BL.Console.error) return BL.Console.error(line);
	        if (level === 'WRN' && BL.Console.warn) return BL.Console.warn(line);
	        if (level === 'DBG' && BL.Console.debug) return BL.Console.debug(line);
	        if (level === 'INF' && BL.Console.info) return BL.Console.info(line);
	        if (BL.Console.log) return BL.Console.log(line);
	      }
	    } catch (_) { }
	  }

  function normalizeRoot(obj) {
    try {
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
      if (obj.storage && typeof obj.storage === 'object' && !Array.isArray(obj.storage)) return obj.storage;
      return obj;
    } catch (_) {
      return null;
    }
  }

  function applyJson(obj) {
    try {
      var map = normalizeRoot(obj);
      if (!map) {
        log('WRN', 'root is not object map', '');
        return;
      }

      var keys = Object.keys(map);
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        var v = map[k];

        if (typeof v === 'string') {
          // важно: НЕ JSON.stringify, иначе получишь "\"false\"" вместо "false"
          lsSet(k, v);
        }
        else if (v && typeof v === 'object') {
          // массивы/объекты
          lsSet(k, JSON.stringify(v));
        }
        else {
          // number/boolean/null/undefined
          lsSet(k, String(v));
        }
      }

      lsSet(FLAG, '1');
      log('OK', 'applied', 'keys=' + String(keys.length));
    } catch (e) {
      log('ERR', 'apply error', e && e.message ? e.message : e);
    }
  }

  function resolveJsonUrl(base) {
    try {
      return String(new URL(String(PRELOAD_JSON_FILE || ''), base || location.href).href);
    } catch (_) {
      return String(PRELOAD_JSON_FILE || '');
    }
  }

  BL.Preload.apply = function (opts) {
    opts = opts || {};

    return new Promise(function (resolve) {
      try {
        // already applied
        if (lsGet(FLAG) === '1') {
          log('DBG', 'skip (flag)', '');
          return resolve(true);
        }

        // where json lives
        var base = '';
        try { base = opts && opts.base ? String(opts.base) : (BL.ctx && BL.ctx.base ? String(BL.ctx.base) : ''); } catch (_) { base = ''; }
        var jsonUrl = resolveJsonUrl(base);

        // legacy fallback slot (kept for compatibility)
        try { if (opts && opts.fallbackKey) FALLBACK_KEY = String(opts.fallbackKey); } catch (_) { }
        try { void FALLBACK_KEY; } catch (_) { }

        if (window.fetch) {
          fetch(jsonUrl, { cache: 'no-cache' }).then(function (r) {
            return r.json();
          }).then(function (obj) {
            applyJson(obj);
            resolve(true);
          }).catch(function (e) {
            log('WRN', 'fetch error', e && e.message ? e.message : e);
            resolve(false);
          });
          return;
        }

        // XHR fallback
        var xhr = new XMLHttpRequest();
        xhr.open('GET', jsonUrl, true);
        xhr.onreadystatechange = function () {
          if (xhr.readyState !== 4) return;
          if (xhr.status >= 200 && xhr.status < 300) {
            try { applyJson(JSON.parse(xhr.responseText || '{}')); } catch (_) { }
          } else {
            log('WRN', 'xhr status', xhr.status);
          }
          resolve(true);
        };
        xhr.send(null);
      } catch (e2) {
        log('ERR', 'load error', e2 && e2.message ? e2.message : e2);
        resolve(false);
      }
    });
  };
})();
