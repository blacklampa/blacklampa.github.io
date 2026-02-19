(function () {
  'use strict';

  var BL = window.BL = window.BL || {};
  BL.PlayerEngine = BL.PlayerEngine || {};

  var API = BL.PlayerEngine;
  if (API.__blPlayerEngineLoadedV1) return;
  API.__blPlayerEngineLoadedV1 = true;

  var LS_PREFIX = 'blacklampa_';
  try { if (BL.Keys && BL.Keys.prefix) LS_PREFIX = String(BL.Keys.prefix || 'blacklampa_'); } catch (_) { }

  var KEY_ENGINE = LS_PREFIX + 'player_engine_v1';
  var KEY_OVERLAY_ENABLED = LS_PREFIX + 'player_overlay_enabled';
  var KEY_OVERLAY_MODE = LS_PREFIX + 'player_overlay_mode';
  var KEY_PG_ENABLED = LS_PREFIX + 'player_guard_enabled';

  function sGet(k, fallback) {
    var v = null;
    try { if (window.Lampa && Lampa.Storage && Lampa.Storage.get) v = Lampa.Storage.get(String(k)); } catch (_) { v = null; }
    if (v === undefined || v === null || v === '') {
      try { if (window.localStorage) v = localStorage.getItem(String(k)); } catch (_) { v = null; }
    }
    return (v === undefined || v === null || v === '') ? fallback : v;
  }

  function sSet(k, v) {
    try { if (window.Lampa && Lampa.Storage && Lampa.Storage.set) Lampa.Storage.set(String(k), String(v)); } catch (_) { }
    try { if (window.localStorage) localStorage.setItem(String(k), String(v)); } catch (_) { }
  }

  function parseBool(v, def) {
    if (v === undefined || v === null || v === '') return !!def;
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return isFinite(v) && v !== 0;
    try { v = String(v).trim(); } catch (_) { return !!def; }
    if (v === '') return !!def;
    return !/^(0|false|off|no)$/i.test(v);
  }

  function normalizeEngine(v) {
    try { v = String(v || '').toLowerCase().trim(); } catch (_) { v = ''; }
    if (v === 'off' || v === 'legacy' || v === 'overlay' || v === 'delta' || v === 'auto') return v;
    if (v === 'deltaguard' || v === 'delta_guard') return 'delta';
    return 'auto';
  }

  function autoResolveEngine() {
    var overlayEnabled = parseBool(sGet(KEY_OVERLAY_ENABLED, '0'), false);
    var overlayMode = String(sGet(KEY_OVERLAY_MODE, 'legacy') || 'legacy').toLowerCase();
    if (overlayEnabled && (overlayMode === 'delta' || overlayMode === 'deltaguard' || overlayMode === 'delta_guard')) return 'delta';
    if (overlayEnabled) return 'overlay';
    if (parseBool(sGet(KEY_PG_ENABLED, '0'), false)) return 'legacy';
    return 'off';
  }

  function log(msg, extra) {
    try {
      if (window.BL && BL.Log && BL.Log.showInfo) return BL.Log.showInfo('PlayerEngine', String(msg || ''), String(extra || ''));
    } catch (_) { }
    try { if (window.console && console.info) console.info('[BlackLampa][PlayerEngine] ' + String(msg || ''), extra || ''); } catch (_) { }
  }

  API.key = KEY_ENGINE;
  API.values = ['off', 'legacy', 'overlay', 'delta', 'auto'];

  API.getRaw = function () {
    return normalizeEngine(sGet(KEY_ENGINE, 'auto'));
  };

  API.get = function () {
    var raw = API.getRaw();
    if (raw === 'auto') return autoResolveEngine();
    return raw;
  };

  API.set = function (v) {
    var next = normalizeEngine(v);
    sSet(KEY_ENGINE, next);
    var resolved = API.get();
    log('engine switched; requires playback restart', 'raw=' + next + ' resolved=' + resolved);
    return resolved;
  };
})();
