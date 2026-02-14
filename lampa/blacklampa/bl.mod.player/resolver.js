(function () {
  'use strict';

  var BL = window.BL = window.BL || {};
  var MP = BL.ModPlayer = BL.ModPlayer || {};
  if (MP.Resolver && MP.Resolver.__loaded) return;

  var Resolver = MP.Resolver = MP.Resolver || {};
  Resolver.__loaded = true;

  function str(v) {
    return v === undefined || v === null ? '' : String(v);
  }

  function toNum(v, d) {
    var n = Number(v);
    return isFinite(n) ? n : d;
  }

  function toInt(v, d) {
    var n = parseInt(v, 10);
    return isFinite(n) ? n : d;
  }

  function log(level, msg, meta) {
    try {
      if (MP && typeof MP.log === 'function') MP.log(level, msg, meta || null);
    } catch (_) { }
  }

  function addUrlComponent(url, component) {
    try {
      if (Lampa.Utils && typeof Lampa.Utils.addUrlComponent === 'function') return Lampa.Utils.addUrlComponent(url, component);
    } catch (_) { }
    return str(url) + (str(url).indexOf('?') >= 0 ? '&' : '?') + component;
  }

  function ensureUid() {
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

  function account(url) {
    var out = str(url || '');
    var email = '';
    var uid = ensureUid();

    try { email = str(Lampa.Storage.get('account_email', '')); } catch (_) { }

    if (out.indexOf('account_email=') === -1 && email) out = addUrlComponent(out, 'account_email=' + encodeURIComponent(email));
    if (out.indexOf('uid=') === -1 && uid) out = addUrlComponent(out, 'uid=' + encodeURIComponent(uid));

    try {
      if (out.indexOf('showy_token=') === -1) {
        var showy = str(Lampa.Storage.get('showy_token', ''));
        out = addUrlComponent(out, 'showy_token=' + encodeURIComponent(showy));
      }
    } catch (_) { }

    return out;
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

  function clone(obj) {
    try { return $.extend(true, {}, obj || {}); } catch (_) { return obj || {}; }
  }

  function splitUrlReserve(data) {
    if (!data || !data.url || typeof data.url !== 'string') return;
    if (data.url.indexOf(' or ') === -1) return;
    var urls = data.url.split(' or ');
    data.url = urls[0];
    data.url_reserve = urls[1] || '';
  }

  function getQualityMap(data) {
    return (data && (data.quality || data.qualitys)) || {};
  }

  function setDefaultQuality(data) {
    if (!data) return;
    var quality = getQualityMap(data);
    var keys = [];
    try { keys = Lampa.Arrays.getKeys(quality); } catch (_) { keys = Object.keys(quality || {}); }
    if (!keys.length) return;

    var targetQ = 0;
    try { targetQ = toInt(Lampa.Storage.field('video_quality_default'), 0); } catch (_) { }

    keys.forEach(function (q) {
      var val = str(quality[q] || '');
      if (toInt(q, -1) === targetQ && val) {
        data.url = val;
        splitUrlReserve(data);
      }
      if (val.indexOf(' or ') !== -1) quality[q] = val.split(' or ')[0];
    });

    if (data.quality) data.quality = quality;
    if (data.qualitys) data.qualitys = quality;
  }

  function toPlayElement(file) {
    var item = clone(file || {});
    return {
      title: item.title || item.text || '',
      url: item.url || '',
      quality: item.qualitys || item.quality || {},
      timeline: item.timeline,
      subtitles: item.subtitles,
      segments: item.segments,
      callback: item.mark,
      season: item.season,
      episode: item.episode,
      voice_name: item.voice_name,
      thumbnail: item.thumbnail || item.img || ''
    };
  }

  function normalizeResolved(file, json, jsonCall) {
    var stream = json || {};
    var callMeta = jsonCall || {};

    if (!stream.url && callMeta.url) stream.url = callMeta.url;

    var element = toPlayElement(file);
    element.url = stream.url || element.url || '';
    element.headers = callMeta.headers || stream.headers;
    element.quality = callMeta.quality || file.qualitys || file.quality || {};
    element.segments = callMeta.segments || file.segments;
    element.hls_manifest_timeout = callMeta.hls_manifest_timeout || stream.hls_manifest_timeout;

    if (stream.subtitles) element.subtitles = stream.subtitles;
    if (callMeta.subtitles_call || stream.subtitles_call) element.subtitles_call = callMeta.subtitles_call || stream.subtitles_call;

    if (stream.vast && stream.vast.url) {
      element.vast_url = stream.vast.url;
      element.vast_msg = stream.vast.msg;
      element.vast_region = stream.vast.region;
      element.vast_platform = stream.vast.platform;
      element.vast_screen = stream.vast.screen;
    }

    splitUrlReserve(element);
    setDefaultQuality(element);

    return {
      file: clone(file),
      stream: stream,
      call: callMeta,
      element: element,
      ok: !!element.url
    };
  }

  Resolver.orUrlReserve = splitUrlReserve;
  Resolver.setDefaultQuality = setDefaultQuality;
  Resolver.toPlayElement = toPlayElement;

  Resolver.resolveFile = function (ctx, source, file) {
    return new Promise(function (resolve, reject) {
      try {
        var f = clone(file || {});
        if (!f || !f.url) return reject(new Error('file_url_missing'));

        var method = str(f.method || '').toLowerCase();

        if (Lampa.Storage.field('player') !== 'inner' && f.stream && Lampa.Platform && Lampa.Platform.is && Lampa.Platform.is('apple')) {
          var appleFile = clone(f);
          appleFile.method = 'play';
          appleFile.url = f.stream;
          var appleRes = normalizeResolved(appleFile, appleFile, {});
          return resolve(appleRes);
        }

        if (!method || method === 'play') {
          return resolve(normalizeResolved(f, f, {}));
        }

        request(f.url, 'json', 20000).then(function (json) {
          if (json && json.rch) {
            log('WRN', 'resolve_rch_required', { source: source && source.id, url: f.url });
            return reject(new Error('rch_required'));
          }

          if (!json || !json.url) {
            return reject(new Error('stream_url_empty'));
          }

          resolve(normalizeResolved(f, json, json));
        })['catch'](function (e) {
          reject(e || new Error('resolve_failed'));
        });
      } catch (e) {
        reject(e);
      }
    });
  };

  Resolver.loadSubtitles = function (subtitlesCall) {
    return new Promise(function (resolve) {
      if (!subtitlesCall) return resolve(false);
      request(subtitlesCall, 'json', 15000).then(function (subs) {
        try {
          if (window.Lampa && Lampa.Player && typeof Lampa.Player.subtitles === 'function') {
            Lampa.Player.subtitles(subs || []);
            return resolve(true);
          }
        } catch (_) { }
        resolve(false);
      })['catch'](function () {
        resolve(false);
      });
    });
  };
})();
