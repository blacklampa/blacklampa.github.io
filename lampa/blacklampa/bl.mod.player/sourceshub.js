(function () {
  'use strict';

  var BL = window.BL = window.BL || {};
  var MP = BL.ModPlayer = BL.ModPlayer || {};
  if (MP.SourcesHub && MP.SourcesHub.__loaded) return;

  var API = MP.SourcesHub = MP.SourcesHub || {};
  API.__loaded = true;

  var LS = {
    autoLoadDonors: 'blmod.autoload_donors',
    preferredSource: 'blmod.preferred_source',
    sourcePriority: 'blmod.source_priority'
  };

  var DONORS = [
    { id: 'modsxfull', title: 'modsxfull.js', path: '/lampa/scripts/modsxfull.js' },
    { id: 'online_mod', title: 'online_mod.js', path: '/lampa/scripts/online_mod.js' },
    { id: 'online', title: 'online.js', path: '/lampa/scripts/online.js' },
    { id: 'onlines', title: 'onlines.js', path: '/lampa/scripts/onlines.js' },
    { id: 'free_onl', title: 'free_onl.js', path: '/lampa/scripts/free_onl.js' },
    { id: 'fx', title: 'fx.js', path: '/lampa/scripts/fx.js' },
    { id: 'play', title: 'play.js', path: '/lampa/scripts/play.js' }
  ];

  var RUNTIME = {
    donorLoadPromise: null,
    donorPromises: {},
    donorState: {},
    staticSourceCache: {},
    lastSnapshot: null,
    lastDiag: null
  };

  function str(v) {
    return v === undefined || v === null ? '' : String(v);
  }

  function isObj(v) {
    return !!v && typeof v === 'object';
  }

  function nowMs() {
    return Date.now();
  }

  function clone(x) {
    try { return JSON.parse(JSON.stringify(x)); } catch (_) { return x && typeof x === 'object' ? Object.assign({}, x) : x; }
  }

  function toInt(v, d) {
    var n = parseInt(v, 10);
    return isFinite(n) ? n : d;
  }

  function toBool(v, def) {
    if (v === undefined || v === null || v === '') return !!def;
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return isFinite(v) && v !== 0;
    var s = str(v).trim().toLowerCase();
    if (!s) return !!def;
    return !(s === '0' || s === 'false' || s === 'off' || s === 'no');
  }

  function sGet(key, fallback) {
    var v = null;
    try { if (window.Lampa && Lampa.Storage && Lampa.Storage.get) v = Lampa.Storage.get(String(key)); } catch (_) { v = null; }
    if (v === undefined || v === null) {
      try { if (window.localStorage) v = localStorage.getItem(String(key)); } catch (_) { v = null; }
    }
    return (v === undefined || v === null) ? fallback : v;
  }

  function sSet(key, value) {
    try {
      if (window.Lampa && Lampa.Storage && Lampa.Storage.set) {
        Lampa.Storage.set(String(key), value);
      }
    } catch (_) { }
    try {
      if (window.localStorage) {
        if (typeof value === 'object') localStorage.setItem(String(key), JSON.stringify(value));
        else localStorage.setItem(String(key), String(value));
      }
    } catch (_) { }
  }

  function hashSig(input) {
    var s = str(input);
    var h = 2166136261;
    var i;
    for (i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
    }
    return ('00000000' + (h >>> 0).toString(16)).slice(-8);
  }

  function donorEnabledKey(id) {
    return 'blmod.donor_enabled.' + str(id || '');
  }

  function sourceEnabledKey(id) {
    return 'blmod.source_enabled.' + hashSig(str(id || ''));
  }

  function readPriority() {
    var raw = str(sGet(LS.sourcePriority, '') || '');
    if (!raw) return [];
    return raw.split(',').map(function (s) { return str(s).trim(); }).filter(Boolean);
  }

  function writePriority(list) {
    var out = Array.isArray(list) ? list.map(function (x) { return str(x).trim(); }).filter(Boolean) : [];
    sSet(LS.sourcePriority, out.join(','));
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

  function hasDelegateComponents() {
    try {
      var get = (window.Lampa && Lampa.Component && typeof Lampa.Component.get === 'function') ? Lampa.Component.get : null;
      if (!get) return false;
      return !!(get('modss_online') || get('online_mod') || get('smotrolet') || get('lampacskaz') || get('iptvskaz') || get('lampac'));
    } catch (_) {
      return false;
    }
  }

  function donorById(id) {
    var i;
    for (i = 0; i < DONORS.length; i++) if (DONORS[i].id === id) return DONORS[i];
    return null;
  }

  function donorState(id) {
    id = str(id || '');
    if (!id) return { id: '', loaded: false, loading: false, err: '', attempts: 0, ts: 0 };
    if (!RUNTIME.donorState[id]) RUNTIME.donorState[id] = { id: id, loaded: false, loading: false, err: '', attempts: 0, ts: 0 };
    return RUNTIME.donorState[id];
  }

  function hasScriptTag(path) {
    path = str(path || '');
    if (!path) return false;
    try {
      var tags = document.querySelectorAll('script[src]');
      var i;
      var full = path;
      var short = path.split('/').pop();
      for (i = 0; i < tags.length; i++) {
        var src = str(tags[i].getAttribute('src') || tags[i].src || '');
        if (!src) continue;
        if (src.indexOf(full) >= 0 || (short && src.indexOf(short) >= 0)) return true;
      }
    } catch (_) { }
    return false;
  }

  function loadDonorScript(def, timeoutMs) {
    def = def || {};
    var id = str(def.id || '');
    var path = str(def.path || '');
    if (!id || !path) return Promise.resolve({ id: id, path: path, status: 'invalid' });

    var st = donorState(id);
    timeoutMs = toInt(timeoutMs, 12000);
    st.loading = false;
    st.attempts += 1;
    st.ts = nowMs();
    st.loaded = hasScriptTag(path);
    st.err = '';
    log('INF', 'donor_load_skipped', { donor: id, path: path, timeout: timeoutMs, loaded: st.loaded ? 1 : 0 });
    return Promise.resolve({ id: id, path: path, status: st.loaded ? 'already_loaded' : 'skipped', err: '' });
  }

  function parseSourceIdsFromText(text) {
    text = str(text || '');
    if (!text) return [];
    var found = {};
    var out = [];

    function add(id) {
      id = str(id || '').trim();
      if (!id) return;
      if (id.length > 80) return;
      if (/[^a-z0-9._\-\/]/i.test(id)) return;
      if (found[id]) return;
      found[id] = 1;
      out.push(id);
    }

    var m;
    var reApi = /Lampa\.Api\.sources\s*\[\s*['"]([^'"]+)['"]\s*\]/ig;
    while ((m = reApi.exec(text))) add(m[1]);

    var reSrc = /sources\s*\[\s*['"]([^'"]+)['"]\s*\]/ig;
    while ((m = reSrc.exec(text))) add(m[1]);

    var reAll = /all_sources\s*=\s*\[([\s\S]*?)\]/ig;
    while ((m = reAll.exec(text))) {
      var body = str(m[1] || '');
      var q;
      var qre = /['"]([a-z0-9._\-\/]{2,80})['"]/ig;
      while ((q = qre.exec(body))) add(q[1]);
    }

    return out;
  }

  function fetchDonorStatic(def) {
    def = def || {};
    var id = str(def.id || '');
    var path = str(def.path || '');
    if (!id || !path) return Promise.resolve([]);
    if (RUNTIME.staticSourceCache[id]) return Promise.resolve(RUNTIME.staticSourceCache[id].slice());

    return new Promise(function (resolve) {
      if (typeof fetch !== 'function') return resolve([]);
      fetch(path, { cache: 'no-store' }).then(function (r) {
        if (!r || !r.ok) return '';
        return r.text();
      }).then(function (text) {
        var ids = parseSourceIdsFromText(text);
        RUNTIME.staticSourceCache[id] = ids.slice();
        resolve(ids.slice());
      })['catch'](function () {
        resolve([]);
      });
    });
  }

  function donorEnabled(id) {
    return toBool(sGet(donorEnabledKey(id), '1'), true);
  }

  function sourceEnabled(id) {
    return toBool(sGet(sourceEnabledKey(id), '1'), true);
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

  function collectStaticSources() {
    var enabled = DONORS.filter(function (d) { return donorEnabled(d.id); });
    if (!enabled.length) return Promise.resolve([]);
    var p = enabled.map(function (d) { return fetchDonorStatic(d).then(function (ids) { return { donor: d, ids: ids || [] }; }); });
    return Promise.all(p).then(function (rows) {
      var out = [];
      rows.forEach(function (row) {
        (row.ids || []).forEach(function (id) {
          if (String(id).toLowerCase() === 'tmdb') return;
          out.push({
            id: id,
            key: id,
            title: id,
            kind: 'delegate',
            origin: 'static:' + str(row.donor && row.donor.id || ''),
            source: null,
            delegateOnly: true
          });
        });
      });
      return out;
    });
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
        source: s,
        delegateOnly: false
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

  function sortByPriority(items) {
    var preferred = str(sGet(LS.preferredSource, '') || '');
    var priority = readPriority();
    var rank = {};
    priority.forEach(function (id, i) { if (!rank[id]) rank[id] = i + 1; });
    items.sort(function (a, b) {
      var ai = str(a && (a.id || a.key) || '');
      var bi = str(b && (b.id || b.key) || '');
      if (preferred) {
        if (ai === preferred && bi !== preferred) return -1;
        if (bi === preferred && ai !== preferred) return 1;
      }
      var ar = rank[ai] || 9999;
      var br = rank[bi] || 9999;
      if (ar !== br) return ar - br;
      return str(a && a.title || ai).localeCompare(str(b && b.title || bi), 'ru');
    });
    return items;
  }

  function snapshotFromParts(apiPack, legacy, statics) {
    var all = [];
    var delegate = hasDelegateComponents();
    (apiPack && apiPack.playable || []).forEach(function (s) { all.push(clone(s)); });
    (legacy || []).forEach(function (s) { all.push(clone(s)); });
    (statics || []).forEach(function (s) {
      var row = clone(s);
      row.playable = !!delegate;
      row.delegateOnly = true;
      all.push(row);
    });

    all = uniqueById(all);
    all.forEach(function (s) {
      var id = str(s.id || s.key || '');
      s.enabled = sourceEnabled(id);
      if (s.playable !== true) s.playable = !s.delegateOnly;
      if (s.delegateOnly) s.playable = !!delegate;
    });
    sortByPriority(all);

    var enabledAll = all.filter(function (s) { return !!s.enabled; });
    var enabledPlayable = enabledAll.filter(function (s) { return !!s.playable; });

    var snap = {
      ts: nowMs(),
      donorAutoLoad: API.getAutoLoadDonors(),
      delegateCapable: delegate,
      counts: {
        apiKeys: toInt(apiPack && apiPack.allKeys && apiPack.allKeys.length, 0),
        apiPlayable: toInt(apiPack && apiPack.playable && apiPack.playable.length, 0),
        apiExcluded: toInt(apiPack && apiPack.excluded && apiPack.excluded.length, 0),
        legacy: toInt(legacy && legacy.length, 0),
        static: toInt(statics && statics.length, 0),
        all: all.length,
        enabled: enabledAll.length,
        enabledPlayable: enabledPlayable.length
      },
      apiKeys: (apiPack && apiPack.allKeys || []).slice(0, 200),
      apiExcluded: (apiPack && apiPack.excluded || []).slice(0, 200),
      all: all,
      enabledPlayable: enabledPlayable
    };

    RUNTIME.lastSnapshot = snap;
    return snap;
  }

  API.getDonors = function () {
    return DONORS.map(function (d) {
      var st = donorState(d.id);
      return {
        id: d.id,
        title: d.title,
        path: d.path,
        enabled: donorEnabled(d.id),
        loaded: !!st.loaded,
        loading: !!st.loading,
        err: str(st.err || ''),
        attempts: toInt(st.attempts, 0),
        ts: toInt(st.ts, 0)
      };
    });
  };

  API.setDonorEnabled = function (id, enabled) {
    sSet(donorEnabledKey(id), enabled ? '1' : '0');
    return true;
  };

  API.donorStorageKey = function (id) {
    return donorEnabledKey(id);
  };

  API.setSourceEnabled = function (id, enabled) {
    sSet(sourceEnabledKey(id), enabled ? '1' : '0');
    return true;
  };

  API.sourceStorageKey = function (id) {
    return sourceEnabledKey(id);
  };

  API.isSourceEnabled = function (id) {
    return sourceEnabled(id);
  };

  API.getPreferredSource = function () {
    return str(sGet(LS.preferredSource, '') || '');
  };

  API.setPreferredSource = function (id) {
    sSet(LS.preferredSource, str(id || ''));
    return true;
  };

  API.getAutoLoadDonors = function () {
    return toBool(sGet(LS.autoLoadDonors, '0'), false);
  };

  API.setAutoLoadDonors = function (enabled) {
    sSet(LS.autoLoadDonors, enabled ? '1' : '0');
    return true;
  };

  API.getPriority = function () {
    return readPriority();
  };

  API.setPriority = function (list) {
    writePriority(list);
    return true;
  };

  API.bumpSourcePriority = function (id) {
    id = str(id || '');
    if (!id) return false;
    var p = readPriority().filter(function (x) { return x !== id; });
    p.unshift(id);
    writePriority(p);
    return true;
  };

  API.ensureDonorsLoaded = function (opts) {
    opts = opts || {};
    var force = !!opts.force;
    if (!force && RUNTIME.donorLoadPromise) return RUNTIME.donorLoadPromise;

    var list = DONORS.filter(function (d) { return donorEnabled(d.id); });
    if (!list.length) {
      RUNTIME.donorLoadPromise = Promise.resolve({ ts: nowMs(), requested: 0, loaded: 0, failed: 0, rows: [] });
      return RUNTIME.donorLoadPromise;
    }

    var chain = Promise.resolve([]);
    list.forEach(function (d) {
      chain = chain.then(function (rows) {
        return loadDonorScript(d, toInt(opts.timeoutMs, 12000)).then(function (res) {
          rows.push(res);
          return rows;
        });
      });
    });

    RUNTIME.donorLoadPromise = chain.then(function (rows) {
      var loaded = rows.filter(function (r) { return r.status === 'loaded' || r.status === 'already_loaded'; }).length;
      var failed = rows.length - loaded;
      var summary = { ts: nowMs(), requested: rows.length, loaded: loaded, failed: failed, rows: rows };
      log('INF', 'donors_load_done', { requested: summary.requested, loaded: loaded, failed: failed });
      return summary;
    })['catch'](function (e) {
      log('WRN', 'donors_load_error', { err: str(e && e.message || e) });
      return { ts: nowMs(), requested: list.length, loaded: 0, failed: list.length, rows: [] };
    }).then(function (summary) {
      RUNTIME.donorLoadPromise = null;
      return summary;
    });

    return RUNTIME.donorLoadPromise;
  };

  API.refresh = function (ctx, opts) {
    return API.collect(ctx, opts || {});
  };

  API.collect = function (ctx, opts) {
    opts = opts || {};
    var forceDonorLoad = !!opts.forceDonorLoad;
    var autoLoad = (opts.autoLoad !== undefined) ? !!opts.autoLoad : API.getAutoLoadDonors();
    var ensure = (autoLoad || forceDonorLoad) ? API.ensureDonorsLoaded({ force: forceDonorLoad }) : Promise.resolve(null);

    return ensure.then(function () {
      var apiPack = collectApiSources();
      var wantLegacy = (opts.includeLegacy !== false);
      var wantStatic = (opts.includeStatic !== false);
      var pLegacy = Promise.resolve([]);
      var pStatic = Promise.resolve([]);

      if (wantLegacy && !apiPack.playable.length && MP.SourceKit && typeof MP.SourceKit.listSources === 'function') {
        pLegacy = MP.SourceKit.listSources(ctx).then(function (legacy) {
          var list = mapLegacySources(legacy);
          log('WRN', 'sourceshub_fallback_legacy', { count: list.length });
          return list;
        })['catch'](function () { return []; });
      }

      if (wantStatic && !apiPack.playable.length) pStatic = collectStaticSources();

      return Promise.all([pLegacy, pStatic]).then(function (rows) {
        var legacy = rows[0] || [];
        var statics = rows[1] || [];
        return snapshotFromParts(apiPack, legacy, statics);
      });
    });
  };

  API.hasLampaSources = function () {
    var x = collectApiSources();
    return !!(x.playable && x.playable.length);
  };

  API.isPlayableSource = isPlayableSource;

  API.pickDefault = function (list) {
    var preferred = API.getPreferredSource();
    if (!preferred) {
      try { preferred = str(Lampa.Storage.field('source') || ''); } catch (_) { }
    }
    if (!preferred) try { preferred = str(Lampa.Storage.get('source', '') || ''); } catch (_) { }
    if (!preferred) try { preferred = str(Lampa.Storage.get('online_balanser', '') || ''); } catch (_) { }
    if (!preferred) try { preferred = str(Lampa.Storage.get('online_mod_balanser', '') || ''); } catch (_) { }

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
    return API.collect(ctx, {}).then(function (snap) {
      var out = snap && snap.enabledPlayable ? snap.enabledPlayable.slice() : [];
      log('INF', 'sourceshub_list', {
        all: toInt(snap && snap.counts && snap.counts.all, 0),
        enabled: toInt(snap && snap.counts && snap.counts.enabled, 0),
        playable: out.length
      });
      return out;
    });
  };

  API.resolveForMovie = function (ctx, opts) {
    return API.collect(ctx, opts || {}).then(function (snap) {
      var list = snap && snap.enabledPlayable ? snap.enabledPlayable.slice() : [];
      if (!list.length) return { ok: false, reason: 'sources_empty', sources: [], snapshot: snap, diag: API.diag(ctx) };
      return { ok: true, reason: '', sources: list, snapshot: snap, diag: API.diag(ctx) };
    });
  };

  API.lastSnapshot = function () {
    return RUNTIME.lastSnapshot ? clone(RUNTIME.lastSnapshot) : null;
  };

  API.dump = function () {
    var snap = API.lastSnapshot() || {};
    return {
      ts: nowMs(),
      autoLoadDonors: API.getAutoLoadDonors(),
      preferredSource: API.getPreferredSource(),
      priority: API.getPriority(),
      donors: API.getDonors(),
      snapshot: snap
    };
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

    var out = {
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
      scripts: scriptDiag,
      donors: API.getDonors(),
      autoLoadDonors: API.getAutoLoadDonors(),
      preferredSource: API.getPreferredSource(),
      priority: API.getPriority(),
      snapshot: API.lastSnapshot()
    };
    RUNTIME.lastDiag = out;
    return out;
  };

  API.diagnose = function (ctx, opts) {
    opts = opts || {};
    var force = !!opts.force;
    return API.collect(ctx, { forceDonorLoad: force, includeLegacy: true, includeStatic: true }).then(function () {
      return API.diag(ctx);
    });
  };
})();
