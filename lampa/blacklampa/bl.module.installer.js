(function () {
  'use strict';

  var BL = window.BL = window.BL || {};
  BL.ModuleInstaller = BL.ModuleInstaller || {};

  var API = BL.ModuleInstaller;
  if (API.__blModuleInstallerLoaded) return;
  API.__blModuleInstallerLoaded = true;

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

  function getInstalledStateSafe(ctx, urlAbs) {
    try {
      if (ctx && ctx.opts && typeof ctx.opts.getInstalledState === 'function') return ctx.opts.getInstalledState(String(urlAbs || '')) || { installed: false, status: null };
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

  function statusText(st) {
    try {
      if (!st || !st.installed) return 'not installed';
      if (st.status === 0) return 'installed (disabled)';
      return 'installed (active)';
    } catch (_) { return 'unknown'; }
  }

  API.defaultFocusPluginDetail = function (ctx, payload) {
    try {
      payload = payload || {};
      var meta = payload && payload.meta ? payload.meta : null;
      var urlAbs = meta && meta.urlAbs ? String(meta.urlAbs) : String(payload && payload.urlAbs ? payload.urlAbs : '');
      var st = urlAbs ? getInstalledStateSafe(ctx, urlAbs) : { installed: false, status: null };
      return st.installed ? 4 : 2;
    } catch (_) { }
    return 0;
  };

  API.buildPluginsMenuScreen = function (ctx) {
    try {
      Lampa.SettingsApi.addParam({
        component: ctx.componentId,
        param: { name: 'bl_pi_plugins_managed', type: 'static', default: true },
        field: { name: 'Managed', description: 'Плагины из bl.autoplugin.json → plugins[].' },
        onRender: function (item) {
          try { if (item && item.on) item.on('hover:enter', function () { ctx.push('managed', null, 0, 0); }); } catch (_) { }
        }
      });

      Lampa.SettingsApi.addParam({
        component: ctx.componentId,
        param: { name: 'bl_pi_plugins_extras', type: 'static', default: true },
        field: { name: 'Extras', description: 'Дополнительные плагины из bl.autoplugin.json → disabled[].' },
        onRender: function (item) {
          try { if (item && item.on) item.on('hover:enter', function () { ctx.push('extras', null, 0, 1); }); } catch (_) { }
        }
      });
    } catch (_) { }
  };

  API.buildManagedScreen = function (ctx) {
    var list = [];
    try { list = (ctx && ctx.opts && typeof ctx.opts.getManagedPlugins === 'function') ? (ctx.opts.getManagedPlugins() || []) : []; } catch (_) { list = []; }
    if (!Array.isArray(list)) list = [];

    var idx = 0;
    for (var i = 0; i < list.length; i++) {
      (function (raw, rowIndex) {
        var meta = managedMeta(raw);
        if (!meta) return;

        Lampa.SettingsApi.addParam({
          component: ctx.componentId,
          param: { name: 'bl_pi_managed_' + String(meta.hash), type: 'static', default: true },
          field: { name: meta.title, description: meta.desc },
          onRender: function (item) {
            try {
              if (item && item.on) {
                item.on('hover:enter', function () {
                  ctx.push('plugin_detail', { kind: 'managed', meta: meta }, null, rowIndex);
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

              var st = getInstalledStateSafe(ctx, meta.urlAbs);
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
        component: ctx.componentId,
        param: { name: 'bl_pi_managed_remove_all', type: 'button' },
        field: { name: 'Remove all managed', description: 'Удаляет плагины из plugins[] (disabled[] не трогает).' },
        onChange: function () {
          ctx.runOnce('Remove all managed', 'Удалить все managed плагины?\n\ndisabled[] не трогается.\n\nАвтоперезагрузка отключена. При необходимости перезапустите приложение вручную.', function () {
            if (ctx && ctx.opts && typeof ctx.opts.removeManagedPluginsOnly === 'function') return ctx.opts.removeManagedPluginsOnly();
          });
        }
      });
    } catch (_) { }
  };

  API.buildExtrasScreen = function (ctx) {
    var disabled = [];
    try { disabled = (ctx && ctx.opts && typeof ctx.opts.getExtrasPlugins === 'function') ? (ctx.opts.getExtrasPlugins() || []) : []; } catch (_) { disabled = []; }
    if (!Array.isArray(disabled)) disabled = [];

    if (!disabled.length) {
      var none = 'Нет дополнительных плагинов.';
      try {
        Lampa.SettingsApi.addParam({
          component: ctx.componentId,
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
          component: ctx.componentId,
          param: { name: 'bl_pi_extras_' + String(meta.hash), type: 'static', default: true },
          field: { name: meta.title, description: meta.desc },
          onRender: function (item) {
            try {
              if (item && item.on) {
                item.on('hover:enter', function () {
                  ctx.push('plugin_detail', { kind: 'extras', meta: meta }, null, rowIndex);
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

              var st = getInstalledStateSafe(ctx, meta.urlAbs);
              var $st = ensureStatusDot(item);
              setStatusDotPlugin($st, st);
            } catch (_) { }
          }
        });
      })(disabled[i], idx);
      idx++;
    }
  };

  API.buildPluginDetailScreen = function (ctx) {
    var payload = (ctx && ctx.payload) ? ctx.payload : {};
    payload = payload || {};
    var meta = payload.meta || null;
    if (!meta) meta = {};
    var urlAbs = String(meta.urlAbs || payload.urlAbs || '');
    if (!urlAbs) {
      var bad = 'Плагин не найден.';
      try {
        Lampa.SettingsApi.addParam({
          component: ctx.componentId,
          param: { name: 'bl_pi_detail_bad', type: 'static', values: bad, default: bad },
          field: { name: 'Plugin', description: bad }
        });
      } catch (_) { }
      return;
    }

    var st = getInstalledStateSafe(ctx, urlAbs);

    // Info
    try {
      var info = '';
      try { info = String(meta.desc || ''); } catch (_) { info = ''; }
      if (info) info = info + '\n';
      info = info + String(urlAbs);

      Lampa.SettingsApi.addParam({
        component: ctx.componentId,
        param: { name: 'bl_pi_detail_info', type: 'static', values: info, default: info },
        field: { name: String(meta.title || guessName(urlAbs)), description: info }
      });
    } catch (_) { }

    // Status
    try {
      var sline = statusText(st);
      Lampa.SettingsApi.addParam({
        component: ctx.componentId,
        param: { name: 'bl_pi_detail_status', type: 'static', values: sline, default: sline },
        field: { name: 'Status', description: sline }
      });
    } catch (_) { }

    // Install
    if (!st.installed) {
      try {
        Lampa.SettingsApi.addParam({
          component: ctx.componentId,
          param: { name: 'bl_pi_detail_install', type: 'button' },
          field: { name: 'Install', description: 'Добавляет плагин в расширения Lampa.' },
          onChange: function () {
            var focus = ctx.getFocusIndex();
            ctx.runOnce('Install: ' + String(meta.title || ''), 'Установить плагин?\n\n' + String(meta.title || '') + '\n' + String(urlAbs), function () {
              ctx.storeLastIndex('plugin_detail', focus);
              if (ctx && ctx.opts && typeof ctx.opts.installOne === 'function') {
                return ctx.opts.installOne(urlAbs, { inject: true }).then(function (r) {
                  try {
                    if (r && r.ok) ctx.notify('[[BlackLampa]] Установлено: ' + String(meta.title || guessName(urlAbs)));
                    else ctx.notify('[[BlackLampa]] Ошибка установки: ' + String(meta.title || guessName(urlAbs)));
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
          component: ctx.componentId,
          param: { name: 'bl_pi_detail_install_disabled', type: 'static', values: note1, default: note1 },
          field: { name: 'Install', description: note1 }
        });
      } catch (_) { }
    }

    // Remove
    if (st.installed) {
      try {
        Lampa.SettingsApi.addParam({
          component: ctx.componentId,
          param: { name: 'bl_pi_detail_remove', type: 'button' },
          field: { name: 'Remove', description: 'Удаляет плагин из расширений Lampa.' },
          onChange: function () {
            var focus2 = ctx.getFocusIndex();
            ctx.runOnce('Remove: ' + String(meta.title || ''), 'Удалить плагин?\n\n' + String(meta.title || '') + '\n' + String(urlAbs) + '\n\nАвтоперезагрузка отключена. При необходимости перезапустите приложение вручную.', function () {
              ctx.storeLastIndex('plugin_detail', focus2);
              if (ctx && ctx.opts && typeof ctx.opts.removeOne === 'function') return ctx.opts.removeOne(urlAbs);
            });
          }
        });
      } catch (_) { }
    } else {
      try {
        var none = 'Плагин не установлен.';
        Lampa.SettingsApi.addParam({
          component: ctx.componentId,
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
          component: ctx.componentId,
          param: { name: 'bl_pi_detail_toggle', type: 'button' },
          field: { name: toggle.name, description: 'Включает/выключает плагин.' },
          onChange: function () {
            var focus3 = ctx.getFocusIndex();
            ctx.runOnce(toggle.name + ': ' + String(meta.title || ''), toggle.name + ' plugin?\n\n' + String(meta.title || '') + '\n' + String(urlAbs), function () {
              ctx.storeLastIndex('plugin_detail', focus3);
              if (ctx && ctx.opts && typeof ctx.opts[toggle.fn] === 'function') return ctx.opts[toggle.fn](urlAbs);
            });
          }
        });
      } catch (_) { }
    } else {
      try {
        var na = 'Доступно только для установленного плагина.';
        Lampa.SettingsApi.addParam({
          component: ctx.componentId,
          param: { name: 'bl_pi_detail_toggle_disabled', type: 'static', values: na, default: na },
          field: { name: 'Enable/Disable', description: na }
        });
      } catch (_) { }
    }

    // Optional: Inject now
    if (ctx && ctx.opts && typeof ctx.opts.injectNow === 'function') {
      try {
        Lampa.SettingsApi.addParam({
          component: ctx.componentId,
          param: { name: 'bl_pi_detail_inject', type: 'button' },
          field: { name: 'Inject now', description: 'Подгружает скрипт плагина в текущую сессию.' },
          onChange: function () {
            var focus4 = ctx.getFocusIndex();
            ctx.runOnce('Inject: ' + String(meta.title || ''), 'Inject now?\n\n' + String(meta.title || '') + '\n' + String(urlAbs), function () {
              ctx.storeLastIndex('plugin_detail', focus4);
              return ctx.opts.injectNow(urlAbs).then(function (r) {
                try {
                  if (r && r.ok) ctx.notify('[[BlackLampa]] Inject: OK');
                  else ctx.notify('[[BlackLampa]] Inject: FAIL');
                } catch (_) { }
                return r;
              });
            });
          }
        });
      } catch (_) { }
    }
  };

  API.buildDangerScreen = function (ctx) {
    // Factory reset
    try {
      Lampa.SettingsApi.addParam({
        component: ctx.componentId,
        param: { name: 'bl_pi_danger_factory_reset', type: 'button' },
        field: { name: 'Factory reset', description: 'Полный сброс доменных данных + повторная блокировка авторизации. Выполняет перезагрузку.' },
        onChange: function () {
          ctx.runOnce('Factory reset', 'Сбросить Lampa до заводских?\n\nЭто удалит доменные данные и выполнит перезагрузку.\n\nВНИМАНИЕ: действие необратимо.', function () {
            if (ctx && ctx.opts && typeof ctx.opts.factoryReset === 'function') return ctx.opts.factoryReset();
          });
        }
      });
    } catch (_) { }

    // Remove all plugins
    try {
      Lampa.SettingsApi.addParam({
        component: ctx.componentId,
        param: { name: 'bl_pi_danger_remove_all', type: 'button' },
        field: { name: 'Remove all Lampa plugins', description: 'Удаляет ВСЕ установленные плагины. Автоперезагрузка отключена.' },
        onChange: function () {
          ctx.runOnce('Remove all plugins', 'Удалить ВСЕ плагины Lampa?\n\nАвтоперезагрузка отключена. При необходимости перезапустите приложение вручную.', function () {
            if (ctx && ctx.opts && typeof ctx.opts.removeAllLampaPlugins === 'function') return ctx.opts.removeAllLampaPlugins();
          });
        }
      });
    } catch (_) { }

    // Reset first-install flags
    try {
      Lampa.SettingsApi.addParam({
        component: ctx.componentId,
        param: { name: 'bl_pi_danger_reset_flags', type: 'button' },
        field: { name: 'Reset first-install flags', description: 'Сбрасывает флаги первой автоустановки AutoPlugin.' },
        onChange: function () {
          ctx.runOnce('Reset first-install flags', 'Сбросить флаги первой установки AutoPlugin?\n\nЭто НЕ удаляет плагины.', function () {
            try { if (ctx && ctx.opts && typeof ctx.opts.resetFirstInstallFlags === 'function') ctx.opts.resetFirstInstallFlags(); } catch (_) { }
            ctx.notify('[[BlackLampa]] AutoPlugin: флаг сброшен');
          });
        }
      });
    } catch (_) { }
  };
})();

