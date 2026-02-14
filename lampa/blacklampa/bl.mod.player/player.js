(function () {
  'use strict';

  var BL = window.BL = window.BL || {};
  var MP = BL.ModPlayer = BL.ModPlayer || {};
  if (MP.Player && MP.Player.__loaded) return;

  var Player = MP.Player = MP.Player || {};
  Player.__loaded = true;

  function nowMs() {
    return Date.now();
  }

  function str(v) {
    return v === undefined || v === null ? '' : String(v);
  }

  function toNum(v, d) {
    var n = Number(v);
    return isFinite(n) ? n : d;
  }

  function log(level, msg, meta) {
    try {
      if (MP && typeof MP.log === 'function') MP.log(level, msg, meta || null);
    } catch (_) { }
  }

  function hashSig(input) {
    if (MP.SourceKit && typeof MP.SourceKit.hashSig === 'function') return MP.SourceKit.hashSig(input);
    var s = str(input);
    var h = 2166136261;
    var i;
    for (i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
    }
    return ('00000000' + (h >>> 0).toString(16)).slice(-8);
  }

  function overlayObj() {
    try {
      if (window.BL_PlayerOverlay) return window.BL_PlayerOverlay;
    } catch (_) { }
    try {
      if (window.BL && BL.PlayerOverlay) return BL.PlayerOverlay;
    } catch (_) { }
    return null;
  }

  function pickTitle(item, movie) {
    var p = [];
    var t = str(item && (item.title || item.text));
    if (t) p.push(t);
    if (item && item.season) p.push('S' + item.season);
    if (item && item.episode) p.push('E' + item.episode);
    if (!p.length && movie) p.push(str(movie.title || movie.name || 'BL-Mod'));
    return p.join(' ');
  }

  function buildPlaylistFromCatalog(catalog, selectedItem, sourceId) {
    var list = [];
    if (!catalog || !catalog.videos || !catalog.videos.length) return list;

    catalog.videos.forEach(function (v) {
      if (!v || !v.url) return;
      var method = str(v.method || '').toLowerCase();
      if (method && method !== 'play') return;

      var cell = MP.Resolver && typeof MP.Resolver.toPlayElement === 'function' ? MP.Resolver.toPlayElement(v) : {
        title: v.title || v.text || '',
        url: v.url || '',
        quality: v.qualitys || v.quality || {},
        subtitles: v.subtitles,
        segments: v.segments,
        season: v.season,
        episode: v.episode,
        voice_name: v.voice_name,
        thumbnail: v.thumbnail || ''
      };

      if (MP.Resolver && typeof MP.Resolver.orUrlReserve === 'function') MP.Resolver.orUrlReserve(cell);
      if (MP.Resolver && typeof MP.Resolver.setDefaultQuality === 'function') MP.Resolver.setDefaultQuality(cell);

      if (!cell.url) return;

      cell.blmod = {
        sourceId: sourceId,
        fileId: hashSig(str(v.url) + '|' + str(v.season) + '|' + str(v.episode)),
        season: v.season || null,
        episode: v.episode || null
      };

      list.push(cell);
    });

    return list;
  }

  Player.buildPayload = function (ctx, source, selectedItem, resolved, catalog) {
    if (!resolved || !resolved.element) return null;

    var payload = $.extend(true, {}, resolved.element);
    var movie = (ctx && ctx.movie) || {};

    payload.title = payload.title || pickTitle(selectedItem, movie);
    payload.isonline = true;

    var src = str(payload.url || '');
    var sourceId = str(source && source.id || 'source');
    var ctxSig = str(ctx && ctx.ctxSig || '');

    payload.blmod = {
      sourceId: sourceId,
      sourceTitle: str(source && source.title || sourceId),
      fileId: hashSig(str(src) + '|' + str(selectedItem && selectedItem.season) + '|' + str(selectedItem && selectedItem.episode)),
      voice: str(selectedItem && selectedItem.voice_name || ''),
      season: selectedItem && selectedItem.season ? selectedItem.season : null,
      episode: selectedItem && selectedItem.episode ? selectedItem.episode : null,
      urlSig: hashSig(src),
      ctxSig: ctxSig,
      movieId: str(movie.id || ''),
      tmdb_id: str(movie.tmdb_id || ''),
      imdb_id: str(movie.imdb_id || ''),
      kinopoisk_id: str(movie.kinopoisk_id || ''),
      ts: nowMs()
    };

    var playlist = buildPlaylistFromCatalog(catalog, selectedItem, sourceId);
    if (playlist.length > 1) payload.playlist = playlist;

    return payload;
  };

  Player.notifyStart = function (meta, payload) {
    var ov = overlayObj();
    if (!ov || typeof ov.onPlaybackStart !== 'function') return;
    try {
      ov.onPlaybackStart({
        blmodMeta: meta || {},
        playPayload: payload || {}
      });
    } catch (_) { }
  };

  Player.notifyStop = function (meta) {
    var ov = overlayObj();
    if (!ov || typeof ov.onPlaybackStop !== 'function') return;
    try {
      ov.onPlaybackStop({ blmodMeta: meta || {} });
    } catch (_) { }
  };

  Player.playResolved = function (ctx, source, selectedItem, resolved, catalog) {
    return new Promise(function (resolve, reject) {
      try {
        var payload = Player.buildPayload(ctx, source, selectedItem, resolved, catalog);
        if (!payload || !payload.url) return reject(new Error('payload_url_empty'));

        try {
          Lampa.Player.play(payload);
          if (payload.playlist && payload.playlist.length > 1 && typeof Lampa.Player.playlist === 'function') {
            Lampa.Player.playlist(payload.playlist);
          }
        } catch (e) {
          return reject(e);
        }

        try {
          if (payload.subtitles_call && MP.Resolver && typeof MP.Resolver.loadSubtitles === 'function') {
            MP.Resolver.loadSubtitles(payload.subtitles_call);
          }
        } catch (_) { }

        Player.notifyStart(payload.blmod, payload);
        log('INF', 'play_started', {
          source: payload.blmod && payload.blmod.sourceId,
          season: payload.blmod && payload.blmod.season,
          episode: payload.blmod && payload.blmod.episode
        });

        resolve(payload);
      } catch (e) {
        reject(e);
      }
    });
  };
})();
