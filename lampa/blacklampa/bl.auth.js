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
  // SHA-256 base64 (WebCrypto ONLY)
  // =========================
  function sha256Base64(str) {
    var enc = new TextEncoder().encode(str);
    return crypto.subtle.digest('SHA-256', enc).then(function (buf) {
      var bytes = new Uint8Array(buf);
      var bin = '';
      for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      return btoa(bin);
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
    // зелёный/красный делаем только стилями существующих элементов
    ui.hashText.style.color = isMatch ? 'rgba(140,255,170,.95)' : 'rgba(255,170,170,.95)';
    ui.hashBox.style.opacity = isMatch ? '.95' : '.8';
  }

  // LIVE HASH (added): хэш на лету по вводу (debounce + защита от гонок)
  function liveHashFromInput() {
    if (!ui.inp) return;

    var v = String(ui.inp.value || '').trim();
    ui.lastPlain = v;

    if (!v) {
      // ничего не показываем/не подсвечиваем если пусто
      try { ui.hashBox && (ui.hashBox.style.display = 'none'); } catch (_) { }
      return;
    }

    // crypto must exist
    if (!(window.crypto && crypto.subtle && window.TextEncoder)) return;

    if (ui.liveTimer) clearTimeout(ui.liveTimer);
    var seq = ++ui.liveSeq;

    ui.liveTimer = setTimeout(function () {
      sha256Base64(v).then(function (hash) {
        // если за время вычисления ввод изменился — игнор
        if (seq !== ui.liveSeq) return;
        if (String(ui.lastPlain || '') !== v) return;

        ui.lastHash = hash;

        // показываем пару сразу
        showHashPair(AUTH_KEY, hash);

        // live-highlight: совпадает ли с JSON
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

      // hash pair (no focus, no inputs)
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

    // COPY: make focusable for TV engines that respect focus() / tabindex
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

    // LIVE HASH (added): вывод пары на лету
    ui.inp.addEventListener('input', liveHashFromInput, true);
    ui.inp.addEventListener('keyup', liveHashFromInput, true); // на некоторых ТВ input бывает кривой
  }

  function focusInput() {
    if (!ui.inp) return;
    try { ui.err && (ui.err.style.display = 'none'); } catch (_) { }
    setSel(0);
    try { ui.inp.focus(); } catch (_) { }

    // LIVE HASH (added): при фокусе тоже обновим (если уже что-то введено)
    liveHashFromInput();
  }

  function submit() {
    if (!ui.inp) return;

    blurInputHard();

    var v = String(ui.inp.value || '').trim();
    if (!v) return;

    // crypto must exist
    if (!(window.crypto && crypto.subtle && window.TextEncoder)) {
      try { ui.err && (ui.err.style.display = 'block'); } catch (_) { }
      try { ui.err && (ui.err.textContent = 'No WebCrypto'); } catch (_) { }
      return;
    }

    sha256Base64(v).then(function (hash) {
      // показываем пару для добавления в JSON
      showHashPair(AUTH_KEY, hash);

      if (findAuthEntry(AUTH_KEY, hash)) {
        setAuthed(true);
        detachKeyGuard();
        try { ui.wrap && ui.wrap.remove(); } catch (_) { }
        startMainOnce();
      } else {
        try { ui.err && (ui.err.style.display = 'block'); } catch (_) { }
        try { ui.inp.value = ''; } catch (_) { }
        setSel(0);
        blurInputHard();
      }
    }).catch(function () {
      try { ui.err && (ui.err.style.display = 'block'); } catch (_) { }
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

    // left/right keep old behavior (Enter/Unlock row)
    if (k === 37 || k === 21) { setSel(0); return; }
    if (k === 39 || k === 22) { setSel(1); return; }

    // up/down: cycle through Enter -> Unlock -> Copy (when visible)
    if (k === 40 || k === 20) { setSel(ui.sel + 1); return; } // вниз
    if (k === 38 || k === 19) { setSel(ui.sel - 1); return; } // вверх

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
