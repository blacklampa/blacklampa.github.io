(function () {
  'use strict';

  var BL = window.BL = window.BL || {};
  BL.Auth = BL.Auth || {};

  // =========================
  // CONFIG
  // =========================
  // Single source of truth: BL.Config.auth.*
  var cfg = null;
  try { cfg = (BL.Config && typeof BL.Config.get === 'function') ? BL.Config.get() : BL.Config; } catch (_) { cfg = BL.Config; }
  cfg = cfg || {};
  var authCfg = cfg.auth || {};
  var AUTH_KEY = String(authCfg.key || '');
  // `bl.auth.json` is the only source of BlackLampa auth configuration.
  // Intentionally fixed to a single file name/path to keep the subsystem self-contained.
  var AUTH_JSON = String(authCfg.authJson || '');

  // =========================
  // STORAGE (Lampa)
  // =========================
  function getAuthed() {
    try { return !!(window.Lampa && Lampa.Storage && Lampa.Storage.get(AUTH_KEY)); }
    catch (e) { return false; }
  }

  function setAuthed(v) {
    try { window.Lampa && Lampa.Storage && Lampa.Storage.set(AUTH_KEY, v ? 1 : 0); }
    catch (e) { }
  }

  // =========================
  // URL helpers
  // =========================
  function baseDir() {
    try {
      var s = document.currentScript && document.currentScript.src ? String(document.currentScript.src) : '';
      if (!s) return '';
      return s.slice(0, s.lastIndexOf('/') + 1);
    } catch (_) { return ''; }
  }
  var BASE = baseDir();

  function abs(u) {
    try { return String(new URL(String(u), BASE || location.href).href); }
    catch (_) { return String(u); }
  }

  // =========================
  // AUTH LIST (JSON)
  // =========================
  // поддержка обеих структур:
  // 1) { "auth": [ {key, hash}, ... ] }
  // 2) [ { "auth": [ ... ] } ]
  var AUTH_LIST = [];

  function normalizeAuthJson(j) {
    try {
      if (!j) return [];
      if (Array.isArray(j)) {
        var out = [];
        for (var i = 0; i < j.length; i++) {
          var a = j[i] && j[i].auth;
          if (Array.isArray(a)) out = out.concat(a);
        }
        return out;
      }
      if (Array.isArray(j.auth)) return j.auth;
    } catch (_) { }
    return [];
  }

  function loadAuthList() {
    var url = abs(AUTH_JSON);
    return fetch(url, { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (j) { AUTH_LIST = normalizeAuthJson(j); })
      .catch(function () { AUTH_LIST = []; });
  }

  function findAuthEntry(key, hash) {
    for (var i = 0; i < AUTH_LIST.length; i++) {
      var a = AUTH_LIST[i];
      if (a && String(a.key || '') === String(key) && String(a.hash || '') === String(hash)) return a;
    }
    return null;
  }

  // =========================
  // BASE64 helpers
  // =========================
  function bytesToBase64(bytes) {
    // bytes: Uint8Array
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i] & 0xff);
    // btoa expects latin1
    return btoa(bin);
  }

  function hasWebCrypto() {
    try { return !!(window.crypto && crypto.subtle && window.TextEncoder); } catch (_) { return false; }
  }

  // =========================
  // SHA-256 (pure JS) -> base64
  // =========================
  // Minimal SHA-256 implementation (works in old/TV engines). Returns Uint8Array(32).
  function sha256BytesFallback(str) {
    // UTF-8 encode
    var utf8;
    try {
      utf8 = new TextEncoder().encode(str);
    } catch (_) {
      // old engines: manual UTF-8 encoding
      utf8 = (function (s) {
        var out = [];
        for (var i = 0; i < s.length; i++) {
          var c = s.charCodeAt(i);
          if (c < 0x80) out.push(c);
          else if (c < 0x800) {
            out.push(0xc0 | (c >> 6));
            out.push(0x80 | (c & 0x3f));
          } else if (c >= 0xd800 && c <= 0xdbff) {
            // surrogate pair
            var d = s.charCodeAt(++i);
            var cp = ((c - 0xd800) << 10) + (d - 0xdc00) + 0x10000;
            out.push(0xf0 | (cp >> 18));
            out.push(0x80 | ((cp >> 12) & 0x3f));
            out.push(0x80 | ((cp >> 6) & 0x3f));
            out.push(0x80 | (cp & 0x3f));
          } else {
            out.push(0xe0 | (c >> 12));
            out.push(0x80 | ((c >> 6) & 0x3f));
            out.push(0x80 | (c & 0x3f));
          }
        }
        return new Uint8Array(out);
      })(str);
    }

    // SHA-256
    function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }
    function ch(x, y, z) { return (x & y) ^ (~x & z); }
    function maj(x, y, z) { return (x & y) ^ (x & z) ^ (y & z); }
    function s0(x) { return rotr(x, 2) ^ rotr(x, 13) ^ rotr(x, 22); }
    function s1(x) { return rotr(x, 6) ^ rotr(x, 11) ^ rotr(x, 25); }
    function g0(x) { return rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3); }
    function g1(x) { return rotr(x, 17) ^ rotr(x, 19) ^ (x >>> 10); }

    var K = [
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
      0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ];

    var H0 = 0x6a09e667, H1 = 0xbb67ae85, H2 = 0x3c6ef372, H3 = 0xa54ff53a;
    var H4 = 0x510e527f, H5 = 0x9b05688c, H6 = 0x1f83d9ab, H7 = 0x5be0cd19;

    // Pre-processing (padding)
    var l = utf8.length;
    var bitLenHi = (l / 0x20000000) | 0; // (l*8) >> 32
    var bitLenLo = (l << 3) >>> 0;

    var withOne = l + 1;
    var padLen = (withOne % 64 <= 56) ? (56 - (withOne % 64)) : (56 + (64 - (withOne % 64)));
    var total = withOne + padLen + 8;

    var msg = new Uint8Array(total);
    msg.set(utf8, 0);
    msg[l] = 0x80;

    // append length (64-bit big-endian)
    msg[total - 8] = (bitLenHi >>> 24) & 0xff;
    msg[total - 7] = (bitLenHi >>> 16) & 0xff;
    msg[total - 6] = (bitLenHi >>> 8) & 0xff;
    msg[total - 5] = (bitLenHi >>> 0) & 0xff;
    msg[total - 4] = (bitLenLo >>> 24) & 0xff;
    msg[total - 3] = (bitLenLo >>> 16) & 0xff;
    msg[total - 2] = (bitLenLo >>> 8) & 0xff;
    msg[total - 1] = (bitLenLo >>> 0) & 0xff;

    var W = new Int32Array(64);

    for (var off = 0; off < msg.length; off += 64) {
      for (var i = 0; i < 16; i++) {
        var j = off + i * 4;
        W[i] = ((msg[j] << 24) | (msg[j + 1] << 16) | (msg[j + 2] << 8) | (msg[j + 3])) | 0;
      }
      for (i = 16; i < 64; i++) {
        W[i] = (g1(W[i - 2]) + W[i - 7] + g0(W[i - 15]) + W[i - 16]) | 0;
      }

      var a = H0, b = H1, c = H2, d = H3, e = H4, f = H5, g = H6, h = H7;

      for (i = 0; i < 64; i++) {
        var t1 = (h + s1(e) + ch(e, f, g) + K[i] + W[i]) | 0;
        var t2 = (s0(a) + maj(a, b, c)) | 0;
        h = g;
        g = f;
        f = e;
        e = (d + t1) | 0;
        d = c;
        c = b;
        b = a;
        a = (t1 + t2) | 0;
      }

      H0 = (H0 + a) | 0;
      H1 = (H1 + b) | 0;
      H2 = (H2 + c) | 0;
      H3 = (H3 + d) | 0;
      H4 = (H4 + e) | 0;
      H5 = (H5 + f) | 0;
      H6 = (H6 + g) | 0;
      H7 = (H7 + h) | 0;
    }

    var out = new Uint8Array(32);
    function put32(i, v) {
      out[i] = (v >>> 24) & 0xff;
      out[i + 1] = (v >>> 16) & 0xff;
      out[i + 2] = (v >>> 8) & 0xff;
      out[i + 3] = (v >>> 0) & 0xff;
    }
    put32(0, H0); put32(4, H1); put32(8, H2); put32(12, H3);
    put32(16, H4); put32(20, H5); put32(24, H6); put32(28, H7);
    return out;
  }

  // =========================
  // SHA-256 base64 (WebCrypto OR fallback)
  // =========================
  function sha256Base64(str) {
    // Prefer WebCrypto
    if (hasWebCrypto()) {
      var enc = new TextEncoder().encode(str);
      return crypto.subtle.digest('SHA-256', enc).then(function (buf) {
        return bytesToBase64(new Uint8Array(buf));
      });
    }

    // Fallback (sync) but return Promise for API compatibility
    return new Promise(function (resolve) {
      try {
        var bytes = sha256BytesFallback(String(str));
        resolve(bytesToBase64(bytes));
      } catch (_) {
        // last-ditch: return empty (will never match)
        resolve('');
      }
    });
  }

  // =========================
  // INTERNAL GUARDS
  // =========================
  var mainStarted = false;
  var keyGuardInstalled = false;
  var rescueTimer = null;
  var onOk = function () { };

  function startMainOnce() {
    if (mainStarted) return;
    mainStarted = true;
    try { onOk(true); } catch (_) { }
  }

  // =========================
  // UI
  // =========================
  var ui = {
    wrap: null,
    inp: null,
    bEnter: null,
    bUnlock: null,
    err: null,
    sel: 0,
    hashBox: null,
    hashText: null,
    hashCopy: null,

    // LIVE HASH (added)
    liveTimer: null,
    liveSeq: 0,
    lastPlain: '',
    lastHash: ''
  };

  function blurInputHard() {
    if (!ui.inp) return;
    try { ui.inp.blur(); } catch (_) { }
    try { ui.inp.setAttribute('readonly', 'readonly'); } catch (_) { }
    setTimeout(function () {
      try { ui.inp && ui.inp.removeAttribute('readonly'); } catch (_) { }
    }, 0);
  }

  function setSel(n) {
    // COPY: selectable only when visible + exists
    var maxSel = 1;
    try {
      if (ui.hashCopy && ui.hashBox && ui.hashBox.style && ui.hashBox.style.display !== 'none') maxSel = 2;
    } catch (_) { }

    if (n < 0) n = 0;
    if (n > maxSel) n = maxSel;
    ui.sel = n;

    var a = ui.bEnter, b = ui.bUnlock, c = ui.hashCopy;
    [a, b, c].forEach(function (x) {
      if (!x) return;
      x.style.outline = 'none';
      x.style.background = 'transparent';
    });

    var on = (ui.sel === 0) ? a : (ui.sel === 1) ? b : c;
    if (on) {
      on.style.outline = '2px solid rgba(255,255,255,.65)';
      on.style.background = 'rgba(255,255,255,.08)';
      if (on.focus) on.focus();
    }

    if (ui.sel !== 0) blurInputHard();
  }

  function showHashPair(key, hash) {
    if (!ui.hashBox || !ui.hashText || !ui.hashCopy) return;

    var pair = '{"key":"' + String(key) + '","hash":"' + String(hash) + '"}';
    ui.hashText.textContent = pair;
    ui.hashBox.style.display = 'block';

    ui.hashCopy.onclick = function () {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(pair);
        }
      } catch (_) { }
    };
  }

  // LIVE HASH (added): подсветка совпадения, без изменения HTML
  function setLiveHighlight(isMatch) {
    if (!ui.hashBox || !ui.hashText) return;
    ui.hashText.style.color = isMatch ? 'rgba(140,255,170,.95)' : 'rgba(255,170,170,.95)';
    ui.hashBox.style.opacity = isMatch ? '.95' : '.8';
  }

  // LIVE HASH (added): хэш на лету по вводу (debounce + защита от гонок)
  function liveHashFromInput() {
    if (!ui.inp) return;

    var v = String(ui.inp.value || '').trim();
    ui.lastPlain = v;

    if (!v) {
      try { ui.hashBox && (ui.hashBox.style.display = 'none'); } catch (_) { }
      return;
    }

    if (ui.liveTimer) clearTimeout(ui.liveTimer);
    var seq = ++ui.liveSeq;

    ui.liveTimer = setTimeout(function () {
      sha256Base64(v).then(function (hash) {
        if (seq !== ui.liveSeq) return;
        if (String(ui.lastPlain || '') !== v) return;

        ui.lastHash = hash;

        showHashPair(AUTH_KEY, hash);
        setLiveHighlight(!!findAuthEntry(AUTH_KEY, hash));
      }).catch(function () { });
    }, 140);
  }

  function ensureOverlay() {
    if (document.getElementById('msx_fake_lock')) return;

    var wrap = document.createElement('div');
    wrap.id = 'msx_fake_lock';
    wrap.style.cssText = [
      'position:fixed', 'top:0', 'left:0', 'right:0', 'bottom:0',
      'z-index:2147483647',
      'background:rgba(0,0,0,.92)',
      'display:flex', 'align-items:center', 'justify-content:center',
      'padding:24px', 'box-sizing:border-box'
    ].join(';');

    var box = document.createElement('div');
    box.style.cssText = [
      'width:100%', 'max-width:520px',
      'border:1px solid rgba(255,255,255,.15)',
      'border-radius:16px',
      'padding:18px',
      'box-sizing:border-box',
      'color:#fff',
      'font:16px/1.35 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif'
    ].join(';');

    box.innerHTML =
      '<div style="font-size:22px;margin-bottom:10px">Locked</div>' +
      '<div style="opacity:.8;margin-bottom:14px">Enter password</div>' +
      '<input id="msx_pw_inp" type="password" placeholder="password" autocomplete="off" autocapitalize="none" spellcheck="false" style="' +
      'width:100%;padding:12px 14px;background:#111;' +
      'border:1px solid rgba(255,255,255,.18);border-radius:12px;' +
      'color:#fff;outline:none;box-sizing:border-box;' +
      '"/>' +
      '<div style="margin-top:12px;display:flex;gap:10px">' +
      '<div id="msx_btn_enter" style="' +
      'flex:1;display:flex;align-items:center;justify-content:center;' +
      'padding:12px 14px;border:1px solid rgba(255,255,255,.22);' +
      'border-radius:12px;user-select:none;' +
      '">Enter</div>' +
      '<div id="msx_btn_unlock" style="' +
      'flex:1;display:flex;align-items:center;justify-content:center;' +
      'padding:12px 14px;border:1px solid rgba(255,255,255,.22);' +
      'border-radius:12px;user-select:none;' +
      '">Unlock</div>' +
      '</div>' +
      '<div id="msx_pw_err" style="margin-top:10px;opacity:.85;display:none;color:#ff6b6b">Wrong password</div>' +
      '<div id="msx_hash_box" style="' +
      'margin-top:10px;display:none;font-size:16px;opacity:.65;' +
      'word-break:break-all;user-select:text' +
      '">' +
      '<div id="msx_hash_text" style="margin-bottom:8px;"></div>' +
      '<div id="msx_hash_copy" style="' +
      'flex:1;display:flex;align-items:center;justify-content:center;' +
      'padding:12px 14px;border:1px solid rgba(255,255,255,.22);' +
      'border-radius:12px;user-select:none;' +
      '">' +
      '📋 Copy' +
      '</div>' +
      '</div>' +
      '<div style="margin-top:10px;opacity:.55;font-size:12px">TV: use arrows and OK</div>';

    wrap.appendChild(box);
    document.body.appendChild(wrap);

    ui.wrap = wrap;
    ui.inp = box.querySelector('#msx_pw_inp');
    ui.bEnter = box.querySelector('#msx_btn_enter');
    ui.bUnlock = box.querySelector('#msx_btn_unlock');
    ui.err = box.querySelector('#msx_pw_err');

    ui.hashBox = box.querySelector('#msx_hash_box');
    ui.hashText = box.querySelector('#msx_hash_text');
    ui.hashCopy = box.querySelector('#msx_hash_copy');

    try {
      if (ui.hashCopy) {
        ui.hashCopy.setAttribute('tabindex', '0');
        ui.hashCopy.setAttribute('role', 'button');
      }
    } catch (_) { }

    blurInputHard();
    setSel(0);

    ui.bEnter.addEventListener('click', function () { focusInput(); }, true);
    ui.bUnlock.addEventListener('click', function () { submit(); }, true);

    ui.inp.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || (e.keyCode || 0) === 13) submit();
    }, true);

    ui.inp.addEventListener('input', liveHashFromInput, true);
    ui.inp.addEventListener('keyup', liveHashFromInput, true);
  }

  function focusInput() {
    if (!ui.inp) return;
    try { ui.err && (ui.err.style.display = 'none'); } catch (_) { }
    setSel(0);
    try { ui.inp.focus(); } catch (_) { }
    liveHashFromInput();
  }

  function submit() {
    if (!ui.inp) return;

    blurInputHard();

    var v = String(ui.inp.value || '').trim();
    if (!v) return;

    sha256Base64(v).then(function (hash) {
      showHashPair(AUTH_KEY, hash);

      if (findAuthEntry(AUTH_KEY, hash)) {
        setAuthed(true);
        detachKeyGuard();
        try { ui.wrap && ui.wrap.remove(); } catch (_) { }
        startMainOnce();
      } else {
        try { ui.err && (ui.err.style.display = 'block'); } catch (_) { }
        try { ui.err && (ui.err.textContent = 'Wrong password'); } catch (_) { }
        try { ui.inp.value = ''; } catch (_) { }
        setSel(0);
        blurInputHard();
      }
    }).catch(function () {
      try { ui.err && (ui.err.style.display = 'block'); } catch (_) { }
      try { ui.err && (ui.err.textContent = 'Auth error'); } catch (_) { }
    });
  }

  // =========================
  // KEY GUARD
  // =========================
  function isNavKeyCode(k) {
    return (
      k === 38 || k === 40 || k === 37 || k === 39 ||
      k === 19 || k === 20 || k === 21 || k === 22 ||
      k === 13 || k === 23 ||
      k === 27 || k === 8 || k === 461 || k === 10009
    );
  }

  function keyGuardHandler(e) {
    if (!document.getElementById('msx_fake_lock')) return;

    var k = e.keyCode || 0;
    var t = e.target;

    var isInput = t && (t.id === 'msx_pw_inp' || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);

    if (isInput && !isNavKeyCode(k)) {
      e.stopImmediatePropagation();
      return;
    }

    e.preventDefault();
    e.stopImmediatePropagation();

    if (k === 37 || k === 21) { setSel(0); return; }
    if (k === 39 || k === 22) { setSel(1); return; }

    if (k === 40 || k === 20) { setSel(ui.sel + 1); return; }
    if (k === 38 || k === 19) { setSel(ui.sel - 1); return; }

    if (k === 13 || k === 23) {
      if (ui.sel === 0) focusInput();
      else if (ui.sel === 1) submit();
      else if (ui.sel === 2 && ui.hashCopy) ui.hashCopy.click();
      return;
    }
  }

  function attachKeyGuard() {
    if (keyGuardInstalled) return;
    keyGuardInstalled = true;
    window.addEventListener('keydown', keyGuardHandler, true);
  }

  function detachKeyGuard() {
    if (!keyGuardInstalled) return;
    keyGuardInstalled = false;
    window.removeEventListener('keydown', keyGuardHandler, true);
  }

  // =========================
  // STABILITY
  // =========================
  function watchOverlay() {
    if (rescueTimer) return;
    rescueTimer = setInterval(function () {
      if (getAuthed()) return;
      if (!document.body) return;
      if (!document.getElementById('msx_fake_lock')) ensureOverlay();
    }, 400);
  }

  // =========================
  // BOOT
  // =========================
  function BOOT() {
    if (getAuthed()) { startMainOnce(); return; }
    if (!document.body) { setTimeout(BOOT, 50); return; }

    attachKeyGuard();
    ensureOverlay();
    watchOverlay();
  }

  var startPromise = null;

  BL.Auth.start = function (opts) {
    opts = opts || {};

    if (startPromise) return startPromise;

    try {
      if (opts && typeof opts.key === 'string' && opts.key) {
        AUTH_KEY = String(opts.key);
        try {
          var c1 = null;
          try { c1 = (BL.Config && typeof BL.Config.get === 'function') ? BL.Config.get() : BL.Config; } catch (_) { c1 = BL.Config; }
          if (c1) {
            c1.auth = c1.auth || {};
            c1.auth.key = AUTH_KEY;
          }
        } catch (_) { }
      }
      if (opts && typeof opts.authJson === 'string' && opts.authJson) {
        AUTH_JSON = String(opts.authJson);
        try {
          var c2 = null;
          try { c2 = (BL.Config && typeof BL.Config.get === 'function') ? BL.Config.get() : BL.Config; } catch (_) { c2 = BL.Config; }
          if (c2) {
            c2.auth = c2.auth || {};
            c2.auth.authJson = AUTH_JSON;
          }
        } catch (_) { }
      }
    } catch (_) { }

    startPromise = new Promise(function (resolve) {
      onOk = resolve;
      loadAuthList().then(BOOT);
    });

    return startPromise;
  };

  BL.Auth.getKey = function () { return AUTH_KEY; };
  BL.Auth.getAuthed = getAuthed;
})();
