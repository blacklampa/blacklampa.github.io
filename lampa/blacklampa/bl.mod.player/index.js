(function () {
  'use strict';

  var BL = window.BL = window.BL || {};
  var MP = BL.ModPlayer = BL.ModPlayer || {};
  if (MP.__loaded) return;
  MP.__loaded = true;

  var VERSION = '2.2.0';
  var LOG_CAP = 120;

  var LS = {
    enabled: 'blmod.enabled',
    debug: 'blmod.debug',
    logLevel: 'blmod.log_level',
    preferredBalancer: 'blmod.preferred_balanser',
    lastOpen: 'blmod.last_open'
  };

  var BUILTIN_BALANCERS = [
    { id: 'vibix', title: 'Vibix', stable: true },
    { id: 'kodik', title: 'Kodik', stable: true },
    { id: 'cdnvideohub', title: 'CDNVideoHub', stable: true },
    { id: 'collaps', title: 'Collaps', stable: true },
    { id: 'rezka2', title: 'HDrezka', stable: true },
    { id: 'filmix', title: 'Filmix', stable: false },
    { id: 'lumex', title: 'Lumex', stable: false },
    { id: 'fancdn2', title: 'FanCDN (ID)', stable: false },
    { id: 'anilibria2', title: 'AniLibria.top', stable: false },
    { id: 'kinopub', title: 'KinoPub', stable: false }
  ];

  var LOG = {
    rows: [],
    cap: LOG_CAP
  };

  var STATE = {
    installed: false,
    busy: false,
    lastOpen: null
  };

  function nowMs() {
    return Date.now();
  }

  function str(v) {
    return v === undefined || v === null ? '' : String(v);
  }

  function toBool(v, d) {
    if (v === undefined || v === null || v === '') return !!d;
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return isFinite(v) && v !== 0;
    var s = str(v).toLowerCase().trim();
    if (!s) return !!d;
    return !(s === '0' || s === 'false' || s === 'off' || s === 'no');
  }

  function sGet(k, fallback) {
    var v = null;
    try { if (window.Lampa && Lampa.Storage && Lampa.Storage.get) v = Lampa.Storage.get(String(k)); } catch (_) { v = null; }
    if (v === undefined || v === null) {
      try { if (window.localStorage) v = localStorage.getItem(String(k)); } catch (_) { v = null; }
    }
    return (v === undefined || v === null) ? fallback : v;
  }

  function sSet(k, v) {
    try { if (window.Lampa && Lampa.Storage && Lampa.Storage.set) Lampa.Storage.set(String(k), v); } catch (_) { }
    try {
      if (window.localStorage) {
        localStorage.setItem(String(k), (typeof v === 'object') ? JSON.stringify(v) : String(v));
      }
    } catch (_) { }
  }

  function sDel(k) {
    try { if (window.Lampa && Lampa.Storage && Lampa.Storage.set) Lampa.Storage.set(String(k), null); } catch (_) { }
    try { if (window.localStorage) localStorage.removeItem(String(k)); } catch (_) { }
  }

  function normalizeLogLevel(v) {
    var s = str(v || 'normal').toLowerCase();
    if (s !== 'silent' && s !== 'trace') s = 'normal';
    return s;
  }

  function currentLogLevel() {
    return normalizeLogLevel(sGet(LS.logLevel, 'normal'));
  }

  function pushLogRow(level, msg, meta) {
    var t = nowMs();
    var m = str(msg || '');
    var payload = '';
    try { payload = JSON.stringify(meta || null); } catch (_) { payload = ''; }
    var key = str(level || 'INF') + '|' + m + '|' + payload;

    var rows = LOG.rows;
    var last = rows.length ? rows[rows.length - 1] : null;
    if (last && last.key === key) {
      last.n += 1;
      last.ts = t;
      return;
    }

    rows.push({
      ts: t,
      level: str(level || 'INF'),
      msg: m,
      meta: meta || null,
      n: 1,
      key: key
    });

    if (rows.length > LOG.cap) rows.splice(0, rows.length - LOG.cap);
  }

  function log(level, msg, meta) {
    var lvl = str(level || 'INF').toUpperCase();
    pushLogRow(lvl, msg, meta || null);

    if (currentLogLevel() === 'silent') return;
    if (currentLogLevel() !== 'trace' && lvl === 'DBG') return;

    try {
      var line = '[BL-Mod] ' + lvl + ' ' + str(msg || '');
      if (meta && typeof meta === 'object') line += ' | ' + JSON.stringify(meta);
      if (lvl === 'ERR' && console.error) console.error(line);
      else if (lvl === 'WRN' && console.warn) console.warn(line);
      else if (console.log) console.log(line);
    } catch (_) { }
  }

  function showNoty(text) {
    try {
      if (window.Lampa && Lampa.Noty && typeof Lampa.Noty.show === 'function') {
        Lampa.Noty.show(str(text || 'BL-Mod error'));
      }
    } catch (_) { }
  }

  function isEnabled() {
    var raw = sGet(LS.enabled, 'true');
    return raw === true || raw === 1 || raw === '1' || raw === 'true';
  }

  function sourceKey(id) {
    return 'blmod.source.enabled.' + str(id || '');
  }

  function findBalancer(id) {
    var sid = str(id || '').toLowerCase();
    var i;
    for (i = 0; i < BUILTIN_BALANCERS.length; i++) {
      if (str(BUILTIN_BALANCERS[i].id).toLowerCase() === sid) return BUILTIN_BALANCERS[i];
    }
    return null;
  }

  function sourceEnabled(id, defEnabled) {
    var raw = sGet(sourceKey(id), null);
    if (raw === null || raw === undefined || raw === '') return !!defEnabled;
    return toBool(raw, !!defEnabled);
  }

  function balancersState() {
    return BUILTIN_BALANCERS.map(function (row) {
      return {
        id: row.id,
        title: row.title,
        stable: !!row.stable,
        enabled: sourceEnabled(row.id, !!row.stable)
      };
    });
  }

  function enabledBalancers() {
    return balancersState().filter(function (row) { return !!row.enabled; });
  }

  function preferredBalancerRaw() {
    return str(sGet(LS.preferredBalancer, BUILTIN_BALANCERS[0] && BUILTIN_BALANCERS[0].id || ''));
  }

  function preferredBalancer() {
    var preferred = preferredBalancerRaw();
    var rows = enabledBalancers();
    if (!rows.length) return '';
    if (findBalancer(preferred) && sourceEnabled(preferred, !!findBalancer(preferred).stable)) return preferred;
    return str(rows[0].id || '');
  }

  function syncOnlineModSettings() {
    var preferred = preferredBalancer();
    if (!preferred) return false;
    try {
      if (window.Lampa && Lampa.Storage && typeof Lampa.Storage.set === 'function') {
        Lampa.Storage.set('online_mod_balanser', preferred);
      }
    } catch (_) { }
    return true;
  }

  function onlineModTitle() {
    try {
      if (window.Lampa && Lampa.Lang && typeof Lampa.Lang.translate === 'function') {
        return str(Lampa.Lang.translate('online_mod_title_full') || 'Онлайн Мод');
      }
    } catch (_) { }
    return 'Онлайн Мод';
  }

  function cloneMovie(movie) {
    try { return window.$ && $.extend ? $.extend(true, {}, movie || {}) : (movie || {}); } catch (_) { return movie || {}; }
  }

  function currentMovie(movieArg) {
    if (movieArg && typeof movieArg === 'object') return cloneMovie(movieArg);

    try {
      if (window.Lampa && Lampa.Activity && typeof Lampa.Activity.active === 'function') {
        var act = Lampa.Activity.active();
        var movie = (act && (act.card || (act.activity && act.activity.card) || (act.activity && act.activity.movie))) || null;
        if (movie) return cloneMovie(movie);
      }
    } catch (_) { }

    return null;
  }

  function hasOnlineModComponent() {
    try {
      return !!(window.Lampa && Lampa.Component && typeof Lampa.Component.get === 'function' && Lampa.Component.get('online_mod'));
    } catch (_) {
      return false;
    }
  }

  function buildOpenMarker(movie, reason) {
    movie = movie || {};
    var enabled = enabledBalancers();
    var preferred = preferredBalancer();
    return {
      ts: nowMs(),
      from: 'blmod',
      reason: str(reason || 'button'),
      component: 'online_mod',
      preferred_balanser: preferred,
      enabled_count: enabled.length,
      cardId: str(movie.id || movie.tmdb_id || movie.imdb_id || movie.kinopoisk_id || ''),
      title: str(movie.title || movie.name || ''),
      original_title: str(movie.original_title || movie.original_name || ''),
      imdb_id: str(movie.imdb_id || ''),
      kinopoisk_id: str(movie.kinopoisk_id || ''),
      tmdb_id: str(movie.tmdb_id || '')
    };
  }

  function setLastOpen(marker) {
    STATE.lastOpen = marker || null;
    sSet(LS.lastOpen, marker || {});
  }

  function openOnlineMod(movieArg, reason) {
    if (!isEnabled()) {
      showNoty('BL-Mod отключен (blmod.enabled=false)');
      return Promise.resolve(false);
    }

    if (STATE.busy) {
      showNoty('BL-Mod: дождитесь завершения текущей операции');
      return Promise.resolve(false);
    }

    var movie = currentMovie(movieArg);
    if (!movie) {
      showNoty('BL-Mod: открой карточку фильма/сериала');
      return Promise.resolve(false);
    }

    if (!hasOnlineModComponent()) {
      showNoty('BL-Mod: online_mod not loaded');
      log('WRN', 'online_mod_missing', { cardId: str(movie.id || movie.tmdb_id || '') });
      return Promise.resolve(false);
    }

    var enabled = enabledBalancers();
    if (!enabled.length) {
      showNoty('BL-Mod: нет включённых балансеров (BL -> BL-Mod)');
      log('WRN', 'no_enabled_balancers', null);
      return Promise.resolve(false);
    }

    var payload = {
      url: '',
      title: onlineModTitle(),
      component: 'online_mod',
      search: str(movie.title || movie.name || ''),
      search_one: str(movie.title || movie.name || ''),
      search_two: str(movie.original_title || movie.original_name || ''),
      movie: movie,
      page: 1
    };

    STATE.busy = true;

    try {
      syncOnlineModSettings();
      var marker = buildOpenMarker(movie, reason || 'button');
      setLastOpen(marker);
      Lampa.Activity.push(payload);
      log('OK', 'open_online_mod', { cardId: marker.cardId, title: marker.title });
      STATE.busy = false;
      return Promise.resolve(true);
    } catch (e) {
      STATE.busy = false;
      log('ERR', 'open_online_mod_fail', { err: str(e && e.message || e) });
      showNoty('BL-Mod: не удалось открыть online_mod');
      return Promise.resolve(false);
    }
  }

  function ensureDeps() {
    return !!(MP.UI && MP.UI.Button && typeof MP.UI.Button.install === 'function');
  }

  MP.version = VERSION;
  MP.log = log;
  MP.logTail = function () { return LOG.rows.slice(); };

  MP.state = function () {
    return {
      version: VERSION,
      installed: STATE.installed,
      busy: STATE.busy,
      enabled: isEnabled(),
      debug: toBool(sGet(LS.debug, '0'), false),
      logLevel: currentLogLevel(),
      hasOnlineMod: hasOnlineModComponent(),
      preferredBalancer: preferredBalancer(),
      balancers: balancersState(),
      lastOpen: STATE.lastOpen || sGet(LS.lastOpen, null)
    };
  };

  MP.diagnose = function () {
    var movie = currentMovie(null);
    return Promise.resolve({
      ts: nowMs(),
      enabled: isEnabled(),
      debug: toBool(sGet(LS.debug, '0'), false),
      hasLampa: !!window.Lampa,
      hasOnlineMod: hasOnlineModComponent(),
      preferredBalancer: preferredBalancer(),
      enabledBalancers: enabledBalancers().map(function (row) { return row.id; }),
      allBalancers: balancersState(),
      activeCard: !!movie,
      activeCardId: str(movie && (movie.id || movie.tmdb_id || movie.imdb_id || movie.kinopoisk_id) || ''),
      lastOpen: STATE.lastOpen || sGet(LS.lastOpen, null)
    });
  };

  MP.resetDefaults = function () {
    sSet(LS.enabled, 'true');
    sSet(LS.debug, '0');
    sSet(LS.logLevel, 'normal');
    sSet(LS.preferredBalancer, BUILTIN_BALANCERS[0] && BUILTIN_BALANCERS[0].id || 'vibix');
    BUILTIN_BALANCERS.forEach(function (row) {
      sSet(sourceKey(row.id), row.stable ? '1' : '0');
    });
    return true;
  };

  MP.defaults = function () {
    var out = {
      enabled: 1,
      debug: 0,
      log_level: 'normal',
      preferred_balanser: BUILTIN_BALANCERS[0] && BUILTIN_BALANCERS[0].id || 'vibix',
      sources: {}
    };
    BUILTIN_BALANCERS.forEach(function (row) {
      out.sources[row.id] = row.stable ? 1 : 0;
    });
    return out;
  };

  MP.builtinBalancers = function () {
    return BUILTIN_BALANCERS.map(function (row) { return { id: row.id, title: row.title, stable: !!row.stable }; });
  };

  MP.listBalancers = balancersState;
  MP.getPreferredBalancer = preferredBalancer;
  MP.setPreferredBalancer = function (id) {
    var row = findBalancer(id);
    if (!row) return false;
    sSet(LS.preferredBalancer, row.id);
    return true;
  };

  MP.setSourceEnabled = function (id, enabled) {
    var row = findBalancer(id);
    if (!row) return false;
    sSet(sourceKey(row.id), toBool(enabled, false) ? '1' : '0');
    return true;
  };

  MP.clearSourceState = function () {
    BUILTIN_BALANCERS.forEach(function (row) {
      sDel(sourceKey(row.id));
    });
  };

  MP.openOnlineMod = openOnlineMod;
  MP.openFromCard = function (movie) {
    return openOnlineMod(movie, 'button');
  };
  MP.open = MP.openFromCard;

  MP.install = function () {
    if (STATE.installed) return true;

    if (!ensureDeps()) {
      setTimeout(MP.install, 500);
      return false;
    }

    STATE.installed = true;
    try { MP.UI.Button.install(); } catch (e) { log('ERR', 'button_install_fail', { err: str(e && e.message) }); }

    log('OK', 'installed', { version: VERSION });
    return true;
  };

  MP.install();
})();
