(function () {
  'use strict';

  var BL = window.BL = window.BL || {};
  var MP = BL.ModPlayer = BL.ModPlayer || {};
  if (MP.SourceKit && MP.SourceKit.__loaded) return;

  var SourceKit = MP.SourceKit = MP.SourceKit || {};
  SourceKit.__loaded = true;

  var HOST_DEFAULT = 'http://smotret24.com/';
  var TTL_SOURCES_MS = 30000;
  var TTL_CATALOG_MS = 10000;

  var CACHE = {
    sourcesByCtx: {},
    sourceById: {},
    catalogByKey: {}
  };

  function nowMs() {
    return Date.now();
  }

  function toInt(v, d) {
    var n = parseInt(v, 10);
    return isFinite(n) ? n : d;
  }

  function toNum(v, d) {
    var n = Number(v);
    return isFinite(n) ? n : d;
  }

  function str(v) {
    return v === undefined || v === null ? '' : String(v);
  }

  function log(level, msg, meta) {
    try {
      if (MP && typeof MP.log === 'function') MP.log(level, msg, meta || null);
    } catch (_) { }
  }

  function uniqId() {
    var uid = '';
    try { uid = str(Lampa.Storage.get('lampac_unic_id', '')); } catch (_) { }
    if (!uid) {
      try { uid = str(Lampa.Storage.get('blmod.uid', '')); } catch (_) { }
    }
    if (!uid) {
      try {
        if (Lampa.Utils && typeof Lampa.Utils.uid === 'function') uid = str(Lampa.Utils.uid(8)).toLowerCase();
      } catch (_) { }
    }
    if (uid) {
      try { Lampa.Storage.set('blmod.uid', uid); } catch (_) { }
    }
    return uid;
  }

  function addUrlComponent(url, component) {
    try {
      if (Lampa.Utils && typeof Lampa.Utils.addUrlComponent === 'function') return Lampa.Utils.addUrlComponent(url, component);
    } catch (_) { }
    return str(url) + (str(url).indexOf('?') >= 0 ? '&' : '?') + component;
  }

  function baseHost() {
    var h = HOST_DEFAULT;
    try { h = str(Lampa.Storage.get('blmod.host', HOST_DEFAULT)); } catch (_) { }
    if (!h) h = HOST_DEFAULT;
    if (h.indexOf('http://') !== 0 && h.indexOf('https://') !== 0) h = 'http://' + h;
    if (h.slice(-1) !== '/') h += '/';
    return h;
  }

  function hostKey() {
    return baseHost().replace(/^https?:\/\//i, '').replace(/\/$/, '');
  }

  function account(url) {
    var out = str(url || '');
    var email = '';
    var uid = uniqId();

    try { email = str(Lampa.Storage.get('account_email', '')); } catch (_) { }

    if (out.indexOf('account_email=') === -1 && email) out = addUrlComponent(out, 'account_email=' + encodeURIComponent(email));
    if (out.indexOf('uid=') === -1 && uid) out = addUrlComponent(out, 'uid=' + encodeURIComponent(uid));

    try {
      if (out.indexOf('showy_token=') === -1) {
        var showy = str(Lampa.Storage.get('showy_token', ''));
        out = addUrlComponent(out, 'showy_token=' + encodeURIComponent(showy));
      }
    } catch (_) { }

    try {
      if (email && out.indexOf('cub_id=') === -1 && Lampa.Utils && typeof Lampa.Utils.hash === 'function') {
        out = addUrlComponent(out, 'cub_id=' + encodeURIComponent(str(Lampa.Utils.hash(email))));
      }
    } catch (_) { }

    return out;
  }

  function rchType() {
    var hk = hostKey();
    try {
      if (window.rch_nws && window.rch_nws[hk] && window.rch_nws[hk].type) return str(window.rch_nws[hk].type);
    } catch (_) { }
    try {
      if (window.rch && window.rch[hk] && window.rch[hk].type) return str(window.rch[hk].type);
    } catch (_) { }
    return '';
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

  function buildCtxSig(movie) {
    var base = [
      str(movie && movie.id),
      str(movie && movie.tmdb_id),
      str(movie && movie.imdb_id),
      str(movie && movie.kinopoisk_id),
      str(movie && movie.title),
      str(movie && movie.name),
      str(movie && movie.original_title),
      str(movie && movie.original_name),
      str(movie && movie.release_date),
      str(movie && movie.first_air_date)
    ].join('|');
    return hashSig(base);
  }

  function request(url, dataType, timeoutMs) {
    return new Promise(function (resolve, reject) {
      try {
        var net = new Lampa.Reguest();
        if (timeoutMs && typeof net.timeout === 'function') net.timeout(timeoutMs);
        net.native(account(url), function (res) {
          resolve(res);
        }, function (a, c) {
          reject({ a: a, c: c, message: 'request_failed', url: url });
        }, false, {
          dataType: dataType || 'json'
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  function normalizeSourceId(row) {
    var bals = str(row && row.balanser).trim();
    var name = str(row && row.name).trim();
    var first = name ? name.split(' ')[0] : '';
    return str((bals || first || name || 'source')).toLowerCase();
  }

  function parseJsonData(strHtml, selector, movie) {
    var html = $('<div>' + str(strHtml || '') + '</div>');
    var elems = [];

    html.find(selector).each(function () {
      var item = $(this);
      var raw = item.attr('data-json');
      var data = {};

      try { data = JSON.parse(raw || '{}') || {}; } catch (_) { data = {}; }

      var season = item.attr('s');
      var episode = item.attr('e');
      var text = str(item.text() || '').trim();

      if (!movie || !movie.name) {
        if (/\d+p/i.test(text) && !data.quality) {
          data.quality = {};
          data.quality[text] = data.url;
        }
        if (text === 'По умолчанию') text = str(movie && movie.title);
      }

      if (season) data.season = toInt(season, 0);
      if (episode) data.episode = toInt(episode, 0);
      if (text) data.text = text;
      data.active = item.hasClass('active');

      elems.push(data);
    });

    return elems;
  }

  function parseCatalog(text, movie, sourceId, sourceTitle, requestUrl) {
    var items = parseJsonData(text, '.videos__item', movie);
    var buttons = parseJsonData(text, '.videos__button', movie);
    var videos = [];
    var links = [];
    var similar = [];

    items.forEach(function (v) {
      if (v && v.similar) similar.push(v);
      if (v && (v.method === 'play' || v.method === 'call')) videos.push(v);
      else if (v && v.url) links.push(v);
    });

    return {
      sourceId: sourceId,
      sourceTitle: sourceTitle,
      requestUrl: requestUrl,
      rawText: text,
      buttons: buttons,
      videos: videos,
      links: links,
      similar: similar,
      hasPlayable: !!videos.length
    };
  }

  function requestParams(url, ctx, extra) {
    var movie = (ctx && ctx.movie) || {};
    var q = [];

    q.push('id=' + encodeURIComponent(str(movie.id || '')));
    if (movie.imdb_id) q.push('imdb_id=' + encodeURIComponent(str(movie.imdb_id)));
    if (movie.kinopoisk_id) q.push('kinopoisk_id=' + encodeURIComponent(str(movie.kinopoisk_id)));
    if (movie.tmdb_id) q.push('tmdb_id=' + encodeURIComponent(str(movie.tmdb_id)));

    q.push('title=' + encodeURIComponent(str((ctx && ctx.queryTitle) || movie.title || movie.name || '')));
    q.push('original_title=' + encodeURIComponent(str(movie.original_title || movie.original_name || '')));
    q.push('serial=' + (movie.name ? '1' : '0'));
    q.push('original_language=' + encodeURIComponent(str(movie.original_language || '')));

    var year = str(movie.release_date || movie.first_air_date || '0000').slice(0, 4);
    q.push('year=' + encodeURIComponent(year || '0000'));
    q.push('source=' + encodeURIComponent(str(movie.source || 'tmdb')));
    q.push('clarification=' + (ctx && ctx.clarification ? '1' : '0'));
    q.push('similar=' + (ctx && ctx.similar ? 'true' : 'false'));

    var rch = rchType();
    if (rch) q.push('rchtype=' + encodeURIComponent(rch));

    if (extra) {
      Object.keys(extra).forEach(function (k) {
        if (extra[k] === undefined || extra[k] === null) return;
        q.push(encodeURIComponent(k) + '=' + encodeURIComponent(str(extra[k])));
      });
    }

    return str(url) + (str(url).indexOf('?') >= 0 ? '&' : '?') + q.join('&');
  }

  function ensureExternalIds(ctx) {
    return new Promise(function (resolve) {
      try {
        var movie = (ctx && ctx.movie) || {};
        if (movie.imdb_id && movie.kinopoisk_id) return resolve(ctx);

        var host = baseHost();
        var q = [];
        q.push('id=' + encodeURIComponent(str(movie.id || '')));
        q.push('serial=' + (movie.name ? '1' : '0'));
        if (movie.imdb_id) q.push('imdb_id=' + encodeURIComponent(str(movie.imdb_id)));
        if (movie.kinopoisk_id) q.push('kinopoisk_id=' + encodeURIComponent(str(movie.kinopoisk_id)));

        var url = host + 'externalids?' + q.join('&');

        request(url, 'json', 10000).then(function (json) {
          if (json && typeof json === 'object') {
            Object.keys(json).forEach(function (k) {
              movie[k] = json[k];
            });
          }
          resolve(ctx);
        })['catch'](function () {
          resolve(ctx);
        });
      } catch (_) {
        resolve(ctx);
      }
    });
  }

  function mapSources(rows) {
    var out = [];
    (rows || []).forEach(function (j) {
      if (!j || !j.url) return;
      var id = normalizeSourceId(j);
      var title = str(j.name || id || 'Source');
      var source = {
        id: id,
        title: title,
        url: str(j.url),
        show: typeof j.show === 'undefined' ? true : !!j.show,
        kind: 'balancer',
        raw: j
      };
      out.push(source);
      CACHE.sourceById[id] = source;
    });
    return out;
  }

  function builtinSources() {
    try {
      if (MP && MP.OnlineCore && typeof MP.OnlineCore.builtinSources === 'function') {
        var rows = MP.OnlineCore.builtinSources();
        return Array.isArray(rows) ? rows : [];
      }
    } catch (_) { }
    return [];
  }

  function mergeWithBuiltin(runtime) {
    runtime = Array.isArray(runtime) ? runtime : [];
    var defs = builtinSources();
    if (!defs.length) return runtime;

    var byId = {};
    runtime.forEach(function (s) { byId[str(s && s.id || '').toLowerCase()] = s; });

    var out = defs.map(function (d) {
      var id = str(d && d.id || '').toLowerCase();
      var rt = byId[id];
      if (rt) {
        var m = $.extend(true, {}, rt);
        m.id = str(m.id || id);
        m.title = str(d.title || m.title || id);
        m.kind = str(m.kind || d.kind || 'balancer');
        m.origin = str(m.origin || 'runtime_builtin');
        return m;
      }
      return {
        id: id,
        title: str(d && d.title || id),
        url: '',
        show: true,
        kind: str(d && d.kind || 'balancer'),
        raw: null
      };
    });

    return out;
  }

  function getLifeOnline(ctx, memkey) {
    var host = baseHost();
    var attempts = 0;

    return new Promise(function (resolve, reject) {
      function step() {
        attempts += 1;
        var url = requestParams(host + 'lifeevents?memkey=' + encodeURIComponent(str(memkey || '')), ctx);

        request(url, 'json', 7000).then(function (json) {
          if (json && json.accsdb) return reject(json);

          if (json && json.title && ctx && ctx.movie) {
            if (ctx.movie.title) ctx.movie.title = json.title;
            if (ctx.movie.name) ctx.movie.name = json.title;
            ctx.queryTitle = json.title;
          }

          if (json && json.online && json.online.length && (json.ready || attempts >= 8)) return resolve(json.online);
          if (attempts >= 8) return resolve((json && json.online) || []);
          setTimeout(step, 900);
        })['catch'](function () {
          if (attempts >= 8) return reject({ message: 'lifeevents_failed' });
          setTimeout(step, 900);
        });
      }

      step();
    });
  }

  function fetchSources(ctx) {
    var host = baseHost();
    var url = requestParams(host + 'lite/events?life=true', ctx);

    return request(url, 'json', 15000).then(function (json) {
      if (json && json.accsdb) return Promise.reject(json);

      if (json && json.life) {
        if (json.memkey) ctx.memkey = json.memkey;
        if (json.title) {
          if (ctx.movie.title) ctx.movie.title = json.title;
          if (ctx.movie.name) ctx.movie.name = json.title;
          ctx.queryTitle = json.title;
        }

        if (json.online && json.online.length && json.ready) return json.online;
        return getLifeOnline(ctx, json.memkey || '');
      }

      if (Array.isArray(json)) return json;
      if (json && Array.isArray(json.online)) return json.online;
      return [];
    });
  }

  function sourceCacheKey(ctx) {
    return str(ctx && ctx.ctxSig || '');
  }

  function catalogCacheKey(ctx, sourceId, url) {
    return sourceCacheKey(ctx) + '|' + str(sourceId) + '|' + hashSig(str(url));
  }

  SourceKit.hashSig = hashSig;

  SourceKit.buildContext = function (movieArg) {
    var movie = movieArg || null;
    try {
      if (!movie && window.Lampa && Lampa.Activity && typeof Lampa.Activity.active === 'function') {
        var act = Lampa.Activity.active();
        movie = (act && (act.card || (act.activity && act.activity.card) || (act.activity && act.activity.movie))) || null;
      }
    } catch (_) { }

    if (!movie) return null;

    var movieCopy = $.extend(true, {}, movie);
    var title = str(movieCopy.title || movieCopy.name || '');

    return {
      movie: movieCopy,
      queryTitle: title,
      clarification: false,
      similar: false,
      ctxSig: buildCtxSig(movieCopy),
      createdTs: nowMs(),
      memkey: ''
    };
  };

  SourceKit.listSources = function (ctx) {
    if (!ctx || !ctx.movie) return Promise.resolve([]);

    var key = sourceCacheKey(ctx);
    var cached = CACHE.sourcesByCtx[key];
    if (cached && nowMs() - toInt(cached.ts, 0) < TTL_SOURCES_MS) {
      return Promise.resolve(cached.sources.slice());
    }

    return ensureExternalIds(ctx).then(function () {
      return fetchSources(ctx);
    }).then(function (rows) {
      var runtimeSources = mapSources(rows).filter(function (s) { return s.show; });
      var sources = mergeWithBuiltin(runtimeSources);
      CACHE.sourcesByCtx[key] = { ts: nowMs(), sources: sources };
      log('INF', 'sources_loaded', { count: sources.length, ctx: ctx.ctxSig });
      return sources.slice();
    })['catch'](function (e) {
      log('WRN', 'sources_failed', { err: str(e && (e.message || e.msg || e.c || 'unknown')) });
      return [];
    });
  };

  SourceKit.getSource = function (id, ctx) {
    var source = CACHE.sourceById[str(id || '')] || null;
    if (source) return source;

    var key = sourceCacheKey(ctx || {});
    var cached = CACHE.sourcesByCtx[key];
    if (!cached || !cached.sources) return null;

    var found = null;
    cached.sources.some(function (s) {
      if (s.id === id) {
        found = s;
        return true;
      }
      return false;
    });

    return found;
  };

  SourceKit.resolveCatalogByUrl = function (ctx, sourceId, nextUrl) {
    if (!ctx || !ctx.movie || !nextUrl) return Promise.resolve(null);

    var source = SourceKit.getSource(sourceId, ctx) || { id: sourceId, title: sourceId, url: nextUrl };
    var finalUrl = requestParams(nextUrl, ctx);
    var ck = catalogCacheKey(ctx, sourceId, finalUrl);
    var cached = CACHE.catalogByKey[ck];

    if (cached && nowMs() - toInt(cached.ts, 0) < TTL_CATALOG_MS) {
      return Promise.resolve($.extend(true, {}, cached.catalog));
    }

    return request(finalUrl, 'text', 20000).then(function (text) {
      if (text && typeof text === 'object' && text.rch) {
        return {
          sourceId: source.id,
          sourceTitle: source.title,
          requestUrl: finalUrl,
          rawText: '',
          buttons: [],
          videos: [],
          links: [],
          similar: [],
          hasPlayable: false,
          needsRch: true
        };
      }

      var catalog = parseCatalog(str(text || ''), ctx.movie, source.id, source.title, finalUrl);
      CACHE.catalogByKey[ck] = { ts: nowMs(), catalog: $.extend(true, {}, catalog) };
      return catalog;
    })['catch'](function (e) {
      log('WRN', 'catalog_failed', { source: sourceId, err: str(e && (e.message || e.c || 'unknown')) });
      return {
        sourceId: source.id,
        sourceTitle: source.title,
        requestUrl: finalUrl,
        rawText: '',
        buttons: [],
        videos: [],
        links: [],
        similar: [],
        hasPlayable: false,
        failed: true,
        error: e
      };
    });
  };

  SourceKit.resolveCatalog = function (ctx, sourceId) {
    var source = SourceKit.getSource(sourceId, ctx);
    if (!source || !source.url) return Promise.resolve(null);
    return SourceKit.resolveCatalogByUrl(ctx, sourceId, source.url);
  };

  SourceKit.resolveFile = function (ctx, sourceId, selection) {
    if (!MP.Resolver || typeof MP.Resolver.resolveFile !== 'function') {
      return Promise.reject(new Error('resolver_missing'));
    }
    return MP.Resolver.resolveFile(ctx, SourceKit.getSource(sourceId, ctx), selection);
  };

  SourceKit.meta = function () {
    return {
      host: baseHost(),
      cacheSources: Object.keys(CACHE.sourcesByCtx).length,
      cacheCatalog: Object.keys(CACHE.catalogByKey).length
    };
  };
})();
