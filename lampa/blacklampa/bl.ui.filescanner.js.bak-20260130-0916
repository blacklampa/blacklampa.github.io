(function () {
  'use strict';

  var BL = window.BL = window.BL || {};
  BL.FileScanner = BL.FileScanner || {};

  var API = BL.FileScanner;

  var CFG = {
    jsonFile: 'bl.filescan.json',
    timeoutMs: 3500,
    yieldEvery: 2,
    contentMaxChars: 200000,
    contentMaxLines: 800
  };

  var STATE = {
    inited: false,
    open: false,
    keyHandlerInstalled: false,

    styleEl: null,
    rootEl: null,
    listScrollEl: null,
    listEl: null,
    contentColEl: null,
    contentTitleEl: null,
    contentStateEl: null,
    contentScrollEl: null,
    contentPreEl: null,
    footerEl: null,

    focusZone: 'list', // list | content
    nowrap: false,
    selectedIndex: 0,

    items: [],
    rows: [],
    cache: Object.create(null), // url -> { state, text, errCode, err, ts, truncated }

    queue: [],
    workerRunning: false,
    workerSeq: 0,
    workerTimer: null,
    scanTotal: 0,
    scanDone: 0,

    currentAbort: null,
    currentAbortTimer: null,
    currentXhr: null,

    listPromise: null
  };

  function safe(fn, fallback) { try { return fn(); } catch (_) { return fallback; } }

  function abs(u) {
    try { return String(new URL(String(u), (BL.ctx && BL.ctx.base) ? String(BL.ctx.base) : location.href).href); }
    catch (_) { return String(u || ''); }
  }

  function isBackKeyCode(k) {
    return k === 27 || k === 8 || k === 461 || k === 10009;
  }

  function isOkKeyCode(k) {
    return k === 13 || k === 23;
  }

  function clamp(n, a, b) {
    if (n < a) return a;
    if (n > b) return b;
    return n;
  }

  function getPopupZIndex() {
    try {
      var cfg = null;
      try { cfg = (BL.Config && typeof BL.Config.get === 'function') ? BL.Config.get() : BL.Config; } catch (_) { cfg = BL.Config; }
      cfg = cfg || {};
      var uiCfg = cfg.ui || {};
      if (typeof uiCfg.popupZIndex === 'number') return uiCfg.popupZIndex + 3;
    } catch (_) { }
    return 100000 + 3;
  }

  function ensureStyle() {
    try {
      if (STATE.styleEl) return;
      if (!document || !document.createElement) return;

      var st = document.createElement('style');
      st.type = 'text/css';
      st.id = '__bl_fs_style';
      st.textContent = [
        '.bl_fs_root{position:fixed;top:18px;left:18px;right:18px;bottom:18px;display:none;background:rgba(0,0,0,0.70);color:#fff;z-index:100000;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;}',
        '.bl_fs_panel{position:absolute;top:0;left:0;right:0;bottom:0;display:flex;flex-direction:column;background:rgba(20,20,20,0.97);border:1px solid rgba(255,255,255,0.10);border-radius:14px;overflow:hidden;}',
        '.bl_fs_header{padding:10px 12px;border-bottom:1px solid rgba(255,255,255,0.10);}',
        '.bl_fs_title{font-size:16px;font-weight:650;letter-spacing:0.2px;}',
        '.bl_fs_help{margin-top:4px;font-size:12px;opacity:0.85;}',
        '.bl_fs_body{flex:1;min-height:0;display:flex;}',
        '.bl_fs_col{min-height:0;display:flex;flex-direction:column;}',
        '.bl_fs_list_col{width:42%;min-width:320px;border-right:1px solid rgba(255,255,255,0.10);}',
        '.bl_fs_list_scroll{flex:1;min-height:0;overflow:auto;}',
        '.bl_fs_list{display:flex;flex-direction:column;}',
        '.bl_fs_row{display:flex;gap:10px;align-items:center;padding:8px 10px;border-bottom:1px solid rgba(255,255,255,0.06);}',
        '.bl_fs_row_main{flex:1;min-width:0;}',
        '.bl_fs_row_url{font-size:12px;word-break:break-all;}',
        '.bl_fs_row_tag{font-size:11px;opacity:0.70;margin-top:2px;}',
        '.bl_fs_row_status{flex:0 0 auto;font-size:11px;padding:2px 7px;border-radius:999px;border:1px solid rgba(255,255,255,0.18);opacity:0.95;}',
        '.bl_fs_row_sel{background:rgba(64,169,255,0.18);}',
        '.bl_fs_row_state_ok .bl_fs_row_status{color:#52c41a;border-color:rgba(82,196,26,0.70);}',
        '.bl_fs_row_state_loading .bl_fs_row_status{color:#ffa940;border-color:rgba(255,169,64,0.75);}',
        '.bl_fs_row_state_unknown .bl_fs_row_status{color:#8c8c8c;border-color:rgba(140,140,140,0.55);}',
        '.bl_fs_row_state_missing .bl_fs_row_status{color:#ff4d4f;border-color:rgba(255,77,79,0.75);}',
        '.bl_fs_row_state_blocked .bl_fs_row_status{color:#ff4d4f;border-color:rgba(255,77,79,0.75);}',
        '.bl_fs_row_state_timeout .bl_fs_row_status{color:#ff4d4f;border-color:rgba(255,77,79,0.75);}',
        '.bl_fs_row_state_err .bl_fs_row_status{color:#ff4d4f;border-color:rgba(255,77,79,0.75);}',
        '.bl_fs_content_col{flex:1;min-width:0;}',
        '.bl_fs_content_head{display:flex;gap:10px;align-items:baseline;padding:10px 12px;border-bottom:1px solid rgba(255,255,255,0.10);}',
        '.bl_fs_content_title{flex:1;min-width:0;font-size:12px;opacity:0.92;word-break:break-all;}',
        '.bl_fs_content_state{flex:0 0 auto;font-size:11px;opacity:0.92;}',
        '.bl_fs_content_scroll{flex:1;min-height:0;overflow:auto;padding:10px 12px;}',
        '.bl_fs_content_pre{margin:0;font:12px/1.35 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;white-space:pre-wrap;}',
        '.bl_fs_nowrap .bl_fs_content_pre{white-space:pre;}',
        '.bl_fs_footer{padding:8px 12px;border-top:1px solid rgba(255,255,255,0.10);font-size:12px;opacity:0.92;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
        '.bl_fs_focus_list .bl_fs_list_col{box-shadow:inset 0 0 0 2px rgba(64,169,255,0.55);}',
        '.bl_fs_focus_content .bl_fs_content_col{box-shadow:inset 0 0 0 2px rgba(64,169,255,0.55);}'
      ].join('');

      (document.head || document.documentElement).appendChild(st);
      STATE.styleEl = st;
    } catch (_) { }
  }

  function ensureDom() {
    try {
      if (STATE.rootEl) return;
      if (!document || !document.createElement) return;

      ensureStyle();

      var root = document.createElement('div');
      root.id = '__bl_fs_root';
      root.className = 'bl_fs_root bl_fs_focus_list';
      root.style.zIndex = String(getPopupZIndex());
      root.innerHTML = [
        '<div class="bl_fs_panel">',
          '<div class="bl_fs_header">',
            '<div class="bl_fs_title">Filesystem Scan</div>',
            '<div class="bl_fs_help">OK=refresh • ↑↓ list/content • ←→ focus • BACK=close</div>',
          '</div>',
          '<div class="bl_fs_body">',
            '<div class="bl_fs_col bl_fs_list_col">',
              '<div class="bl_fs_list_scroll"><div class="bl_fs_list"></div></div>',
            '</div>',
            '<div class="bl_fs_col bl_fs_content_col">',
              '<div class="bl_fs_content_head">',
                '<div class="bl_fs_content_title"></div>',
                '<div class="bl_fs_content_state"></div>',
              '</div>',
              '<div class="bl_fs_content_scroll"><pre class="bl_fs_content_pre"></pre></div>',
            '</div>',
          '</div>',
          '<div class="bl_fs_footer"></div>',
        '</div>'
      ].join('');

      (document.body || document.documentElement).appendChild(root);

      STATE.rootEl = root;
      STATE.listScrollEl = root.querySelector('.bl_fs_list_scroll');
      STATE.listEl = root.querySelector('.bl_fs_list');
      STATE.contentColEl = root.querySelector('.bl_fs_content_col');
      STATE.contentTitleEl = root.querySelector('.bl_fs_content_title');
      STATE.contentStateEl = root.querySelector('.bl_fs_content_state');
      STATE.contentScrollEl = root.querySelector('.bl_fs_content_scroll');
      STATE.contentPreEl = root.querySelector('.bl_fs_content_pre');
      STATE.footerEl = root.querySelector('.bl_fs_footer');
    } catch (_) { }
  }

  function setOpen(on) {
    try {
      STATE.open = !!on;
      if (STATE.rootEl) STATE.rootEl.style.display = STATE.open ? 'block' : 'none';
    } catch (_) { }
  }

  function setFocus(zone) {
    zone = (zone === 'content') ? 'content' : 'list';
    STATE.focusZone = zone;
    try {
      if (!STATE.rootEl) return;
      STATE.rootEl.classList.remove('bl_fs_focus_list');
      STATE.rootEl.classList.remove('bl_fs_focus_content');
      STATE.rootEl.classList.add(zone === 'content' ? 'bl_fs_focus_content' : 'bl_fs_focus_list');
    } catch (_) { }
  }

  function setNowrap(on) {
    STATE.nowrap = !!on;
    try {
      if (!STATE.rootEl) return;
      if (STATE.nowrap) STATE.rootEl.classList.add('bl_fs_nowrap');
      else STATE.rootEl.classList.remove('bl_fs_nowrap');
    } catch (_) { }
  }

  function stateClass(state) {
    if (state === 'OK') return 'ok';
    if (state === 'LOADING') return 'loading';
    if (state === 'MISSING') return 'missing';
    if (state === 'BLOCKED') return 'blocked';
    if (state === 'TIMEOUT') return 'timeout';
    if (state === 'ERR') return 'err';
    return 'unknown';
  }

  function stateLabel(entry) {
    try {
      if (!entry || !entry.state) return 'UNKNOWN';
      if (entry.state === 'OK') return 'OK';
      if (entry.state === 'LOADING') return 'LOADING';
      if (entry.state === 'MISSING') return 'MISSING';
      if (entry.state === 'BLOCKED') return 'BLOCKED';
      if (entry.state === 'TIMEOUT') return 'TIMEOUT';
      if (entry.state === 'ERR') return entry.errCode ? String(entry.errCode) : 'ERR';
      return 'UNKNOWN';
    } catch (_) {
      return 'UNKNOWN';
    }
  }

  function ensureCache(url) {
    if (!url) return null;
    if (!STATE.cache[url]) STATE.cache[url] = { state: 'UNKNOWN', text: '', errCode: '', err: '', ts: 0, truncated: false };
    return STATE.cache[url];
  }

  function updateFooter() {
    try {
      if (!STATE.footerEl) return;

      var total = STATE.items.length || 0;
      var ok = 0, missing = 0, err = 0, loading = 0, unknown = 0;

      for (var i = 0; i < total; i++) {
        var u = STATE.items[i] ? String(STATE.items[i].url || '') : '';
        if (!u) continue;
        var c = STATE.cache[u];
        var st = c && c.state ? c.state : 'UNKNOWN';

        if (st === 'OK') ok++;
        else if (st === 'LOADING') loading++;
        else if (st === 'MISSING') missing++;
        else if (st === 'UNKNOWN') unknown++;
        else err++;
      }

      var parts = [];
      parts.push(String(ok) + '/' + String(total) + ' ok');
      parts.push(String(missing) + ' missing');
      parts.push(String(err) + ' errors');
      if (loading) parts.push(String(loading) + ' loading');
      if (unknown) parts.push(String(unknown) + ' unknown');
      if (STATE.workerRunning && STATE.scanTotal) parts.push('scan ' + String(STATE.scanDone) + '/' + String(STATE.scanTotal));

      STATE.footerEl.textContent = parts.join(' \u2022 ');
    } catch (_) { }
  }

  function updateRow(i) {
    try {
      var row = STATE.rows[i];
      var it = STATE.items[i];
      if (!row || !it) return;

      var u = String(it.url || '');
      var c = ensureCache(u);
      var st = c ? c.state : 'UNKNOWN';
      var sc = stateClass(st);

      row.classList.remove('bl_fs_row_state_ok', 'bl_fs_row_state_loading', 'bl_fs_row_state_unknown', 'bl_fs_row_state_missing', 'bl_fs_row_state_blocked', 'bl_fs_row_state_timeout', 'bl_fs_row_state_err');
      row.classList.add('bl_fs_row_state_' + sc);

      var statusEl = row.querySelector('.bl_fs_row_status');
      if (statusEl) statusEl.textContent = stateLabel(c);
    } catch (_) { }
  }

  function updateAllRows() {
    for (var i = 0; i < STATE.rows.length; i++) updateRow(i);
    updateFooter();
  }

  function setSelectedIndex(next) {
    try {
      var max = (STATE.items.length || 0) - 1;
      if (max < 0) max = 0;
      next = clamp(next, 0, max);

      var prev = STATE.selectedIndex || 0;
      if (next === prev) return;

      STATE.selectedIndex = next;

      var pr = STATE.rows[prev];
      if (pr) pr.classList.remove('bl_fs_row_sel');

      var nr = STATE.rows[next];
      if (nr) nr.classList.add('bl_fs_row_sel');

      // reset content scroll to top on file switch
      try { if (STATE.contentScrollEl) STATE.contentScrollEl.scrollTop = 0; } catch (_) { }
    } catch (_) { }
  }

  function ensureSelectedVisible() {
    try {
      if (!STATE.listScrollEl) return;
      var row = STATE.rows[STATE.selectedIndex || 0];
      if (!row) return;

      var top = row.offsetTop;
      var bottom = top + row.offsetHeight;
      var viewTop = STATE.listScrollEl.scrollTop;
      var viewBottom = viewTop + STATE.listScrollEl.clientHeight;

      if (top < viewTop) STATE.listScrollEl.scrollTop = top;
      else if (bottom > viewBottom) STATE.listScrollEl.scrollTop = Math.max(0, bottom - STATE.listScrollEl.clientHeight);
    } catch (_) { }
  }

  function formatContentText(text, truncated) {
    try {
      var s = String(text || '');
      if (!s) s = '';

      // Guard: too long -> cut chars first (cheap).
      if (s.length > CFG.contentMaxChars) {
        s = s.slice(0, CFG.contentMaxChars);
        truncated = true;
      }

      // Guard: too many lines -> cut lines.
      var lines = s.split('\n');
      if (lines.length > CFG.contentMaxLines) {
        s = lines.slice(0, CFG.contentMaxLines).join('\n');
        truncated = true;
      }

      if (truncated) s += '\n\n(truncated)';
      return s;
    } catch (_) {
      return '';
    }
  }

  function renderContent() {
    try {
      if (!STATE.contentPreEl || !STATE.contentTitleEl || !STATE.contentStateEl) return;

      var it = STATE.items[STATE.selectedIndex || 0];
      if (!it) {
        STATE.contentTitleEl.textContent = '';
        STATE.contentStateEl.textContent = '';
        STATE.contentPreEl.textContent = '';
        return;
      }

      var url = String(it.url || '');
      var c = ensureCache(url);

      STATE.contentTitleEl.textContent = url;
      STATE.contentStateEl.textContent = stateLabel(c);

      if (!c || c.state === 'UNKNOWN') {
        STATE.contentPreEl.textContent = 'UNKNOWN: ' + url + '\nPress OK to load.';
        return;
      }
      if (c.state === 'LOADING') {
        STATE.contentPreEl.textContent = 'Loading...\n' + url;
        return;
      }
      if (c.state === 'OK') {
        STATE.contentPreEl.textContent = formatContentText(c.text, !!c.truncated);
        return;
      }

      // error states
      var reason = '';
      try { reason = c.err ? String(c.err) : ''; } catch (_) { reason = ''; }
      if (!reason) reason = c.errCode ? String(c.errCode) : 'error';
      STATE.contentPreEl.textContent = String(c.state || 'ERR') + ': ' + url + '\nReason: ' + reason;
    } catch (_) { }
  }

  function buildList() {
    try {
      if (!STATE.listEl) return;
      STATE.listEl.innerHTML = '';
      STATE.rows = [];

      for (var i = 0; i < STATE.items.length; i++) {
        (function (idx) {
          var it = STATE.items[idx];
          if (!it) return;

          var row = document.createElement('div');
          row.className = 'bl_fs_row bl_fs_row_state_unknown';
          row.setAttribute('data-index', String(idx));

          var main = document.createElement('div');
          main.className = 'bl_fs_row_main';

          var urlEl = document.createElement('div');
          urlEl.className = 'bl_fs_row_url';
          urlEl.textContent = String(it.url || '');

          var tagEl = document.createElement('div');
          tagEl.className = 'bl_fs_row_tag';
          tagEl.textContent = String(it.tag || '');

          var stEl = document.createElement('div');
          stEl.className = 'bl_fs_row_status';
          stEl.textContent = 'UNKNOWN';

          main.appendChild(urlEl);
          main.appendChild(tagEl);

          row.appendChild(main);
          row.appendChild(stEl);

          row.addEventListener('click', function () {
            try {
              setFocus('list');
              setSelectedIndex(idx);
              if (STATE.rows[idx]) STATE.rows[idx].classList.add('bl_fs_row_sel');
              ensureSelectedVisible();
              renderContent();
            } catch (_) { }
          }, false);

          STATE.listEl.appendChild(row);
          STATE.rows[idx] = row;
        })(i);
      }

      // selection highlight
      var si = STATE.selectedIndex || 0;
      if (STATE.rows[si]) STATE.rows[si].classList.add('bl_fs_row_sel');
    } catch (_) { }
  }

  function loadListOnce() {
    if (STATE.listPromise) return STATE.listPromise;

    STATE.listPromise = new Promise(function (resolve) {
      try {
        var url = abs(CFG.jsonFile);

        var loadJson = null;
        try { loadJson = (BL.Core && typeof BL.Core.loadJson === 'function') ? BL.Core.loadJson : null; } catch (_) { loadJson = null; }

        var p = null;
        if (loadJson) p = loadJson(url, { cache: 'no-store' });
        else if (window.fetch) {
          p = fetch(url, { cache: 'no-store' }).then(function (r) { return r.json(); });
        }

        if (p) {
          p.then(function (obj) {
            try {
              var items = (obj && obj.items && Array.isArray(obj.items)) ? obj.items : [];
              var out = [];

              for (var i = 0; i < items.length; i++) {
                var it = items[i];
                if (!it || typeof it.url !== 'string') continue;
                var u = String(it.url || '').trim();
                if (!u) continue;
                out.push({ url: u, tag: (typeof it.tag === 'string') ? String(it.tag || '') : '' });
              }

              // Keep JSON order (already sorted by generator), but still normalize selection bounds.
              STATE.items = out;
              if (STATE.selectedIndex >= STATE.items.length) STATE.selectedIndex = 0;

              for (var j = 0; j < STATE.items.length; j++) ensureCache(String(STATE.items[j].url || ''));

              buildList();
              updateAllRows();
              renderContent();
              resolve(true);
            } catch (_) {
              resolve(false);
            }
          }).catch(function () {
            resolve(false);
          });
          return;
        }

        // XHR fallback (very old environments)
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.onreadystatechange = function () {
          if (xhr.readyState !== 4) return;
          try {
            if (xhr.status >= 200 && xhr.status < 300) {
              var obj2 = null;
              try { obj2 = JSON.parse(xhr.responseText || '{}'); } catch (_) { obj2 = null; }
              var items2 = (obj2 && obj2.items && Array.isArray(obj2.items)) ? obj2.items : [];
              var out2 = [];
              for (var i2 = 0; i2 < items2.length; i2++) {
                var it2 = items2[i2];
                if (!it2 || typeof it2.url !== 'string') continue;
                var u2 = String(it2.url || '').trim();
                if (!u2) continue;
                out2.push({ url: u2, tag: (typeof it2.tag === 'string') ? String(it2.tag || '') : '' });
              }
              STATE.items = out2;
              if (STATE.selectedIndex >= STATE.items.length) STATE.selectedIndex = 0;
              for (var j2 = 0; j2 < STATE.items.length; j2++) ensureCache(String(STATE.items[j2].url || ''));
              buildList();
              updateAllRows();
              renderContent();
            }
          } catch (_) { }
          resolve(true);
        };
        xhr.onerror = function () { resolve(false); };
        xhr.send(null);
      } catch (_) {
        resolve(false);
      }
    });

    return STATE.listPromise;
  }

  function abortInFlight() {
    try {
      if (STATE.currentAbortTimer) { clearTimeout(STATE.currentAbortTimer); STATE.currentAbortTimer = null; }
      if (STATE.currentAbort) {
        try { STATE.currentAbort.abort(); } catch (_) { }
        STATE.currentAbort = null;
      }
      if (STATE.currentXhr) {
        try { STATE.currentXhr.abort(); } catch (_) { }
        STATE.currentXhr = null;
      }
    } catch (_) { }
  }

  function fetchText(url, timeoutMs) {
    return new Promise(function (resolve, reject) {
      try {
        if (!window.fetch) return reject({ code: 'NO_FETCH' });

        var timer = null;
        var ctrl = null;
        if (window.AbortController) {
          ctrl = new AbortController();
          STATE.currentAbort = ctrl;
          timer = setTimeout(function () {
            try { ctrl.abort(); } catch (_) { }
          }, timeoutMs);
          STATE.currentAbortTimer = timer;
        }

        fetch(url, { cache: 'no-store', signal: ctrl ? ctrl.signal : void 0 }).then(function (r) {
          if (timer) { clearTimeout(timer); timer = null; STATE.currentAbortTimer = null; }
          STATE.currentAbort = null;
          if (!r) throw { code: 'NO_RESPONSE' };
          if (!r.ok) {
            var st = (typeof r.status === 'number') ? r.status : 0;
            if (!(st === 0 && /^file:/i.test(String(url || '')))) throw { code: 'HTTP', status: st };
          }
          return r.text();
        }).then(function (text) {
          if (timer) { clearTimeout(timer); timer = null; STATE.currentAbortTimer = null; }
          STATE.currentAbort = null;
          resolve(String(text || ''));
        }).catch(function (e) {
          if (timer) { clearTimeout(timer); timer = null; STATE.currentAbortTimer = null; }
          STATE.currentAbort = null;
          if (e && (e.name === 'AbortError' || e.code === 20)) return reject({ code: 'TIMEOUT' });
          reject({ code: 'FETCH_ERR', err: e });
        });
      } catch (e2) {
        reject({ code: 'FETCH_ERR', err: e2 });
      }
    });
  }

  function xhrText(url, timeoutMs) {
    return new Promise(function (resolve, reject) {
      try {
        var xhr = new XMLHttpRequest();
        STATE.currentXhr = xhr;
        xhr.open('GET', url, true);
        try { xhr.timeout = timeoutMs; } catch (_) { }
        try { xhr.responseType = 'text'; } catch (_) { }

        xhr.onload = function () {
          STATE.currentXhr = null;
          var st = (typeof xhr.status === 'number') ? xhr.status : 0;

          // file:// often returns status=0 even on success; accept it (empty file is allowed).
          var ok = (st >= 200 && st < 300) || (st === 0 && xhr.responseText != null);
          if (ok) return resolve(String(xhr.responseText || ''));
          reject({ code: 'HTTP', status: st });
        };
        xhr.onerror = function () { STATE.currentXhr = null; reject({ code: 'XHR_ERR' }); };
        xhr.ontimeout = function () { STATE.currentXhr = null; reject({ code: 'TIMEOUT' }); };

        xhr.send(null);
      } catch (e) {
        STATE.currentXhr = null;
        reject({ code: 'XHR_ERR', err: e });
      }
    });
  }

  function loadText(url) {
    return fetchText(url, CFG.timeoutMs).catch(function (fe) {
      // HTTP status is a definitive result (do not override with a fallback).
      if (fe && fe.code === 'HTTP') throw fe;

      return xhrText(url, CFG.timeoutMs).catch(function (xe) {
        // Prefer XHR HTTP/timeout signals (missing, forbidden, timeout).
        if (xe && (xe.code === 'HTTP' || xe.code === 'TIMEOUT')) throw xe;
        throw { code: 'BOTH_FAIL', fetchErr: fe, xhrErr: xe };
      });
    });
  }

  function classifyFail(url, e) {
    try {
      var u = String(url || '');
      var isFile = /^file:/i.test(u);

      // Direct HTTP
      if (e && e.code === 'HTTP') {
        if (e.status === 404) return { state: 'MISSING', errCode: 'MISSING', err: 'HTTP 404' };
        if (e.status === 403) return { state: isFile ? 'BLOCKED' : 'ERR', errCode: isFile ? 'BLOCKED' : 'HTTP_403', err: 'HTTP 403' };
        return { state: 'ERR', errCode: e.status ? ('HTTP_' + String(e.status)) : 'HTTP', err: e.status ? ('HTTP ' + String(e.status)) : 'HTTP error' };
      }

      // Timeout
      if (e && e.code === 'TIMEOUT') return { state: 'TIMEOUT', errCode: 'TIMEOUT', err: 'timeout' };

      // Both failed
      if (e && e.code === 'BOTH_FAIL') {
        if (isFile) return { state: 'BLOCKED', errCode: 'BLOCKED', err: 'CORS/BLOCKED' };
        var fe = e.fetchErr || null;
        var xe = e.xhrErr || null;
        var msg = '';
        try { msg = fe && fe.code ? String(fe.code) : ''; } catch (_) { msg = ''; }
        if (!msg) try { msg = xe && xe.code ? String(xe.code) : ''; } catch (_) { msg = ''; }
        return { state: 'ERR', errCode: 'FETCH_ERR', err: msg || 'fetch/xhr error' };
      }

      // Fetch errors
      if (e && e.code === 'FETCH_ERR') {
        if (isFile) return { state: 'BLOCKED', errCode: 'BLOCKED', err: 'fetch blocked' };
        return { state: 'ERR', errCode: 'FETCH_ERR', err: 'fetch error' };
      }
      if (e && e.code === 'XHR_ERR') {
        if (isFile) return { state: 'BLOCKED', errCode: 'BLOCKED', err: 'xhr blocked' };
        return { state: 'ERR', errCode: 'XHR_ERR', err: 'xhr error' };
      }
    } catch (_) { }
    return { state: 'ERR', errCode: 'ERR', err: 'error' };
  }

  function loadUrl(url, force) {
    return new Promise(function (resolve) {
      try {
        var u = String(url || '');
        if (!u) return resolve(false);

        var c = ensureCache(u);
        if (!c) return resolve(false);

        if (!force && c.state === 'OK') return resolve(true);
        if (c.state === 'LOADING') return resolve(true);

        c.state = 'LOADING';
        c.errCode = '';
        c.err = '';
        c.text = '';
        c.ts = Date.now();
        c.truncated = false;

        // Paint immediately
        updateAllRows();
        if (STATE.items[STATE.selectedIndex || 0] && String(STATE.items[STATE.selectedIndex || 0].url || '') === u) renderContent();

        loadText(u).then(function (text) {
          try {
            c.state = 'OK';
            c.errCode = '';
            c.err = '';

            var s = String(text || '');
            if (s.length > CFG.contentMaxChars) {
              c.text = s.slice(0, CFG.contentMaxChars);
              c.truncated = true;
            } else {
              c.text = s;
              c.truncated = false;
            }
            c.ts = Date.now();
          } catch (_) { }

          updateAllRows();
          if (STATE.items[STATE.selectedIndex || 0] && String(STATE.items[STATE.selectedIndex || 0].url || '') === u) renderContent();
          resolve(true);
        }).catch(function (e) {
          var info = classifyFail(u, e);
          try {
            c.state = info.state || 'ERR';
            c.errCode = info.errCode || 'ERR';
            c.err = info.err || '';
            c.text = '';
            c.truncated = false;
            c.ts = Date.now();
          } catch (_) { }

          updateAllRows();
          if (STATE.items[STATE.selectedIndex || 0] && String(STATE.items[STATE.selectedIndex || 0].url || '') === u) renderContent();
          resolve(false);
        });
      } catch (_) {
        resolve(false);
      }
    });
  }

  function enqueue(url, force, front) {
    try {
      var u = String(url || '');
      if (!u) return;

      for (var i = 0; i < STATE.queue.length; i++) {
        if (STATE.queue[i] && STATE.queue[i].url === u) {
          if (force) STATE.queue[i].force = true;
          if (front) {
            var t = STATE.queue.splice(i, 1)[0];
            STATE.queue.unshift(t);
          }
          return;
        }
      }

      var t2 = { url: u, force: !!force };
      if (front) STATE.queue.unshift(t2);
      else STATE.queue.push(t2);
    } catch (_) { }
  }

  function workerStop() {
    try {
      STATE.queue = [];
      STATE.workerRunning = false;
      STATE.scanTotal = 0;
      STATE.scanDone = 0;
      if (STATE.workerTimer) { clearTimeout(STATE.workerTimer); STATE.workerTimer = null; }
      abortInFlight();
      updateFooter();
    } catch (_) { }
  }

  function workerNext(seq) {
    if (!STATE.open) return workerStop();
    if (seq !== STATE.workerSeq) return;

    var task = null;
    try { task = STATE.queue.shift(); } catch (_) { task = null; }
    if (!task) {
      STATE.workerRunning = false;
      STATE.scanTotal = 0;
      STATE.scanDone = 0;
      updateFooter();
      return;
    }

    var shouldCount = false;
    try { shouldCount = STATE.scanTotal > 0 && STATE.scanDone < STATE.scanTotal; } catch (_) { shouldCount = false; }

    loadUrl(task.url, !!task.force).then(function () {
      if (!STATE.open) return workerStop();
      if (seq !== STATE.workerSeq) return;

      if (shouldCount) STATE.scanDone++;
      updateFooter();

      var yieldNow = false;
      try { yieldNow = (CFG.yieldEvery > 0) && (STATE.scanDone % CFG.yieldEvery === 0); } catch (_) { yieldNow = false; }

      if (yieldNow) STATE.workerTimer = setTimeout(function () { workerNext(seq); }, 0);
      else workerNext(seq);
    });
  }

  function workerStart() {
    if (STATE.workerRunning) return;
    STATE.workerRunning = true;
    STATE.workerSeq++;
    var seq = STATE.workerSeq;
    updateFooter();
    workerNext(seq);
  }

  function scanUnknown() {
    try {
      var queued = 0;
      for (var i = 0; i < STATE.items.length; i++) {
        var u = String(STATE.items[i] ? STATE.items[i].url : '');
        if (!u) continue;
        var c = ensureCache(u);
        if (!c || c.state === 'UNKNOWN') {
          enqueue(u, false, false);
          queued++;
        }
      }
      if (queued) {
        STATE.scanTotal = queued;
        STATE.scanDone = 0;
        workerStart();
      } else {
        updateFooter();
      }
    } catch (_) { }
  }

  function refreshSelected() {
    try {
      var it = STATE.items[STATE.selectedIndex || 0];
      if (!it) return;
      var u = String(it.url || '');
      if (!u) return;

      // Priority: refresh selected next.
      enqueue(u, true, true);
      if (!STATE.workerRunning) {
        STATE.scanTotal = 1;
        STATE.scanDone = 0;
      }
      workerStart();
      updateFooter();
    } catch (_) { }
  }

  function keyHandler(e) {
    if (!STATE.open) return;
    var k = e.keyCode || 0;

    if (isBackKeyCode(k)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      API.close();
      return;
    }

    // LEFT/RIGHT: switch focus list/content
    if (k === 37 || k === 39) {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (k === 37) setFocus('list');
      else setFocus('content');
      return;
    }

    // UP/DOWN: list navigation or content scroll
    if (k === 38 || k === 19 || k === 40 || k === 20) {
      e.preventDefault();
      e.stopImmediatePropagation();

      var isUp = (k === 38 || k === 19);

      if (STATE.focusZone === 'content') {
        try {
          if (!STATE.contentScrollEl) return;
          var step = 140;
          var next = STATE.contentScrollEl.scrollTop + (isUp ? -step : step);
          STATE.contentScrollEl.scrollTop = clamp(next, 0, STATE.contentScrollEl.scrollHeight || next);
        } catch (_) { }
        return;
      }

      var nextIndex = (STATE.selectedIndex || 0) + (isUp ? -1 : 1);
      setSelectedIndex(nextIndex);
      ensureSelectedVisible();
      updateRow(STATE.selectedIndex || 0);
      renderContent();
      updateFooter();
      return;
    }

    // OK: refresh selected or toggle wrap
    if (isOkKeyCode(k)) {
      e.preventDefault();
      e.stopImmediatePropagation();

      if (STATE.focusZone === 'content') {
        setNowrap(!STATE.nowrap);
        return;
      }

      refreshSelected();
      return;
    }
  }

  function installKeyHandler() {
    if (STATE.keyHandlerInstalled) return;
    STATE.keyHandlerInstalled = true;
    try { window.addEventListener('keydown', keyHandler, true); } catch (_) { }
  }

  function removeKeyHandler() {
    if (!STATE.keyHandlerInstalled) return;
    STATE.keyHandlerInstalled = false;
    try { window.removeEventListener('keydown', keyHandler, true); } catch (_) { }
  }

  API.init = function () {
    if (STATE.inited) return;
    STATE.inited = true;

    ensureDom();
    setFocus('list');
    setNowrap(false);
  };

  API.isOpen = function () { return !!STATE.open; };

  API.open = function () {
    try {
      if (!STATE.inited) API.init();
      ensureDom();
      if (!STATE.rootEl) return;

      // Avoid key-handler conflicts with the Log viewer popup.
      try { if (window.BL && BL.Log && typeof BL.Log.closeViewer === 'function') BL.Log.closeViewer(); } catch (_) { }

      setOpen(true);
      installKeyHandler();
      setFocus('list');

      loadListOnce().then(function () {
        if (!STATE.open) return;
        updateAllRows();
        renderContent();
        // Auto-scan on open (no polling; only user-triggered by opening the popup).
        API.scan();
      });
    } catch (_) { }
  };

  API.close = function () {
    try {
      setOpen(false);
      removeKeyHandler();
      workerStop();
    } catch (_) { }
  };

  API.scan = function () {
    try {
      if (!STATE.inited) API.init();
      if (!STATE.open) return;

      // Force refresh all (queued), but keep it single-threaded.
      STATE.queue = [];
      for (var i = 0; i < STATE.items.length; i++) {
        var u = String(STATE.items[i] ? STATE.items[i].url : '');
        if (!u) continue;
        enqueue(u, true, false);
      }
      STATE.scanTotal = STATE.items.length || 0;
      STATE.scanDone = 0;
      workerStart();
      updateFooter();
    } catch (_) { }
  };
})();
