(function () {
  'use strict';

  var BL = window.BL = window.BL || {};
  BL.MenuCore = BL.MenuCore || {};

  var API = BL.MenuCore;
  if (API.__blMenuCoreLoaded) return;
  API.__blMenuCoreLoaded = true;

  var STATE = {
    inited: false,
    opts: null,
    rootComponentId: '',
    componentId: '',
    openComponentId: '',
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

  function hasLampaSettingsApi() {
    try { return !!(window.Lampa && Lampa.SettingsApi); } catch (_) { return false; }
  }

  function ensureSettingsTemplate(id) {
    try {
      if (!id) return;
      if (window.Template && Template.add) return Template.add('settings_' + String(id), '<div></div>');
    } catch (_) { }
    try { if (window.Lampa && Lampa.Template && Lampa.Template.add) return Lampa.Template.add('settings_' + String(id), '<div></div>'); } catch (_) { }
  }

  function dbgEnabled() {
    try { return !!(BL.cfg && BL.cfg.PERF_DEBUG); } catch (_) { return false; }
  }

  function dbg(msg, extra) {
    if (!dbgEnabled()) return;
    try { if (BL.Log && typeof BL.Log.showDbg === 'function') BL.Log.showDbg('MenuCore', String(msg || ''), extra); } catch (_) { }
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
      return String(s.pi.name || '') || 'BlackLampa';
    } catch (_) { return 'BlackLampa'; }
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
    if (!cur) {
      try { cur = String(STATE.openComponentId || ''); } catch (_) { cur = ''; }
    }
    return String(cur || '');
  }

  function routeComponentId(route) {
    route = String(route || 'root');
    if (route === 'root') return String(STATE.rootComponentId || '');
    return String(STATE.rootComponentId || '') + '__' + route;
  }

  function routeFromComponentId(id) {
    id = String(id || '');
    var root = String(STATE.rootComponentId || '');
    if (!id || !root) return '';
    if (id === root) return 'root';
    var pre = root + '__';
    if (id.indexOf(pre) !== 0) return '';
    return id.slice(pre.length) || 'root';
  }

  function isOurSettingsComponentId(id) {
    id = String(id || '');
    var root = String(STATE.rootComponentId || '');
    if (!id || !root) return false;
    if (id === root) return true;
    return id.indexOf(root + '__') === 0;
  }

  function isSettingsComponentVisible() {
    try { return isOurSettingsComponentId(getCurrentSettingsComponentIdSafe()); } catch (_) { return false; }
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

  function ensureSettingsComponentControls(where) {
    try {
      if (!isSettingsComponentVisible()) return;

      try { if (window.BL && BL.Log && typeof BL.Log.closeViewer === 'function') BL.Log.closeViewer(); } catch (_) { }
      try { if (window.BL && BL.FileScanner && typeof BL.FileScanner.isOpen === 'function' && BL.FileScanner.isOpen() && typeof BL.FileScanner.close === 'function') BL.FileScanner.close(); } catch (_) { }

      var en = null;
      try { if (window.Lampa && Lampa.Controller && typeof Lampa.Controller.enabled === 'function') en = Lampa.Controller.enabled(); } catch (_) { en = null; }
      var name = '';
      try { name = en && en.name ? String(en.name) : ''; } catch (_) { name = ''; }

      if (name === 'modal') {
        try { if (window.Lampa && Lampa.Modal && typeof Lampa.Modal.close === 'function') Lampa.Modal.close(); } catch (_) { }
      } else if (name === 'loading') {
        try { if (window.Lampa && Lampa.Loading && typeof Lampa.Loading.stop === 'function') Lampa.Loading.stop(); } catch (_) { }
      }

      if (name !== 'settings_component') {
        try { if (window.Lampa && Lampa.Controller && typeof Lampa.Controller.toggle === 'function') Lampa.Controller.toggle('settings_component'); } catch (_) { }
        dbg('restore controller', (where ? String(where) : '') + (name ? (' | from=' + name) : ''));
      }
    } catch (_) { }
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

  function showNoty(msg) {
    try { if (window.Lampa && Lampa.Noty && Lampa.Noty.show) Lampa.Noty.show(String(msg || '')); } catch (_) { }
  }

  function confirmAction(title, text, onYes) {
    try {
      if (window.Lampa && Lampa.Modal && typeof Lampa.Modal.open === 'function' && window.$) {
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
    STATE.componentId = routeComponentId(STATE.route);
  }

  function t(key, vars) {
    try { if (window.BL && typeof BL.t === 'function') return String(BL.t(String(key || ''), vars) || ''); } catch (_) { }
    return String(key || '');
  }

  function buildCtx() {
    return {
      componentId: STATE.componentId,
      route: STATE.route,
      payload: STATE.payload,
      opts: STATE.opts || {},
      t: t,
      safe: safe,
      ensureControls: ensureSettingsComponentControls,
      notify: showNoty,
      runOnce: runOnce,
      runAsync: runAsync,
      confirm: confirmAction,
      push: push,
      go: go,
      back: back,
      open: API.open,
      refresh: API.refresh,
      getFocusIndex: getSettingsFocusIndexSafe,
      storeLastIndex: storeLastIndex,
      getLastIndex: getLastIndex
    };
  }

  function render(route, payload) {
    payload = payload || null;

    var reg = null;
    try { reg = (window.BL && BL.MenuRegistry) ? BL.MenuRegistry : null; } catch (_) { reg = null; }
    if (!reg || typeof reg.has !== 'function' || typeof reg.build !== 'function') return false;

    route = String(route || 'root');
    if (typeof reg.normalizeRoute === 'function') route = reg.normalizeRoute(route);
    else if (!reg.has(route)) route = 'root';

    try { setRoute(route, payload); } catch (_) { }
    try { ensureSettingsTemplate(STATE.componentId); } catch (_) { }
    resetParams();

    try {
      reg.build(route, buildCtx());
      return true;
    } catch (e) {
      try { dbg('render failed', String(route) + ' | ' + (e && e.message ? e.message : e)); } catch (_) { }
      try { setRoute('root', null); } catch (_) { }
      resetParams();
      try { reg.build('root', buildCtx()); } catch (_) { }
      return false;
    }
  }

  function back() {
    try { storeLastIndex(STATE.route, getSettingsFocusIndexSafe()); } catch (_) { }

    var prev = null;
    try { prev = STATE.stack && STATE.stack.length ? STATE.stack.pop() : null; } catch (_) { prev = null; }

    if (!prev || !prev.route) {
      STATE.prevRoute = '';
      openInternal('root', null, getLastIndex('root'), { resetStack: true });
      return;
    }

    STATE.prevRoute = String(prev.route || '');
    var fi = (typeof prev.focusIndex === 'number') ? prev.focusIndex : getLastIndex(String(prev.route));
    openInternal(String(prev.route), prev.payload || null, fi, { resetStack: false });
  }

  function push(route, payload, focusIndexNext, fromFocusIndex) {
    try {
      var fr = STATE.route || 'root';
      STATE.prevRoute = String(fr || '');
      var fi = (typeof fromFocusIndex === 'number') ? fromFocusIndex : getSettingsFocusIndexSafe();
      storeLastIndex(fr, fi);
      STATE.stack.push({ route: fr, payload: STATE.payload || null, focusIndex: fi });
    } catch (_) { }
    openInternal(route, payload, focusIndexNext, { resetStack: false });
  }

  function go(route, payload, focusIndex) {
    openInternal(route, payload, focusIndex, { resetStack: false });
  }

  function openInternal(route, payload, focusIndex, nav) {
    nav = nav || {};

    try {
      if (!hasLampaSettingsApi()) return;
      if (!window.Lampa || !Lampa.Settings || !Lampa.Settings.create) return;

      var reg = null;
      try { reg = (window.BL && BL.MenuRegistry) ? BL.MenuRegistry : null; } catch (_) { reg = null; }

      route = String(route || 'root');
      if (!reg || typeof reg.has !== 'function') route = 'root';
      else if (typeof reg.normalizeRoute === 'function') route = reg.normalizeRoute(route);
      else if (!reg.has(route)) route = 'root';

      if (nav.resetStack) {
        STATE.stack = [];
        storeLastIndex('root', 0);
      }

      var useDefault = (typeof focusIndex !== 'number');
      if (useDefault) focusIndex = getLastIndex(route);
      if (typeof focusIndex !== 'number') focusIndex = 0;

      if (useDefault && focusIndex === 0 && reg && typeof reg.defaultFocus === 'function') {
        try {
          var df = reg.defaultFocus(route, payload || null, buildCtx());
          if (typeof df === 'number' && df > 0) focusIndex = df;
        } catch (_) { }
      }

      render(route, payload || null);

      var cid = routeComponentId(route);
      try { STATE.openComponentId = String(cid || ''); } catch (_) { }
      try { ensureSettingsTemplate(cid); } catch (_) { }
      var cp = { __bl_pi_internal: true, __bl_pi_route: route };
      if (route !== 'root') cp.onBack = function () { back(); };
      if (typeof focusIndex === 'number' && focusIndex > 0) cp.last_index = focusIndex;

      Lampa.Settings.create(String(cid), cp);
    } catch (_) { }
  }

  function onSettingsOpen(e) {
    try {
      if (!e || !e.name) return;

      try { STATE.openComponentId = String(e.name || ''); } catch (_) { }

      if (String(e.name) === 'main') {
        setRoute('root', null);
        STATE.stack = [];
        return;
      }

      if (!isOurSettingsComponentId(String(e.name))) return;

      try { applyBlUiFont(e.body); } catch (_) { }
      if (e.params && e.params.__bl_pi_internal) return;

      setTimeout(function () {
        try {
          if (!isSettingsComponentOpen()) return;

          var wantRoute = routeFromComponentId(String(e.name)) || (STATE.route || 'root');
          var wantPayload = (wantRoute === 'root') ? null : (STATE.payload || null);
          try { setRoute(wantRoute, wantPayload); } catch (_) { }

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

          openInternal(wantRoute, wantPayload, focus, { resetStack: false });
        } catch (_) { }
      }, 0);
    } catch (_) { }
  }

  API.init = function (opts) {
    STATE.opts = opts || STATE.opts || {};

    try {
      if (!hasLampaSettingsApi()) return;

      var cfg = getConfigSafe();

      STATE.rootComponentId = pickSettingsComponentId(cfg);
      STATE.componentId = String(STATE.rootComponentId || '');
      STATE.componentName = pickSettingsName(cfg);
      STATE.componentIcon = pickSettingsIcon(cfg);

      var s = getSettingsCfg(cfg);
      var legacyExtras = String(s.ap.extrasComponentId || 'bl_autoplugin_extras');
      var legacyPrefix = String(s.ap.extraPluginComponentPrefix || 'bl_autoplugin_extras_plugin_');

      try {
        removeComponentSafe('autoplugin_installer');
        removeComponentSafe('bl_autoplugin');
        removeComponentSafe('bl_autoplugin_extras');
        removeComponentSafe(String(STATE.rootComponentId));
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
        component: String(STATE.rootComponentId),
        name: String(STATE.componentName),
        icon: String(STATE.componentIcon)
      });

      STATE.route = STATE.route || 'root';
      if (!STATE.route) STATE.route = 'root';
      render('root', null);

      try {
        if (!STATE.__hookInstalled && window.Lampa && Lampa.Settings && Lampa.Settings.listener && Lampa.Settings.listener.follow) {
          STATE.__hookInstalled = true;
          Lampa.Settings.listener.follow('open', onSettingsOpen);
	        }
	      } catch (_) { }

      STATE.inited = true;
    } catch (_) { }
  };

  API.refresh = function (opt) {
    try {
      if (!STATE.inited) return;
      ensureSettingsComponentControls('refresh');
      if (!isSettingsComponentOpen()) return;

      opt = opt || {};
      var info = getSettingsFocusIndexInfo();
      var focus = info.index || 0;
      if (!info.found) {
        var stored = getLastIndex(STATE.route || 'root');
        if (stored > 0) focus = stored;
      }
      storeLastIndex(STATE.route, focus);
      openInternal(STATE.route || 'root', STATE.payload || null, focus, { resetStack: false });
    } catch (_) { }
  };

  API.refreshCurrent = function (opt) { return API.refresh(opt || {}); };

  API.open = function (route, payload, focusIndex) {
    try {
      if (!STATE.inited) API.init(STATE.opts || {});
      route = String(route || 'root');
      openInternal(route, payload || null, focusIndex, { resetStack: route === 'root' });
    } catch (_) { }
  };

  API.push = push;
  API.go = go;
  API.back = back;
  API.isOpen = isSettingsComponentOpen;
  API.getSettingsFocusIndexSafe = getSettingsFocusIndexSafe;
  API.getComponentId = function () { return String(STATE.rootComponentId || ''); };
  API.getState = function () { return STATE; };
  API.getCtx = function () { return buildCtx(); };
})();
