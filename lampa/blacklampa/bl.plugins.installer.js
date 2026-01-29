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

      // 3) Danger
      Lampa.SettingsApi.addParam({
        component: STATE.componentId,
        param: { name: 'bl_pi_root_danger', type: 'static', default: true },
        field: { name: 'Danger zone', description: 'Сброс/очистка/опасные операции.' },
        onRender: function (item) {
          try { if (item && item.on) item.on('hover:enter', function () { push('danger', null, 0, 3); }); } catch (_) { }
        }
      });

	      // 4) Log viewer (kept from legacy AutoPlugin UI)
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

	      // 5) Logging
	      Lampa.SettingsApi.addParam({
	        component: STATE.componentId,
	        param: { name: 'bl_pi_root_logging', type: 'static', default: true },
	        field: { name: 'Logging', description: 'Режим popup-логов (silent / auto popup).' },
	        onRender: function (item) {
	          try { if (item && item.on) item.on('hover:enter', function () { push('logging', null, 0, 5); }); } catch (_) { }
	        }
	      });

	      // 6) Filesystem scan (popup)
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
	        route !== 'logging' && route !== 'blocklist' && route !== 'blocklist_builtin' && route !== 'blocklist_user' && route !== 'blocklist_user_detail' && route !== 'blocklist_add') {
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
