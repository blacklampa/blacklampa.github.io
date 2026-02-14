(function () {
  'use strict';

  var BL = window.BL = window.BL || {};
  var MP = BL.ModPlayer = BL.ModPlayer || {};
  if (MP.ScriptsRegistry && MP.ScriptsRegistry.__loaded) return;

  var API = MP.ScriptsRegistry = MP.ScriptsRegistry || {};
  API.__loaded = true;

  function str(v) {
    return v === undefined || v === null ? '' : String(v);
  }

  function hasScriptTagContains(part) {
    var p = str(part || '').toLowerCase();
    if (!p) return false;
    try {
      var list = document.querySelectorAll('script[src]');
      var i;
      for (i = 0; i < list.length; i++) {
        var s = str(list[i].getAttribute('src') || '').toLowerCase();
        if (s.indexOf(p) >= 0) return true;
      }
    } catch (_) { }
    return false;
  }

  function hasComponent(name) {
    try {
      return !!(window.Lampa && Lampa.Component && typeof Lampa.Component.get === 'function' && Lampa.Component.get(name));
    } catch (_) {
      return false;
    }
  }

  API.inspect = function () {
    var flags = {
      loaded_modss: !!window.loaded_modss,
      smotrolet_plugin: !!window.smotrolet_plugin,
      onlyskaz_plugin: !!window.onlyskaz_plugin
    };

    var scripts = {
      modss_js: hasScriptTagContains('/scripts/modss.js') || hasScriptTagContains('modss.js'),
      modsxfull_js: hasScriptTagContains('/scripts/modsxfull.js') || hasScriptTagContains('modsxfull.js'),
      online_js: hasScriptTagContains('/scripts/online.js') || hasScriptTagContains('online.js'),
      onlines_js: hasScriptTagContains('/scripts/onlines.js') || hasScriptTagContains('onlines.js'),
      online_mod_js: hasScriptTagContains('/scripts/online_mod.js') || hasScriptTagContains('online_mod.js'),
      free_onl_js: hasScriptTagContains('/scripts/free_onl.js') || hasScriptTagContains('free_onl.js'),
      fx_js: hasScriptTagContains('/scripts/fx.js') || hasScriptTagContains('fx.js'),
      play_js: hasScriptTagContains('/scripts/play.js') || hasScriptTagContains('play.js')
    };

    var components = {
      modss_online: hasComponent('modss_online'),
      online_mod: hasComponent('online_mod'),
      smotrolet: hasComponent('smotrolet'),
      lampacskaz: hasComponent('lampacskaz'),
      iptvskaz: hasComponent('iptvskaz'),
      lampac: hasComponent('lampac')
    };

    return {
      flags: flags,
      scripts: scripts,
      components: components
    };
  };
})();
