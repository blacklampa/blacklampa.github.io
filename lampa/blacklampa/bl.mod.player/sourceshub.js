(function () {
  'use strict';

  var BL = window.BL = window.BL || {};
  var MP = BL.ModPlayer = BL.ModPlayer || {};
  if (MP.SourcesHub && MP.SourcesHub.__loaded) return;

  var API = MP.SourcesHub = MP.SourcesHub || {};
  API.__loaded = true;

  function str(v) {
    return v === undefined || v === null ? '' : String(v);
  }

  function isObj(v) {
    return !!v && typeof v === 'object';
  }

  function nowMs() {
    return Date.now();
  }

  function log(level, msg, meta) {
    try {
      if (MP && typeof MP.log === 'function') MP.log(level, msg, meta || null);
    } catch (_) { }
  }

  function hasAnyMethod(obj, names) {
    if (!isObj(obj)) return false;
    var i;
    for (i = 0; i < names.length; i++) {
      if (typeof obj[names[i]] === 'function') return true;
    }
    return false;
  }

  function isPlayableSource(source, key) {
    var id = str(key || '').toLowerCase();
    if (!isObj(source)) return false;
    if (!id) return false;
    if (id === 'tmdb') return false;

    var hasTitle = !!str(source.title || source.name || key);
    var hasApi = hasAnyMethod(source, ['search', 'main', 'list', 'get', 'discovery', 'person']);

    return hasTitle && hasApi;
  }

  function inferKind(source) {
    if (!isObj(source)) return 'unknown';
    if (typeof source.seasons === 'function' || typeof source.episodes === 'function') return 'tv';
    if (typeof source.search === 'function' || typeof source.discovery === 'function') return 'mixed';
    if (typeof source.main === 'function' || typeof source.list === 'function' || typeof source.get === 'function') return 'mixed';
    return 'unknown';
  }

  function collectApiSources() {
    var raw = null;
    try {
      if (window.Lampa && Lampa.Api && Lampa.Api.sources) raw = Lampa.Api.sources;
    } catch (_) { }

    if (!raw || typeof raw !== 'object') {
      return {
        allKeys: [],
        playable: [],
        excluded: []
      };
    }

    var keys = Object.keys(raw);
    var playable = [];
    var excluded = [];

    keys.forEach(function (k) {
      var s = raw[k];
      if (!isPlayableSource(s, k)) {
        excluded.push(k);
        return;
      }

      playable.push({
        id: k,
        key: k,
        title: str(s.title || s.name || k),
        kind: inferKind(s),
        origin: 'Lampa.Api.sources',
        source: s
      });
    });

    playable.sort(function (a, b) {
      return str(a.title).localeCompare(str(b.title), 'ru');
    });

    return {
      allKeys: keys,
      playable: playable,
      excluded: excluded
    };
  }

  function mapLegacySources(list) {
    var out = [];
    (list || []).forEach(function (s) {
      if (!s) return;
      var id = str(s.id || s.key || '');
      if (!id) return;

      out.push({
        id: id,
        key: id,
        title: str(s.title || id),
        kind: str(s.kind || 'online'),
        origin: 'legacy_sourcekit',
        source: s
      });
    });

    return out;
  }

  function uniqueById(items) {
    var map = {};
    var out = [];

    (items || []).forEach(function (it) {
      var id = str(it && it.id || '');
      if (!id) return;
      if (map[id]) return;
      map[id] = 1;
      out.push(it);
    });

    return out;
  }

  API.hasLampaSources = function () {
    var x = collectApiSources();
    return !!(x.playable && x.playable.length);
  };

  API.isPlayableSource = isPlayableSource;

  API.pickDefault = function (list) {
    var preferred = '';

    try { preferred = str(Lampa.Storage.field('source') || ''); } catch (_) { }
    if (!preferred) {
      try { preferred = str(Lampa.Storage.get('source', '') || ''); } catch (_) { }
    }
    if (!preferred) {
      try { preferred = str(Lampa.Storage.get('online_balanser', '') || ''); } catch (_) { }
    }
    if (!preferred) {
      try { preferred = str(Lampa.Storage.get('online_mod_balanser', '') || ''); } catch (_) { }
    }

    if (preferred && list && list.length) {
      var found = null;
      list.some(function (s) {
        if (str(s.id) === preferred || str(s.key) === preferred) {
          found = s;
          return true;
        }
        return false;
      });
      if (found) return found;
    }

    return list && list.length ? list[0] : null;
  };

  API.list = function (ctx) {
    var fromApi = collectApiSources();

    if (fromApi.playable.length) {
      log('INF', 'sourceshub_api_sources', {
        count: fromApi.playable.length,
        keys: fromApi.playable.map(function (s) { return s.id; }).slice(0, 50)
      });
      return Promise.resolve(fromApi.playable.slice());
    }

    if (MP.SourceKit && typeof MP.SourceKit.listSources === 'function') {
      return MP.SourceKit.listSources(ctx).then(function (legacy) {
        var list = mapLegacySources(legacy);
        list = uniqueById(list);
        log('WRN', 'sourceshub_fallback_legacy', { count: list.length });
        return list;
      })['catch'](function () {
        return [];
      });
    }

    return Promise.resolve([]);
  };

  API.diag = function (ctx) {
    var fromApi = collectApiSources();

    var scriptDiag = {};
    try {
      if (MP.ScriptsRegistry && typeof MP.ScriptsRegistry.inspect === 'function') scriptDiag = MP.ScriptsRegistry.inspect();
    } catch (_) { }

    var lampa = !!window.Lampa;
    var hasApi = false;
    var hasApiSources = false;

    try {
      hasApi = !!(Lampa && Lampa.Api);
      hasApiSources = !!(Lampa && Lampa.Api && Lampa.Api.sources);
    } catch (_) { }

    return {
      ts: nowMs(),
      hasLampa: lampa,
      hasApi: hasApi,
      hasApiSources: hasApiSources,
      apiKeysCount: fromApi.allKeys.length,
      apiPlayableCount: fromApi.playable.length,
      apiExcludedCount: fromApi.excluded.length,
      apiKeys: fromApi.allKeys.slice(0, 100),
      apiExcluded: fromApi.excluded.slice(0, 100),
      ctxSig: str(ctx && ctx.ctxSig || ''),
      scripts: scriptDiag
    };
  };
})();
