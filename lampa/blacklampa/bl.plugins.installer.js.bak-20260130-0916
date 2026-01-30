(function () {
  'use strict';

  var BL = window.BL = window.BL || {};
  BL.PluginsInstaller = BL.PluginsInstaller || {};

  var API = BL.PluginsInstaller;

  var STATE = {
    inited: false,
    opts: null,
    componentId: '',
    componentName: '',
    componentIcon: '',
    prevRoute: '',
    route: 'root',
    payload: null,
    stack: [],
    lastIndex: {},
    busy: false,
    __hookInstalled: false
  };

  function safe(fn, fallback) { try { return fn(); } catch (_) { return fallback; } }

  function isPlainObject(x) {
    try { return !!x && typeof x === 'object' && !Array.isArray(x); } catch (_) { return false; }
  }

  function absUrl(u) {
    try { return String(new URL(String(u), location.href).href); } catch (_) { return String(u || ''); }
  }

  function guessName(url) {
    try {
      var u = new URL(String(url), location.href);
      var p = String(u.pathname || '');
      var last = p.split('/'); last = last[last.length - 1] || '';
      if (!last) last = u.hostname;
      return last;
    } catch (_) {
      var s = String(url || '');
      var a = s.split('/'); return a[a.length - 1] || s;
    }
  }

  function djb2(str) {
    var h = 5381;
    try {
      str = String(str || '');
      for (var i = 0; i < str.length; i++) h = ((h << 5) + h) + str.charCodeAt(i);
    } catch (_) { }
    return (h >>> 0).toString(16);
  }

  function getConfigSafe() {
    try {
      if (STATE.opts && typeof STATE.opts.getConfig === 'function') return STATE.opts.getConfig() || {};
    } catch (_) { }
    try { return (BL.Config && typeof BL.Config.get === 'function') ? (BL.Config.get() || {}) : (BL.Config || {}); } catch (_) { }
    return {};
  }

  function getSettingsCfg(cfg) {
    cfg = cfg || {};
    var pi = (cfg.pluginsInstaller && cfg.pluginsInstaller.settings) ? cfg.pluginsInstaller.settings : {};
    var ap = (cfg.autoplugin && cfg.autoplugin.settings) ? cfg.autoplugin.settings : {};
    return { pi: pi, ap: ap };
  }

  function pickSettingsComponentId(cfg) {
    try {
      var s = getSettingsCfg(cfg);
      var id = String(s.pi.componentId || '') || String(s.ap.componentId || '') || 'bl_autoplugin';
      return String(id || 'bl_autoplugin');
    } catch (_) {
      return 'bl_autoplugin';
    }
  }

  function pickSettingsName(cfg) {
    try {
      var s = getSettingsCfg(cfg);
      return String(s.pi.name || '') || 'BlackLampa Installer';
    } catch (_) { return 'BlackLampa Installer'; }
  }

  function pickSettingsIcon(cfg) {
    try {
      var s = getSettingsCfg(cfg);
      if (s.pi.icon) return String(s.pi.icon);
    } catch (_) { }
    return '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm1 14.5h-2v-2h2v2zm0-4h-2V6h2v6.5z" fill="currentColor"/></svg>';
  }

  var BL_UI_FONT_FAMILY = 'system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif';

  function applyBlUiFont(root) {
    try {
      if (!root) return;
      if (typeof root.css === 'function') root.css('font-family', BL_UI_FONT_FAMILY);
      else if (root.style) root.style.fontFamily = BL_UI_FONT_FAMILY;
    } catch (_) { }
  }

  function hasLampaSettingsApi() {
    try { return !!(window.Lampa && Lampa.SettingsApi); } catch (_) { return false; }
  }

  function dbgEnabled() {
    try { return !!(BL.cfg && BL.cfg.PERF_DEBUG); } catch (_) { return false; }
  }

  function dbg(msg, extra) {
    if (!dbgEnabled()) return;
    try { if (BL.Log && typeof BL.Log.showDbg === 'function') BL.Log.showDbg('PluginsInstaller', String(msg || ''), extra); } catch (_) { }
  }

  function getCurrentSettingsComponentIdSafe() {
    var cur = '';
    try { cur = (BL.Core && BL.Core.getQueryParam) ? String(BL.Core.getQueryParam('settings') || '') : ''; } catch (_) { cur = ''; }
    if (!cur) {
      try {
        var qs = String(location.search || '');
        var m = qs.match(/[?&]settings=([^&]+)/);
        cur = m ? decodeURIComponent(m[1]) : '';
      } catch (_) { cur = ''; }
    }
    return String(cur || '');
  }

  function isSettingsComponentVisible() {
    try { return getCurrentSettingsComponentIdSafe() === String(STATE.componentId || ''); } catch (_) { return false; }
  }

  function ensureSettingsComponentControls(where) {
    try {
      // Only restore when our Settings component is actually visible (avoid stealing focus from other screens).
      if (!isSettingsComponentVisible()) return;

      // If any BL popup viewer is active, close it (capture keydown handlers must not block Settings).
      try { if (window.BL && BL.Log && typeof BL.Log.closeViewer === 'function') BL.Log.closeViewer(); } catch (_) { }
      try { if (window.BL && BL.FileScanner && typeof BL.FileScanner.isOpen === 'function' && BL.FileScanner.isOpen() && typeof BL.FileScanner.close === 'function') BL.FileScanner.close(); } catch (_) { }

      var en = null;
      try { if (window.Lampa && Lampa.Controller && typeof Lampa.Controller.enabled === 'function') en = Lampa.Controller.enabled(); } catch (_) { en = null; }
      var name = '';
      try { name = en && en.name ? String(en.name) : ''; } catch (_) { name = ''; }

      // Stuck modal/loading controllers are the most common "no input" reason.
      if (name === 'modal') {
        try { if (window.Lampa && Lampa.Modal && typeof Lampa.Modal.close === 'function') Lampa.Modal.close(); } catch (_) { }
      } else if (name === 'loading') {
        try { if (window.Lampa && Lampa.Loading && typeof Lampa.Loading.stop === 'function') Lampa.Loading.stop(); } catch (_) { }
      }

      // After inject/install some plugins may toggle Controller away from Settings; force it back.
      if (name !== 'settings_component') {
        try { if (window.Lampa && Lampa.Controller && typeof Lampa.Controller.toggle === 'function') Lampa.Controller.toggle('settings_component'); } catch (_) { }
        dbg('restore controller', (where ? String(where) : '') + (name ? (' | from=' + name) : ''));
      }
    } catch (_) { }
  }

  function isSettingsComponentOpen() {
    try {
      if (!window.Lampa) return false;
      try {
        if (Lampa.Controller && typeof Lampa.Controller.enabled === 'function') {
          var en = Lampa.Controller.enabled();
          if (en && en.name && String(en.name) !== 'settings_component') return false;
        }
      } catch (_) { }
      return isSettingsComponentVisible();
    } catch (_) {
      return false;
    }
  }

  function getSettingsFocusIndexInfo() {
    try {
      if (!document || !document.querySelector) return { index: 0, found: false };
      var body = document.querySelector('.settings__body');
      if (!body) return { index: 0, found: false };
      var focus = body.querySelector('.selector.focus');
      if (!focus) return { index: 0, found: false };
      var nodes = body.querySelectorAll('.selector');
      for (var i = 0; i < nodes.length; i++) {
        if (nodes[i] === focus) return { index: i, found: true };
      }
    } catch (_) { }
    return { index: 0, found: false };
  }

  function getSettingsFocusIndexSafe() {
    try { return getSettingsFocusIndexInfo().index || 0; } catch (_) { return 0; }
  }

  function removeComponentSafe(id) {
    try {
      if (!id) return;
      if (window.Lampa && Lampa.SettingsApi && Lampa.SettingsApi.removeComponent) Lampa.SettingsApi.removeComponent(String(id));
    } catch (_) { }
  }

  function resetParams() {
    try { if (window.Lampa && Lampa.SettingsApi && Lampa.SettingsApi.removeParams) Lampa.SettingsApi.removeParams(String(STATE.componentId)); } catch (_) { }
  }

  function confirmAction(title, text, onYes) {
    try {
      if (window.Lampa && Lampa.Modal && typeof Lampa.Modal.open === 'function' && window.$) {
        // IMPORTANT: Lampa.Modal.close() does not restore Controller by itself.
        // If we close via "Cancel"/BACK without toggling back, input may stay stuck on controller "modal".
        var focusBefore = getSettingsFocusIndexSafe();
        try { storeLastIndex(STATE.route, focusBefore); } catch (_) { }
        var restore = function (where) {
          setTimeout(function () {
            try { ensureSettingsComponentControls(String(where || 'confirm')); } catch (_) { }
          }, 0);
        };

        var html = $('<div class="about"></div>');
        var t = $('<div class="about__text"></div>');
        t.text(String(text || title || 'Confirm?'));
        html.append(t);
        Lampa.Modal.open({
          title: String(title || ''),
          size: 'medium',
          align: 'center',
          mask: true,
          html: html,
          onBack: function () {
            try { if (Lampa.Modal && Lampa.Modal.close) Lampa.Modal.close(); } catch (_) { }
            restore('confirm:back');
          },
          buttons: [{
            name: 'Отмена',
            onSelect: function () {
              try { if (Lampa.Modal && Lampa.Modal.close) Lampa.Modal.close(); } catch (_) { }
              restore('confirm:cancel');
            }
          }, {
            name: 'OK',
            onSelect: function () {
              try { if (Lampa.Modal && Lampa.Modal.close) Lampa.Modal.close(); } catch (_) { }
              try { if (typeof onYes === 'function') onYes(); } catch (_) { }
            }
          }]
        });
        return;
      }
    } catch (_) { }
    try { if (window.confirm(String(text || title || 'Confirm?'))) { if (typeof onYes === 'function') onYes(); } } catch (_) { }
  }

  function showNoty(msg) {
    try { if (window.Lampa && Lampa.Noty && Lampa.Noty.show) Lampa.Noty.show(String(msg || '')); } catch (_) { }
  }

  function runOnce(title, text, fn) {
    if (STATE.busy) {
      showNoty('[[BlackLampa]] Операция уже выполняется...');
      return;
    }
    confirmAction(title, text, function () {
      if (STATE.busy) return;
      STATE.busy = true;
      showNoty('[[BlackLampa]] Выполняется...');
      setTimeout(function () {
        var res = null;
        try { res = fn && fn(); } catch (_) { res = null; }

        if (res && typeof res.then === 'function') {
          res.then(function () {
            STATE.busy = false;
            API.refresh();
          }, function () {
            STATE.busy = false;
            API.refresh();
          });
          return;
        }

        STATE.busy = false;
        API.refresh();
      }, 0);
    });
  }

  function storeLastIndex(route, idx) {
    try { STATE.lastIndex[String(route || '')] = (typeof idx === 'number') ? idx : 0; } catch (_) { }
  }

  function getLastIndex(route) {
    try {
      var v = STATE.lastIndex[String(route || '')];
      return (typeof v === 'number') ? v : 0;
    } catch (_) { return 0; }
  }

  function setRoute(route, payload) {
    STATE.route = String(route || 'root');
    STATE.payload = payload || null;
  }

  function back() {
    try { storeLastIndex(STATE.route, getSettingsFocusIndexSafe()); } catch (_) { }

    var prev = null;
    try { prev = STATE.stack && STATE.stack.length ? STATE.stack.pop() : null; } catch (_) { prev = null; }

    if (!prev || !prev.route) {
      STATE.prevRoute = '';
      openInternal('root', null, getLastIndex('root'), { resetStack: true, push: false });
      return;
    }

    STATE.prevRoute = String(prev.route || '');
    openInternal(String(prev.route), prev.payload || null, getLastIndex(String(prev.route)), { resetStack: false, push: false });
  }

  function push(route, payload, focusIndexNext, fromFocusIndex) {
    try {
      var fr = STATE.route || 'root';
      STATE.prevRoute = String(fr || '');
      var fi = (typeof fromFocusIndex === 'number') ? fromFocusIndex : getSettingsFocusIndexSafe();
      storeLastIndex(fr, fi);
      STATE.stack.push({ route: fr, payload: STATE.payload || null });
    } catch (_) { }
    openInternal(route, payload, focusIndexNext, { resetStack: false, push: false });
  }

  function go(route, payload, focusIndex) {
    openInternal(route, payload, focusIndex, { resetStack: false, push: false });
  }

  // ============================================================================
  // Screen builders
  // ============================================================================
  function toPluginUrl(raw) {
    try {
      if (!raw) return '';
      if (typeof raw === 'string') return String(raw);
      if (isPlainObject(raw) && typeof raw.url === 'string') return String(raw.url);
    } catch (_) { }
    return '';
  }

  function extraMeta(raw) {
    try {
      var url = toPluginUrl(raw);
      if (!url) return null;
      var urlAbs = absUrl(url);

      var title = '';
      var desc = '';
      try { if (isPlainObject(raw) && typeof raw.title === 'string') title = String(raw.title || ''); } catch (_) { title = ''; }
      try { if (isPlainObject(raw) && typeof raw.desc === 'string') desc = String(raw.desc || ''); } catch (_) { desc = ''; }
      if (!title) title = guessName(urlAbs);
      if (!desc) desc = '';

      var hash = djb2('extra|' + urlAbs);
      return { raw: raw, url: url, urlAbs: urlAbs, title: title, desc: desc, hash: hash };
    } catch (_) {
      return null;
    }
  }

  function managedMeta(raw) {
    try {
      var url = toPluginUrl(raw);
      if (!url) return null;
      var urlAbs = absUrl(url);

      var title = '';
      var desc = '';
      try { if (isPlainObject(raw) && typeof raw.title === 'string') title = String(raw.title || ''); } catch (_) { title = ''; }
      try { if (isPlainObject(raw) && typeof raw.desc === 'string') desc = String(raw.desc || ''); } catch (_) { desc = ''; }
      if (!title) title = guessName(urlAbs);
      if (!desc) desc = '';

      var hash = djb2('managed|' + urlAbs);
      return { raw: raw, url: url, urlAbs: urlAbs, title: title, desc: desc, hash: hash };
    } catch (_) {
      return null;
    }
  }

  function getInstalledStateSafe(urlAbs) {
    try {
      if (STATE.opts && typeof STATE.opts.getInstalledState === 'function') return STATE.opts.getInstalledState(String(urlAbs || '')) || { installed: false, status: null };
    } catch (_) { }
    return { installed: false, status: null };
  }

  function ensureStatusDot(item) {
    try {
      if (!window.$ || !item) return null;
      if (item.find('.settings-param__status').length === 0) item.append('<div class="settings-param__status one"></div>');
      return item.find('.settings-param__status');
    } catch (_) {
      return null;
    }
  }

  function setStatusDotPlugin($st, st) {
    try {
      if (!$st || !$st.length) return;
      if (st && st.installed && st.status !== 0) $st.css('background-color', '').removeClass('active error').addClass('active');
      else if (st && st.installed && st.status === 0) $st.removeClass('active error').css('background-color', 'rgb(255, 165, 0)');
      else $st.css('background-color', '').removeClass('active error').addClass('error');
    } catch (_) { }
  }

	  function buildRootScreen() {
	    try {
      // 0) Managed
      Lampa.SettingsApi.addParam({
        component: STATE.componentId,
        param: { name: 'bl_pi_root_managed', type: 'static', default: true },
        field: { name: 'Managed plugins', description: 'Плагины из bl.autoplugin.json → plugins[].' },
        onRender: function (item) {
          try { if (item && item.on) item.on('hover:enter', function () { push('managed', null, 0, 0); }); } catch (_) { }
        }
      });

      // 1) Extras
      Lampa.SettingsApi.addParam({
        component: STATE.componentId,
        param: { name: 'bl_pi_root_extras', type: 'static', default: true },
        field: { name: 'Extras', description: 'Дополнительные плагины из bl.autoplugin.json → disabled[].' },
        onRender: function (item) {
          try { if (item && item.on) item.on('hover:enter', function () { push('extras', null, 0, 1); }); } catch (_) { }
        }
      });

      // 2) Blocklist
      Lampa.SettingsApi.addParam({
        component: STATE.componentId,
        param: { name: 'bl_pi_root_blocklist', type: 'static', default: true },
        field: { name: 'Blocklist', description: 'URL Blocklist (BlackLampa network policy).' },
        onRender: function (item) {
          try { if (item && item.on) item.on('hover:enter', function () { push('blocklist', null, 0, 2); }); } catch (_) { }
        }
      });

      // 3) JS query params
      Lampa.SettingsApi.addParam({
        component: STATE.componentId,
        param: { name: 'bl_pi_root_jsqp', type: 'static', default: true },
        field: { name: 'JS query params', description: 'Подмена/удаление GET параметров (origin/logged/reset) в запросах на *.js' },
        onRender: function (item) {
          try { if (item && item.on) item.on('hover:enter', function () { push('jsqp', null, 0, 3); }); } catch (_) { }
        }
      });

      // 4) User-Agent
      Lampa.SettingsApi.addParam({
        component: STATE.componentId,
        param: { name: 'bl_pi_root_ua', type: 'static', default: true },
        field: { name: 'User-Agent', description: 'Подмена navigator.* (userAgent/appVersion/platform/vendor) + (опц.) X-BL-UA.' },
        onRender: function (item) {
          try { if (item && item.on) item.on('hover:enter', function () { push('ua', null, 0, 4); }); } catch (_) { }
        }
      });

	      // 5) Logging
	      Lampa.SettingsApi.addParam({
	        component: STATE.componentId,
	        param: { name: 'bl_pi_root_logging', type: 'static', default: true },
	        field: { name: 'Logging', description: 'Режим popup-логов (silent / auto popup).' },
	        onRender: function (item) {
	          try { if (item && item.on) item.on('hover:enter', function () { push('logging', null, 0, 5); }); } catch (_) { }
	        }
	      });

	      // 6) Log viewer (kept from legacy AutoPlugin UI)
	      Lampa.SettingsApi.addParam({
	        component: STATE.componentId,
	        param: { name: 'bl_pi_root_log_viewer', type: 'static', default: true },
	        field: { name: 'Log viewer', description: 'Открывает popup-лог BlackLampa.' },
        onRender: function (item) {
          try {
            if (!item || !item.on) return;
            item.on('hover:enter', function () {
              try {
                if (window.BL && BL.Log && typeof BL.Log.openViewer === 'function') BL.Log.openViewer();
                else if (window.BL && BL.Log && typeof BL.Log.ensurePopup === 'function') {
                  BL.Log.ensurePopup();
                  if (BL.Log && BL.Log.showInfo) BL.Log.showInfo('PluginsInstaller', 'viewer', 'BL.Log.openViewer missing');
                }
              } catch (_) { }
            });
          } catch (_) { }
        }
	      });

	      // 7) Backup / Transfer
	      Lampa.SettingsApi.addParam({
	        component: STATE.componentId,
	        param: { name: 'bl_pi_root_backup', type: 'static', default: true },
	        field: { name: 'Backup / Transfer', description: 'Экспорт/импорт настроек BlackLampa (localStorage) + шифрование + history.' },
	        onRender: function (item) {
	          try { if (item && item.on) item.on('hover:enter', function () { push('backup', null, 0, 7); }); } catch (_) { }
	        }
	      });

	      // 8) Filesystem scan (popup)
	      Lampa.SettingsApi.addParam({
	        component: STATE.componentId,
	        param: { name: 'bl_pi_root_filesystem_scan', type: 'static', default: true },
	        field: { name: 'Filesystem Scan', description: 'Открывает popup-сканер файлов из bl.filescan.json.' },
	        onRender: function (item) {
	          try {
	            if (!item || !item.on) return;
	            item.on('hover:enter', function () {
	              safe(function () {
	                if (window.BL && BL.FileScanner && typeof BL.FileScanner.open === 'function') BL.FileScanner.open();
	              });
	            });
	          } catch (_) { }
	        }
	      });

      // 9) Danger
      Lampa.SettingsApi.addParam({
        component: STATE.componentId,
        param: { name: 'bl_pi_root_danger', type: 'static', default: true },
        field: { name: 'Danger zone', description: 'Сброс/очистка/опасные операции.' },
        onRender: function (item) {
          try { if (item && item.on) item.on('hover:enter', function () { push('danger', null, 0, 9); }); } catch (_) { }
        }
      });

	      // X) Status (last)
	      Lampa.SettingsApi.addParam({
	        component: STATE.componentId,
	        param: { name: 'bl_pi_root_status', type: 'static', values: '', default: '' },
	        field: { name: 'Status', description: '' },
	        onRender: function (item) {
	          try {
	            if (!window.$ || !item) return;
	            var ss = null;
	            try { ss = (STATE.opts && typeof STATE.opts.statusStrings === 'function') ? (STATE.opts.statusStrings() || null) : null; } catch (_) { ss = null; }

	            var raw = ss && ss.raw ? String(ss.raw) : '';
	            var help = ss && ss.help ? String(ss.help) : '';
	            var short = ss && ss.short ? String(ss.short) : '';

	            var $d = item.find('.settings-param__descr');
	            if (!$d.length) {
	              item.append('<div class="settings-param__descr"></div>');
	              $d = item.find('.settings-param__descr');
	            }
	            $d.empty();
	            if (short) $d.append($('<div></div>').text(short));
	            if (raw && raw !== short) $d.append($('<div></div>').text(raw));
	            if (help) $d.append($('<div style=\"opacity:0.85;margin-top:0.35em;white-space:pre-wrap;\"></div>').text(help));
	          } catch (_) { }
	        }
	      });
	    } catch (_) { }
	  }

	  function buildLoggingScreen() {
	    try {
	      var mode = 'silent';
	      try { mode = (window.BL && BL.Log && typeof BL.Log.getMode === 'function') ? String(BL.Log.getMode() || 'silent') : 'silent'; } catch (_) { mode = 'silent'; }
	      if (mode !== 'popup') mode = 'silent';

	      // 0) No popup (default)
	      Lampa.SettingsApi.addParam({
	        component: STATE.componentId,
	        param: { name: 'bl_pi_logging_silent', type: 'static', default: true },
	        field: { name: (mode === 'silent' ? '✓ No popup (default)' : 'No popup (default)'), description: 'Popup не открывается автоматически. Логи всё равно пишутся в память.' },
	        onRender: function (item) {
	          try {
	            if (!item || !item.on) return;
	            item.on('hover:enter', function () {
	              try { if (window.BL && BL.Log && typeof BL.Log.setMode === 'function') BL.Log.setMode('silent'); } catch (_) { }
	              try { API.refresh(); } catch (_) { }
	            });
	          } catch (_) { }
	        }
	      });

	      // 1) Auto popup
	      Lampa.SettingsApi.addParam({
	        component: STATE.componentId,
	        param: { name: 'bl_pi_logging_popup', type: 'static', default: true },
	        field: { name: (mode === 'popup' ? '✓ Auto popup' : 'Auto popup'), description: 'Разрешает авто-показ popup при логах/ошибках.' },
	        onRender: function (item) {
	          try {
	            if (!item || !item.on) return;
	            item.on('hover:enter', function () {
	              try { if (window.BL && BL.Log && typeof BL.Log.setMode === 'function') BL.Log.setMode('popup'); } catch (_) { }
	              try { API.refresh(); } catch (_) { }
	            });
	          } catch (_) { }
	        }
	      });
	    } catch (_) { }
	  }

  function buildJsqpScreen() {
    try {
      var DEF = {
        bl_jsqp_enabled: '1',
        bl_jsqp_force: '0',
        bl_jsqp_origin_mode: 'remove',
        bl_jsqp_origin_value: '',
        bl_jsqp_logged_mode: 'remove',
        bl_jsqp_logged_value: 'false',
        bl_jsqp_reset_mode: 'remove',
        bl_jsqp_reset_value: '0',
        bl_jsqp_match: '\\\\.js(\\\\?|$)',
        bl_jsqp_params: 'origin,logged,reset'
      };

      function sGet(k, fallback) {
        var v = null;
        try { if (window.Lampa && Lampa.Storage && Lampa.Storage.get) v = Lampa.Storage.get(String(k)); } catch (_) { v = null; }
        if (v === undefined || v === null) {
          try { if (window.localStorage) v = localStorage.getItem(String(k)); } catch (_) { v = null; }
        }
        if (v === undefined || v === null) return fallback;
        return v;
      }

      function sSet(k, v) {
        try { if (window.Lampa && Lampa.Storage && Lampa.Storage.set) return Lampa.Storage.set(String(k), String(v)); } catch (_) { }
        try { if (window.localStorage) localStorage.setItem(String(k), String(v)); } catch (_) { }
      }

      function sEnsure(k, def) {
        try {
          var v = sGet(k, null);
          if (v === undefined || v === null) sSet(k, def);
        } catch (_) { }
      }

      // Seed defaults
      try {
        sEnsure('bl_jsqp_enabled', DEF.bl_jsqp_enabled);
        sEnsure('bl_jsqp_force', DEF.bl_jsqp_force);
        sEnsure('bl_jsqp_origin_mode', DEF.bl_jsqp_origin_mode);
        sEnsure('bl_jsqp_origin_value', DEF.bl_jsqp_origin_value);
        sEnsure('bl_jsqp_logged_mode', DEF.bl_jsqp_logged_mode);
        sEnsure('bl_jsqp_logged_value', DEF.bl_jsqp_logged_value);
        sEnsure('bl_jsqp_reset_mode', DEF.bl_jsqp_reset_mode);
        sEnsure('bl_jsqp_reset_value', DEF.bl_jsqp_reset_value);
        sEnsure('bl_jsqp_match', DEF.bl_jsqp_match);
        sEnsure('bl_jsqp_params', DEF.bl_jsqp_params);
      } catch (_) { }

      var resetMode = String(sGet('bl_jsqp_reset_mode', DEF.bl_jsqp_reset_mode) || DEF.bl_jsqp_reset_mode);
      resetMode = resetMode.toLowerCase();
      if (resetMode !== 'remove' && resetMode !== 'set' && resetMode !== 'random') resetMode = DEF.bl_jsqp_reset_mode;

      function shortStr(s, max) {
        s = String(s || '');
        max = Number(max || 220);
        if (s.length <= max) return s;
        return s.slice(0, max - 1) + '…';
      }

      // Info
      try {
        var info = 'Подмена/удаление GET параметров (origin/logged/reset) в запросах на *.js';
        Lampa.SettingsApi.addParam({
          component: STATE.componentId,
          param: { name: 'bl_jsqp_info', type: 'static', values: info, default: info },
          field: { name: 'JS query params', description: info }
        });
      } catch (_) { }

      // Enabled
      try {
        Lampa.SettingsApi.addParam({
          component: STATE.componentId,
          param: { name: 'bl_jsqp_enabled', type: 'select', values: { 0: 'OFF', 1: 'ON' }, default: 1 },
          field: { name: 'Enabled', description: 'Включить переписывание URL для *.js.' }
        });
      } catch (_) { }

      // Force apply
      try {
        Lampa.SettingsApi.addParam({
          component: STATE.componentId,
          param: { name: 'bl_jsqp_force', type: 'select', values: { 0: 'OFF', 1: 'ON' }, default: 0 },
          field: { name: 'Force apply', description: 'Переписывать даже если params отсутствуют в URL.' }
        });
      } catch (_) { }

      // Match regex
      try {
        Lampa.SettingsApi.addParam({
          component: STATE.componentId,
          param: { name: 'bl_jsqp_match', type: 'input', values: '', default: DEF.bl_jsqp_match, placeholder: DEF.bl_jsqp_match },
          field: { name: 'Match regex', description: 'RegExp (string) для матчинга URL. По умолчанию: \\\\.js(\\\\?|$)' }
        });
      } catch (_) { }

      // Params list
      try {
        Lampa.SettingsApi.addParam({
          component: STATE.componentId,
          param: { name: 'bl_jsqp_params', type: 'input', values: '', default: DEF.bl_jsqp_params, placeholder: DEF.bl_jsqp_params },
          field: { name: 'Params list (csv)', description: 'Список управляемых параметров (origin,logged,reset).' }
        });
      } catch (_) { }

      // Origin mode
      try {
        Lampa.SettingsApi.addParam({
          component: STATE.componentId,
          param: { name: 'bl_jsqp_origin_mode', type: 'select', values: { remove: 'remove', set: 'set', set_b64: 'set (base64)' }, default: DEF.bl_jsqp_origin_mode },
          field: { name: 'Origin mode', description: 'remove => удалить | set => задать значение | set (base64) => btoa(utf8).' }
        });
      } catch (_) { }

      // Origin value
      try {
        Lampa.SettingsApi.addParam({
          component: STATE.componentId,
          param: { name: 'bl_jsqp_origin_value', type: 'input', values: '', default: DEF.bl_jsqp_origin_value, placeholder: 'example.com' },
          field: { name: 'Origin value', description: 'Если origin_mode=set: ставим как есть (без base64).' }
        });
      } catch (_) { }

      // Logged mode
      try {
        Lampa.SettingsApi.addParam({
          component: STATE.componentId,
          param: { name: 'bl_jsqp_logged_mode', type: 'select', values: { remove: 'remove', set: 'set' }, default: DEF.bl_jsqp_logged_mode },
          field: { name: 'Logged mode', description: 'remove => удалить | set => задать значение.' }
        });
      } catch (_) { }

      // Logged value
      try {
        Lampa.SettingsApi.addParam({
          component: STATE.componentId,
          param: { name: 'bl_jsqp_logged_value', type: 'input', values: '', default: DEF.bl_jsqp_logged_value, placeholder: 'false' },
          field: { name: 'Logged value', description: 'Если logged_mode=set (строка, например 0/false).' }
        });
      } catch (_) { }

      // Reset mode
      try {
        Lampa.SettingsApi.addParam({
          component: STATE.componentId,
          param: { name: 'bl_jsqp_reset_mode', type: 'select', values: { remove: 'remove', set: 'set', random: 'random' }, default: DEF.bl_jsqp_reset_mode },
          field: { name: 'Reset mode', description: 'remove => удалить | set => value | random => Math.random().' },
          onChange: function () {
            go('jsqp', null, getSettingsFocusIndexSafe());
          }
        });
      } catch (_) { }

      // Reset value (hidden when random)
      if (resetMode !== 'random') {
        try {
          Lampa.SettingsApi.addParam({
            component: STATE.componentId,
            param: { name: 'bl_jsqp_reset_value', type: 'input', values: '', default: DEF.bl_jsqp_reset_value, placeholder: '0' },
            field: { name: 'Reset value', description: 'Если reset_mode=set.' }
          });
        } catch (_) { }
      }

      // Test URL (optional)
      try {
        var ex = '/x.js?logged=false&reset=0.123&origin=YmxhY2tsYW1wYS5naXRodWIuaW8%3D';
        Lampa.SettingsApi.addParam({
          component: STATE.componentId,
          param: { name: 'bl_jsqp_test_url', type: 'input', values: '', default: ex, placeholder: ex },
          field: { name: 'Test URL', description: 'URL для теста (опционально).' }
        });
      } catch (_) { }

      // Test rewrite
      try {
        Lampa.SettingsApi.addParam({
          component: STATE.componentId,
          param: { name: 'bl_jsqp_test', type: 'button' },
          field: { name: 'Test rewrite', description: 'Показывает результат BL.Net.rewriteJsQuery().' },
          onChange: function () {
            try {
              var sample = '';
              try { sample = String(sGet('bl_jsqp_test_url', '') || ''); } catch (_) { sample = ''; }
              sample = String(sample || '').trim();
              if (!sample) sample = String(location.href || '');

              var after = sample;
              try {
                if (window.BL && BL.Net && typeof BL.Net.rewriteJsQuery === 'function') after = BL.Net.rewriteJsQuery(sample);
              } catch (_) { after = sample; }

              if (String(after) === String(sample)) showNoty('[[BlackLampa]] JSQP: no change');
              else showNoty('[[BlackLampa]] JSQP: ' + shortStr(after, 240));
            } catch (_) { }
          }
        });
      } catch (_) { }

      // Reset to defaults
      try {
        Lampa.SettingsApi.addParam({
          component: STATE.componentId,
          param: { name: 'bl_jsqp_reset_defaults', type: 'button' },
          field: { name: 'Reset to defaults', description: 'Сбрасывает настройки JSQP.' },
          onChange: function () {
            try {
              sSet('bl_jsqp_enabled', DEF.bl_jsqp_enabled);
              sSet('bl_jsqp_force', DEF.bl_jsqp_force);
              sSet('bl_jsqp_origin_mode', DEF.bl_jsqp_origin_mode);
              sSet('bl_jsqp_origin_value', DEF.bl_jsqp_origin_value);
              sSet('bl_jsqp_logged_mode', DEF.bl_jsqp_logged_mode);
              sSet('bl_jsqp_logged_value', DEF.bl_jsqp_logged_value);
              sSet('bl_jsqp_reset_mode', DEF.bl_jsqp_reset_mode);
              sSet('bl_jsqp_reset_value', DEF.bl_jsqp_reset_value);
              sSet('bl_jsqp_match', DEF.bl_jsqp_match);
              sSet('bl_jsqp_params', DEF.bl_jsqp_params);
            } catch (_) { }
            showNoty('[[BlackLampa]] JSQP: defaults restored');
            go('jsqp', null, getSettingsFocusIndexSafe());
          }
        });
      } catch (_) { }
    } catch (_) { }
  }

  function buildUaScreen() {
    try {
      var DEF = {
        bl_ua_enabled: '0',
        bl_ua_mode: 'preset',
        bl_ua_preset: 'chrome_win_latest',
        bl_ua_custom: '',
        bl_ua_apply_scope: 'all',
        bl_ua_reload_on_change: '1',
        bl_ua_add_header: '0'
      };

      function sGet(k, fallback) {
        var v = null;
        try { if (window.Lampa && Lampa.Storage && Lampa.Storage.get) v = Lampa.Storage.get(String(k)); } catch (_) { v = null; }
        if (v === undefined || v === null) {
          try { if (window.localStorage) v = localStorage.getItem(String(k)); } catch (_) { v = null; }
        }
        if (v === undefined || v === null) return fallback;
        return v;
      }

      function sSet(k, v) {
        try { if (window.Lampa && Lampa.Storage && Lampa.Storage.set) return Lampa.Storage.set(String(k), String(v)); } catch (_) { }
        try { if (window.localStorage) localStorage.setItem(String(k), String(v)); } catch (_) { }
      }

      function sEnsure(k, def) {
        try {
          var v = sGet(k, null);
          if (v === undefined || v === null) sSet(k, def);
        } catch (_) { }
      }

      // Seed defaults
      try {
        sEnsure('bl_ua_enabled', DEF.bl_ua_enabled);
        sEnsure('bl_ua_mode', DEF.bl_ua_mode);
        sEnsure('bl_ua_preset', DEF.bl_ua_preset);
        sEnsure('bl_ua_custom', DEF.bl_ua_custom);
        sEnsure('bl_ua_apply_scope', DEF.bl_ua_apply_scope);
        sEnsure('bl_ua_reload_on_change', DEF.bl_ua_reload_on_change);
        sEnsure('bl_ua_add_header', DEF.bl_ua_add_header);
      } catch (_) { }

      function shortStr(s, max) {
        s = String(s || '');
        max = Number(max || 80);
        if (s.length <= max) return s;
        return s.slice(0, max - 1) + '…';
      }

      function reloadNow() {
        showNoty('[[BlackLampa]] UA applied, reloading…');
        setTimeout(function () { try { location.reload(); } catch (_) { } }, 200);
      }

      function reloadOnChangeAllowed() {
        var roc = String(sGet('bl_ua_reload_on_change', DEF.bl_ua_reload_on_change) || DEF.bl_ua_reload_on_change);
        if (roc === '1') { reloadNow(); return true; }
        showNoty('[[BlackLampa]] UA: reload required');
        return false;
      }

      function enabledNow() {
        try { return String(sGet('bl_ua_enabled', DEF.bl_ua_enabled) || DEF.bl_ua_enabled) === '1'; } catch (_) { return false; }
      }

      function reloadIfEnabled() {
        if (!enabledNow()) return false;
        return reloadOnChangeAllowed();
      }

      var cur = '';
      try { cur = String(navigator && navigator.userAgent ? navigator.userAgent : '') || ''; } catch (_) { cur = ''; }
      var st = 'Current UA: ' + shortStr(cur, 80);

      // Status
      try {
        Lampa.SettingsApi.addParam({
          component: STATE.componentId,
          param: { name: 'bl_ua_status', type: 'static', values: st, default: st },
          field: { name: 'User-Agent', description: st }
        });
      } catch (_) { }

      // Enabled
      try {
        Lampa.SettingsApi.addParam({
          component: STATE.componentId,
          param: { name: 'bl_ua_enabled', type: 'select', values: { 0: 'OFF', 1: 'ON' }, default: 0 },
          field: { name: 'Enabled', description: 'Подменять navigator.* (JS runtime). HTTP User-Agent не меняется.' },
          onChange: function () {
            reloadOnChangeAllowed();
          }
        });
      } catch (_) { }

      // Mode
      var mode = String(sGet('bl_ua_mode', DEF.bl_ua_mode) || DEF.bl_ua_mode);
      mode = mode.toLowerCase();
      if (mode !== 'preset' && mode !== 'custom') mode = DEF.bl_ua_mode;

      try {
        Lampa.SettingsApi.addParam({
          component: STATE.componentId,
          param: { name: 'bl_ua_mode', type: 'select', values: { preset: 'preset', custom: 'custom' }, default: DEF.bl_ua_mode },
          field: { name: 'Mode', description: '' },
          onChange: function () {
            go('ua', null, 2);
            reloadIfEnabled();
          }
        });
      } catch (_) { }

      // Preset / Custom UA
      if (mode === 'preset') {
        try {
          Lampa.SettingsApi.addParam({
            component: STATE.componentId,
            param: {
              name: 'bl_ua_preset',
              type: 'select',
              values: {
                chrome_win_latest: 'chrome_win_latest',
                edge_win_latest: 'edge_win_latest',
                firefox_win_latest: 'firefox_win_latest',
                chrome_android_latest: 'chrome_android_latest',
                safari_ios_latest: 'safari_ios_latest'
              },
              default: DEF.bl_ua_preset
            },
            field: { name: 'Preset', description: '' },
            onChange: function () {
              reloadIfEnabled();
            }
          });
        } catch (_) { }
      } else {
        try {
          Lampa.SettingsApi.addParam({
            component: STATE.componentId,
            param: { name: 'bl_ua_custom', type: 'input', values: '', default: DEF.bl_ua_custom, placeholder: 'Mozilla/5.0 ...' },
            field: { name: 'Custom UA', description: '' },
            onChange: function () {
              reloadIfEnabled();
            }
          });
        } catch (_) { }
      }

      // Add X-BL-UA header (optional)
      try {
        Lampa.SettingsApi.addParam({
          component: STATE.componentId,
          param: { name: 'bl_ua_add_header', type: 'select', values: { 0: 'OFF', 1: 'ON' }, default: 0 },
          field: { name: 'Add X-BL-UA header', description: 'Опционально добавляет X-BL-UA в fetch/XHR (может вызвать CORS preflight).' },
          onChange: function () {
            reloadIfEnabled();
          }
        });
      } catch (_) { }

      // Reload on change
      try {
        Lampa.SettingsApi.addParam({
          component: STATE.componentId,
          param: { name: 'bl_ua_reload_on_change', type: 'select', values: { 0: 'OFF', 1: 'ON' }, default: 1 },
          field: { name: 'Reload on change', description: 'При изменении настроек (и enabled=1) выполняет reload.' }
        });
      } catch (_) { }

      // Apply (always reload)
      try {
        Lampa.SettingsApi.addParam({
          component: STATE.componentId,
          param: { name: 'bl_ua_apply', type: 'button' },
          field: { name: 'Apply', description: 'Применить и перезагрузить.' },
          onChange: function () {
            reloadNow();
          }
        });
      } catch (_) { }
    } catch (_) { }
  }

  function buildBackupScreen() {
    try {
      if (!window.BL || !BL.Backup) {
        var na = 'BL.Backup missing (bl.backup.js not loaded).';
        Lampa.SettingsApi.addParam({
          component: STATE.componentId,
          param: { name: 'bl_backup_na', type: 'static', values: na, default: na },
          field: { name: 'Backup / Transfer', description: na }
        });
        return;
      }

      var CFG_KEY = 'bl_backup_cfg_v1';

      function normPrefixes(arr) {
        var out = [];
        try {
          if (!Array.isArray(arr)) arr = [];
          for (var i = 0; i < arr.length; i++) {
            var p = String(arr[i] || '').trim();
            if (p) out.push(p);
          }
        } catch (_) { }
        if (!out.length) out = ['bl_'];
        return out;
      }

      function parsePrefixesString(str) {
        var out = [];
        try {
          var parts = String(str || '').split(',');
          for (var i = 0; i < parts.length; i++) {
            var p = String(parts[i] || '').trim();
            if (p) out.push(p);
          }
        } catch (_) { }
        if (!out.length) out = ['bl_'];
        return out;
      }

      function loadCfgSafe() {
        var def = { prefixes: ['bl_'], provider: 'paste_rs', keyHint: '', unsafe_store_key: 0 };
        var raw = safe(function () { return window.localStorage ? localStorage.getItem(CFG_KEY) : ''; }, '');
        if (!raw) return def;
        var obj = safe(function () { return JSON.parse(String(raw || '')); }, null);
        if (!isPlainObject(obj)) return def;
        def.prefixes = normPrefixes(obj.prefixes);
        def.provider = String(obj.provider || def.provider) || def.provider;
        def.keyHint = String(obj.keyHint || '');
        def.unsafe_store_key = (String(obj.unsafe_store_key || '0') === '1') ? 1 : 0;
        return def;
      }

      function saveCfgSafe(cfg) {
        try {
          if (!window.localStorage) return;
          localStorage.setItem(CFG_KEY, JSON.stringify(cfg || {}));
        } catch (_) { }
      }

      function sGet(k, fallback) {
        var v = fallback;
        try { if (window.Lampa && Lampa.Storage && Lampa.Storage.get) v = Lampa.Storage.get(String(k)); } catch (_) { v = fallback; }
        if (typeof v === 'undefined' || v === null) return fallback;
        return v;
      }

      function pad2(n) { n = Number(n || 0); return (n < 10 ? '0' : '') + String(n); }

      function fmtTs(ms) {
        try {
          var d = new Date(Number(ms) || 0);
          return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
        } catch (_) { return ''; }
      }

      function shortId(idOrUrl) {
        var s = String(idOrUrl || '');
        try {
          if (s.indexOf('://') > 0) {
            var u = new URL(s, location.href);
            var p = String(u.pathname || '');
            var segs = p.split('/');
            var last = segs[segs.length - 1] || '';
            var prev = segs.length > 1 ? (segs[segs.length - 2] || '') : '';
            var id = last || prev || '';
            return id || s;
          }
        } catch (_) { }
        return s;
      }

      function syncCfgFromUi(currentCfg) {
        var provider = String(sGet('bl_backup_provider_v1', currentCfg.provider) || currentCfg.provider);
        var keyHint = String(sGet('bl_backup_key_hint_v1', currentCfg.keyHint) || '');
        var unsafe = String(sGet('bl_backup_unsafe_store_key_v1', currentCfg.unsafe_store_key ? '1' : '0') || '0');
        var prefixesStr = String(sGet('bl_backup_prefixes_v1', (currentCfg.prefixes || ['bl_']).join(',')) || '');
        var prefixes = parsePrefixesString(prefixesStr);
        var cfg = { prefixes: prefixes, provider: provider, keyHint: keyHint, unsafe_store_key: (unsafe === '1') ? 1 : 0 };
        saveCfgSafe(cfg);
        return cfg;
      }

      var cfg = loadCfgSafe();
      saveCfgSafe(cfg);

      var hist = [];
      try { hist = (BL.Backup.history && BL.Backup.history.list) ? (BL.Backup.history.list() || []) : []; } catch (_) { hist = []; }
      if (!Array.isArray(hist)) hist = [];

      // Status
      try {
        var st = 'history: ' + String(hist.length) + ' | prefixes: ' + String((cfg.prefixes || ['bl_']).join(','));
        Lampa.SettingsApi.addParam({
          component: STATE.componentId,
          param: { name: 'bl_backup_status', type: 'static', values: st, default: st },
          field: { name: 'Backup / Transfer', description: 'Экспорт/импорт настроек BlackLampa (localStorage) + шифрование + history.' }
        });
      } catch (_) { }

      // Encryption key (input)
      try {
        Lampa.SettingsApi.addParam({
          component: STATE.componentId,
          param: { name: 'bl_backup_key_input_v1', type: 'input', values: '', default: '', placeholder: 'Enter key / PIN' },
          field: { name: 'Encryption key', description: 'Используется для AES-GCM. Не хранится в history по умолчанию.' }
        });
      } catch (_) { }

      // Key label / hint (input)
      try {
        Lampa.SettingsApi.addParam({
          component: STATE.componentId,
          param: { name: 'bl_backup_key_hint_v1', type: 'input', values: '', default: String(cfg.keyHint || ''), placeholder: 'home-tv / phone / test' },
          field: { name: 'Key label / hint', description: '' },
          onChange: function () { cfg = syncCfgFromUi(cfg); }
        });
      } catch (_) { }

      // Prefixes (input)
      try {
        Lampa.SettingsApi.addParam({
          component: STATE.componentId,
          param: { name: 'bl_backup_prefixes_v1', type: 'input', values: '', default: String((cfg.prefixes || ['bl_']).join(',')), placeholder: 'bl_' },
          field: { name: 'Prefixes', description: 'Какие ключи localStorage экспортировать (prefix list, через ,).' },
          onChange: function () { cfg = syncCfgFromUi(cfg); }
        });
      } catch (_) { }

      // Provider (select)
      try {
        Lampa.SettingsApi.addParam({
          component: STATE.componentId,
          param: { name: 'bl_backup_provider_v1', type: 'select', values: { paste_rs: 'paste.rs', dpaste_org: 'dpaste.org' }, default: String(cfg.provider || 'paste_rs') },
          field: { name: 'Provider', description: '' },
          onChange: function () { cfg = syncCfgFromUi(cfg); }
        });
      } catch (_) { }

      // Unsafe: store key in history (select)
      try {
        Lampa.SettingsApi.addParam({
          component: STATE.componentId,
          param: { name: 'bl_backup_unsafe_store_key_v1', type: 'select', values: { 0: 'OFF (safe)', 1: 'ON (unsafe)' }, default: (cfg.unsafe_store_key ? 1 : 0) },
          field: { name: 'Unsafe: store key in history', description: 'Если ON — ключ сохранится вместе с paste ID в history.' },
          onChange: function () { cfg = syncCfgFromUi(cfg); }
        });
      } catch (_) { }

      function keyHash(pass) {
        try {
          if (window.BL && BL.Backup && typeof BL.Backup.__keyHash === 'function') return BL.Backup.__keyHash(String(pass || ''));
        } catch (_) { }
        return Promise.resolve('');
      }

      function runAsync(label, fn) {
        if (STATE.busy) {
          showNoty('[[BlackLampa]] Операция уже выполняется...');
          return;
        }
        STATE.busy = true;
        if (label) showNoty('[[BlackLampa]] ' + String(label));
        setTimeout(function () {
          Promise.resolve().then(fn).then(function () {
            STATE.busy = false;
            API.refresh();
          }, function () {
            STATE.busy = false;
            API.refresh();
          });
        }, 0);
      }

      // Export button
      try {
        Lampa.SettingsApi.addParam({
          component: STATE.componentId,
          param: { name: 'bl_backup_export_btn', type: 'button' },
          field: { name: 'Export', description: 'Шифрует конфиг и загружает в выбранный provider. Запись добавляется в history.' },
          onChange: function () {
            var pass = String(sGet('bl_backup_key_input_v1', '') || '').trim();
            if (!pass) {
              showNoty('[[BlackLampa]] Set encryption key');
              return;
            }
            runAsync('Exporting...', function () {
              cfg = syncCfgFromUi(cfg);

              var cfgObj = null;
              try { cfgObj = BL.Backup.collectConfig(); } catch (_) { cfgObj = { meta: {}, data: {} }; }

              var provider = String(cfg.provider || 'paste_rs');
              var hint = String(cfg.keyHint || '');
              var unsafe = !!cfg.unsafe_store_key;

              return BL.Backup.encrypt(cfgObj, pass).then(function (payloadStr) {
                return BL.Backup.upload(provider, payloadStr).then(function (up) {
                  var storedId = '';
                  try { storedId = (up && up.url) ? String(up.url || '') : String(up && up.id ? up.id : ''); } catch (_) { storedId = ''; }
                  if (!storedId) storedId = String(up && up.id ? up.id : '');

                  return keyHash(pass).then(function (kh) {
                    try {
                      var item = {
                        ts: Date.now(),
                        provider: provider,
                        id: storedId,
                        bytes: payloadStr.length,
                        schema: 1,
                        keyHint: hint,
                        keyHash: String(kh || ''),
                        note: ''
                      };
                      if (unsafe) item.unsafeKey = pass;
                      if (BL.Backup.history && BL.Backup.history.add) BL.Backup.history.add(item);
                    } catch (_) { }
                    showNoty('[[BlackLampa]] Exported: ' + shortId(storedId));
                  });
                });
              }).catch(function (e) {
                if (e && e.code === 'CORS') showNoty('[[BlackLampa]] Provider blocked by CORS on this device');
                else showNoty('[[BlackLampa]] Export failed: ' + String((e && e.message) ? e.message : e));
                throw e;
              });
            });
          }
        });
      } catch (_) { }

      // Import mode
      try {
        Lampa.SettingsApi.addParam({
          component: STATE.componentId,
          param: { name: 'bl_backup_import_mode_v1', type: 'select', values: { merge: 'Merge (default)', replace: 'Replace' }, default: 'merge' },
          field: { name: 'Import mode', description: 'Merge — обновляет/добавляет ключи. Replace — очищает BL-prefix ключи и импортирует.' }
        });
      } catch (_) { }

      function doImport(provider, idOrUrl, pass, mode) {
        provider = String(provider || '');
        idOrUrl = String(idOrUrl || '').trim();
        pass = String(pass || '').trim();
        mode = (mode === 'replace') ? 'replace' : 'merge';

        if (!idOrUrl) {
          showNoty('[[BlackLampa]] Set paste id/url');
          return Promise.reject(new Error('no id'));
        }
        if (!pass) {
          showNoty('[[BlackLampa]] Set encryption key');
          return Promise.reject(new Error('no key'));
        }

        return BL.Backup.download(provider, idOrUrl).then(function (payloadStr) {
          return BL.Backup.decrypt(payloadStr, pass);
        }).then(function (cfgObj) {
          BL.Backup.applyConfig(cfgObj, mode);
          showNoty('[[BlackLampa]] Imported, reloading…');
          setTimeout(function () { try { location.reload(); } catch (_) { } }, 0);
        }).catch(function (e) {
          if (e && e.code === 'CORS') showNoty('[[BlackLampa]] Provider blocked by CORS on this device');
          else showNoty('[[BlackLampa]] Import failed: ' + String((e && e.message) ? e.message : e));
          throw e;
        });
      }

      // Import from history (last N)
      try {
        var max = 15;
        if (!hist.length) {
          Lampa.SettingsApi.addParam({
            component: STATE.componentId,
            param: { name: 'bl_backup_hist_empty', type: 'static', default: true },
            field: { name: 'No exports yet', description: '' }
          });
        } else {
          for (var hi = 0; hi < hist.length && hi < max; hi++) {
            (function (it, idx) {
              var label = fmtTs(it.ts) + ' | ' + String(it.provider || '') + ' | ' + shortId(it.id) + (it.keyHint ? (' | ' + String(it.keyHint || '')) : '');
              Lampa.SettingsApi.addParam({
                component: STATE.componentId,
                param: { name: 'bl_backup_hist_' + String(idx) + '_' + String(it.ts || idx), type: 'static', default: true },
                field: { name: label, description: 'OK — import (uses key input; unsafeKey if saved).' },
                onRender: function (item) {
                  try {
                    if (!item || !item.on) return;
                    item.on('hover:enter', function () {
                      var mode = String(sGet('bl_backup_import_mode_v1', 'merge') || 'merge');
                      var pass = String(sGet('bl_backup_key_input_v1', '') || '').trim();
                      if (!pass && it.unsafeKey) pass = String(it.unsafeKey || '').trim();
                      runAsync('Importing...', function () { return doImport(String(it.provider || cfg.provider || 'paste_rs'), String(it.id || ''), pass, mode); });
                    });
                  } catch (_) { }
                }
              });
            })(hist[hi] || {}, hi);
          }
        }
      } catch (_) { }

      // Import manual (id/url)
      try {
        Lampa.SettingsApi.addParam({
          component: STATE.componentId,
          param: { name: 'bl_backup_import_id_v1', type: 'input', values: '', default: '', placeholder: 'id-or-url' },
          field: { name: 'Import: paste id/url', description: '' }
        });
      } catch (_) { }

      // Import button
      try {
        Lampa.SettingsApi.addParam({
          component: STATE.componentId,
          param: { name: 'bl_backup_import_btn', type: 'button' },
          field: { name: 'Import', description: 'Скачивает → расшифровывает → применяет → reload.' },
          onChange: function () {
            var provider = String(sGet('bl_backup_provider_v1', cfg.provider || 'paste_rs') || cfg.provider || 'paste_rs');
            var id = String(sGet('bl_backup_import_id_v1', '') || '').trim();
            var pass = String(sGet('bl_backup_key_input_v1', '') || '').trim();
            var mode = String(sGet('bl_backup_import_mode_v1', 'merge') || 'merge');

            if (!id) {
              showNoty('[[BlackLampa]] Set paste id/url');
              return;
            }
            if (!pass) {
              showNoty('[[BlackLampa]] Set encryption key');
              return;
            }

            runAsync('Importing...', function () { return doImport(provider, id, pass, mode); });
          }
        });
      } catch (_) { }

      // Clear history
      try {
        Lampa.SettingsApi.addParam({
          component: STATE.componentId,
          param: { name: 'bl_backup_history_clear_btn', type: 'button' },
          field: { name: 'Clear history', description: 'Удаляет только history экспортов. Настройки BlackLampa не трогает.' },
          onChange: function () {
            try { if (BL.Backup.history && BL.Backup.history.clear) BL.Backup.history.clear(); } catch (_) { }
            showNoty('[[BlackLampa]] History cleared');
            API.refresh();
          }
        });
      } catch (_) { }
    } catch (_) { }
  }

  function buildManagedScreen() {
    var list = [];
    try { list = (STATE.opts && typeof STATE.opts.getManagedPlugins === 'function') ? (STATE.opts.getManagedPlugins() || []) : []; } catch (_) { list = []; }
    if (!Array.isArray(list)) list = [];

    var idx = 0;
    for (var i = 0; i < list.length; i++) {
      (function (raw, rowIndex) {
        var meta = managedMeta(raw);
        if (!meta) return;

        Lampa.SettingsApi.addParam({
          component: STATE.componentId,
          param: { name: 'bl_pi_managed_' + String(meta.hash), type: 'static', default: true },
          field: { name: meta.title, description: meta.desc },
          onRender: function (item) {
            try {
              if (item && item.on) {
                item.on('hover:enter', function () {
                  push('plugin_detail', { kind: 'managed', meta: meta }, null, rowIndex);
                });
              }

              // URL line
              try {
                if (!window.$ || !item) return;
                var $d = item.find('.settings-param__descr');
                if (!$d.length) {
                  item.append('<div class="settings-param__descr"></div>');
                  $d = item.find('.settings-param__descr');
                }
                if ($d.find('.bl-pi-url').length === 0) {
                  var $u = $('<div class="bl-pi-url"></div>');
                  $u.text(String(meta.urlAbs || ''));
                  $u.css({ opacity: '0.9', 'font-size': '0.88em', 'word-break': 'break-all', 'margin-top': meta.desc ? '0.25em' : '0' });
                  $d.append($u);
                }
              } catch (_) { }

              var st = getInstalledStateSafe(meta.urlAbs);
              var $st = ensureStatusDot(item);
              setStatusDotPlugin($st, st);
            } catch (_) { }
          }
        });
      })(list[i], idx);
      idx++;
    }

    // Remove all managed
    try {
      Lampa.SettingsApi.addParam({
        component: STATE.componentId,
        param: { name: 'bl_pi_managed_remove_all', type: 'button' },
        field: { name: 'Remove all managed', description: 'Удаляет плагины из plugins[] (disabled[] не трогает).' },
        onChange: function () {
          runOnce('Remove all managed', 'Удалить все managed плагины?\n\ndisabled[] не трогается.\n\nАвтоперезагрузка отключена. При необходимости перезапустите приложение вручную.', function () {
            if (STATE.opts && typeof STATE.opts.removeManagedPluginsOnly === 'function') return STATE.opts.removeManagedPluginsOnly();
          });
        }
      });
    } catch (_) { }
  }

  function buildExtrasScreen() {
    var disabled = [];
    try { disabled = (STATE.opts && typeof STATE.opts.getExtrasPlugins === 'function') ? (STATE.opts.getExtrasPlugins() || []) : []; } catch (_) { disabled = []; }
    if (!Array.isArray(disabled)) disabled = [];

    if (!disabled.length) {
      var none = 'Нет дополнительных плагинов.';
      try {
        Lampa.SettingsApi.addParam({
          component: STATE.componentId,
          param: { name: 'bl_pi_extras_none', type: 'static', values: none, default: none },
          field: { name: 'Extras', description: none }
        });
      } catch (_) { }
      return;
    }

    var idx = 0;
    for (var i = 0; i < disabled.length; i++) {
      (function (raw, rowIndex) {
        var meta = extraMeta(raw);
        if (!meta) return;

        Lampa.SettingsApi.addParam({
          component: STATE.componentId,
          param: { name: 'bl_pi_extras_' + String(meta.hash), type: 'static', default: true },
          field: { name: meta.title, description: meta.desc },
          onRender: function (item) {
            try {
              if (item && item.on) {
                item.on('hover:enter', function () {
                  push('plugin_detail', { kind: 'extras', meta: meta }, null, rowIndex);
                });
              }

              // URL line
              try {
                if (!window.$ || !item) return;
                var $d = item.find('.settings-param__descr');
                if (!$d.length) {
                  item.append('<div class="settings-param__descr"></div>');
                  $d = item.find('.settings-param__descr');
                }
                if ($d.find('.bl-pi-url').length === 0) {
                  var $u = $('<div class="bl-pi-url"></div>');
                  $u.text(String(meta.urlAbs || ''));
                  $u.css({ opacity: '0.9', 'font-size': '0.88em', 'word-break': 'break-all', 'margin-top': meta.desc ? '0.25em' : '0' });
                  $d.append($u);
                }
              } catch (_) { }

              var st = getInstalledStateSafe(meta.urlAbs);
              var $st = ensureStatusDot(item);
              setStatusDotPlugin($st, st);
            } catch (_) { }
          }
        });
      })(disabled[i], idx);
      idx++;
    }
  }

  function statusText(st) {
    try {
      if (!st || !st.installed) return 'not installed';
      if (st.status === 0) return 'installed (disabled)';
      return 'installed (active)';
    } catch (_) { return 'unknown'; }
  }

  function buildPluginDetailScreen(payload) {
    payload = payload || {};
    var meta = payload.meta || null;
    if (!meta) meta = {};
    var urlAbs = String(meta.urlAbs || payload.urlAbs || '');
    if (!urlAbs) {
      var bad = 'Плагин не найден.';
      try {
        Lampa.SettingsApi.addParam({
          component: STATE.componentId,
          param: { name: 'bl_pi_detail_bad', type: 'static', values: bad, default: bad },
          field: { name: 'Plugin', description: bad }
        });
      } catch (_) { }
      return;
    }

    var st = getInstalledStateSafe(urlAbs);

    // Info
    try {
      var info = '';
      try { info = String(meta.desc || ''); } catch (_) { info = ''; }
      if (info) info = info + '\n';
      info = info + String(urlAbs);

      Lampa.SettingsApi.addParam({
        component: STATE.componentId,
        param: { name: 'bl_pi_detail_info', type: 'static', values: info, default: info },
        field: { name: String(meta.title || guessName(urlAbs)), description: info }
      });
    } catch (_) { }

    // Status
    try {
      var sline = statusText(st);
      Lampa.SettingsApi.addParam({
        component: STATE.componentId,
        param: { name: 'bl_pi_detail_status', type: 'static', values: sline, default: sline },
        field: { name: 'Status', description: sline }
      });
    } catch (_) { }

    // Install
    if (!st.installed) {
      try {
        Lampa.SettingsApi.addParam({
          component: STATE.componentId,
          param: { name: 'bl_pi_detail_install', type: 'button' },
          field: { name: 'Install', description: 'Добавляет плагин в расширения Lampa.' },
          onChange: function () {
            var focus = getSettingsFocusIndexSafe();
            runOnce('Install: ' + String(meta.title || ''), 'Установить плагин?\n\n' + String(meta.title || '') + '\n' + String(urlAbs), function () {
              storeLastIndex('plugin_detail', focus);
              if (STATE.opts && typeof STATE.opts.installOne === 'function') {
                return STATE.opts.installOne(urlAbs, { inject: true }).then(function (r) {
                  try {
                    if (r && r.ok) showNoty('[[BlackLampa]] Установлено: ' + String(meta.title || guessName(urlAbs)));
                    else showNoty('[[BlackLampa]] Ошибка установки: ' + String(meta.title || guessName(urlAbs)));
                  } catch (_) { }
                  return r;
                });
              }
            });
          }
        });
      } catch (_) { }
    } else {
      try {
        var note1 = (st.status === 0) ? 'Плагин уже установлен, но отключён.' : 'Плагин уже установлен.';
        Lampa.SettingsApi.addParam({
          component: STATE.componentId,
          param: { name: 'bl_pi_detail_install_disabled', type: 'static', values: note1, default: note1 },
          field: { name: 'Install', description: note1 }
        });
      } catch (_) { }
    }

    // Remove
    if (st.installed) {
      try {
        Lampa.SettingsApi.addParam({
          component: STATE.componentId,
          param: { name: 'bl_pi_detail_remove', type: 'button' },
          field: { name: 'Remove', description: 'Удаляет плагин из расширений Lampa.' },
          onChange: function () {
            var focus2 = getSettingsFocusIndexSafe();
            runOnce('Remove: ' + String(meta.title || ''), 'Удалить плагин?\n\n' + String(meta.title || '') + '\n' + String(urlAbs) + '\n\nАвтоперезагрузка отключена. При необходимости перезапустите приложение вручную.', function () {
              storeLastIndex('plugin_detail', focus2);
              if (STATE.opts && typeof STATE.opts.removeOne === 'function') return STATE.opts.removeOne(urlAbs);
            });
          }
        });
      } catch (_) { }
    } else {
      try {
        var none = 'Плагин не установлен.';
        Lampa.SettingsApi.addParam({
          component: STATE.componentId,
          param: { name: 'bl_pi_detail_remove_disabled', type: 'static', values: none, default: none },
          field: { name: 'Remove', description: none }
        });
      } catch (_) { }
    }

    // Enable/Disable
    if (st.installed) {
      try {
        var toggle = (st.status === 0) ? { name: 'Enable', fn: 'enableOne' } : { name: 'Disable', fn: 'disableOne' };
        Lampa.SettingsApi.addParam({
          component: STATE.componentId,
          param: { name: 'bl_pi_detail_toggle', type: 'button' },
          field: { name: toggle.name, description: 'Включает/выключает плагин.' },
          onChange: function () {
            var focus3 = getSettingsFocusIndexSafe();
            runOnce(toggle.name + ': ' + String(meta.title || ''), toggle.name + ' plugin?\n\n' + String(meta.title || '') + '\n' + String(urlAbs), function () {
              storeLastIndex('plugin_detail', focus3);
              if (STATE.opts && typeof STATE.opts[toggle.fn] === 'function') return STATE.opts[toggle.fn](urlAbs);
            });
          }
        });
      } catch (_) { }
    } else {
      try {
        var na = 'Доступно только для установленного плагина.';
        Lampa.SettingsApi.addParam({
          component: STATE.componentId,
          param: { name: 'bl_pi_detail_toggle_disabled', type: 'static', values: na, default: na },
          field: { name: 'Enable/Disable', description: na }
        });
      } catch (_) { }
    }

    // Optional: Inject now
    if (STATE.opts && typeof STATE.opts.injectNow === 'function') {
      try {
        Lampa.SettingsApi.addParam({
          component: STATE.componentId,
          param: { name: 'bl_pi_detail_inject', type: 'button' },
          field: { name: 'Inject now', description: 'Подгружает скрипт плагина в текущую сессию.' },
          onChange: function () {
            var focus4 = getSettingsFocusIndexSafe();
            runOnce('Inject: ' + String(meta.title || ''), 'Inject now?\n\n' + String(meta.title || '') + '\n' + String(urlAbs), function () {
              storeLastIndex('plugin_detail', focus4);
              return STATE.opts.injectNow(urlAbs).then(function (r) {
                try {
                  if (r && r.ok) showNoty('[[BlackLampa]] Inject: OK');
                  else showNoty('[[BlackLampa]] Inject: FAIL');
                } catch (_) { }
                return r;
              });
            });
          }
        });
      } catch (_) { }
    }
  }

  function buildDangerScreen() {
    // Factory reset
    try {
      Lampa.SettingsApi.addParam({
        component: STATE.componentId,
        param: { name: 'bl_pi_danger_factory_reset', type: 'button' },
        field: { name: 'Factory reset', description: 'Полный сброс доменных данных + повторная блокировка авторизации. Выполняет перезагрузку.' },
        onChange: function () {
          runOnce('Factory reset', 'Сбросить Lampa до заводских?\n\nЭто удалит доменные данные и выполнит перезагрузку.\n\nВНИМАНИЕ: действие необратимо.', function () {
            if (STATE.opts && typeof STATE.opts.factoryReset === 'function') return STATE.opts.factoryReset();
          });
        }
      });
    } catch (_) { }

    // Remove all plugins
    try {
      Lampa.SettingsApi.addParam({
        component: STATE.componentId,
        param: { name: 'bl_pi_danger_remove_all', type: 'button' },
        field: { name: 'Remove all Lampa plugins', description: 'Удаляет ВСЕ установленные плагины. Автоперезагрузка отключена.' },
        onChange: function () {
          runOnce('Remove all plugins', 'Удалить ВСЕ плагины Lampa?\n\nАвтоперезагрузка отключена. При необходимости перезапустите приложение вручную.', function () {
            if (STATE.opts && typeof STATE.opts.removeAllLampaPlugins === 'function') return STATE.opts.removeAllLampaPlugins();
          });
        }
      });
    } catch (_) { }

    // Reset first-install flags
    try {
      Lampa.SettingsApi.addParam({
        component: STATE.componentId,
        param: { name: 'bl_pi_danger_reset_flags', type: 'button' },
        field: { name: 'Reset first-install flags', description: 'Сбрасывает флаги первой автоустановки AutoPlugin.' },
        onChange: function () {
          runOnce('Reset first-install flags', 'Сбросить флаги первой установки AutoPlugin?\n\nЭто НЕ удаляет плагины.', function () {
            try { if (STATE.opts && typeof STATE.opts.resetFirstInstallFlags === 'function') STATE.opts.resetFirstInstallFlags(); } catch (_) { }
            showNoty('[[BlackLampa]] AutoPlugin: флаг сброшен');
          });
        }
      });
    } catch (_) { }
  }

  // ============================================================================
  // URL Blocklist UI (moved from AutoPlugin UI)
  // ============================================================================
  var BL_RULE_ADD_PATTERN = 'bl_net_rule_add_pattern';
  var BL_RULE_ADD_TYPE = 'bl_net_rule_add_type';
  var BL_RULE_ADD_CT = 'bl_net_rule_add_ct';
  var BL_RULE_ADD_BODY = 'bl_net_rule_add_body';

  function getBlocklistApi() {
    try {
      if (window.BL && BL.PolicyNetwork && BL.PolicyNetwork.blocklist) return BL.PolicyNetwork.blocklist;
    } catch (_) { }
    return null;
  }

  function setStatusDotBlocklist($st, enabled) {
    try {
      if (!$st || !$st.length) return;
      if (enabled) $st.css('background-color', '').removeClass('error').addClass('active');
      else $st.removeClass('active error').css('background-color', 'rgba(255,255,255,0.35)');
    } catch (_) { }
  }

  function buildBlocklistScreen() {
    try {
      Lampa.SettingsApi.addParam({
        component: STATE.componentId,
        param: { name: 'bl_pi_blocklist_builtin', type: 'static', default: true },
        field: { name: 'Встроенные правила', description: 'Категории встроенных блокировок BlackLampa (toggle ON/OFF).' },
        onRender: function (item) {
          try { if (item && item.on) item.on('hover:enter', function () { push('blocklist_builtin', null, 0, 0); }); } catch (_) { }
        }
      });
      Lampa.SettingsApi.addParam({
        component: STATE.componentId,
        param: { name: 'bl_pi_blocklist_user', type: 'static', default: true },
        field: { name: 'Пользовательские URL', description: 'Список пользовательских URL/Pattern правил (simple/advanced).' },
        onRender: function (item) {
          try { if (item && item.on) item.on('hover:enter', function () { push('blocklist_user', null, 0, 1); }); } catch (_) { }
        }
      });
      Lampa.SettingsApi.addParam({
        component: STATE.componentId,
        param: { name: 'bl_pi_blocklist_add', type: 'static', default: true },
        field: { name: 'Добавить URL', description: 'Добавить пользовательское правило блокировки.' },
        onRender: function (item) {
          try { if (item && item.on) item.on('hover:enter', function () { push('blocklist_add', null, 0, 2); }); } catch (_) { }
        }
      });
    } catch (_) { }
  }

  function buildBlocklistBuiltinScreen() {
    try {
      var api = getBlocklistApi();
      var list = [];
      try { list = (api && api.builtin && typeof api.builtin.getAll === 'function') ? api.builtin.getAll() : []; } catch (_) { list = []; }

      if (!list || !list.length) {
        var none = api ? 'Нет встроенных правил.' : 'Network policy не доступна.';
        Lampa.SettingsApi.addParam({
          component: STATE.componentId,
          param: { name: 'bl_pi_blocklist_builtin_none', type: 'static', values: none, default: none },
          field: { name: 'URL Blocklist', description: none }
        });
        return;
      }

      for (var i = 0; i < list.length; i++) {
        (function (rule, rowIndex) {
          Lampa.SettingsApi.addParam({
            component: STATE.componentId,
            param: { name: 'bl_pi_blocklist_builtin_' + String(rule.id || rowIndex), type: 'static', default: true },
            field: { name: String(rule.title || 'Rule'), description: String(rule.description || '') },
            onRender: function (item) {
              try {
                if (!window.$ || !item) return;
                try { item.find('.settings-param__name').text(String(rule.title || '')); } catch (_) { }
                try {
                  var $d = item.find('.settings-param__descr');
                  if (!$d.length) {
                    item.append('<div class="settings-param__descr"></div>');
                    $d = item.find('.settings-param__descr');
                  }
                  $d.text(String(rule.description || ''));
                } catch (_) { }

                var $st = ensureStatusDot(item);
                setStatusDotBlocklist($st, !!rule.enabled);

                if (item.on) {
                  item.on('hover:enter', function () {
                    try {
                      var api2 = getBlocklistApi();
                      if (api2 && api2.builtin && typeof api2.builtin.setEnabled === 'function') api2.builtin.setEnabled(String(rule.id), !rule.enabled);
                    } catch (_) { }
                    go('blocklist_builtin', null, rowIndex);
                  });
                }
              } catch (_) { }
            }
          });
        })(list[i], i);
      }
    } catch (_) { }
  }

  function buildBlocklistUserRulesScreen() {
    try {
      var api = getBlocklistApi();
      var list = [];
      try { list = (api && api.user && typeof api.user.getAll === 'function') ? api.user.getAll() : []; } catch (_) { list = []; }

      if (!api) {
        var na = 'Network policy не доступна.';
        Lampa.SettingsApi.addParam({
          component: STATE.componentId,
          param: { name: 'bl_pi_blocklist_user_na', type: 'static', values: na, default: na },
          field: { name: 'URL Blocklist', description: na }
        });
        return;
      }

      if (!list || !list.length) {
        var none = 'Нет пользовательских правил.';
        Lampa.SettingsApi.addParam({
          component: STATE.componentId,
          param: { name: 'bl_pi_blocklist_user_none', type: 'static', values: none, default: none },
          field: { name: 'Пользовательские URL', description: none }
        });
        return;
      }

      for (var i = 0; i < list.length; i++) {
        (function (rule, rowIndex) {
          Lampa.SettingsApi.addParam({
            component: STATE.componentId,
            param: { name: 'bl_pi_blocklist_user_' + String(rule.id || rowIndex), type: 'static', default: true },
            field: { name: 'URL rule', description: '' },
            onRender: function (item) {
              try {
                if (!window.$ || !item) return;
                try { item.find('.settings-param__name').text(String(rule.pattern || '')); } catch (_) { }
                try {
                  var $d = item.find('.settings-param__descr');
                  if (!$d.length) {
                    item.append('<div class="settings-param__descr"></div>');
                    $d = item.find('.settings-param__descr');
                  }
                  $d.text('type: ' + String(rule.type || 'simple'));
                } catch (_) { }

                var $st = ensureStatusDot(item);
                setStatusDotBlocklist($st, !!rule.enabled);

                if (item.on) item.on('hover:enter', function () { push('blocklist_user_detail', { id: String(rule.id) }, null, rowIndex); });
              } catch (_) { }
            }
          });
        })(list[i], i);
      }
    } catch (_) { }
  }

  function buildBlocklistUserRuleDetailScreen(ruleId) {
    try {
      var api = getBlocklistApi();
      var list = [];
      try { list = (api && api.user && typeof api.user.getAll === 'function') ? api.user.getAll() : []; } catch (_) { list = []; }
      var rule = null;
      for (var i = 0; i < list.length; i++) {
        try { if (String(list[i].id) === String(ruleId)) { rule = list[i]; break; } } catch (_) { }
      }

      if (!rule) {
        var bad = 'Правило не найдено.';
        Lampa.SettingsApi.addParam({
          component: STATE.componentId,
          param: { name: 'bl_pi_blocklist_user_detail_bad', type: 'static', values: bad, default: bad },
          field: { name: 'Пользовательские URL', description: bad }
        });
        return;
      }

      // Info (safe text)
      try {
        Lampa.SettingsApi.addParam({
          component: STATE.componentId,
          param: { name: 'bl_pi_blocklist_user_detail_info', type: 'static', default: true },
          field: { name: 'Правило', description: '' },
          onRender: function (item) {
            try {
              if (!window.$ || !item) return;
              try { item.find('.settings-param__name').text(String(rule.pattern || '')); } catch (_) { }
              var descr = 'type: ' + String(rule.type || 'simple');
              try {
                if (rule.type === 'advanced' && rule.advanced) {
                  if (rule.advanced.contentType) descr += '\ncontent-type: ' + String(rule.advanced.contentType);
                  if (rule.advanced.bodyMode) descr += '\nbody: ' + String(rule.advanced.bodyMode);
                }
              } catch (_) { }
              try {
                var $d = item.find('.settings-param__descr');
                if (!$d.length) {
                  item.append('<div class="settings-param__descr"></div>');
                  $d = item.find('.settings-param__descr');
                }
                $d.text(descr);
              } catch (_) { }
              var $st = ensureStatusDot(item);
              setStatusDotBlocklist($st, !!rule.enabled);
            } catch (_) { }
          }
        });
      } catch (_) { }

      // Toggle enable/disable
      try {
        var toggleName = rule.enabled ? 'Выключить' : 'Включить';
        Lampa.SettingsApi.addParam({
          component: STATE.componentId,
          param: { name: 'bl_pi_blocklist_user_detail_toggle', type: 'button' },
          field: { name: toggleName, description: 'Включает/выключает пользовательское правило.' },
          onChange: function () {
            try {
              var api2 = getBlocklistApi();
              if (api2 && api2.user && typeof api2.user.setEnabled === 'function') api2.user.setEnabled(String(rule.id), !rule.enabled);
            } catch (_) { }
            go('blocklist_user_detail', { id: String(rule.id) }, getSettingsFocusIndexSafe());
          }
        });
      } catch (_) { }

      // Delete
      try {
        Lampa.SettingsApi.addParam({
          component: STATE.componentId,
          param: { name: 'bl_pi_blocklist_user_detail_delete', type: 'button' },
          field: { name: 'Удалить', description: 'Удаляет пользовательское правило.' },
          onChange: function () {
            confirmAction('Удалить правило', 'Удалить правило?\n\n' + String(rule.pattern || ''), function () {
              try {
                var api2 = getBlocklistApi();
                if (api2 && api2.user && typeof api2.user.remove === 'function') api2.user.remove(String(rule.id));
              } catch (_) { }
              back();
            });
          }
        });
      } catch (_) { }
    } catch (_) { }
  }

  function buildBlocklistAddScreen() {
    try {
      var api = getBlocklistApi();
      if (!api) {
        var na = 'Network policy не доступна.';
        Lampa.SettingsApi.addParam({
          component: STATE.componentId,
          param: { name: 'bl_pi_blocklist_add_na', type: 'static', values: na, default: na },
          field: { name: 'URL Blocklist', description: na }
        });
        return;
      }

      // URL / Pattern
      try {
        Lampa.SettingsApi.addParam({
          component: STATE.componentId,
          param: { name: BL_RULE_ADD_PATTERN, type: 'input', values: '', default: '', placeholder: 'https://example.com/*' },
          field: { name: 'URL / Pattern', description: 'Подстрока / wildcard (*) / /regex/i.' }
        });
      } catch (_) { }

      // Type
      try {
        Lampa.SettingsApi.addParam({
          component: STATE.componentId,
          param: { name: BL_RULE_ADD_TYPE, type: 'select', values: { simple: 'Простое (simple)', advanced: 'Расширенное (advanced)' }, default: 'simple' },
          field: { name: 'Тип правила', description: '' },
          onChange: function () {
            go('blocklist_add', null, 2);
          }
        });
      } catch (_) { }

      var rt = 'simple';
      try { rt = (window.Lampa && Lampa.Storage && Lampa.Storage.get) ? String(Lampa.Storage.get(BL_RULE_ADD_TYPE) || 'simple') : 'simple'; } catch (_) { rt = 'simple'; }

      if (rt === 'advanced') {
        // Content-Type
        try {
          Lampa.SettingsApi.addParam({
            component: STATE.componentId,
            param: {
              name: BL_RULE_ADD_CT,
              type: 'select',
              values: {
                'application/json': 'application/json',
                'application/javascript': 'application/javascript',
                'text/css': 'text/css',
                'text/html': 'text/html',
                'image/svg+xml': 'image/svg+xml',
                'image/png': 'image/png',
                'image/jpeg': 'image/jpeg',
                'image/gif': 'image/gif',
                'image/webp': 'image/webp',
                'image/x-icon': 'image/x-icon',
                'text/plain': 'text/plain'
              },
              default: 'application/json'
            },
            field: { name: 'Content-Type', description: '' }
          });
        } catch (_) { }

        // Body mode
        try {
          Lampa.SettingsApi.addParam({
            component: STATE.componentId,
            param: { name: BL_RULE_ADD_BODY, type: 'select', values: { empty: 'empty', minimal: 'minimal' }, default: 'empty' },
            field: { name: 'Body mode', description: '' }
          });
        } catch (_) { }
      }

      // Save
      try {
        Lampa.SettingsApi.addParam({
          component: STATE.componentId,
          param: { name: 'bl_pi_blocklist_add_save', type: 'button' },
          field: { name: 'Сохранить', description: 'Добавляет правило и включает его.' },
          onChange: function () {
            try {
              var pat = '';
              try { pat = (window.Lampa && Lampa.Storage && Lampa.Storage.get) ? String(Lampa.Storage.get(BL_RULE_ADD_PATTERN) || '') : ''; } catch (_) { pat = ''; }
              pat = String(pat || '').trim();
              if (!pat) {
                showNoty('[[BlackLampa]] Укажите URL / Pattern');
                return;
              }

              var type = 'simple';
              try { type = (window.Lampa && Lampa.Storage && Lampa.Storage.get) ? String(Lampa.Storage.get(BL_RULE_ADD_TYPE) || 'simple') : 'simple'; } catch (_) { type = 'simple'; }
              if (type !== 'advanced') type = 'simple';

              var rule = { pattern: pat, type: type, enabled: true };
              if (type === 'advanced') {
                var ct = '';
                var bm = '';
                try { ct = (window.Lampa && Lampa.Storage && Lampa.Storage.get) ? String(Lampa.Storage.get(BL_RULE_ADD_CT) || '') : ''; } catch (_) { ct = ''; }
                try { bm = (window.Lampa && Lampa.Storage && Lampa.Storage.get) ? String(Lampa.Storage.get(BL_RULE_ADD_BODY) || '') : ''; } catch (_) { bm = ''; }
                rule.advanced = { contentType: ct, bodyMode: bm };
              }

              var api2 = getBlocklistApi();
              if (api2 && api2.user && typeof api2.user.add === 'function') {
                api2.user.add(rule);
                showNoty('[[BlackLampa]] Правило добавлено');
                go('blocklist_user', null, 0);
              } else {
                showNoty('[[BlackLampa]] Network policy missing');
              }
            } catch (_) { }
          }
        });
      } catch (_) { }
    } catch (_) { }
  }

	  function buildScreen(route, payload) {
	    if (route === 'managed') return buildManagedScreen();
	    if (route === 'extras') return buildExtrasScreen();
	    if (route === 'plugin_detail') return buildPluginDetailScreen(payload);
	    if (route === 'danger') return buildDangerScreen();
	    if (route === 'logging') return buildLoggingScreen();
	    if (route === 'jsqp') return buildJsqpScreen();
	    if (route === 'ua') return buildUaScreen();
	    if (route === 'backup') return buildBackupScreen();
	    if (route === 'blocklist') return buildBlocklistScreen();
	    if (route === 'blocklist_builtin') return buildBlocklistBuiltinScreen();
	    if (route === 'blocklist_user') return buildBlocklistUserRulesScreen();
	    if (route === 'blocklist_user_detail') return buildBlocklistUserRuleDetailScreen(payload && payload.id ? payload.id : '');
	    if (route === 'blocklist_add') return buildBlocklistAddScreen();
	    return buildRootScreen();
	  }

  function defaultFocusFor(route, payload) {
    try {
      if (route === 'plugin_detail') {
        var meta = payload && payload.meta ? payload.meta : null;
        var urlAbs = meta && meta.urlAbs ? String(meta.urlAbs) : String(payload && payload.urlAbs ? payload.urlAbs : '');
        var st = urlAbs ? getInstalledStateSafe(urlAbs) : { installed: false, status: null };
        return st.installed ? 4 : 2;
      }
    } catch (_) { }
    return 0;
  }

  function openInternal(route, payload, focusIndex, nav) {
    nav = nav || {};

    try {
      if (!hasLampaSettingsApi()) return;
      if (!window.Lampa || !Lampa.Settings || !Lampa.Settings.create) return;

	      route = String(route || 'root');
	      if (route !== 'root' && route !== 'managed' && route !== 'extras' && route !== 'plugin_detail' && route !== 'danger' &&
	        route !== 'logging' && route !== 'jsqp' && route !== 'ua' && route !== 'backup' && route !== 'blocklist' && route !== 'blocklist_builtin' && route !== 'blocklist_user' && route !== 'blocklist_user_detail' && route !== 'blocklist_add') {
	        route = 'root';
	      }

      if (nav.resetStack) {
        STATE.stack = [];
        storeLastIndex('root', 0);
      }

      var useDefault = (typeof focusIndex !== 'number');
      if (useDefault) focusIndex = getLastIndex(route);
      if (typeof focusIndex !== 'number') focusIndex = 0;
      if (useDefault && focusIndex === 0) {
        try { focusIndex = defaultFocusFor(route, payload); } catch (_) { focusIndex = 0; }
      }

      setRoute(route, payload || null);

      resetParams();
      buildScreen(route, payload || null);

      var cp = { __bl_pi_internal: true, __bl_pi_route: route };
      if (route !== 'root') cp.onBack = function () { back(); };
      if (typeof focusIndex === 'number' && focusIndex > 0) cp.last_index = focusIndex;

      Lampa.Settings.create(String(STATE.componentId), cp);
    } catch (_) { }
  }

	  function onSettingsOpen(e) {
	    try {
	      if (!e || !e.name) return;

      // Leaving to Settings main: reset internal navigation state.
      if (String(e.name) === 'main') {
        STATE.route = 'root';
        STATE.payload = null;
        STATE.stack = [];
        return;
      }

	      if (String(e.name) !== String(STATE.componentId)) return;

	      // Scope BL font override strictly to our Settings component body.
	      // Do NOT touch Lampa global styles.
	      try { applyBlUiFont(e.body); } catch (_) { }
	      if (e.params && e.params.__bl_pi_internal) return;

      // External open OR Settings.update() recreate (drops onBack): restore our current route.
      setTimeout(function () {
        try {
          if (!isSettingsComponentOpen()) return;

          var focus = 0;
          if (e.params && typeof e.params.last_index === 'number') {
            focus = e.params.last_index;
          } else {
            var info = getSettingsFocusIndexInfo();
            focus = info.index || 0;
            if (!info.found) {
              var stored = getLastIndex(STATE.route || 'root');
              if (stored > 0) focus = stored;
            }
          }

          openInternal(STATE.route || 'root', STATE.payload || null, focus, { resetStack: false, push: false });
        } catch (_) { }
      }, 0);
    } catch (_) { }
  }

  API.init = function (opts) {
    STATE.opts = opts || STATE.opts || {};

    try {
      if (!hasLampaSettingsApi()) return;

      var cfg = getConfigSafe();

      // Component config
      STATE.componentId = pickSettingsComponentId(cfg);
      STATE.componentName = pickSettingsName(cfg);
      STATE.componentIcon = pickSettingsIcon(cfg);

      // Remove legacy component ids (avoid extra top-level menu items).
      var s = getSettingsCfg(cfg);
      var legacyExtras = String(s.ap.extrasComponentId || 'bl_autoplugin_extras');
      var legacyPrefix = String(s.ap.extraPluginComponentPrefix || 'bl_autoplugin_extras_plugin_');

      try {
        removeComponentSafe('autoplugin_installer');
        removeComponentSafe('bl_autoplugin');
        removeComponentSafe('bl_autoplugin_extras');
        removeComponentSafe(String(STATE.componentId));
        removeComponentSafe(String(legacyExtras));

        try {
          if (Lampa.SettingsApi.allComponents && legacyPrefix) {
            var all = Lampa.SettingsApi.allComponents();
            for (var k in all) {
              if (k && String(k).indexOf(String(legacyPrefix)) === 0) removeComponentSafe(k);
            }
          }
        } catch (_) { }
      } catch (_) { }

      Lampa.SettingsApi.addComponent({
        component: String(STATE.componentId),
        name: String(STATE.componentName),
        icon: String(STATE.componentIcon)
      });

      // Initial seed (root params only; do not open Settings here).
      STATE.route = STATE.route || 'root';
      if (!STATE.route) STATE.route = 'root';
      resetParams();
      buildRootScreen();

      if (!STATE.__hookInstalled && window.Lampa && Lampa.Settings && Lampa.Settings.listener && Lampa.Settings.listener.follow) {
        STATE.__hookInstalled = true;
        Lampa.Settings.listener.follow('open', onSettingsOpen);
      }

      STATE.inited = true;
    } catch (_) { }
  };

  API.refresh = function () {
    try {
      if (!STATE.inited) return;
      ensureSettingsComponentControls('refresh');
      if (!isSettingsComponentOpen()) return;
      var info = getSettingsFocusIndexInfo();
      var focus = info.index || 0;
      if (!info.found) {
        var stored = getLastIndex(STATE.route || 'root');
        if (stored > 0) focus = stored;
      }
      storeLastIndex(STATE.route, focus);
      openInternal(STATE.route || 'root', STATE.payload || null, focus, { resetStack: false, push: false });
    } catch (_) { }
  };

  API.open = function (route, payload, focusIndex) {
    try {
      if (!STATE.inited) API.init(STATE.opts || {});
      openInternal(String(route || 'root'), payload || null, focusIndex, { resetStack: String(route || 'root') === 'root', push: false });
    } catch (_) { }
  };

  API.dispose = function () {
    // Optional: Lampa.Settings.listener.follow() does not provide an official unsubscriber in all builds.
    // Keep this as a no-op for compatibility.
  };

  // Expose helper (used by acceptance requirement / debugging)
  API.getSettingsFocusIndexSafe = getSettingsFocusIndexSafe;
})();
