(function () {
  'use strict';

  var BL = window.BL = window.BL || {};
  var MP = BL.ModPlayer = BL.ModPlayer || {};
  if (MP.__loaded) return;
  MP.__loaded = true;

  var VERSION = '2.1.0';
  var LOG_CAP = 120;

  var LS = {
    enabled: 'blmod.enabled',
    debug: 'blmod.debug',
    logLevel: 'blmod.log_level',
    lastOpen: 'blmod.last_open'
  };

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
    return {
      ts: nowMs(),
      from: 'blmod',
      reason: str(reason || 'button'),
      component: 'online_mod',
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
      activeCard: !!movie,
      activeCardId: str(movie && (movie.id || movie.tmdb_id || movie.imdb_id || movie.kinopoisk_id) || ''),
      lastOpen: STATE.lastOpen || sGet(LS.lastOpen, null)
    });
  };

  MP.resetDefaults = function () {
    sSet(LS.enabled, 'true');
    sSet(LS.debug, '0');
    sSet(LS.logLevel, 'normal');
    return true;
  };

  MP.openOnlineMod = openOnlineMod;
  MP.openFromCard = function (movie) {
    return openOnlineMod(movie, 'button');
  };
  MP.open = MP.openFromCard;

  // Compatibility no-ops for legacy menu/flows.
  MP.ensureDonorsLoaded = function () { return Promise.resolve(null); };
  MP.sourcesDump = function () { return {}; };
  MP.sourcesDiag = function () { return MP.diagnose(); };

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
