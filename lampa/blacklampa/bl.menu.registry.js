(function () {
  'use strict';

  var BL = window.BL = window.BL || {};
  BL.MenuRegistry = BL.MenuRegistry || {};

  var API = BL.MenuRegistry;
  if (API.__blMenuRegistryLoaded) return;
  API.__blMenuRegistryLoaded = true;

  function safe(fn, fallback) { try { return fn(); } catch (_) { return fallback; } }
  function isPlainObject(x) { try { return !!x && typeof x === 'object' && !Array.isArray(x); } catch (_) { return false; } }
  function t(ctx, key, vars) {
    try { return ctx && typeof ctx.t === 'function' ? String(ctx.t(String(key || ''), vars) || '') : String(key || ''); } catch (_) { return String(key || ''); }
  }

  function sGet(k, fallback) {
    var v = null;
    try { if (window.Lampa && Lampa.Storage && Lampa.Storage.get) v = Lampa.Storage.get(String(k)); } catch (_) { v = null; }
    if (v === undefined || v === null) { try { if (window.localStorage) v = localStorage.getItem(String(k)); } catch (_) { v = null; } }
    return (v === undefined || v === null) ? fallback : v;
  }

  function sSet(k, v) {
    try { if (window.Lampa && Lampa.Storage && Lampa.Storage.set) return Lampa.Storage.set(String(k), String(v)); } catch (_) { }
    try { if (window.localStorage) localStorage.setItem(String(k), String(v)); } catch (_) { }
  }

  function shortStr(s, max) {
    s = String(s || '');
    max = Number(max || 160);
    return (s.length <= max) ? s : (s.slice(0, max - 1) + '…');
  }

  function addParam(ctx, param, field, onRender, onChange) {
    try {
      Lampa.SettingsApi.addParam({
        component: ctx.componentId,
        param: param,
        field: field,
        onRender: onRender,
        onChange: onChange
      });
    } catch (_) { }
  }

  function stDot(item) {
    try {
      if (!window.$ || !item) return null;
      if (item.find('.settings-param__status').length === 0) item.append('<div class="settings-param__status one"></div>');
      return item.find('.settings-param__status');
    } catch (_) { return null; }
  }

  function stSet($st, v) {
    try {
      if (!$st || !$st.length) return;
      if (v === 1) $st.css('background-color', '').removeClass('error').addClass('active');
      else if (v === 0) $st.css('background-color', '').removeClass('active').addClass('error');
      else if (v === 2) $st.removeClass('active error').css('background-color', 'rgb(255, 165, 0)');
      else $st.removeClass('active error').css('background-color', '#8c8c8c');
    } catch (_) { }
  }

  function pref() {
    try { if (window.BL && BL.Keys && BL.Keys.prefix) return String(BL.Keys.prefix || 'blacklampa_'); } catch (_) { }
    try {
      var c = (window.BL && BL.Config) ? BL.Config : null;
      if (c && typeof c.get === 'function') c = c.get() || c;
      if (c && c.storagePrefix) return String(c.storagePrefix);
    } catch (_) { }
    return 'blacklampa_';
  }

  function optKey(opt) {
    if (!opt) return '';
    try { if (opt.key) return String(opt.key); } catch (_) { }
    var id = '';
    try { id = String(opt.id || ''); } catch (_) { id = ''; }
    if (!id) return '';
    if (id.indexOf('bl_') === 0) return id;
    var p = pref();
    return (p && id.indexOf(p) === 0) ? id : (String(p || 'blacklampa_') + id);
  }

  function parseBool(v, def) {
    if (v === undefined || v === null || v === '') return !!def;
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return isFinite(v) && v !== 0;
    try { v = String(v).trim(); } catch (_) { return !!def; }
    if (v === '') return !!def;
    return !/^(0|false|off|no)$/i.test(v);
  }

  function valuesMap(values) {
    if (!values) return null;
    if (Array.isArray(values)) {
      var out = {};
      for (var i = 0; i < values.length; i++) out[i] = String(values[i]);
      return out;
    }
    if (typeof values === 'object') return values;
    return null;
  }

  function P(ctx, opt) {
    try {
      if (!window.Lampa || !Lampa.SettingsApi || !Lampa.SettingsApi.addParam) return null;
      opt = opt || {};

      var key = optKey(opt);
      if (!key) return null;

      var type = String(opt.type || 'static');
      var lType = (type === 'toggle') ? 'select' : type;

      var param = { name: key, type: lType };
      if (lType === 'static') { if (opt.values !== undefined) param.values = opt.values; }
      else if (lType === 'select') param.values = valuesMap(opt.values) || ((type === 'toggle') ? { 0: 'OFF', 1: 'ON' } : null);
      else if (lType === 'input') {
        if (opt.values !== undefined) param.values = opt.values;
        if (opt.placeholder !== undefined) param.placeholder = opt.placeholder;
      }

      if (opt["default"] !== undefined) param["default"] = opt["default"];
      else if (lType === 'static') param["default"] = (param.values !== undefined) ? param.values : true;
      else if (lType === 'select') param["default"] = 0;
      else if (lType === 'input') param["default"] = '';

      var name = '';
      var desc = '';
      try { name = (opt.name !== undefined && opt.name !== null) ? String(opt.name) : ''; } catch (_) { name = ''; }
      try { desc = (opt.desc !== undefined && opt.desc !== null) ? String(opt.desc) : ''; } catch (_) { desc = ''; }
      if (!name && opt.nameKey) name = t(ctx, opt.nameKey);
      if (!desc && opt.descKey) desc = t(ctx, opt.descKey);

      var onRender = null;
      if (typeof opt.onEnter === 'function' || typeof opt.onRender === 'function') {
        onRender = function (item) {
          try { if (typeof opt.onRender === 'function') opt.onRender(item, ctx); } catch (_) { }
          if (typeof opt.onEnter === 'function') {
            try { if (item && item.on) item.on('hover:enter', function () { opt.onEnter(item, ctx); }); } catch (_) { }
          }
        };
      }

      var onChange = null;
      if (typeof opt.onChange === 'function') {
	        onChange = function () {
	          var v = null;
	          try {
	            var a0 = (arguments && arguments.length) ? arguments[0] : undefined;
	            if (typeof a0 === 'string' || typeof a0 === 'number' || typeof a0 === 'boolean') v = a0;
	            else if (a0 && typeof a0 === 'object') {
	              if (a0.value !== undefined && (typeof a0.value === 'string' || typeof a0.value === 'number' || typeof a0.value === 'boolean')) v = a0.value;
	              else if (a0.id !== undefined && (typeof a0.id === 'string' || typeof a0.id === 'number' || typeof a0.id === 'boolean')) v = a0.id;
	              else if (a0.key !== undefined && (typeof a0.key === 'string' || typeof a0.key === 'number' || typeof a0.key === 'boolean')) v = a0.key;
	              else if (a0.name !== undefined && (typeof a0.name === 'string' || typeof a0.name === 'number' || typeof a0.name === 'boolean')) v = a0.name;
	              else if (a0.title !== undefined && (typeof a0.title === 'string' || typeof a0.title === 'number' || typeof a0.title === 'boolean')) v = a0.title;
	            }
	          } catch (_) { v = null; }
	          if (v === null) v = sGet(key, null);
	          if (type === 'toggle') v = parseBool(v, false) ? 1 : 0;
	          var r = opt.onChange(v, ctx);
          if (r === false) return;
          try { if (ctx && ctx.refresh && type !== 'input') ctx.refresh({ keepFocus: true }); } catch (_) { }
        };
      } else if (lType === 'select' && type !== 'input') {
        onChange = function () { try { if (ctx && ctx.refresh) ctx.refresh({ keepFocus: true }); } catch (_) { } };
      }

      addParam(ctx, param, { name: name, description: desc }, onRender, onChange);
      return key;
    } catch (_) {
      return null;
    }
  }

  function callMod(modName, fnName, ctx, fallbackTitleKey) {
    try {
      var mod = null;
      try { mod = (window.BL && BL[modName]) ? BL[modName] : null; } catch (_) { mod = null; }
      if (mod && typeof mod[fnName] === 'function') return mod[fnName](ctx);
    } catch (_) { }
    if (fallbackTitleKey) P(ctx, { id: 'mod_missing_' + String(modName || '') + '_' + String(fnName || ''), type: 'static', values: 'Module missing', name: t(ctx, fallbackTitleKey), desc: 'Module missing: ' + String(modName || '') });
  }

  function rootStatusRender(ctx, item) {
    try {
      if (!window.$ || !item) return;
      var ss = null;
      try { ss = (ctx && ctx.opts && typeof ctx.opts.statusStrings === 'function') ? (ctx.opts.statusStrings() || null) : null; } catch (_) { ss = null; }
      var raw = ss && ss.raw ? String(ss.raw) : '';
      var help = ss && ss.help ? String(ss.help) : '';
      var short = ss && ss.short ? String(ss.short) : '';

      var $d = item.find('.settings-param__descr');
      if (!$d.length) {
        item.append('<div class=\"settings-param__descr\"></div>');
        $d = item.find('.settings-param__descr');
      }
      $d.empty();
      if (short) $d.append($('<div></div>').text(short));
      if (raw && raw !== short) $d.append($('<div></div>').text(raw));
      if (help) $d.append($('<div style=\"opacity:0.85;margin-top:0.35em;white-space:pre-wrap;\"></div>').text(help));
    } catch (_) { }
  }

  function uaMenuRender(ctx, item) {
    try {
      if (!window.$ || !item) return;

      var $d = item.find('.settings-param__descr');
      if (!$d.length) {
        item.append('<div class=\"settings-param__descr\"></div>');
        $d = item.find('.settings-param__descr');
      }

      var ua = '';
      try {
        if (window.BL && BL.UA && BL.UA.effective && BL.UA.effective.ua) ua = String(BL.UA.effective.ua || '');
        else ua = String(navigator && navigator.userAgent ? navigator.userAgent : '') || '';
      } catch (_) { ua = ''; }
      ua = shortStr(ua, 180);

      var src = '';
      try { if (window.BL && BL.UA && typeof BL.UA.getSelectedPresetId === 'function') src = String(BL.UA.getSelectedPresetId() || ''); } catch (_) { src = ''; }

      var line = ua;
      if (src && ua) line = src + ': ' + ua;

      var $ua = $d.find('.bl_ua_effective');
      if (!$ua.length) {
        $ua = $('<div class=\"bl_ua_effective\" style=\"opacity:0.85;margin-top:0.35em;white-space:pre-wrap;\"></div>');
        $d.append($ua);
      }
      $ua.text(line || '');
    } catch (_) { }
  }

  function dfPluginDetail(ctx, payload) {
    try {
      if (window.BL && BL.ModuleInstaller && typeof BL.ModuleInstaller.defaultFocusPluginDetail === 'function') {
        return BL.ModuleInstaller.defaultFocusPluginDetail(ctx, payload || null) || 0;
      }
    } catch (_) { }
    return 0;
  }

  var TOP = BL.MenuTopology = {
    root: { id: 'root', children: ['plugins', 'network', 'logs', 'utils', 'danger', 'ui', 'status'] },

    plugins: { id: 'plugins', parent: 'root', titleKey: 'menu.root.plugins.title', descKey: 'menu.root.plugins.desc', children: ['managed', 'extras'] },
    managed: { id: 'managed', parent: 'plugins', title: 'Managed', desc: 'Плагины из bl.autoplugin.json → plugins[].', screen: 'managed' },
    extras: { id: 'extras', parent: 'plugins', title: 'Extras', desc: 'Дополнительные плагины из bl.autoplugin.json → disabled[].', screen: 'extras' },
    plugin_detail: { id: 'plugin_detail', parent: 'plugins', menu: false, screen: 'plugin_detail', defaultFocus: dfPluginDetail },

    network: { id: 'network', parent: 'root', titleKey: 'menu.root.network.title', descKey: 'menu.root.network.desc', status: 'net_policy', children: ['net_policy', 'net_builtin', 'net_rules', 'network_status', 'jsqp', 'query_params', 'ua'] },
    net_policy: { id: 'net_policy', parent: 'network', title: 'Сетевая политика', desc: 'Вкл/выкл применение правил/блокировок.', status: 'net_policy', screen: 'net_policy' },
    net_builtin: { id: 'net_builtin', parent: 'network', title: 'Встроенные блокировки', desc: 'Yandex / Google / YouTube / Stats / BWA:CORS.', screen: 'net_builtin' },
    net_rules: { id: 'net_rules', parent: 'network', title: 'Пользовательские правила', desc: 'User rules (JSON array).', status: 'net_rules', screen: 'net_rules' },
    net_rule_detail: { id: 'net_rule_detail', parent: 'net_rules', menu: false, screen: 'net_rule_detail' },
    network_status: { id: 'network_status', parent: 'network', title: 'Interceptors Status', desc: 'Coverage matrix + lastBlocked.', screen: 'network_status' },
    jsqp: { id: 'jsqp', parent: 'network', title: 'JSQP', desc: 'JS query rewrite (origin/logged/reset).', status: 'jsqp', screen: 'jsqp' },
    query_params: { id: 'query_params', parent: 'network', titleKey: 'menu.root.query_params.title', descKey: 'menu.root.query_params.desc', screen: 'query_params' },

    ua: { id: 'ua', parent: 'network', titleKey: 'menu.root.ua.title', descKey: 'menu.root.ua.desc', status: 'ua', rootRender: uaMenuRender, children: ['ua_presets', 'ua_effective'] },
    ua_presets: { id: 'ua_presets', parent: 'ua', title: 'Presets', desc: 'Выбор пресета UA. Включает Original(system).', screen: 'ua_presets' },
    ua_effective: { id: 'ua_effective', parent: 'ua', title: 'Effective (now)', desc: 'Показывает текущий effective UA и поддержку подмены заголовка.', screen: 'ua_effective' },

    logs: { id: 'logs', parent: 'root', titleKey: 'menu.root.logs.title', descKey: 'menu.root.logs.desc', children: ['logs_view', 'logging'] },
    logs_view: { id: 'logs_view', parent: 'logs', title: 'View logs', desc: 'Открывает viewer логов BlackLampa.', screen: 'action', action: function () { try { if (window.BL && BL.Log && BL.Log.openViewer) BL.Log.openViewer(); } catch (_) { } } },
    logging: { id: 'logging', parent: 'logs', title: 'Log mode', desc: 'silent / popup (не влияет на блокировки).', screen: 'logging' },

    utils: { id: 'utils', parent: 'root', title: 'Utils', desc: 'Backup/Transfer + Scanner.', children: ['backup', 'filesystem_scan'] },
    backup: { id: 'backup', parent: 'utils', titleKey: 'menu.root.backup.title', descKey: 'menu.root.backup.desc', screen: 'backup' },
    filesystem_scan: { id: 'filesystem_scan', parent: 'utils', title: 'Scanner', descKey: 'menu.root.filescan.desc', screen: 'action', action: function () { try { if (window.BL && BL.FileScanner && BL.FileScanner.open) BL.FileScanner.open(); } catch (_) { } } },
    danger: { id: 'danger', parent: 'root', titleKey: 'menu.root.danger.title', descKey: 'menu.root.danger.desc', screen: 'danger' },
    ui: { id: 'ui', parent: 'root', titleKey: 'menu.root.ui.title', descKey: 'menu.root.ui.desc', screen: 'ui' },
    status: { id: 'status', parent: 'root', titleKey: 'menu.root.status.title', param: { name: 'bl_pi_root_status', type: 'static', values: '', default: '' }, screen: 'status', rootRender: rootStatusRender }
  };

  function node(id) { try { return TOP[String(id || '')] || null; } catch (_) { return null; } }
  function has(route) { return !!node(route); }

  function nodeTitle(ctx, n, id) {
    var s = '';
    try { s = n.titleKey ? t(ctx, n.titleKey) : ''; } catch (_) { s = ''; }
    if (!s) try { s = (n.title !== undefined && n.title !== null) ? String(n.title) : ''; } catch (_) { s = ''; }
    return s || String(id || '');
  }

  function nodeDesc(ctx, n) {
    var s = '';
    try { s = n.descKey ? t(ctx, n.descKey) : ''; } catch (_) { s = ''; }
    if (!s) try { s = (n.desc !== undefined && n.desc !== null) ? String(n.desc) : ''; } catch (_) { s = ''; }
    return s || '';
  }

  function menuParamName(parentId, childId) {
    return 'bl_pi_' + String(parentId || 'root') + '_' + String(childId || '');
  }

  function k(name) {
    try { if (window.BL && BL.Keys && BL.Keys[name]) return String(BL.Keys[name]); } catch (_) { }
    return String(pref() || 'blacklampa_') + String(name || '');
  }

	  function stNetPolicy() {
	    try { if (window.BL && BL.NetPolicy && typeof BL.NetPolicy.isEnabled === 'function') return BL.NetPolicy.isEnabled() ? 1 : 0; } catch (_) { }
	    try { return parseBool(sGet(k('net_policy_enabled'), '1'), true) ? 1 : 0; } catch (_) { }
	    return -1;
	  }

  function stJsqp() {
    try { return parseBool(sGet(k('jsqp_enabled'), '1'), true) ? 1 : 0; } catch (_) { }
    return -1;
  }

  function stUa() {
    try {
      var uaApi = (window.BL && BL.UA) ? BL.UA : null;
      var id = '';
      try { if (uaApi && typeof uaApi.getSelectedPresetId === 'function') id = String(uaApi.getSelectedPresetId() || ''); } catch (_) { id = ''; }
      if (!id) id = String(sGet(k('ua_preset_id_v1'), 'original_system') || 'original_system');
      return (id && id !== 'original_system') ? 1 : 0;
    } catch (_) { return -1; }
  }

  function stNetRules() {
    try {
      if (window.BL && BL.PolicyNetwork && BL.PolicyNetwork.blocklist && BL.PolicyNetwork.blocklist.user) {
        var u = BL.PolicyNetwork.blocklist.user;
        try { if (u.getParseError && u.getParseError()) return 2; } catch (_) { }
        var list = null;
        try { if (u.getAll) list = u.getAll(); } catch (_) { list = null; }
        if (Array.isArray(list)) {
          if (!list.length) return -1;
          for (var i = 0; i < list.length; i++) { try { if (list[i] && list[i].enabled) return 1; } catch (_) { } }
          return 0;
        }
      }
    } catch (_) { }
    return -1;
  }

  var Status = { net_policy: stNetPolicy, jsqp: stJsqp, ua: stUa, net_rules: stNetRules };

  function buildMenu(ctx, routeId) {
    var n = node(routeId);
    var kids = (n && Array.isArray(n.children)) ? n.children : [];

    for (var i = 0; i < kids.length; i++) {
      (function (childId, idx) {
        childId = String(childId || '');
        if (!childId) return;
        var c = node(childId);
        if (!c || c.menu === false) return;

        var title = nodeTitle(ctx, c, childId);
        var desc = nodeDesc(ctx, c);

        var param = c.param || { name: menuParamName(routeId, childId), type: 'static', default: true };
        if (!param.name) param.name = menuParamName(routeId, childId);
        if (!param.type) param.type = 'static';
        if (param["default"] === undefined) param["default"] = true;

        addParam(ctx, param, { name: title, description: desc }, function (item) {
          try {
            if (item && item.on) {
              item.on('hover:enter', function () {
                try {
                  if (c.action) return c.action(ctx, item, idx);
                  ctx.push(childId, null, 0, idx);
                } catch (_) { }
              });
            }
          } catch (_) { }
          try { if (c.rootRender) c.rootRender(ctx, item, idx); } catch (_) { }
          try { if (c.status && Status[c.status]) stSet(stDot(item), Status[c.status](ctx, c, childId, idx)); } catch (_) { }
        });
      })(kids[i], i);
    }
  }

  function actionScreen(ctx) {
    try {
      var n = node(ctx && ctx.route ? ctx.route : '');
      if (n && n.action) n.action(ctx || null);
      else P(ctx, { id: 'action_none', type: 'static', values: '—', name: 'Action', desc: 'No action.' });
    } catch (_) { }
  }

  var Screens = {
    action: actionScreen,
    managed: function (ctx) { callMod('ModuleInstaller', 'buildManagedScreen', ctx); },
    extras: function (ctx) { callMod('ModuleInstaller', 'buildExtrasScreen', ctx); },
    plugin_detail: function (ctx) { callMod('ModuleInstaller', 'buildPluginDetailScreen', ctx); },
    danger: function (ctx) { callMod('ModuleInstaller', 'buildDangerScreen', ctx); },
    net_policy: buildNetPolicyScreen,
    net_builtin: buildNetBuiltinScreen,
    net_rules: buildNetRulesScreen,
    net_rule_detail: buildNetRuleDetailScreen,
    network_status: buildNetworkStatusScreen,
    jsqp: buildJsqpScreen,
    ui: buildUiScreen,
    logging: buildLoggingScreen,
    ua_presets: buildUaPresetsScreen,
    ua_effective: buildUaEffectiveScreen,
    query_params: buildQueryParamsScreen,
    status: buildStatusScreen,
    backup: buildBackupScreen
  };

  API.has = has;
  API.normalizeRoute = function (route) {
    route = String(route || 'root');
    return has(route) ? route : 'root';
  };

  API.defaultFocus = function (route, payload, ctx) {
    try {
      var n = node(route);
      if (n && typeof n.defaultFocus === 'function') return n.defaultFocus(ctx || null, payload || null) || 0;
    } catch (_) { }
    return 0;
  };

  API.build = function (route, ctx) {
    route = API.normalizeRoute(route);
    var n = node(route) || node('root');
    if (!n) return;
    try { if (n.guard && typeof n.guard === 'function' && !n.guard(ctx || null)) { route = 'root'; n = node('root'); } } catch (_) { route = 'root'; n = node('root'); }
    if (!n) return;
    if (n.children && n.children.length) return buildMenu(ctx, route);
    if (n.screen && Screens[n.screen]) return Screens[n.screen](ctx || null);
    buildMenu(ctx, 'root');
  };

	  function buildNetPolicyScreen(ctx) {
	    try {
	      P(ctx, {
	        id: 'net_policy_enabled',
	        type: 'toggle',
	        values: { 0: 'OFF', 1: 'ON' },
	        default: 1,
	        name: 'Сетевая политика',
	        desc: 'OFF => правила не применяются (UI остаётся доступен).',
	        onChange: function (v) {
          try {
            var on = parseBool(v, false);
            var key = k('net_policy_enabled');
            var want = on ? '1' : '0';
            try { localStorage.setItem(String(key), want); } catch (_) { }
            try { if (window.Lampa && Lampa.Storage && Lampa.Storage.set) Lampa.Storage.set(String(key), want); } catch (_) { }

            var got = null;
            var gotS = null;
            try { got = localStorage.getItem(String(key)); } catch (_) { got = null; }
            try { if (window.Lampa && Lampa.Storage && Lampa.Storage.get) gotS = Lampa.Storage.get(String(key)); } catch (_) { gotS = null; }

            if (String(got) !== want) {
              try { if (window.BL && BL.Log && BL.Log.showError) BL.Log.showError('Policy', 'persist failed', 'key=' + key + ' | want=' + want + ' | got=' + String(got) + ' | storage=' + String(gotS)); } catch (_) { }
              try { console.error('[BlackLampa][Policy] persist failed', { key: String(key), want: want, got: got, storage: gotS }); } catch (_) { }
            }

            try { if (window.BL && BL.NetPolicy && BL.NetPolicy.setEnabled) BL.NetPolicy.setEnabled(on); } catch (_) { }
          } catch (_) { }
        }
      });

      var on = (stNetPolicy() === 1) ? 'ON' : 'OFF';
      P(ctx, { id: 'net_policy_status', type: 'static', values: on, name: 'Status', desc: on });
    } catch (_) { }
  }

	  function buildNetBuiltinScreen(ctx) {
	    try {
	      P(ctx, { id: 'net_block_yandex_v1', type: 'toggle', values: { 0: 'OFF', 1: 'ON' }, default: 1, name: 'Yandex', desc: 'Блокировка доменов Yandex/ya.ru/yastatic.' });
	      P(ctx, { id: 'net_block_google_v2', type: 'toggle', values: { 0: 'OFF', 1: 'ON' }, default: 1, name: 'Google', desc: 'Google/Analytics/Ads.' });
	      P(ctx, { id: 'net_block_youtube_v1', type: 'toggle', values: { 0: 'OFF', 1: 'ON' }, default: 1, name: 'YouTube', desc: 'youtube.com/ytimg/googlevideo.' });
	      P(ctx, { id: 'net_block_stats_v1', type: 'toggle', values: { 0: 'OFF', 1: 'ON' }, default: 1, name: 'Statistics', desc: 'Трекеры/статистика.' });
	      P(ctx, { id: 'net_block_bwa_cors_v1', type: 'toggle', values: { 0: 'OFF', 1: 'ON' }, default: 1, name: 'BWA:CORS', desc: 'bwa.to /cors/check.' });
	    } catch (_) { }
	  }

		  function buildNetRulesScreen(ctx) {
		    try {
		      var u = null;
		      try { u = (window.BL && BL.PolicyNetwork && BL.PolicyNetwork.blocklist && BL.PolicyNetwork.blocklist.user) ? BL.PolicyNetwork.blocklist.user : null; } catch (_) { u = null; }
		      if (!u) return P(ctx, { id: 'net_rules_no_mod', type: 'static', values: '—', name: 'User rules', desc: 'PolicyNetwork missing.' });

		      var err = '';
		      try { if (u.getParseError) err = String(u.getParseError() || ''); } catch (_) { err = ''; }
		      if (err) {
		        P(ctx, { id: 'net_rules_parse_err', type: 'static', values: 'ERR', name: 'User rules', desc: 'Ошибка парсинга rules JSON.' });
		        return P(ctx, { id: 'net_rules_reset', type: 'button', name: 'Reset user rules', desc: 'Backup -> *_bad_<ts>, set []', onChange: function () { try { if (u.reset) u.reset('menu'); } catch (_) { } } });
		      }

		      var formState = buildNetRulesScreen.__formState || (buildNetRulesScreen.__formState = { pattern: '', type: 'simple', ct: 'application/json', body: 'empty' });
		      var kPat = k('net_rule_new_pattern');
		      var kType = k('net_rule_new_type');
		      var kCt = k('net_rule_new_ct');
		      var kBody = k('net_rule_new_body');

		      function readDomInputValue(paramKey) {
		        try {
		          if (!document || !document.querySelector) return null;
		          var el = document.querySelector('div[data-name=\"' + String(paramKey || '') + '\"]');
		          if (!el) return null;
		          var inp = el.querySelector('input');
		          if (inp && typeof inp.value === 'string') return String(inp.value || '');
		        } catch (_) { }
		        return null;
		      }

		      function saveFormState(override) {
		        override = override || {};
		        try {
		          var pat = '';
		          if (override.pattern !== undefined) pat = override.pattern;
		          else {
		            var domPat = readDomInputValue(kPat);
		            if (domPat !== null) pat = domPat;
		            else pat = sGet(kPat, '');
		          }
		          formState.pattern = String(pat || '');
		        } catch (_) { formState.pattern = String(formState.pattern || ''); }

		        try {
		          var ty = (override.type !== undefined) ? override.type : sGet(kType, null);
		          ty = String(ty || 'simple').toLowerCase();
		          if (ty === '1') ty = 'advanced';
		          else if (ty === '0') ty = 'simple';
		          if (ty !== 'advanced') ty = 'simple';
		          formState.type = ty;
		        } catch (_) { formState.type = 'simple'; }

		        try {
		          var ct = (override.ct !== undefined) ? override.ct : sGet(kCt, null);
		          formState.ct = String(ct || formState.ct || 'application/json');
		        } catch (_) { formState.ct = String(formState.ct || 'application/json'); }

		        try {
		          var bm = (override.body !== undefined) ? override.body : sGet(kBody, null);
		          formState.body = String(bm || formState.body || 'empty');
		        } catch (_) { formState.body = String(formState.body || 'empty'); }
		      }

		      function restoreFormState() {
		        try { sSet(kPat, String(formState.pattern || '')); } catch (_) { }
		        try { sSet(kType, String(formState.type || 'simple')); } catch (_) { }
		        try { sSet(kCt, String(formState.ct || 'application/json')); } catch (_) { }
		        try { sSet(kBody, String(formState.body || 'empty')); } catch (_) { }
		      }

		      function refreshRulesList(override) {
		        try { saveFormState(override); } catch (_) { }
		        try { restoreFormState(); } catch (_) { }
		        try { if (ctx && ctx.refresh) ctx.refresh({ keepFocus: true }); } catch (_) { }
		      }

	      function rerenderForm(override) { refreshRulesList(override); }

	      var list = [];
	      try { if (u.getAll) list = u.getAll() || []; } catch (_) { list = []; }
		      if (!Array.isArray(list) || !list.length) {
		        P(ctx, { id: 'net_rules_empty', type: 'static', values: '—', name: 'User rules', desc: 'Нет правил.' });
		      } else {
	        function showRuleActions(id, pat, enabled) {
	          try {
	            if (!window.Lampa || !Lampa.Select || !Lampa.Select.show) return false;

	            var items = [
	              { title: enabled ? 'Выключить' : 'Включить', value: 'toggle' },
	              { title: 'Удалить', value: 'remove' },
	              { title: 'Подробнее', value: 'details' }
	            ];
	            if (Lampa.Utils && Lampa.Utils.copyTextToClipboard) items.push({ title: 'Копировать pattern', value: 'copy' });

	            var en = '';
	            try { if (Lampa.Controller && Lampa.Controller.enabled) en = String((Lampa.Controller.enabled() || {}).name || ''); } catch (_) { en = ''; }

	            Lampa.Select.show({
	              title: 'Правило',
	              items: items,
	              onBack: function () { try { if (en && Lampa.Controller && Lampa.Controller.toggle) Lampa.Controller.toggle(en); } catch (_) { } },
	              onSelect: function (a) {
	                try { if (en && Lampa.Controller && Lampa.Controller.toggle) Lampa.Controller.toggle(en); } catch (_) { }
	                var act = '';
	                try { act = a && a.value ? String(a.value) : ''; } catch (_) { act = ''; }

	                if (act === 'toggle') {
	                  try { if (u.setEnabled) u.setEnabled(id, !enabled); } catch (_) { }
	                  refreshRulesList();
	                } else if (act === 'remove') {
	                  ctx.confirm('Удалить правило', 'Удалить правило?\n\n' + pat, function () {
	                    try { if (u.remove) u.remove(id); } catch (_) { }
	                    refreshRulesList();
	                  });
	                } else if (act === 'details') {
	                  try { ctx.push('net_rule_detail', { id: id }, 0); } catch (_) { }
	                } else if (act === 'copy') {
	                  try {
	                    if (Lampa.Utils && Lampa.Utils.copyTextToClipboard) {
	                      Lampa.Utils.copyTextToClipboard(pat, function () { ctx.notify('[[BlackLampa]] Copied'); }, function () { ctx.notify('[[BlackLampa]] Copy failed'); });
	                    }
	                  } catch (_) { }
	                }
	              }
	            });
	            return true;
	          } catch (_) { }
	          return false;
	        }

	        for (var i = 0; i < list.length; i++) {
	          (function (r) {
	            try {
	              if (!r) return;
	              var id = String(r.id || '');
	              var pat = String(r.pattern || '').trim();
	              if (!id || !pat) return;
	              var ty = String(r.type || 'simple');
	              var ds = 'type: ' + ty;
	              try {
	                if (ty === 'advanced' && r.advanced) {
	                  if (r.advanced.contentType) ds += ' | ct: ' + String(r.advanced.contentType);
	                  if (r.advanced.bodyMode) ds += ' | body: ' + String(r.advanced.bodyMode);
	                }
	              } catch (_) { }
			              P(ctx, {
			                id: 'net_rule_' + id,
			                type: 'static',
			                name: (r.enabled ? '✓ ' : '') + pat,
			                desc: ds,
			                onEnter: function () { if (!showRuleActions(id, pat, !!r.enabled)) { try { if (u.setEnabled) u.setEnabled(id, !r.enabled); } catch (_) { } refreshRulesList(); } },
			                onRender: function (item) {
			                  try {
			                    if (!item || !item.on) return;
			                    item.on('hover:long', function () {
			                      showRuleActions(id, pat, !!r.enabled);
		                    });
		                  } catch (_) { }
		                }
		              });
	            } catch (_) { }
	          })(list[i]);
	        }
		      }

		      P(ctx, { id: 'net_rule_new_pattern', type: 'input', values: '', default: '', placeholder: 'https://example.com/*', name: 'URL / Pattern', desc: 'Подстрока / wildcard (*) / /regex/i.' });
		      P(ctx, {
		        id: 'net_rule_new_type',
		        type: 'select',
		        values: { simple: 'Простое (simple)', advanced: 'Расширенное (advanced)' },
		        default: 'simple',
		        name: 'Тип правила',
		        desc: '',
		        onChange: function (v) {
		          var next = '';
		          try { next = String(v || '').toLowerCase(); } catch (_) { next = ''; }
		          if (next === '1') next = 'advanced';
		          else if (next === '0') next = 'simple';
		          if (next !== 'advanced') next = 'simple';
		          rerenderForm({ type: next });
		          return false;
		        }
		      });

		      var rt = 'simple';
		      try { rt = String(sGet(kType, 'simple') || 'simple'); } catch (_) { rt = 'simple'; }
		      rt = rt.toLowerCase();
		      if (rt === '1') rt = 'advanced';
		      else if (rt === '0') rt = 'simple';
		      if (rt !== 'advanced') rt = 'simple';

		      if (rt === 'advanced') {
		        P(ctx, { id: 'net_rule_new_ct', type: 'select', values: {
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
	        }, default: 'application/json', name: 'Content-Type', desc: '' });
	        P(ctx, { id: 'net_rule_new_body', type: 'select', values: { empty: 'empty', minimal: 'minimal' }, default: 'empty', name: 'Body mode', desc: '' });
	      }

	      P(ctx, {
	        id: 'net_rule_add_btn',
	        type: 'button',
	        name: 'Сохранить',
		        desc: 'Добавляет правило и включает его.',
		        onChange: function () {
		          try {
		            var pat = String(sGet(kPat, '') || '').trim();
		            if (!pat) { ctx.notify('[[BlackLampa]] Укажите URL / Pattern'); return false; }

		            var type = 'simple';
		            try { type = String(sGet(kType, 'simple') || 'simple'); } catch (_) { type = 'simple'; }
		            type = type.toLowerCase();
		            if (type === '1') type = 'advanced';
		            else if (type === '0') type = 'simple';
		            if (type !== 'advanced') type = 'simple';

		            var rule = { enabled: true, pattern: pat, type: type };
		            if (type === 'advanced') {
		              var ct = '';
		              var bm = '';
		              try { ct = String(sGet(kCt, 'application/json') || ''); } catch (_) { ct = ''; }
		              try { bm = String(sGet(kBody, 'empty') || ''); } catch (_) { bm = ''; }
		              rule.advanced = { contentType: ct, bodyMode: bm };
		            }

		            var id = null;
		            try { if (u.add) id = u.add(rule); } catch (_) { id = null; }
		            if (!id) { ctx.notify('[[BlackLampa]] Rule not added'); return false; }
		            sSet(kPat, '');
		            refreshRulesList({ pattern: '' });
		            return false;
		          } catch (_) { }
		          return false;
		        }
		      });
		    } catch (_) { }
		  }

	  function buildNetRuleDetailScreen(ctx) {
	    try {
	      var u = null;
	      try { u = (window.BL && BL.PolicyNetwork && BL.PolicyNetwork.blocklist && BL.PolicyNetwork.blocklist.user) ? BL.PolicyNetwork.blocklist.user : null; } catch (_) { u = null; }
	      if (!u) return P(ctx, { id: 'net_rule_detail_no_mod', type: 'static', values: '—', name: 'Rule', desc: 'PolicyNetwork missing.' });

	      var rid = '';
	      try { rid = (ctx && ctx.payload && ctx.payload.id) ? String(ctx.payload.id) : ''; } catch (_) { rid = ''; }

	      var list = [];
	      try { if (u.getAll) list = u.getAll() || []; } catch (_) { list = []; }

	      var rule = null;
	      for (var i = 0; i < list.length; i++) {
	        try { if (String(list[i].id || '') === rid) { rule = list[i]; break; } } catch (_) { }
	      }
	      if (!rule) return P(ctx, { id: 'net_rule_detail_nf', type: 'static', values: '—', name: 'Rule', desc: 'Not found.' });

	      var pat = String(rule.pattern || '');
	      var ty = String(rule.type || 'simple');
	      var ds = 'type: ' + ty + (rule.id ? (' | id: ' + String(rule.id)) : '');
	      try {
	        if (ty === 'advanced' && rule.advanced) {
	          if (rule.advanced.contentType) ds += '\ncontent-type: ' + String(rule.advanced.contentType);
	          if (rule.advanced.bodyMode) ds += '\nbody: ' + String(rule.advanced.bodyMode);
	        }
	      } catch (_) { }

	      P(ctx, { id: 'net_rule_detail_info', type: 'static', values: pat, name: pat, desc: ds });

	      var toggleName = rule.enabled ? 'Выключить' : 'Включить';
	      P(ctx, {
	        id: 'net_rule_detail_toggle',
	        type: 'button',
	        name: toggleName,
	        desc: 'Включает/выключает правило.',
	        onChange: function () { try { if (u.setEnabled) u.setEnabled(rid, !rule.enabled); } catch (_) { } }
	      });

	      P(ctx, {
	        id: 'net_rule_detail_delete',
	        type: 'button',
	        name: 'Удалить',
	        desc: 'Удаляет правило.',
	        onChange: function () {
	          try {
	            ctx.confirm('Удалить правило', 'Удалить правило?\n\n' + pat, function () {
	              try { if (u.remove) u.remove(rid); } catch (_) { }
	              try { ctx.back(); } catch (_) { }
	            });
	          } catch (_) { }
	          return false;
	        }
	      });
	    } catch (_) { }
	  }

		  function buildNetworkStatusScreen(ctx) {
		    try {
	      var st = null;
	      try { st = (window.BL && BL.PolicyNetwork && typeof BL.PolicyNetwork.getStatus === 'function') ? BL.PolicyNetwork.getStatus() : null; } catch (_) { st = null; }
	      st = st || {};
	      var m = st.interceptors || {};

      var keys = [
        { k: 'fetch', title: 'fetch' },
        { k: 'xhr', title: 'xhr' },
        { k: 'ws', title: 'ws' },
        { k: 'eventsource', title: 'eventsource' },
        { k: 'beacon', title: 'beacon' },
        { k: 'iframe_src', title: 'iframe/src' },
        { k: 'img_src', title: 'img/src' },
        { k: 'script_src', title: 'script/src' },
        { k: 'link_href', title: 'link/href' },
        { k: 'open', title: 'window.open' },
        { k: 'location', title: 'location redirects' }
      ];

		      for (var i = 0; i < keys.length; i++) {
		        (function (row) {
		          try {
		            var active = false;
		            try { active = !!m[row.k]; } catch (_) { active = false; }
		            var line = active ? 'yes' : 'no';
		            P(ctx, { id: 'pi_net_matrix_' + row.k, type: 'static', values: line, name: row.title, desc: line });
		          } catch (_) { }
		        })(keys[i]);
		      }

      var lb = st.lastBlocked || null;
      var lbLine = '—';
	      var ruleLine = '—';
	      try {
	        if (lb && lb.url) {
	          lbLine = String(lb.channel || '') + ' | ' + shortStr(String(lb.url || ''), 220);
	          ruleLine = String(lb.ruleId || '') + (lb.ruleLabel ? (' | ' + shortStr(String(lb.ruleLabel || ''), 160)) : '');
	        }
	      } catch (_) { }

		      P(ctx, { id: 'pi_net_last_blocked', type: 'static', values: lbLine, name: 'Last blocked', desc: lbLine });
		      P(ctx, { id: 'pi_net_rule', type: 'static', values: ruleLine, name: 'Rule matched', desc: ruleLine });
		    } catch (_) { }
		  }

	  function buildQueryParamsScreen(ctx) {
	    try {
	      var raw = '';
	      try { raw = String(location.search || ''); } catch (_) { raw = ''; }

      try {
        var head = raw ? raw : '(empty)';
        Lampa.SettingsApi.addParam({
          component: ctx.componentId,
          param: { name: 'bl_pi_qp_raw', type: 'static', values: head, default: head },
          field: { name: 'location.search', description: head }
        });
      } catch (_) { }

      var qs = raw;
      if (qs && qs.charAt(0) === '?') qs = qs.slice(1);
      if (!qs) return;

      var parts = [];
      try { parts = qs.split('&'); } catch (_) { parts = []; }
      for (var i = 0; i < parts.length; i++) {
        try {
          var kv = String(parts[i] || '');
          if (!kv) continue;
          var eq = kv.indexOf('=');
          var k = eq >= 0 ? kv.slice(0, eq) : kv;
          var v = eq >= 0 ? kv.slice(eq + 1) : '';
          try { k = decodeURIComponent(k); } catch (_) { }
          try { v = decodeURIComponent(v); } catch (_) { }
          k = String(k || '').trim();
          if (!k) continue;
          v = String(v || '');

          Lampa.SettingsApi.addParam({
            component: ctx.componentId,
            param: { name: 'bl_pi_qp_' + String(i), type: 'static', values: v, default: v },
            field: { name: k, description: v || '(empty)' }
          });
        } catch (_) { }
      }
    } catch (_) { }
  }

  function buildStatusScreen(ctx) {
    try {
      function yn(v) { return v ? 'yes' : 'no'; }

      try {
        var av = '';
        var cv = '';
        try { av = (window.Lampa && Lampa.Manifest && Lampa.Manifest.app_version) ? String(Lampa.Manifest.app_version) : ''; } catch (_) { av = ''; }
        try { cv = (window.Lampa && Lampa.Manifest && Lampa.Manifest.css_version) ? String(Lampa.Manifest.css_version) : ''; } catch (_) { cv = ''; }
        var ver = (av ? ('app ' + av) : '') + (cv ? (' | css ' + cv) : '');
        if (ver) {
          Lampa.SettingsApi.addParam({
            component: ctx.componentId,
            param: { name: 'bl_pi_status_lampa_ver', type: 'static', values: ver, default: ver },
            field: { name: 'Lampa version', description: ver }
          });
        }
      } catch (_) { }

      try {
        var ss = null;
        try { ss = (ctx && ctx.opts && typeof ctx.opts.statusStrings === 'function') ? (ctx.opts.statusStrings() || null) : null; } catch (_) { ss = null; }
        var raw = ss && ss.raw ? String(ss.raw) : '';
        var help = ss && ss.help ? String(ss.help) : '';
        var short = ss && ss.short ? String(ss.short) : '';
        var sline = short || raw || '';
        if (sline) {
          Lampa.SettingsApi.addParam({
            component: ctx.componentId,
            param: { name: 'bl_pi_status_autoplugin', type: 'static', values: sline, default: sline },
            field: { name: 'AutoPlugin', description: sline }
          });
        }
        if (help) {
          Lampa.SettingsApi.addParam({
            component: ctx.componentId,
            param: { name: 'bl_pi_status_help', type: 'static', values: help, default: help },
            field: { name: 'Help', description: help }
          });
        }
      } catch (_) { }

      try {
        var mode = 'silent';
        try { mode = (window.BL && BL.Log && typeof BL.Log.getMode === 'function') ? String(BL.Log.getMode() || 'silent') : 'silent'; } catch (_) { mode = 'silent'; }
        Lampa.SettingsApi.addParam({
          component: ctx.componentId,
          param: { name: 'bl_pi_status_log_mode', type: 'static', values: mode, default: mode },
          field: { name: 'Log mode', description: mode }
        });
      } catch (_) { }

      try {
        var uaId = '';
        var uaTitle = '';
        try { uaId = (window.BL && BL.UA && typeof BL.UA.getSelectedPresetId === 'function') ? String(BL.UA.getSelectedPresetId() || '') : ''; } catch (_) { uaId = ''; }
        try { uaTitle = (window.BL && BL.UA && BL.UA.effective && BL.UA.effective.title) ? String(BL.UA.effective.title || '') : ''; } catch (_) { uaTitle = ''; }
        var uaLine = (uaId ? uaId : 'unknown') + (uaTitle ? (' — ' + uaTitle) : '');
        Lampa.SettingsApi.addParam({
          component: ctx.componentId,
          param: { name: 'bl_pi_status_ua', type: 'static', values: uaLine, default: uaLine },
          field: { name: 'UA preset', description: uaLine }
        });
      } catch (_) { }

      try {
        var st = null;
        try { st = (window.BL && BL.PolicyNetwork && typeof BL.PolicyNetwork.getStatus === 'function') ? BL.PolicyNetwork.getStatus() : null; } catch (_) { st = null; }
        st = st || {};
        var m = st.interceptors || {};
        var sum = 'fetch=' + yn(!!m.fetch)
          + ' xhr=' + yn(!!m.xhr)
          + ' ws=' + yn(!!m.ws)
          + ' iframe=' + yn(!!m.iframe_src);
        Lampa.SettingsApi.addParam({
          component: ctx.componentId,
          param: { name: 'bl_pi_status_net', type: 'static', values: sum, default: sum },
          field: { name: 'Network', description: sum }
        });
      } catch (_) { }

      try {
        var conc = '';
        try { conc = String(sGet(k('fs_concurrency_v1'), '') || ''); } catch (_) { conc = ''; }
        if (!conc) conc = '(default)';
        Lampa.SettingsApi.addParam({
          component: ctx.componentId,
          param: { name: 'bl_pi_status_fs_conc', type: 'static', values: conc, default: conc },
          field: { name: 'FS concurrency', description: k('fs_concurrency_v1') + ' = ' + conc }
        });
      } catch (_) { }

      try {
        var effUa = '';
        try { effUa = String(navigator && navigator.userAgent ? navigator.userAgent : '') || ''; } catch (_) { effUa = ''; }
        effUa = shortStr(effUa, 180);
        Lampa.SettingsApi.addParam({
          component: ctx.componentId,
          param: { name: 'bl_pi_status_ua_eff', type: 'static', values: effUa, default: effUa },
          field: { name: 'UA effective', description: effUa }
        });
      } catch (_) { }
    } catch (_) { }
  }

		  function buildUiScreen(ctx) {
		    try {
		      P(ctx, {
		        id: 'blacklampa_ui_extended_interface_sizes',
		        type: 'toggle',
		        values: { 0: 'OFF', 1: 'ON' },
		        default: 1,
		        name: 'Расширенные размеры интерфейса',
		        desc: 'Добавляет xsmall/xxsmall (0.8/0.7) к настройке \"Размер интерфейса\".'
		      });

		      P(ctx, {
		        id: 'ext_filters',
		        type: 'toggle',
		        values: { 0: 'OFF', 1: 'ON' },
	        default: 0,
	        nameKey: 'ui.extfilters.title',
	        descKey: 'ui.extfilters.desc',
	        onChange: function () {
	          try {
	            if (window.BL && BL.ModuleExtFilters && BL.ModuleExtFilters.refresh) return BL.ModuleExtFilters.refresh();
	            if (window.BL && BL.ExtFilters && BL.ExtFilters.refresh) return BL.ExtFilters.refresh();
	          } catch (_) { }
	        }
	      });
	    } catch (_) { }
	  }

	  function buildLoggingScreen(ctx) {
	    try {
	      var mode = 'silent';
	      try { mode = (window.BL && BL.Log && BL.Log.getMode) ? String(BL.Log.getMode() || 'silent') : 'silent'; } catch (_) { mode = 'silent'; }
	      if (mode !== 'popup') mode = 'silent';

	      P(ctx, {
	        id: 'pi_logging_silent',
	        type: 'static',
	        name: (mode === 'silent' ? '✓ No popup (default)' : 'No popup (default)'),
	        desc: 'Popup не открывается автоматически. Логи всё равно пишутся в память.',
	        onEnter: function () {
	          try { if (window.BL && BL.Log && BL.Log.setMode) BL.Log.setMode('silent'); } catch (_) { }
	          ctx.refresh();
	        }
	      });

	      P(ctx, {
	        id: 'pi_logging_popup',
	        type: 'static',
	        name: (mode === 'popup' ? '✓ Auto popup' : 'Auto popup'),
	        desc: 'Разрешает авто-показ popup при логах/ошибках.',
	        onEnter: function () {
	          try { if (window.BL && BL.Log && BL.Log.setMode) BL.Log.setMode('popup'); } catch (_) { }
	          ctx.refresh();
	        }
	      });
	    } catch (_) { }
	  }

	  function buildJsqpScreen(ctx) {
	    try {
	      function p(opt) { P(ctx, opt); }
      var defMatch = '\\\\.js(\\\\?|$)';
      var defParams = 'origin,logged,reset';
      var resetMode = String(sGet(k('jsqp_reset_mode'), 'remove') || 'remove').toLowerCase();
      if (resetMode !== 'remove' && resetMode !== 'set' && resetMode !== 'random') resetMode = 'remove';

	      var info = 'Подмена/удаление GET параметров (origin/logged/reset) в запросах на *.js';
	      p({ id: 'jsqp_info', type: 'static', values: info, name: 'JS query params', desc: info });

	      p({ id: 'jsqp_enabled', type: 'toggle', values: { 0: 'OFF', 1: 'ON' }, default: 1, name: 'Enabled', desc: 'Включить переписывание URL для *.js.' });

	      p({ id: 'jsqp_force', type: 'toggle', values: { 0: 'OFF', 1: 'ON' }, default: 0, name: 'Force apply', desc: 'Переписывать даже если params отсутствуют в URL.' });

	      p({
	        id: 'jsqp_match',
	        type: 'input',
	        values: '',
	        default: defMatch,
	        placeholder: defMatch,
	        name: 'Match regex',
	        desc: 'RegExp (string) для матчинга URL.'
	      });

	      p({
	        id: 'jsqp_params',
	        type: 'input',
	        values: '',
	        default: defParams,
	        placeholder: defParams,
	        name: 'Params list (csv)',
	        desc: 'Список управляемых параметров (origin,logged,reset).'
	      });

	      p({
	        id: 'jsqp_origin_mode',
	        type: 'select',
	        values: { remove: 'remove', set: 'set', set_b64: 'set (base64)' },
	        default: 'remove',
	        name: 'Origin mode',
	        desc: 'remove => удалить | set => задать значение | set (base64) => btoa(utf8).'
	      });

	      p({
	        id: 'jsqp_origin_value',
	        type: 'input',
	        values: '',
	        default: '',
	        placeholder: 'example.com',
	        name: 'Origin value',
	        desc: 'Если origin_mode=set: ставим как есть (без base64).'
	      });

	      p({
	        id: 'jsqp_logged_mode',
	        type: 'select',
	        values: { remove: 'remove', set: 'set' },
	        default: 'remove',
	        name: 'Logged mode',
	        desc: 'remove => удалить | set => задать значение.'
	      });

	      p({
	        id: 'jsqp_logged_value',
	        type: 'input',
	        values: '',
	        default: 'false',
	        placeholder: 'false',
	        name: 'Logged value',
	        desc: 'Если logged_mode=set (строка, например 0/false).'
	      });

	      p({
	        id: 'jsqp_reset_mode',
	        type: 'select',
	        values: { remove: 'remove', set: 'set', random: 'random' },
	        default: 'remove',
	        name: 'Reset mode',
	        desc: 'remove => удалить | set => value | random => Math.random().'
	      });

	      if (resetMode !== 'random') {
	        p({
	          id: 'jsqp_reset_value',
	          type: 'input',
	          values: '',
	          default: '0',
	          placeholder: '0',
	          name: 'Reset value',
	          desc: 'Если reset_mode=set.'
	        });
	      }

	      var ex = '/x.js?logged=false&reset=0.123&origin=YmxhY2tsYW1wYS5naXRodWIuaW8%3D';
	      p({ id: 'jsqp_test_url', type: 'input', values: '', default: ex, placeholder: ex, name: 'Test URL', desc: 'URL для теста (опционально).' });

	      p({
	        id: 'jsqp_test',
	        type: 'button',
	        name: 'Test rewrite',
	        desc: 'Показывает результат BL.Net.rewriteJsQuery().',
	        onChange: function () {
	          try {
	            var sample = String(sGet(k('jsqp_test_url'), '') || '').trim();
	            if (!sample) sample = String(location.href || '');

	            var after = sample;
	            try {
	              if (window.BL && BL.Net && typeof BL.Net.rewriteJsQuery === 'function') after = BL.Net.rewriteJsQuery(sample);
	            } catch (_) { after = sample; }

	            if (String(after) === String(sample)) ctx.notify('[[BlackLampa]] JSQP: no change');
	            else ctx.notify('[[BlackLampa]] JSQP: ' + shortStr(after, 240));
	          } catch (_) { }
	        }
	      });

	      p({
	        id: 'jsqp_reset_defaults',
	        type: 'button',
	        name: 'Reset to defaults',
	        desc: 'Сбрасывает настройки JSQP.',
	        onChange: function () {
	          try {
	            sSet(k('jsqp_enabled'), '1');
	            sSet(k('jsqp_force'), '0');
	            sSet(k('jsqp_origin_mode'), 'remove');
	            sSet(k('jsqp_origin_value'), '');
	            sSet(k('jsqp_logged_mode'), 'remove');
	            sSet(k('jsqp_logged_value'), 'false');
	            sSet(k('jsqp_reset_mode'), 'remove');
	            sSet(k('jsqp_reset_value'), '0');
	            sSet(k('jsqp_match'), defMatch);
	            sSet(k('jsqp_params'), defParams);
	          } catch (_) { }
	          ctx.notify('[[BlackLampa]] JSQP: defaults restored');
	        }
	      });
	    } catch (_) { }
	  }

	  function buildUaPresetsScreen(ctx) {
	    try {
      var uaApi = null;
      try { uaApi = (window.BL && BL.UA) ? BL.UA : null; } catch (_) { uaApi = null; }
      try { if (uaApi && uaApi.ensureOriginalStored) uaApi.ensureOriginalStored(); } catch (_) { }

      var selectedId = '';
      try { if (uaApi && typeof uaApi.getSelectedPresetId === 'function') selectedId = String(uaApi.getSelectedPresetId() || ''); } catch (_) { selectedId = ''; }
      if (!selectedId) { try { selectedId = String(sGet(k('ua_preset_id_v1'), '') || ''); } catch (_) { selectedId = ''; } }

      var presets = [];
      try { if (uaApi && typeof uaApi.getPresets === 'function') presets = uaApi.getPresets() || []; } catch (_) { presets = []; }
      if (!Array.isArray(presets)) presets = [];

	      for (var i = 0; i < presets.length; i++) {
	        (function (p) {
	          try {
	            if (!p || !p.id) return;
	            var id = String(p.id || '');
	            var title = String(p.title || id);
	            var desc = String(p.desc || '');
	            var ua = String(p.ua || '');
	            var isSel = (id === selectedId);

            var d = desc || '';
            if (ua) d = d ? (d + '\n' + shortStr(ua, 120)) : shortStr(ua, 120);
            if (!d) d = ' ';

		            P(ctx, {
		              id: 'pi_ua_preset_' + id,
		              type: 'static',
		              name: (isSel ? '✓ ' : '') + title,
	              desc: d,
	              onEnter: function () {
	                try {
	                  if (uaApi && typeof uaApi.setSelectedPresetId === 'function') uaApi.setSelectedPresetId(id);
	                  else sSet(k('ua_preset_id_v1'), id);
	                } catch (_) { }

	                try { if (uaApi && typeof uaApi.apply === 'function') uaApi.apply(); } catch (_) { }
	                ctx.notify('[[BlackLampa]] UA preset: ' + title);
	                ctx.refresh();
	              }
	            });
	          } catch (_) { }
	        })(presets[i]);
	      }

	      if (String(selectedId || '') === 'custom') {
	        var curCustom = '';
	        try { if (uaApi && typeof uaApi.getCustomUa === 'function') curCustom = String(uaApi.getCustomUa() || ''); } catch (_) { curCustom = ''; }

		        P(ctx, {
		          id: 'ua_custom_v1',
		          type: 'input',
	          values: '',
	          default: curCustom,
	          placeholder: 'Mozilla/5.0 ...',
	          name: 'Custom UA',
	          desc: 'Используется только когда выбран preset=Custom.',
	          onChange: function (v) {
	            try {
	              v = String(v || '').trim();
	              if (uaApi && typeof uaApi.setCustomUa === 'function') uaApi.setCustomUa(v);
	              else sSet(k('ua_custom_v1'), v);

	              try { if (uaApi && typeof uaApi.apply === 'function') uaApi.apply(); } catch (_) { }
	              ctx.notify('[[BlackLampa]] UA: custom applied');
	            } catch (_) { }
	          }
	        });
	      }
	    } catch (_) { }
	  }

	  function buildUaEffectiveScreen(ctx) {
	    try {
	      var uaApi = null;
	      try { uaApi = (window.BL && BL.UA) ? BL.UA : null; } catch (_) { uaApi = null; }

      var original = '';
      try { if (uaApi && typeof uaApi.getOriginalUa === 'function') original = String(uaApi.getOriginalUa() || ''); } catch (_) { original = ''; }
      if (!original) {
        try { original = String(sGet(k('ua_original_v1'), '') || ''); } catch (_) { original = ''; }
      }

      var selectedId = '';
      var selectedTitle = '';
      try { if (uaApi && typeof uaApi.getSelectedPresetId === 'function') selectedId = String(uaApi.getSelectedPresetId() || ''); } catch (_) { selectedId = ''; }
      try { if (uaApi && uaApi.effective && uaApi.effective.title) selectedTitle = String(uaApi.effective.title || ''); } catch (_) { selectedTitle = ''; }

      var effUa = '';
      try { effUa = String(navigator && navigator.userAgent ? navigator.userAgent : '') || ''; } catch (_) { effUa = ''; }

      try { if (uaApi && typeof uaApi.ensureHeaderSupport === 'function') uaApi.ensureHeaderSupport(); } catch (_) { }
      var hdrFlag = '';
      try { hdrFlag = String(sGet(k('ua_header_override_supported_v1'), '') || ''); } catch (_) { hdrFlag = ''; }
      var hdrLine = (hdrFlag === '0') ? 'UA header override: unsupported' : 'UA header override: supported';

	      P(ctx, { id: 'ua_eff_orig', type: 'static', values: original, name: 'Original UA (stored)', desc: original });

	      try {
	        var selLine = (selectedId ? selectedId : 'unknown') + (selectedTitle ? (' — ' + selectedTitle) : '');
		        P(ctx, { id: 'ua_eff_sel', type: 'static', values: selLine, name: 'Selected preset', desc: selLine });
	      } catch (_) { }

	      P(ctx, { id: 'ua_eff_now', type: 'static', values: effUa, name: 'Effective navigator.userAgent', desc: effUa });

	      P(ctx, { id: 'ua_eff_hdr', type: 'static', values: hdrLine, name: 'UA header override', desc: hdrLine });

	      var note = 'Some channels cannot override UA headers in browser environment.';
	      P(ctx, { id: 'ua_eff_note', type: 'static', values: note, name: 'Note', desc: note });
	    } catch (_) { }
	  }

  function buildBackupScreen(ctx) {
    try {
      if (!window.BL || !BL.Backup) {
        var na = 'BL.Backup missing (bl.backup.js not loaded).';
        Lampa.SettingsApi.addParam({
          component: ctx.componentId,
          param: { name: 'bl_backup_na', type: 'static', values: na, default: na },
          field: { name: 'Backup / Transfer', description: na }
        });
        return;
      }

      var BP = String(pref() || 'blacklampa_');
      var CFG_KEY = k('backup_cfg_v1');

      function normPrefixes(arr) {
        var out = [];
        try {
          if (!Array.isArray(arr)) arr = [];
          for (var i = 0; i < arr.length; i++) {
            var p = String(arr[i] || '').trim();
            if (p) out.push(p);
          }
        } catch (_) { }
        try { for (var j = 0; j < out.length; j++) if (out[j] === 'bl_') out[j] = BP; } catch (_) { }
        if (!out.length) out = [BP];
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
        try { for (var j = 0; j < out.length; j++) if (out[j] === 'bl_') out[j] = BP; } catch (_) { }
        if (!out.length) out = [BP];
        return out;
      }

      function loadCfgSafe() {
        var def = { prefixes: [BP], provider: 'paste_rs', keyHint: '', unsafe_store_key: 0 };
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
        var provider = String(sGet(k('backup_provider_v1'), currentCfg.provider) || currentCfg.provider);
        var keyHint = String(sGet(k('backup_key_hint_v1'), currentCfg.keyHint) || '');
        var unsafe = String(sGet(k('backup_unsafe_store_key_v1'), currentCfg.unsafe_store_key ? '1' : '0') || '0');
        var prefixesStr = String(sGet(k('backup_prefixes_v1'), (currentCfg.prefixes || [BP]).join(',')) || '');
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

      try {
        var st = 'history: ' + String(hist.length) + ' | prefixes: ' + String((cfg.prefixes || [BP]).join(','));
        Lampa.SettingsApi.addParam({
          component: ctx.componentId,
          param: { name: 'bl_backup_status', type: 'static', values: st, default: st },
          field: { name: 'Backup / Transfer', description: 'Экспорт/импорт настроек BlackLampa (localStorage) + шифрование + history.' }
        });
      } catch (_) { }

      try {
        Lampa.SettingsApi.addParam({
          component: ctx.componentId,
          param: { name: k('backup_key_input_v1'), type: 'input', values: '', default: '', placeholder: 'Enter key / PIN' },
          field: { name: 'Encryption key', description: 'Используется для AES-GCM. Не хранится в history по умолчанию.' }
        });
      } catch (_) { }

      try {
        Lampa.SettingsApi.addParam({
          component: ctx.componentId,
          param: { name: k('backup_key_hint_v1'), type: 'input', values: '', default: String(cfg.keyHint || ''), placeholder: 'home-tv / phone / test' },
          field: { name: 'Key label / hint', description: '' },
          onChange: function () { cfg = syncCfgFromUi(cfg); }
        });
      } catch (_) { }

      try {
        Lampa.SettingsApi.addParam({
          component: ctx.componentId,
          param: { name: k('backup_prefixes_v1'), type: 'input', values: '', default: String((cfg.prefixes || [BP]).join(',')), placeholder: BP },
          field: { name: 'Prefixes', description: 'Какие ключи localStorage экспортировать (prefix list, через ,).' },
          onChange: function () { cfg = syncCfgFromUi(cfg); }
        });
      } catch (_) { }

      try {
        Lampa.SettingsApi.addParam({
          component: ctx.componentId,
          param: { name: k('backup_provider_v1'), type: 'select', values: { paste_rs: 'paste.rs', dpaste_org: 'dpaste.org' }, default: String(cfg.provider || 'paste_rs') },
          field: { name: 'Provider', description: '' },
          onChange: function () { cfg = syncCfgFromUi(cfg); }
        });
      } catch (_) { }

      try {
        Lampa.SettingsApi.addParam({
          component: ctx.componentId,
          param: { name: k('backup_unsafe_store_key_v1'), type: 'select', values: { 0: 'OFF (safe)', 1: 'ON (unsafe)' }, default: (cfg.unsafe_store_key ? 1 : 0) },
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

      try {
        Lampa.SettingsApi.addParam({
          component: ctx.componentId,
          param: { name: 'bl_backup_export_btn', type: 'button' },
          field: { name: 'Export', description: 'Шифрует конфиг и загружает в выбранный provider. Запись добавляется в history.' },
          onChange: function () {
            var pass = String(sGet(k('backup_key_input_v1'), '') || '').trim();
            if (!pass) {
              ctx.notify('[[BlackLampa]] Set encryption key');
              return;
            }
            ctx.runAsync('Exporting...', function () {
              cfg = syncCfgFromUi(cfg);

              var cfgObj = null;
              try { cfgObj = BL.Backup.collectConfig(); } catch (_) { cfgObj = { meta: {}, data: {} }; }

              var provider = String(cfg.provider || 'paste_rs');
              var hint = String(cfg.keyHint || '');
              var unsafeFlag = !!cfg.unsafe_store_key;

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
                      if (unsafeFlag) item.unsafeKey = pass;
                      if (BL.Backup.history && BL.Backup.history.add) BL.Backup.history.add(item);
                    } catch (_) { }
                    ctx.notify('[[BlackLampa]] Exported: ' + shortId(storedId));
                  });
                });
              }).catch(function (e) {
                if (e && e.code === 'CORS') ctx.notify('[[BlackLampa]] Provider blocked by CORS on this device');
                else ctx.notify('[[BlackLampa]] Export failed: ' + String((e && e.message) ? e.message : e));
                throw e;
              });
            });
          }
        });
      } catch (_) { }

      try {
        Lampa.SettingsApi.addParam({
          component: ctx.componentId,
          param: { name: k('backup_import_mode_v1'), type: 'select', values: { merge: 'Merge (default)', replace: 'Replace' }, default: 'merge' },
          field: { name: 'Import mode', description: 'Merge — обновляет/добавляет ключи. Replace — очищает BL-prefix ключи и импортирует.' }
        });
      } catch (_) { }

      function doImport(provider, idOrUrl, pass, mode) {
        provider = String(provider || '');
        idOrUrl = String(idOrUrl || '').trim();
        pass = String(pass || '').trim();
        mode = (mode === 'replace') ? 'replace' : 'merge';

        if (!idOrUrl) {
          ctx.notify('[[BlackLampa]] Set paste id/url');
          return Promise.reject(new Error('no id'));
        }
        if (!pass) {
          ctx.notify('[[BlackLampa]] Set encryption key');
          return Promise.reject(new Error('no key'));
        }

        return BL.Backup.download(provider, idOrUrl).then(function (payloadStr) {
          return BL.Backup.decrypt(payloadStr, pass);
        }).then(function (cfgObj) {
          BL.Backup.applyConfig(cfgObj, mode);
          ctx.notify('[[BlackLampa]] Imported, reloading…');
          setTimeout(function () { try { location.reload(); } catch (_) { } }, 0);
        }).catch(function (e) {
          if (e && e.code === 'CORS') ctx.notify('[[BlackLampa]] Provider blocked by CORS on this device');
          else ctx.notify('[[BlackLampa]] Import failed: ' + String((e && e.message) ? e.message : e));
          throw e;
        });
      }

      try {
        var max = 15;
        if (!hist.length) {
          Lampa.SettingsApi.addParam({
            component: ctx.componentId,
            param: { name: 'bl_backup_hist_empty', type: 'static', default: true },
            field: { name: 'No exports yet', description: '' }
          });
        } else {
          for (var hi = 0; hi < hist.length && hi < max; hi++) {
            (function (it, idx) {
              var label = fmtTs(it.ts) + ' | ' + String(it.provider || '') + ' | ' + shortId(it.id) + (it.keyHint ? (' | ' + String(it.keyHint || '')) : '');
              Lampa.SettingsApi.addParam({
                component: ctx.componentId,
                param: { name: 'bl_backup_hist_' + String(idx) + '_' + String(it.ts || idx), type: 'static', default: true },
                field: { name: label, description: 'OK — import (uses key input; unsafeKey if saved).' },
                onRender: function (item) {
                  try {
                    if (!item || !item.on) return;
                    item.on('hover:enter', function () {
                      var mode = String(sGet(k('backup_import_mode_v1'), 'merge') || 'merge');
                      var pass = String(sGet(k('backup_key_input_v1'), '') || '').trim();
                      if (!pass && it.unsafeKey) pass = String(it.unsafeKey || '').trim();
                      ctx.runAsync('Importing...', function () { return doImport(String(it.provider || cfg.provider || 'paste_rs'), String(it.id || ''), pass, mode); });
                    });
                  } catch (_) { }
                }
              });
            })(hist[hi] || {}, hi);
          }
        }
      } catch (_) { }

      try {
        Lampa.SettingsApi.addParam({
          component: ctx.componentId,
          param: { name: k('backup_import_id_v1'), type: 'input', values: '', default: '', placeholder: 'id-or-url' },
          field: { name: 'Import: paste id/url', description: '' }
        });
      } catch (_) { }

      try {
        Lampa.SettingsApi.addParam({
          component: ctx.componentId,
          param: { name: 'bl_backup_import_btn', type: 'button' },
          field: { name: 'Import', description: 'Скачивает → расшифровывает → применяет → reload.' },
          onChange: function () {
            var provider = String(sGet(k('backup_provider_v1'), cfg.provider || 'paste_rs') || cfg.provider || 'paste_rs');
            var id = String(sGet(k('backup_import_id_v1'), '') || '').trim();
            var pass = String(sGet(k('backup_key_input_v1'), '') || '').trim();
            var mode = String(sGet(k('backup_import_mode_v1'), 'merge') || 'merge');

            if (!id) {
              ctx.notify('[[BlackLampa]] Set paste id/url');
              return;
            }
            if (!pass) {
              ctx.notify('[[BlackLampa]] Set encryption key');
              return;
            }

            ctx.runAsync('Importing...', function () { return doImport(provider, id, pass, mode); });
          }
        });
      } catch (_) { }

      try {
        Lampa.SettingsApi.addParam({
          component: ctx.componentId,
          param: { name: 'bl_backup_history_clear_btn', type: 'button' },
          field: { name: 'Clear history', description: 'Удаляет только history экспортов. Настройки BlackLampa не трогает.' },
          onChange: function () {
            try { if (BL.Backup.history && BL.Backup.history.clear) BL.Backup.history.clear(); } catch (_) { }
            ctx.notify('[[BlackLampa]] History cleared');
            ctx.refresh();
          }
        });
      } catch (_) { }
    } catch (_) { }
  }

})();
