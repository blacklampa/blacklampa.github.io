(function () {
  'use strict';

  var BL = window.BL = window.BL || {};
  BL.Autoplugin = BL.Autoplugin || {};

  var startPromise = null;

  function safe(fn) { try { return fn(); } catch (_) { return null; } }

  function toInt(x, d) {
    try { return (BL.Core && BL.Core.toInt) ? BL.Core.toInt(x, d) : d; }
    catch (_) { return d; }
  }

  function fmtErr(e) {
    try { return (BL.Core && BL.Core.fmtErr) ? BL.Core.fmtErr(e) : String(e || 'error'); }
    catch (_) { return 'error'; }
  }

  function absUrl(u) {
    try { return String(new URL(String(u), location.href).href); } catch (_) { return String(u); }
  }

  function configUrl(base) {
    var cfg = null;
    try { cfg = (BL.Config && typeof BL.Config.get === 'function') ? BL.Config.get() : BL.Config; } catch (_) { cfg = BL.Config; }
    cfg = cfg || {};
    var apCfg = cfg.autoplugin || {};
    var file = String(apCfg.jsonFile || '');
    try { return String(new URL(file, base || location.href).href); } catch (_) { return file; }
  }

  function normalizeConfig(cfg) {
    try {
      if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) return {};
      return cfg;
    } catch (_) {
      return {};
    }
  }

  function pickOption(opts, key, fallback) {
    try {
      if (!opts || typeof opts !== 'object') return fallback;
      if (opts[key] === undefined || opts[key] === null) return fallback;
      return opts[key];
    } catch (_) {
      return fallback;
    }
  }

  BL.Autoplugin.start = function (opts) {
    opts = opts || {};
    if (startPromise) return startPromise;

    var base = '';
    try { base = opts.base ? String(opts.base) : (BL.ctx && BL.ctx.base ? String(BL.ctx.base) : ''); } catch (_) { base = ''; }

    var url = configUrl(base);

    startPromise = new Promise(function (resolve) {
      var doneCalled = false;
      function doneSafe() {
        if (doneCalled) return;
        doneCalled = true;
        try { if (typeof opts.done === 'function') opts.done(); } catch (_) { }
        resolve(true);
      }

	      function doneLaterFallback() {
	        var cfg = null;
	        try { cfg = (BL.Config && typeof BL.Config.get === 'function') ? BL.Config.get() : BL.Config; } catch (_) { cfg = BL.Config; }
	        cfg = cfg || {};
	        var apCfg = cfg.autoplugin || {};
	        var ms = (typeof apCfg.doneFallbackMs === 'number') ? apCfg.doneFallbackMs : 0;
	        if (ms > 0) setTimeout(function () { doneSafe(); }, ms);
	      }

      function startWithConfig(cfg) {
	        cfg = normalizeConfig(cfg);

	        var cfgOpts = cfg.options || {};

		        var cfgAll = null;
		        try { cfgAll = (BL.Config && typeof BL.Config.get === 'function') ? BL.Config.get() : BL.Config; } catch (_) { cfgAll = BL.Config; }
		        cfgAll = cfgAll || {};
		        var AUTO_ENABLE_DISABLED = !!pickOption(cfgOpts, 'autoEnableDisabled', true);
		        var INJECT_NEWLY_INSTALLED = !!pickOption(cfgOpts, 'injectNewlyInstalled', true);
        // Auto-reload disabled intentionally (BlackLampa policy).
        // The page must never be reloaded automatically after installs/resets/reinit.
	        var RELOAD_AFTER_FIRST_INSTALL = false;
	        var RELOAD_DELAY_SEC = 0;

		        safe(function () { if (BL.Log && BL.Log.init) BL.Log.init(); });

	        function showError(source, message, extra) { safe(function () { BL.Log && BL.Log.showError && BL.Log.showError(source, message, extra); }); }
	        function showWarn(source, message, extra) { safe(function () { BL.Log && BL.Log.showWarn && BL.Log.showWarn(source, message, extra); }); }
	        function showOk(source, message, extra) { safe(function () { BL.Log && BL.Log.showOk && BL.Log.showOk(source, message, extra); }); }
	        function showInfo(source, message, extra) { safe(function () { BL.Log && BL.Log.showInfo && BL.Log.showInfo(source, message, extra); }); }
	        function showDbg(source, message, extra) { safe(function () { BL.Log && BL.Log.showDbg && BL.Log.showDbg(source, message, extra); }); }

        // ============================================================================
        // список автоплагинов (из JSON)
        // ============================================================================
	        var PLUGINS = [];
	        try {
	          var list = cfg.plugins;
	          if (Array.isArray(list)) {
	            for (var i = 0; i < list.length; i++) {
	              var u0 = getPluginUrl(list[i]);
	              if (u0) PLUGINS.push(String(u0));
	            }
	          }
	        } catch (_) { }

	        // ============================================================================
	        // ONE-TIME INSTALL FLAGS
	        // ============================================================================
	        var cfgAll2 = null;
	        try { cfgAll2 = (BL.Config && typeof BL.Config.get === 'function') ? BL.Config.get() : BL.Config; } catch (_) { cfgAll2 = BL.Config; }
	        cfgAll2 = cfgAll2 || {};
	        var apCfg2 = cfgAll2.autoplugin || {};
	        var apFlags2 = apCfg2.flags || {};
		        var AP_KEYS = {
		          done: String(apFlags2.done || ''),
		          sig: String(apFlags2.sig || ''),
		          ts: String(apFlags2.ts || '')
		        };
		        var UI_KEYS = {
		          softrefreshed_v1: 'blacklampa_ui_softrefreshed_v1'
		        };

	        // Storage helpers (official Lampa API):
	        // - For plugin install/remove and related flags we use Lampa.Storage (like lampa/scripts/addon.js).
	        // - Avoid direct localStorage mutations for deletion operations.
        function lsGet(k) {
          try { if (window.Lampa && Lampa.Storage && Lampa.Storage.get) return Lampa.Storage.get(k); } catch (_) { }
          return null;
        }
        function lsSet(k, v) {
          try { if (window.Lampa && Lampa.Storage && Lampa.Storage.set) return Lampa.Storage.set(k, v); } catch (_) { }
        }
        function lsDel(k) {
          try {
            if (window.Lampa && Lampa.Storage) {
              // IMPORTANT:
              // Lampa.Storage.remove() is NOT a "remove key" helper (it is used for sync workers).
              // To reliably reset flags (and bypass internal cache), write an empty value.
              if (Lampa.Storage.set) return Lampa.Storage.set(k, '');
            }
          } catch (_) { }
        }

        // ============================================================================
        // signature (как было)
        // ============================================================================
        function djb2(str) {
          var h = 5381;
          for (var i = 0; i < str.length; i++) h = ((h << 5) + h) + str.charCodeAt(i);
          return (h >>> 0).toString(16);
        }

        function calcPluginsSig() {
          var base = 'v1|' + PLUGINS.join('\n');
          return djb2(base);
        }

        function isFirstInstallCompleted() {
          var done = String(lsGet(AP_KEYS.done) || '') === '1';
          if (!done) return false;

          var sig = String(lsGet(AP_KEYS.sig) || '');
          if (!sig) return false;

          return sig === calcPluginsSig();
        }

        function markFirstInstallCompleted() {
          lsSet(AP_KEYS.done, '1');
          lsSet(AP_KEYS.sig, calcPluginsSig());
          lsSet(AP_KEYS.ts, String(Date.now()));
        }

	        function resetFirstInstallFlags() {
	          lsDel(AP_KEYS.done);
	          lsDel(AP_KEYS.sig);
	          lsDel(AP_KEYS.ts);
	        }

	        // ============================================================================
	        // UI soft refresh (reuse Lampa "interface_size" redraw mechanism)
	        // ============================================================================
	        function uiSoftRefreshedV1() {
	          try { return String(lsGet(UI_KEYS.softrefreshed_v1) || '') === '1'; } catch (_) { return false; }
	        }
	        function markUiSoftRefreshedV1() {
	          try { lsSet(UI_KEYS.softrefreshed_v1, '1'); } catch (_) { }
	        }
	        function softRefreshUi(reason) {
	          if (uiSoftRefreshedV1()) return false;
	          markUiSoftRefreshedV1();

		          try {
		            if (!window.Lampa || !Lampa.Storage || !Lampa.Storage.set) {
		              showWarn('UI', 'soft refresh unsupported', '');
		              return false;
		            }

	            // Post-preload SSOT: only localStorage (no defaults, no preload config).
	            // Trigger the same redraw chain as "Settings -> Interface size -> Smaller":
	            // Settings -> Storage.set('interface_size', ...)
	            // Storage.set -> Storage.listener.send('change', {name:'interface_size', value})
	            // Layer/Activity listen and redraw.
	            if (!window.localStorage || typeof window.localStorage.getItem !== 'function') {
	              showWarn('UI', 'soft refresh unsupported', 'localStorage missing');
	              return false;
	            }

		            var size = window.localStorage.getItem('interface_size');
		            if (size === null) {
		              showWarn('UI', 'soft refresh skipped', 'interface_size not in storage');
		              return false;
		            }

		            if (size !== undefined && size !== null) {
		              showInfo('UI', 'soft refresh', 'reason=' + String(reason || ''));
		              Lampa.Storage.set('interface_size', size);
		              return true;
		            }

		            showWarn('UI', 'soft refresh skipped', 'interface_size not in storage');
		            return false;
		          } catch (e) {
		            showWarn('UI', 'soft refresh unsupported', fmtErr(e));
		            return false;
		          }
	        }

	        BL.UI = BL.UI || {};
	        if (!BL.UI.softRefresh) BL.UI.softRefresh = softRefreshUi;

	        // ============================================================================
	        // status string helper + settings refresh
	        // ============================================================================
		        function getStatusInfoString() {
	          try {
	            var doneFlag = String(lsGet(AP_KEYS.done) || '') === '1';
	            var sigOk = String(lsGet(AP_KEYS.sig) || '') === calcPluginsSig();
	            var ts = toInt(lsGet(AP_KEYS.ts), 0);
	            return 'done=' + (doneFlag ? '1' : '0') + ', sig=' + (sigOk ? 'ok' : 'no') + (ts ? (', ts=' + new Date(ts).toLocaleString()) : '');
	          } catch (_) {
	            return 'done=?, sig=?';
	          }
	        }

	        function getStatusHelpString() {
	          return [
	            'done: 1 — первичная автоустановка выполнена',
	            'sig: ok — список плагинов совпадает с сохранённой подписью',
	            'ts: время фиксации первой установки'
	          ].join('\n');
	        }

	        function refreshInstallerSettingsUi() {
	          try {
	            if (!window.Lampa) return;
	            try {
	              if (window.BL && BL.PluginsInstaller && typeof BL.PluginsInstaller.refresh === 'function') return BL.PluginsInstaller.refresh();
	            } catch (_) { }
	          } catch (_) { }
	        }

        // ============================================================================
        // Plugins removal (official Lampa API)
        //
        // IMPORTANT:
        // - No direct localStorage edits for plugins list.
        // - Use Lampa.Storage (same approach as lampa/scripts/addon.js).
        // - No location.reload for delete actions: user may restart the app manually if needed.
        //   (Factory reset is handled separately and DOES reload.)
        // ============================================================================
        var MANAGED_URLS = {};

        function addManagedUrl(u) {
          try {
            var s = String(u || '');
            if (!s) return;
            MANAGED_URLS[s] = 1;
            MANAGED_URLS[absUrl(s)] = 1;
          } catch (_) { }
        }

        // Build managed urls list from config: active plugins[] only.
        // IMPORTANT: disabled[] are "additional" plugins and must be managed manually via Settings.
	        (function () {
	          try {
	            var p = cfg.plugins;
	            if (Array.isArray(p)) for (var i = 0; i < p.length; i++) addManagedUrl(getPluginUrl(p[i]));
	          } catch (_) { }
	        })();

        function getInstalledPlugins() {
          try {
            if (!window.Lampa || !Lampa.Storage || !Lampa.Storage.get) return [];
            var list = Lampa.Storage.get('plugins');
            if (!list || typeof list.length !== 'number') return [];
            return list;
          } catch (_) {
            return [];
          }
        }

	        function setInstalledPlugins(list) {
	          try {
	            if (!window.Lampa || !Lampa.Storage || !Lampa.Storage.set) return false;
	            Lampa.Storage.set('plugins', list);
	            refreshInstallerSettingsUi();
	            return true;
	          } catch (_) {
	            return false;
	          }
	        }

	        function getPluginUrl(item) {
	          try {
	            if (!item) return '';
	            if (typeof item === 'string') return String(item);
	            if (typeof item.url === 'string') return String(item.url);
	          } catch (_) { }
	          return '';
	        }

	        function findPluginIndexAny(arr, urlAbs) {
	          try {
	            if (!arr || typeof arr.length !== 'number') return -1;
	            var target = String(urlAbs || '');
	            if (!target) return -1;
	
	            for (var i = 0; i < arr.length; i++) {
	              var u = getPluginUrl(arr[i]);
	              if (!u) continue;
	              if (String(u) === target) return i;
	              try { if (absUrl(u) === target) return i; } catch (_) { }
	            }
	          } catch (_) { }
	          return -1;
	        }

	        function getInstalledState(urlAbs) {
	          var list = getInstalledPlugins();
	          var idx = findPluginIndexAny(list, urlAbs);
	          var st = (idx >= 0 && list[idx] && typeof list[idx].status === 'number') ? list[idx].status : null;
	          return { installed: idx >= 0, status: st };
	        }

	        function removeOnePlugin(urlAbs, title) {
	          if (!window.Lampa || !Lampa.Storage || !Lampa.Storage.get || !Lampa.Storage.set) {
	            showWarn('Settings', 'remove plugin', 'Lampa.Storage missing');
	            return 0;
	          }

	          var target = String(urlAbs || '');
	          if (!target) return 0;
	          title = String(title || '') || guessName(target);

	          var list = getInstalledPlugins();
	          var kept = [];
	          var removed = 0;

	          for (var i = 0; i < list.length; i++) {
	            var u = getPluginUrl(list[i]);
	            var ua = '';
	            try { ua = absUrl(u); } catch (_) { ua = String(u || ''); }
	            if (u && (u === target || ua === target)) removed++;
	            else kept.push(list[i]);
	          }

	          if (removed) setInstalledPlugins(kept);

	          if (removed) {
	            showOk('Settings', 'plugin removed', title || target);
	            try { if (Lampa.Noty && Lampa.Noty.show) Lampa.Noty.show('[[BlackLampa]] Плагин удалён: ' + String(title || target)); } catch (_) { }
	          } else {
	            showWarn('Settings', 'remove skip', title || target);
	            try { if (Lampa.Noty && Lampa.Noty.show) Lampa.Noty.show('[[BlackLampa]] Плагин не установлен: ' + String(title || target)); } catch (_) { }
	          }

	          return removed;
	        }

	        function setPluginStatus(urlAbs, status) {
	          if (!window.Lampa || !Lampa.Storage || !Lampa.Storage.get || !Lampa.Storage.set) {
	            showWarn('Settings', 'set status', 'Lampa.Storage missing');
	            return false;
	          }

	          var target = String(urlAbs || '');
	          if (!target) return false;

	          var list = getInstalledPlugins();
	          var idx = findPluginIndexAny(list, target);
	          if (idx < 0 || !list[idx]) return false;

	          list[idx].status = status;
	          setInstalledPlugins(list);

	          try {
	            if (status === 0) {
	              showOk('Settings', 'plugin disabled', target);
	              try { if (Lampa.Noty && Lampa.Noty.show) Lampa.Noty.show('[[BlackLampa]] Плагин отключён'); } catch (_) { }
	            } else {
	              showOk('Settings', 'plugin enabled', target);
	              try { if (Lampa.Noty && Lampa.Noty.show) Lampa.Noty.show('[[BlackLampa]] Плагин включён'); } catch (_) { }
	            }
	          } catch (_) { }

	          return true;
	        }

	        function enableOnePlugin(urlAbs) { return setPluginStatus(urlAbs, 1); }
	        function disableOnePlugin(urlAbs) { return setPluginStatus(urlAbs, 0); }

        function removeAllPluginsLampa() {
          if (!window.Lampa || !Lampa.Storage || !Lampa.Storage.set) {
            showWarn('Settings', 'remove plugins', 'Lampa.Storage missing');
            return 0;
          }

          var plugins = getInstalledPlugins();
          setInstalledPlugins([]);

          showOk('Settings', 'all Lampa plugins removed', '');
          try { if (Lampa.Noty && Lampa.Noty.show) Lampa.Noty.show('[[BlackLampa]] Плагины удалены. Для полного применения может потребоваться перезапуск приложения.'); } catch (_) { }

          return plugins.length;
        }

        function removeManagedPluginsLampa() {
          if (!window.Lampa || !Lampa.Storage || !Lampa.Storage.get || !Lampa.Storage.set) {
            showWarn('AutoPlugin', 'remove plugins', 'Lampa.Storage missing');
            return 0;
          }

          var plugins = getInstalledPlugins();
          var kept = [];
          var removed = 0;

          for (var i = 0; i < plugins.length; i++) {
            var it = plugins[i];
            var u = getPluginUrl(it);
            var ua = '';
            try { ua = absUrl(u); } catch (_) { ua = u; }
            if (u && (MANAGED_URLS[u] || MANAGED_URLS[ua])) removed++;
            else kept.push(it);
          }

          if (removed) setInstalledPlugins(kept);

          // WHY: do NOT reset first-install flags here.
          // Deleting managed plugins must not trigger unexpected re-install on next start.
          // Use "Переинициализация" if you want AutoPlugin to run again.

          showOk('AutoPlugin', 'managed plugins removed', '');
          try { if (Lampa.Noty && Lampa.Noty.show) Lampa.Noty.show('[[BlackLampa]] Плагины AutoPlugin удалены. Для полного применения может потребоваться перезапуск приложения.'); } catch (_) { }

          return removed;
        }

        function clearAllCookies() {
          try {
            var cookies = String(document.cookie || '').split(';');
            var host = String(location.hostname || '');
            var domainDot = host ? '.' + host : '';
            var path = String(location.pathname || '/');

            for (var i = 0; i < cookies.length; i++) {
              var c = cookies[i];
              var eq = c.indexOf('=');
              var name = (eq >= 0 ? c.slice(0, eq) : c).trim();
              if (!name) continue;

              // path variants
              document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
              document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=' + path;

              // domain variants (some browsers require explicit domain)
              if (host) {
                document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=' + host;
                document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=' + domainDot;
                document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=' + path + '; domain=' + host;
                document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=' + path + '; domain=' + domainDot;
              }
            }
          } catch (_) { }
        }

        function clearCachesBestEffort(done) {
          done = done || function () { };
          var called = false;
          function doneOnce() {
            if (called) return;
            called = true;
            try { done(); } catch (_) { }
          }

          // Safety timeout: never block reload on slow/broken cache backends.
          var t = null;
          try { t = setTimeout(doneOnce, 800); } catch (_) { t = null; }

          try {
            if (!window.caches || !caches.keys || !caches["delete"]) return doneOnce();
            caches.keys().then(function (keys) {
              var ps = [];
              for (var i = 0; i < keys.length; i++) {
                try { ps.push(caches["delete"](keys[i])); } catch (_) { }
              }
              return Promise.all(ps);
            }).then(function () {
              try { if (t) clearTimeout(t); } catch (_) { }
              doneOnce();
            })["catch"](function () {
              try { if (t) clearTimeout(t); } catch (_) { }
              doneOnce();
            });
          } catch (_) {
            try { if (t) clearTimeout(t); } catch (_) { }
            doneOnce();
          }
        }

        // Factory reset helper (domain-level):
        // Clears localStorage/sessionStorage/cookies and optional caches, then reloads the page.
        // NOTE: IndexedDB is intentionally not touched here (too risky/complex for TV engines).
        function factoryResetAndReload(reason) {
          reason = String(reason || 'factory reset');

          showWarn('Settings', 'factory reset', reason);

          // Reset AutoPlugin flags explicitly (even though localStorage.clear() will wipe them).
          // WHY: keeps behavior correct even if clear() is blocked in the environment.
          resetFirstInstallFlags();

          // Best-effort: clear auth flag too (auth module stores it in localStorage via Lampa.Storage).
          try {
            var authKey = (BL.Auth && BL.Auth.getKey) ? BL.Auth.getKey() : '';
            if (authKey && window.Lampa && Lampa.Storage && Lampa.Storage.set) Lampa.Storage.set(authKey, '');
          } catch (_) { }
          try {
            var authKey2 = (BL.Auth && BL.Auth.getKey) ? BL.Auth.getKey() : '';
            if (authKey2) localStorage.removeItem(String(authKey2));
          } catch (_) { }

          // Plugins (best-effort via official API) in case localStorage.clear() throws.
          try { removeAllPluginsLampa(); } catch (_) { }

          // Storage
          try { localStorage.clear(); } catch (_) { }
          try { sessionStorage && sessionStorage.clear && sessionStorage.clear(); } catch (_) { }

          // Cookies
          clearAllCookies();

          // Caches (non-blocking best-effort)
          clearCachesBestEffort(function () {
            setTimeout(function () {
              try { location.reload(); }
              catch (_) {
                try { location.href = location.href; } catch (__e) { }
              }
            }, 50);
          });
        }

        BL.Factory = BL.Factory || {};
        if (!BL.Factory.resetAndReload) BL.Factory.resetAndReload = factoryResetAndReload;

        function resetLampa() {
          // Existing "Сброс Lampa до заводских" must fully reset domain data and re-lock auth.
          factoryResetAndReload('user action');
        }

        // ============================================================================
        // reload countdown after first install (disabled)
        // ============================================================================
        function scheduleReloadCountdown(sec, reason) {
          try {
            if (!RELOAD_AFTER_FIRST_INSTALL) {
              // Auto-reload disabled intentionally (BlackLampa policy).
              showInfo('AutoPlugin', 'reload disabled by policy', String(reason || ''));
              return;
            }
            // Safety: even if RELOAD_AFTER_FIRST_INSTALL is toggled somewhere else,
            // BlackLampa must never auto-reload the page.
            showInfo('AutoPlugin', 'reload disabled by policy', String(reason || ''));
          } catch (_) { }
        }

        // ============================================================================
        // Settings UI (moved to BL.PluginsInstaller)
        // ============================================================================
        function initInstallerUiBridge() {
          try {
            if (!window.BL || !BL.PluginsInstaller || typeof BL.PluginsInstaller.init !== 'function') return;

            BL.PluginsInstaller.init({
              getConfig: function () {
                try { return (BL.Config && typeof BL.Config.get === 'function') ? (BL.Config.get() || {}) : (BL.Config || {}); } catch (_) { return BL.Config || {}; }
              },
              getManagedPlugins: function () {
                try { return PLUGINS.slice ? PLUGINS.slice(0) : PLUGINS; } catch (_) { return []; }
              },
              getExtrasPlugins: function () {
                try { return (cfg && Array.isArray(cfg.disabled)) ? cfg.disabled : []; } catch (_) { return []; }
              },
              getInstalledState: function (urlAbs) {
                try { return getInstalledState(String(urlAbs || '')); } catch (_) { return { installed: false, status: null }; }
              },
              installOne: function (urlAbs, o) {
                try { return ensureInstalledOne(String(urlAbs || ''), o || {}); } catch (_) { return Promise.resolve({ ok: false }); }
              },
              removeOne: function (urlAbs) {
                try { return Promise.resolve(removeOnePlugin(String(urlAbs || ''), '')); } catch (_) { return Promise.resolve(0); }
              },
              enableOne: function (urlAbs) {
                try { return Promise.resolve(enableOnePlugin(String(urlAbs || ''))); } catch (_) { return Promise.resolve(false); }
              },
              disableOne: function (urlAbs) {
                try { return Promise.resolve(disableOnePlugin(String(urlAbs || ''))); } catch (_) { return Promise.resolve(false); }
              },
              injectNow: function (urlAbs) {
                try { return injectNowPlugin(String(urlAbs || '')); } catch (_) { return Promise.resolve({ ok: false }); }
              },
              removeAllLampaPlugins: function () {
                try { return Promise.resolve(removeAllPluginsLampa()); } catch (_) { return Promise.resolve(0); }
              },
              removeManagedPluginsOnly: function () {
                try { return Promise.resolve(removeManagedPluginsLampa()); } catch (_) { return Promise.resolve(0); }
              },
              factoryReset: function () {
                try { resetLampa(); } catch (_) { }
              },
              resetFirstInstallFlags: function () {
                try { resetFirstInstallFlags(); } catch (_) { }
              },
              statusStrings: function () {
                try {
                  var raw = getStatusInfoString();
                  return { short: raw, help: getStatusHelpString(), raw: raw };
                } catch (_) {
                  return { short: '', help: '', raw: '' };
                }
              }
            });
          } catch (_) { }
        }

        // ============================================================================
        // global error hooks
        // ============================================================================
        var currentPlugin = null;

		        function onWinError(ev) {
		          try {
		            var src0 = currentPlugin || (ev && ev.filename ? ev.filename : 'window');
		            if (BL.Log && typeof BL.Log.showException === 'function') {
		              BL.Log.showException(src0, ev, { type: 'window.onerror' });
	              return;
	            }

	            var msg = ev && ev.message ? ev.message : 'error';
	            var file = ev && ev.filename ? ev.filename : '(no file)';
	            var line = (ev && typeof ev.lineno === 'number') ? ev.lineno : '?';
	            var col = (ev && typeof ev.colno === 'number') ? ev.colno : '?';
	            var stack = (ev && ev.error && ev.error.stack) ? String(ev.error.stack).split('\n')[0] : '';
	            var src = currentPlugin || file;
	            showError(src, msg, String(file) + ':' + String(line) + ':' + String(col) + (stack ? (' | ' + stack) : ''));
	          } catch (_) { }
	        }

		        function onUnhandledRejection(ev) {
		          try {
		            var src0 = currentPlugin || 'Promise';
		            if (BL.Log && typeof BL.Log.showException === 'function') {
		              BL.Log.showException(src0, ev, { type: 'unhandledrejection' });
	              return;
	            }

	            var reason = ev && ev.reason ? ev.reason : 'unhandled rejection';
	            var msg = fmtErr(reason);
	            var stack = (reason && reason.stack) ? String(reason.stack).split('\n')[0] : '';
	            showError(currentPlugin || 'Promise', msg, stack);
	          } catch (_) { }
	        }

	        function attachGlobalHooks() {
	          window.addEventListener('error', onWinError, true);
	          window.addEventListener('unhandledrejection', onUnhandledRejection);
	        }

        function detachGlobalHooks() {
          try { window.removeEventListener('error', onWinError, true); } catch (_) { }
          try { window.removeEventListener('unhandledrejection', onUnhandledRejection); } catch (_) { }
        }

	        function finalizeLoggingAfterDone() {
	          // Keep global hooks active; mode controls only auto-popup/UI.
	          safe(function () { if (BL.Log && BL.Log.hide) BL.Log.hide(); });
	        }

        // ============================================================================
        // IMPORTANT PART (install / enable / inject)
        // ============================================================================
        function guessName(url) {
          try {
            var u = new URL(String(url), location.href);
            var p = String(u.pathname || '');
            var last = p.split('/'); last = last[last.length - 1] || '';
            if (!last) last = u.hostname;
            return last;
          } catch (_) {
            var s = String(url);
            var a = s.split('/'); return a[a.length - 1] || s;
          }
        }

        function guessAuthor(url) {
          try {
            var u = new URL(String(url), location.href);
            return '@' + String(u.hostname || 'plugin');
          } catch (_) {
            return '@plugin';
          }
        }

        function findPluginIndex(arr, urlAbs) {
          for (var i = 0; i < arr.length; i++) {
            try {
              if (String(arr[i].url || '') === urlAbs) return i;
            } catch (_) { }
          }
          return -1;
        }

        function isBlockedUrl(u) {
          try { return (BL.PolicyNetwork && BL.PolicyNetwork.isBlockedUrl) ? BL.PolicyNetwork.isBlockedUrl(u) : null; }
          catch (_) { return null; }
        }

        function logBlocked(u, where, why) {
          var label = (why || 'Blocked');
          var extra = String(where) + ' | ' + String(u);
          showWarn('Net', 'BLOCKED (' + label + ')', extra);
        }

        function injectScript(urlAbs) {
          return new Promise(function (resolveInject) {
            try {
              var s = document.createElement('script');
              s.src = urlAbs;
              s.async = true;
              s.onload = function () { resolveInject({ ok: true, why: 'onload', url: urlAbs }); };
              s.onerror = function () { resolveInject({ ok: false, why: 'onerror', url: urlAbs }); };
              document.head.appendChild(s);
            } catch (e) {
              resolveInject({ ok: false, why: 'exception:' + fmtErr(e), url: urlAbs });
            }
          });
        }

        function injectNowPlugin(urlOne) {
          return new Promise(function (resolveInjectNow) {
            var urlAbs = absUrl(urlOne);

            var br = isBlockedUrl(urlAbs);
            if (br) {
              logBlocked(urlAbs, 'inject', br);
              resolveInjectNow({ ok: false, action: 'blocked', url: urlAbs, why: br });
              return;
            }

            injectScript(urlAbs).then(function (r) {
              if (r && r.ok) showOk('inject', 'ok', urlAbs);
              else showError('inject', 'fail', urlAbs + ' | ' + (r && r.why ? r.why : 'error'));
              resolveInjectNow({ ok: !!(r && r.ok), action: 'inject', url: urlAbs, why: r && r.why ? r.why : '' });
            });
          });
        }

        function ensureInstalledOne(urlOne, opts) {
          return new Promise(function (resolveOne) {
            opts = opts || {};
            var urlAbs = absUrl(urlOne);

            var br = isBlockedUrl(urlAbs);
            if (br) {
              logBlocked(urlAbs, 'install', br);
              resolveOne({ ok: false, action: 'blocked', url: urlAbs, why: br });
              return;
            }

            if (!window.Lampa || !Lampa.Storage) {
              resolveOne({ ok: false, action: 'no-lampa', url: urlAbs, why: 'Lampa.Storage missing' });
              return;
            }

            var plugins = Lampa.Storage.get('plugins');
            if (!plugins || typeof plugins.length !== 'number') plugins = [];

            var idx = findPluginIndex(plugins, urlAbs);
	            if (idx >= 0) {
	              if (AUTO_ENABLE_DISABLED && plugins[idx] && plugins[idx].status === 0) {
	                plugins[idx].status = 1;
	                Lampa.Storage.set('plugins', plugins);
	                refreshInstallerSettingsUi();
	                showOk('install', 'enabled', urlAbs);
	                resolveOne({ ok: true, action: 'enabled', url: urlAbs, why: 'was disabled' });
	                return;
	              }

              showDbg('install', 'skip (already)', urlAbs);
              resolveOne({ ok: true, action: 'skip', url: urlAbs, why: 'already installed' });
              return;
            }

            var entry = {
              author: guessAuthor(urlAbs),
              url: urlAbs,
              name: guessName(urlAbs),
              status: 1
            };

	            plugins.push(entry);
	            Lampa.Storage.set('plugins', plugins);
	            refreshInstallerSettingsUi();

	            showOk('install', 'installed', urlAbs);

            var doInject = INJECT_NEWLY_INSTALLED;
            try { if (opts && typeof opts === 'object' && typeof opts.inject === 'boolean') doInject = !!opts.inject; } catch (_) { doInject = INJECT_NEWLY_INSTALLED; }

            if (!doInject) {
              resolveOne({ ok: true, action: 'installed', url: urlAbs, why: 'no-inject' });
              return;
            }

            injectScript(urlAbs).then(function (r) {
              if (r.ok) showOk('inject', 'ok', urlAbs);
              else showError('inject', 'fail', urlAbs + ' | ' + r.why);
              resolveOne({ ok: r.ok, action: 'installed+inject', url: urlAbs, why: r.why });
            });
          });
        }

        function ensureInstalledAll(list) {
          return new Promise(function (resolveAll) {
            var i = 0;
            function step() {
              if (i >= list.length) { resolveAll(true); return; }
              var u = list[i++];
              ensureInstalledOne(u).then(function () {
                setTimeout(step, 0);
              });
            }
            step();
          });
        }

        function waitLampa(cb) {
          var tries = 0;
          var max = 240;
          var t = setInterval(function () {
            tries++;
            if (window.Lampa && Lampa.Listener && Lampa.Storage) {
              clearInterval(t);
              cb(true);
              return;
            }
            if (tries >= max) {
              clearInterval(t);
              cb(false);
            }
          }, 250);
        }

        // ============================================================================
        // MAIN (как было)
        // ============================================================================
        function start() {
          // Policy/guards are installed in modification.js PHASE 0 (pre-auth).
          // Calling them here again is intentional: these installs are idempotent and act as a safety net.

          // policy/network
          safe(function () { if (BL.PolicyNetwork && BL.PolicyNetwork.install) BL.PolicyNetwork.install(BL.Log); });

          // storage guards
          safe(function () { if (BL.Storage && BL.Storage.Guards && BL.Storage.Guards.installPluginsBlacklistGuard) BL.Storage.Guards.installPluginsBlacklistGuard(BL.Log); });

	          attachGlobalHooks();
	          safe(function () {
	            if (BL.Log && BL.Log.isPopupEnabled && BL.Log.isPopupEnabled() && BL.Log.ensurePopup) {
	              var el = BL.Log.ensurePopup();
	              if (el) el.style.display = 'none';
	            }
	          });
	          safe(function () {
	            var m = (BL.Log && BL.Log.getMode) ? BL.Log.getMode() : '';
	            if (m) showInfo('AutoPlugin', 'start', 'mode=' + String(m));
	            else showInfo('AutoPlugin', 'start', '');
	          });

          waitLampa(function (ok) {
            if (!ok) {
              showWarn('Lampa', 'wait timeout', 'Lampa not detected');
              finalizeLoggingAfterDone();
              doneSafe();
              return;
            }

            initInstallerUiBridge();
            safe(function () { if (BL.Log && BL.Log.hide) BL.Log.hide(); });

            if (isFirstInstallCompleted()) {
              showOk('AutoPlugin', 'skip', 'first-install flag present (no plugin checks)');
              refreshInstallerSettingsUi();
              finalizeLoggingAfterDone();
              doneSafe();
              return;
            }

	            ensureInstalledAll(PLUGINS).then(function () {
	              markFirstInstallCompleted();
	              refreshInstallerSettingsUi();

              var info = getStatusInfoString();
	              if (info.indexOf('done=1') >= 0) showOk('flags', 'written', info);
	              else showWarn('flags', 'unexpected', info);

	              showOk('AutoPlugin', 'done', 'total=' + String(PLUGINS.length));
	              safe(function () { if (BL.UI && BL.UI.softRefresh) BL.UI.softRefresh('first-install'); });
	              scheduleReloadCountdown(RELOAD_DELAY_SEC, 'first install completed');

	              finalizeLoggingAfterDone();
	              doneSafe();
	            });
          });
        }

        start();
        doneLaterFallback();
      }

			      function startWithoutConfig(err) {
			        try {
			          var msg = err && err.message ? err.message : String(err);
			          if (BL.Log && BL.Log.showWarn) BL.Log.showWarn('AutoPlugin', 'config load error', msg);
			        } catch (_) { }
			        startWithConfig({});
			      }

      try {
        if (BL.Core && BL.Core.loadJson) {
          BL.Core.loadJson(url, { cache: 'no-store' }).then(function (cfg) {
            startWithConfig(cfg);
          }).catch(startWithoutConfig);
        } else {
          startWithoutConfig(new Error('BL.Core.loadJson missing'));
        }
      } catch (e) {
        startWithoutConfig(e);
      }
    });

    return startPromise;
  };
})();
