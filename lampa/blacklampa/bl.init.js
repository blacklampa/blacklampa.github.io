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
