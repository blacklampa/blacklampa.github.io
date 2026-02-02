(function () {
  'use strict';

  var BL = window.BL = window.BL || {};
  BL.Backup = BL.Backup || {};

  var API = BL.Backup;

  var K = (BL.Keys || BL.LocalStorageKeys || {});
  var PFX = String((K && K.prefix) ? K.prefix : 'blacklampa_');
  var CFG_KEY = String((K && K.backup_cfg_v1) ? K.backup_cfg_v1 : (PFX + 'backup_cfg_v1'));
  var HISTORY_KEY = String((K && K.backup_history_v1) ? K.backup_history_v1 : (PFX + 'backup_history_v1'));
  var HISTORY_MAX = 80;

  function safe(fn, fallback) { try { return fn(); } catch (_) { return fallback; } }

  function isPlainObject(x) {
    try { return !!x && typeof x === 'object' && !Array.isArray(x); } catch (_) { return false; }
  }

  function lsGet(k) { try { return window.localStorage ? localStorage.getItem(String(k)) : null; } catch (_) { return null; } }
  function lsSet(k, v) { try { if (!window.localStorage) return false; localStorage.setItem(String(k), String(v)); return true; } catch (_) { return false; } }
  function lsRemove(k) { try { if (!window.localStorage) return false; localStorage.removeItem(String(k)); return true; } catch (_) { return false; } }

  function readJson(key, fallback) {
    var s = lsGet(key);
    if (!s) return fallback;
    try { return JSON.parse(String(s)); } catch (_) { return fallback; }
  }

  function writeJson(key, obj) {
    try { return lsSet(key, JSON.stringify(obj)); } catch (_) { return false; }
  }

  function normalizePrefixes(prefixes) {
    var out = [];
    try {
      if (typeof prefixes === 'string') prefixes = String(prefixes || '').split(',');
      if (!Array.isArray(prefixes)) prefixes = [];
      for (var i = 0; i < prefixes.length; i++) {
        var p = String(prefixes[i] || '').trim();
        if (p) out.push(p);
      }
    } catch (_) { }
    try { for (var j = 0; j < out.length; j++) if (out[j] === 'bl_') out[j] = PFX; } catch (_) { }
    if (!out.length) out = [PFX];
    return out;
  }

  function getCfg() {
    var cfg = readJson(CFG_KEY, null);
    if (!isPlainObject(cfg)) cfg = {};

    var out = {
      prefixes: normalizePrefixes(cfg.prefixes),
      provider: String(cfg.provider || 'paste_rs') || 'paste_rs',
      keyHint: String(cfg.keyHint || ''),
      unsafe_store_key: (String(cfg.unsafe_store_key || '0') === '1') ? 1 : 0
    };

    if (!cfg || !cfg.prefixes || !cfg.provider) writeJson(CFG_KEY, out);
    return out;
  }

  function getHistoryDoc() {
    var doc = readJson(HISTORY_KEY, null);
    if (!isPlainObject(doc)) doc = {};
    if (doc.v !== 1) doc.v = 1;
    if (!Array.isArray(doc.items)) doc.items = [];
    return doc;
  }

  function b64EncodeU8(u8) {
    try {
      var bin = '';
      var chunk = 0x8000;
      for (var i = 0; i < u8.length; i += chunk) {
        bin += String.fromCharCode.apply(null, u8.subarray(i, i + chunk));
      }
      return btoa(bin);
    } catch (_) { return ''; }
  }

  function b64DecodeU8(b64) {
    try {
      var bin = atob(String(b64 || ''));
      var u8 = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i) & 255;
      return u8;
    } catch (_) { return new Uint8Array(0); }
  }

  function utf8Encode(str) {
    str = String(str || '');
    try { if (window.TextEncoder) return new TextEncoder().encode(str); } catch (_) { }
    try {
      var esc = unescape(encodeURIComponent(str));
      var u8 = new Uint8Array(esc.length);
      for (var i = 0; i < esc.length; i++) u8[i] = esc.charCodeAt(i) & 255;
      return u8;
    } catch (_) {
      var u82 = new Uint8Array(str.length);
      for (var j = 0; j < str.length; j++) u82[j] = str.charCodeAt(j) & 255;
      return u82;
    }
  }

  function utf8Decode(u8) {
    try { if (window.TextDecoder) return new TextDecoder('utf-8').decode(u8); } catch (_) { }
    try {
      var s = '';
      for (var i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
      return decodeURIComponent(escape(s));
    } catch (_) {
      try {
        var s2 = '';
        for (var j = 0; j < u8.length; j++) s2 += String.fromCharCode(u8[j]);
        return s2;
      } catch (_) { return ''; }
    }
  }

  function hexOfU8(u8) {
    var hex = '';
    try {
      for (var i = 0; i < u8.length; i++) {
        var h = (u8[i] & 255).toString(16);
        if (h.length < 2) h = '0' + h;
        hex += h;
      }
    } catch (_) { }
    return hex;
  }

  function getSubtle() {
    try { return (window.crypto && crypto.subtle) ? crypto.subtle : null; } catch (_) { return null; }
  }

  function randU8(n) {
    var u8 = new Uint8Array(n);
    try { if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(u8); } catch (_) { }
    return u8;
  }

  function deriveAesKey(pass, salt, iter) {
    var subtle = getSubtle();
    if (!subtle) return Promise.reject(new Error('WebCrypto not available'));
    return subtle.importKey('raw', utf8Encode(pass), { name: 'PBKDF2' }, false, ['deriveKey']).then(function (keyMaterial) {
      return subtle.deriveKey(
        { name: 'PBKDF2', salt: salt, iterations: iter, hash: 'SHA-256' },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
      );
    });
  }

  function sha256PassHex(pass) {
    var subtle = getSubtle();
    if (!subtle) return Promise.reject(new Error('WebCrypto not available'));
    return subtle.digest('SHA-256', utf8Encode(pass)).then(function (buf) {
      return 'sha256:' + hexOfU8(new Uint8Array(buf));
    });
  }

  function fetchWithTimeout(url, opts, timeoutMs) {
    timeoutMs = (typeof timeoutMs === 'number' && timeoutMs > 0) ? timeoutMs : 12000;
    opts = opts || {};
    var controller = null;
    try { if (window.AbortController) controller = new AbortController(); } catch (_) { controller = null; }
    if (controller) {
      try { opts.signal = controller.signal; } catch (_) { }
    }
    return new Promise(function (resolve, reject) {
      var done = false;
      var t = setTimeout(function () {
        if (done) return;
        done = true;
        try { if (controller) controller.abort(); } catch (_) { }
        var e = new Error('timeout');
        e.code = 'TIMEOUT';
        reject(e);
      }, timeoutMs);

      fetch(String(url || ''), opts).then(function (res) {
        if (done) return;
        done = true;
        clearTimeout(t);
        resolve(res);
      }, function (e) {
        if (done) return;
        done = true;
        clearTimeout(t);
        try { if (controller) controller.abort(); } catch (_) { }
        reject(e);
      });
    });
  }

  function isProbablyCorsError(e) {
    try {
      if (!e) return false;
      if (e.code === 'CORS') return true;
      var m = String(e && e.message ? e.message : e);
      if (e && String(e.name || '') === 'TypeError') return true;
      return /Failed to fetch|NetworkError|CORS|blocked by CORS/i.test(m);
    } catch (_) { return false; }
  }

  function errorProvider(provider, where, e) {
    var err = new Error(String(where || 'provider') + ' failed');
    try { err.provider = String(provider || ''); } catch (_) { }
    try { err.cause = e; } catch (_) { }
    if (e && e.code) err.code = e.code;
    if (isProbablyCorsError(e)) err.code = 'CORS';
    try { err.message = (e && e.message) ? String(e.message) : err.message; } catch (_) { }
    return err;
  }

  function parseUrlId(u) {
    try {
      var url = new URL(String(u || ''), location.href);
      var p = String(url.pathname || '');
      var seg = p.split('/'); seg = seg[seg.length - 1] || '';
      if (!seg) seg = url.hostname;
      return String(seg || '');
    } catch (_) {
      var s = String(u || '');
      var a = s.split('/'); return a[a.length - 1] || s;
    }
  }

  function asUrlOrBuild(base, idOrUrl) {
    var s = String(idOrUrl || '').trim();
    if (!s) return String(base || '');
    if (s.indexOf('://') > 0) return s;
    return String(base || '') + s;
  }

  API.collectConfig = function () {
    var cfg = getCfg();
    var prefixes = normalizePrefixes(cfg.prefixes);
    var data = {};
    try {
      if (!window.localStorage) throw 0;
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (!k) continue;
        var ks = String(k);
        var ok = false;
        for (var j = 0; j < prefixes.length; j++) {
          if (ks.indexOf(String(prefixes[j])) === 0) { ok = true; break; }
        }
        if (!ok) continue;
        var v = null;
        try { v = localStorage.getItem(ks); } catch (_) { v = null; }
        data[ks] = (v === null || typeof v === 'undefined') ? '' : String(v);
      }
    } catch (_) { }
    return {
      meta: { schema: 1, ts: Date.now(), prefixes: prefixes },
      data: data
    };
  };

  API.applyConfig = function (cfgObj, mode) {
    mode = (mode === 'replace') ? 'replace' : 'merge';
    cfgObj = isPlainObject(cfgObj) ? cfgObj : {};
    var meta = isPlainObject(cfgObj.meta) ? cfgObj.meta : {};
    var prefixes = normalizePrefixes(meta.prefixes || getCfg().prefixes);
    var data = isPlainObject(cfgObj.data) ? cfgObj.data : {};

    var removed = 0;
    var written = 0;

    try {
      if (!window.localStorage) throw 0;
      if (mode === 'replace') {
        var toRemove = [];
        for (var i = 0; i < localStorage.length; i++) {
          var k = localStorage.key(i);
          if (!k) continue;
          var ks = String(k);
          for (var j = 0; j < prefixes.length; j++) {
            if (ks.indexOf(String(prefixes[j])) === 0) { toRemove.push(ks); break; }
          }
        }
        for (var r = 0; r < toRemove.length; r++) {
          try { localStorage.removeItem(toRemove[r]); removed++; } catch (_) { }
        }
      }

      for (var dk in data) {
        if (!dk) continue;
        try { localStorage.setItem(String(dk), String(data[dk])); written++; } catch (_) { }
      }
    } catch (_) { }

    return { removed: removed, written: written };
  };

  API.encrypt = function (cfgObj, pass) {
    pass = String(pass || '').trim();
    if (!pass) return Promise.reject(new Error('empty key'));

    var subtle = getSubtle();
    if (!subtle) return Promise.reject(new Error('WebCrypto not available'));

    var iter = 200000;
    var salt = randU8(16);
    var iv = randU8(12);

    var plainStr = '';
    try { plainStr = JSON.stringify(cfgObj || {}); } catch (_) { plainStr = '{}'; }
    var plain = utf8Encode(plainStr);

    return deriveAesKey(pass, salt, iter).then(function (key) {
      return subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, plain);
    }).then(function (ctBuf) {
      var payload = {
        v: 1,
        kdf: { name: 'PBKDF2-SHA256', salt: b64EncodeU8(salt), iter: iter },
        enc: { name: 'AES-GCM', iv: b64EncodeU8(iv) },
        ct: b64EncodeU8(new Uint8Array(ctBuf))
      };
      return JSON.stringify(payload);
    });
  };

  API.decrypt = function (payloadJson, pass) {
    pass = String(pass || '').trim();
    if (!pass) return Promise.reject(new Error('empty key'));

    var subtle = getSubtle();
    if (!subtle) return Promise.reject(new Error('WebCrypto not available'));

    var raw = String(payloadJson || '').trim();
    var payload = null;
    try { payload = JSON.parse(raw); } catch (_) { payload = null; }
    if (!isPlainObject(payload) || payload.v !== 1) return Promise.reject(new Error('bad payload'));
    if (!payload.kdf || !payload.enc || !payload.ct) return Promise.reject(new Error('bad payload'));

    var salt = b64DecodeU8(payload.kdf.salt);
    var iter = parseInt(payload.kdf.iter, 10);
    if (!iter || iter < 10000) iter = 200000;
    var iv = b64DecodeU8(payload.enc.iv);
    var ct = b64DecodeU8(payload.ct);

    return deriveAesKey(pass, salt, iter).then(function (key) {
      return subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, ct);
    }).then(function (ptBuf) {
      var ptStr = utf8Decode(new Uint8Array(ptBuf));
      var obj = null;
      try { obj = JSON.parse(String(ptStr || '')); } catch (_) { obj = null; }
      if (!isPlainObject(obj)) throw new Error('bad config');
      return obj;
    });
  };

  API.providers = API.providers || {};

  API.providers.paste_rs = {
    id: 'paste_rs',
    title: 'paste.rs',
    upload: function (payloadStr) {
      var url = 'https://paste.rs/';
      var opts = { method: 'POST', headers: { 'Content-Type': 'text/plain; charset=utf-8' }, body: String(payloadStr || '') };
      return fetchWithTimeout(url, opts, 14000).then(function (res) {
        if (!res || !res.ok) {
          var e = new Error('HTTP ' + (res ? res.status : 0));
          e.code = 'HTTP';
          e.status = res ? res.status : 0;
          throw e;
        }
        return res.text();
      }).then(function (txt) {
        var u = String(txt || '').trim();
        var id = parseUrlId(u);
        return { id: id || u, url: u };
      }).catch(function (e) {
        throw errorProvider('paste_rs', 'upload', e);
      });
    },
    download: function (idOrUrl) {
      var url = asUrlOrBuild('https://paste.rs/', idOrUrl);
      return fetchWithTimeout(url, { method: 'GET' }, 14000).then(function (res) {
        if (!res || !res.ok) {
          var e = new Error('HTTP ' + (res ? res.status : 0));
          e.code = 'HTTP';
          e.status = res ? res.status : 0;
          throw e;
        }
        return res.text();
      }).then(function (txt) {
        return String(txt || '').trim();
      }).catch(function (e) {
        throw errorProvider('paste_rs', 'download', e);
      });
    }
  };

  API.providers.dpaste_org = {
    id: 'dpaste_org',
    title: 'dpaste.org',
    upload: function (payloadStr) {
      var url = 'https://dpaste.org/api/';
      var body = null;
      var opts = { method: 'POST' };
      try {
        if (window.FormData) {
          body = new FormData();
          body.append('format', 'url');
          body.append('content', String(payloadStr || ''));
          opts.body = body;
        } else {
          var enc = encodeURIComponent(String(payloadStr || ''));
          opts.headers = { 'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8' };
          opts.body = 'format=url&content=' + enc;
        }
      } catch (_) {
        opts.headers = { 'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8' };
        opts.body = 'format=url&content=' + encodeURIComponent(String(payloadStr || ''));
      }

      return fetchWithTimeout(url, opts, 14000).then(function (res) {
        if (!res || !res.ok) {
          var e = new Error('HTTP ' + (res ? res.status : 0));
          e.code = 'HTTP';
          e.status = res ? res.status : 0;
          throw e;
        }
        return res.text();
      }).then(function (txt) {
        var t = String(txt || '').trim();
        var u = '';
        try {
          var j = JSON.parse(t);
          if (j && j.url) u = String(j.url || '').trim();
        } catch (_) { }
        if (!u) u = t;
        var id = parseUrlId(u);
        return { id: id || u, url: u };
      }).catch(function (e) {
        throw errorProvider('dpaste_org', 'upload', e);
      });
    },
    download: function (idOrUrl) {
      var s = String(idOrUrl || '').trim();
      var id = '';
      var rawUrl = '';
      try {
        if (s.indexOf('://') > 0) {
          var u = new URL(s, location.href);
          var p = String(u.pathname || '');
          if (p.indexOf('/raw') >= 0) rawUrl = s;
          var segs = p.split('/');
          var last = segs[segs.length - 1] || '';
          var prev = segs.length > 1 ? (segs[segs.length - 2] || '') : '';
          id = (last === 'raw') ? String(prev || '') : String(last || prev || '');
        } else {
          id = s;
        }
      } catch (_) { id = s; }

      if (!rawUrl) rawUrl = 'https://dpaste.org/' + String(id || '') + '/raw';
      return fetchWithTimeout(rawUrl, { method: 'GET' }, 14000).then(function (res) {
        if (!res || !res.ok) {
          var e = new Error('HTTP ' + (res ? res.status : 0));
          e.code = 'HTTP';
          e.status = res ? res.status : 0;
          throw e;
        }
        return res.text();
      }).then(function (txt) {
        return String(txt || '').trim();
      }).catch(function (e) {
        throw errorProvider('dpaste_org', 'download', e);
      });
    }
  };

  API.upload = function (providerId, payloadStr) {
    var pid = String(providerId || '');
    var p = API.providers[pid];
    if (!p || typeof p.upload !== 'function') return Promise.reject(new Error('unknown provider: ' + pid));
    return p.upload(String(payloadStr || ''));
  };

  API.download = function (providerId, idOrUrl) {
    var pid = String(providerId || '');
    var p = API.providers[pid];
    if (!p || typeof p.download !== 'function') return Promise.reject(new Error('unknown provider: ' + pid));
    return p.download(String(idOrUrl || ''));
  };

  API.history = API.history || {};

  API.history.list = function () {
    var doc = getHistoryDoc();
    var items = Array.isArray(doc.items) ? doc.items.slice(0) : [];
    try {
      items.sort(function (a, b) {
        var ta = a && a.ts ? Number(a.ts) : 0;
        var tb = b && b.ts ? Number(b.ts) : 0;
        return tb - ta;
      });
    } catch (_) { }
    return items;
  };

  API.history.add = function (item) {
    if (!isPlainObject(item)) return false;
    var doc = getHistoryDoc();
    var items = Array.isArray(doc.items) ? doc.items : [];

    var it = {
      ts: item.ts ? Number(item.ts) : Date.now(),
      provider: String(item.provider || ''),
      id: String(item.id || ''),
      bytes: item.bytes ? Number(item.bytes) : 0,
      schema: 1,
      keyHint: String(item.keyHint || ''),
      keyHash: String(item.keyHash || ''),
      note: String(item.note || '')
    };
    if (item.unsafeKey) it.unsafeKey = String(item.unsafeKey || '');

    try {
      for (var i = items.length - 1; i >= 0; i--) {
        if (!items[i]) continue;
        if (String(items[i].provider || '') === it.provider && String(items[i].id || '') === it.id) items.splice(i, 1);
      }
    } catch (_) { }

    items.unshift(it);
    if (items.length > HISTORY_MAX) items = items.slice(0, HISTORY_MAX);
    doc.items = items;
    return writeJson(HISTORY_KEY, doc);
  };

  API.history.remove = function (id) {
    var doc = getHistoryDoc();
    var items = Array.isArray(doc.items) ? doc.items : [];
    var sid = String(id || '');
    if (!sid) return false;
    var out = [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (!it) continue;
      if (String(it.id || '') === sid) continue;
      if (String(it.ts || '') === sid) continue;
      out.push(it);
    }
    doc.items = out;
    return writeJson(HISTORY_KEY, doc);
  };

  API.history.clear = function () {
    return writeJson(HISTORY_KEY, { v: 1, items: [] });
  };

  API.__keyHash = sha256PassHex;
})();
