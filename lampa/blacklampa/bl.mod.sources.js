(function () {
  'use strict';

  var BL = window.BL = window.BL || {};
  if (BL.ModSources && BL.ModSources.__loaded) return;

  var API = BL.ModSources = BL.ModSources || {};
  API.__loaded = true;

  function hub() {
    try { return BL.ModPlayer && BL.ModPlayer.SourcesHub ? BL.ModPlayer.SourcesHub : null; } catch (_) { return null; }
  }

  function call(name, args, fallback) {
    var h = hub();
    if (!h || typeof h[name] !== 'function') return fallback;
    try { return h[name].apply(h, args || []); } catch (_) { return fallback; }
  }

  API.init = function () {
    return call('collect', [null, {}], Promise.resolve(null));
  };

  API.collect = function (ctx, opts) {
    return call('collect', [ctx || null, opts || {}], Promise.resolve(null));
  };

  API.list = function (ctx) {
    return call('list', [ctx || null], Promise.resolve([]));
  };

  API.resolveForMovie = function (ctx, opts) {
    return call('resolveForMovie', [ctx || null, opts || {}], Promise.resolve({ ok: false, reason: 'hub_missing', sources: [] }));
  };

  API.diagnose = function (ctx, opts) {
    return call('diagnose', [ctx || null, opts || {}], Promise.resolve({ hasLampa: !!window.Lampa, hubMissing: true }));
  };

  API.ensureDonorsLoaded = function (opts) {
    return call('ensureDonorsLoaded', [opts || {}], Promise.resolve({ requested: 0, loaded: 0, failed: 0 }));
  };
})();
