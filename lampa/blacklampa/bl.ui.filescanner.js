(function () {
  'use strict';

  var BL = window.BL = window.BL || {};
  BL.FileScanner = BL.FileScanner || {};

  var API = BL.FileScanner;
  var LS_CONC = (BL.Keys && BL.Keys.fs_concurrency_v1) ? BL.Keys.fs_concurrency_v1 : 'blacklampa_fs_concurrency_v1';

  var CFG = {
    jsonFile: 'bl.filescan.json',
    timeoutMs: 3500,
    yieldEvery: 8,
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
	    closeBtnEl: null,
	    progressRowEl: null,
	    progressFillEl: null,
	    progressCountEl: null,
	    footerEl: null,

    focusZone: 'list', // list | content
    nowrap: false,
    selectedIndex: 0,

    items: [],
    rows: [],
	    cache: Object.create(null), // url -> { state, text, errCode, err, errInfo, ts, truncated }

    queue: [],
    workerRunning: false,
    workerSeq: 0,
    workerTimer: null,
    scanTotal: 0,
    scanDone: 0,

    stopRequested: false,
    workerActive: 0,
    workerConcurrency: 0,
    doneSinceYield: 0,

    activeAborts: [],
    activeXhrs: [],

    uiUpdateTimer: null,

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

	  function truncateText(s, max) {
	    try {
	      s = String(s || '');
	      max = (typeof max === 'number' && max > 0) ? max : 400;
	      return (s.length <= max) ? s : (s.slice(0, max - 1) + '…');
	    } catch (_) {
	      return '';
	    }
	  }

	  function safeStringify(v, max) {
	    try {
	      var seen = [];
	      var s = JSON.stringify(v, function (k, val) {
	        try {
	          if (val && typeof val === 'object') {
	            for (var i = 0; i < seen.length; i++) if (seen[i] === val) return '[Circular]';
	            if (seen.length < 40) seen.push(val);
	
	            try {
	              if (val instanceof Error) return { name: String(val.name || 'Error'), message: String(val.message || ''), stack: String(val.stack || '') };
	            } catch (_) { }
	            try {
	              if (typeof val.type === 'string' && (val.timeStamp !== undefined || val.target !== undefined)) {
	                return { type: String(val.type || ''), timeStamp: val.timeStamp || 0 };
	              }
	            } catch (_) { }
	          }
	        } catch (_) { }
	        return val;
	      });
	      if (typeof s !== 'string') s = String(s);
	      return truncateText(s, max || 900);
	    } catch (_) {
	      try { return truncateText(String(v), max || 900); } catch (__e) { return '<unstringifiable>'; }
	    }
	  }

	  function getConcurrency() {
	    var def = 6;
	    try {
	      var hc = 0;
      try { hc = navigator && navigator.hardwareConcurrency ? Number(navigator.hardwareConcurrency) : 0; } catch (_) { hc = 0; }
      if (hc && hc > 0 && hc <= 4) def = 4;
    } catch (_) { def = 6; }

    var raw = null;
    try { raw = window.localStorage ? localStorage.getItem(LS_CONC) : null; } catch (_) { raw = null; }
    var n = parseInt(raw, 10);
    if (!n || isNaN(n)) n = def;
    n = clamp(n, 1, 12);
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
	        '.bl_fs_header_top{display:flex;gap:10px;align-items:center;justify-content:space-between;}',
	        '.bl_fs_title{font-size:16px;font-weight:650;letter-spacing:0.2px;}',
	        '.bl_fs_close{flex:0 0 auto;cursor:pointer;user-select:none;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.18);color:#fff;font-size:12px;line-height:1;border-radius:999px;padding:5px 10px;}',
	        '.bl_fs_help{margin-top:4px;font-size:12px;opacity:0.85;}',
	        '.bl_fs_progress_row{display:flex;gap:10px;align-items:center;margin-top:8px;}',
	        '.bl_fs_progress{flex:1;min-width:0;height:6px;background:rgba(255,255,255,0.12);border-radius:999px;overflow:hidden;}',
	        '.bl_fs_progress_fill{height:100%;width:0%;background:#52c41a;}',
	        '.bl_fs_progress_count{flex:0 0 auto;font-size:11px;opacity:0.85;}',
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
	            '<div class="bl_fs_header_top">',
	              '<div class="bl_fs_title">Filesystem Scan</div>',
	              '<button class="bl_fs_close" type="button">× Закрыть</button>',
	            '</div>',
	            '<div class="bl_fs_help">OK=refresh • ↑↓ list/content • ←→ focus • BACK=close</div>',
	            '<div class="bl_fs_progress_row">',
	              '<div class="bl_fs_progress"><div class="bl_fs_progress_fill"></div></div>',
	              '<div class="bl_fs_progress_count"></div>',
	            '</div>',
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
	      STATE.closeBtnEl = root.querySelector('.bl_fs_close');
	      STATE.progressRowEl = root.querySelector('.bl_fs_progress_row');
	      STATE.progressFillEl = root.querySelector('.bl_fs_progress_fill');
	      STATE.progressCountEl = root.querySelector('.bl_fs_progress_count');
	      STATE.footerEl = root.querySelector('.bl_fs_footer');

	      try {
	        if (STATE.closeBtnEl && !STATE.closeBtnEl.__blBound) {
	          STATE.closeBtnEl.__blBound = true;
	          STATE.closeBtnEl.addEventListener('click', function (e) {
	            try { if (e) { e.preventDefault(); e.stopPropagation(); } } catch (_) { }
	            try { API.close(); } catch (_) { }
	          }, false);
	        }
	      } catch (_) { }
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
	    if (!STATE.cache[url]) STATE.cache[url] = { state: 'UNKNOWN', text: '', errCode: '', err: '', errInfo: null, ts: 0, truncated: false };
	    return STATE.cache[url];
	  }

	  function scheduleUiUpdate() {
	    try {
	      if (STATE.uiUpdateTimer) return;
	      STATE.uiUpdateTimer = setTimeout(function () {
	        STATE.uiUpdateTimer = null;
	        try { updateAllRows(); } catch (_) { }
	        try { renderContent(); } catch (_) { }
	        try { updateFooter(); } catch (_) { }
	      }, 0);
	    } catch (_) { }
	  }

	  function updateProgress() {
	    try {
	      if (!STATE.progressFillEl || !STATE.progressCountEl || !STATE.progressRowEl) return;
	      var total = Number(STATE.scanTotal || 0) || 0;
	      var done = Number(STATE.scanDone || 0) || 0;
	      if (!total || total < 0) total = 0;
	      if (total && done < 0) done = 0;
	      if (total && done > total) done = total;

	      var pct = total ? (done * 100 / total) : 0;
	      if (pct < 0) pct = 0;
	      if (pct > 100) pct = 100;
	      try { STATE.progressFillEl.style.width = pct.toFixed(2) + '%'; } catch (_) { }
	      try { STATE.progressCountEl.textContent = total ? (String(done) + '/' + String(total)) : ''; } catch (_) { }
	    } catch (_) { }
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
	      updateProgress();
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

      if (s.length > CFG.contentMaxChars) {
        s = s.slice(0, CFG.contentMaxChars);
        truncated = true;
      }

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

	      var lines = [];
	      lines.push(String(c.state || 'ERR') + ': ' + url);

	      try {
	        var d = c && c.errInfo ? c.errInfo : null;
	        if (d) {
	          if (d.url && String(d.url) !== url) lines.push('url: ' + String(d.url || ''));
	          if (d.hint) lines.push('hint: ' + String(d.hint || ''));
	          if (d.status !== undefined) lines.push('status: ' + String(d.status));
	          if (d.statusText) lines.push('statusText: ' + String(d.statusText || ''));
	          if (d.code) lines.push('code: ' + String(d.code || ''));

	          var errObj = null;
	          try { errObj = d.error || null; } catch (_) { errObj = null; }
	          if (!errObj) { try { if (d.fetch && d.fetch.err) errObj = d.fetch.err; } catch (_) { } }
	          if (!errObj) { try { if (d.xhr && d.xhr.err) errObj = d.xhr.err; } catch (_) { } }
	          if (!errObj) { try { if (d.fetch && d.fetch.event) errObj = d.fetch.event; } catch (_) { } }
	          if (!errObj) { try { if (d.xhr && d.xhr.event) errObj = d.xhr.event; } catch (_) { } }

	          var en = '';
	          var em = '';
	          try { en = errObj && errObj.name ? String(errObj.name || '') : ''; } catch (_) { en = ''; }
	          try { em = errObj && errObj.message ? String(errObj.message || '') : ''; } catch (_) { em = ''; }
	          if (en) lines.push('error.name: ' + en);
	          if (em) lines.push('error.message: ' + em);

	          if (d.fetch) lines.push('fetch: ' + safeStringify(d.fetch, 700));
	          if (d.xhr) lines.push('xhr: ' + safeStringify(d.xhr, 700));
	          if (d.body) lines.push('body: ' + truncateText(String(d.body || ''), 500));
	        }
	      } catch (_) { }

	      if (c.errCode) lines.push('errCode: ' + String(c.errCode || ''));
	      if (c.err) lines.push('err: ' + String(c.err || ''));

	      STATE.contentPreEl.textContent = lines.join('\n');
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
      var ab = STATE.activeAborts || [];
      for (var i = 0; i < ab.length; i++) {
        try { if (ab[i]) ab[i].abort(); } catch (_) { }
      }
      STATE.activeAborts = [];

      var xr = STATE.activeXhrs || [];
      for (var j = 0; j < xr.length; j++) {
        try { if (xr[j]) xr[j].abort(); } catch (_) { }
      }
      STATE.activeXhrs = [];
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
          try { STATE.activeAborts.push(ctrl); } catch (_) { }
          timer = setTimeout(function () {
            try { ctrl.abort(); } catch (_) { }
          }, timeoutMs);
        }

	        fetch(url, { cache: 'no-store', signal: ctrl ? ctrl.signal : void 0 }).then(function (r) {
	          if (timer) { clearTimeout(timer); timer = null; }
	          if (ctrl) {
	            try {
	              for (var i = 0; i < STATE.activeAborts.length; i++) {
	                if (STATE.activeAborts[i] === ctrl) { STATE.activeAborts.splice(i, 1); break; }
	              }
	            } catch (_) { }
	          }
	          if (!r) throw { code: 'NO_RESPONSE', url: url };

	          var st = (typeof r.status === 'number') ? r.status : 0;
	          var stText = '';
	          try { stText = String(r.statusText || ''); } catch (_) { stText = ''; }

	          if (!r.ok) {
	            if (!(st === 0 && /^file:/i.test(String(url || '')))) {
	              return r.text().then(function (body) {
	                throw { code: 'HTTP', url: url, status: st, statusText: stText, body: body };
	              }, function () {
	                throw { code: 'HTTP', url: url, status: st, statusText: stText };
	              });
	            }
	          }
	          return r.text();
	        }).then(function (text) {
	          if (timer) { clearTimeout(timer); timer = null; }
	          if (ctrl) {
	            try {
              for (var i2 = 0; i2 < STATE.activeAborts.length; i2++) {
                if (STATE.activeAborts[i2] === ctrl) { STATE.activeAborts.splice(i2, 1); break; }
              }
            } catch (_) { }
	          }
	          resolve(String(text || ''));
	        }).catch(function (e) {
	          if (timer) { clearTimeout(timer); timer = null; }
	          if (ctrl) {
            try {
              for (var i3 = 0; i3 < STATE.activeAborts.length; i3++) {
                if (STATE.activeAborts[i3] === ctrl) { STATE.activeAborts.splice(i3, 1); break; }
              }
	            } catch (_) { }
	          }
	          if (e && e.code === 'HTTP') return reject(e);
	          if (e && (e.name === 'AbortError' || e.code === 20)) return reject({ code: 'TIMEOUT', url: url });
	          reject({ code: 'FETCH_ERR', url: url, err: e });
	        });
	      } catch (e2) {
	        reject({ code: 'FETCH_ERR', url: url, err: e2 });
	      }
	    });
	  }

	  function xhrText(url, timeoutMs) {
	    return new Promise(function (resolve, reject) {
	      try {
	        var xhr = new XMLHttpRequest();
        try { STATE.activeXhrs.push(xhr); } catch (_) { }
        xhr.open('GET', url, true);
        try { xhr.timeout = timeoutMs; } catch (_) { }
        try { xhr.responseType = 'text'; } catch (_) { }

	        xhr.onload = function () {
	          try {
	            for (var i = 0; i < STATE.activeXhrs.length; i++) {
	              if (STATE.activeXhrs[i] === xhr) { STATE.activeXhrs.splice(i, 1); break; }
	            }
	          } catch (_) { }
	          var st = (typeof xhr.status === 'number') ? xhr.status : 0;

	          var ok = (st >= 200 && st < 300) || (st === 0 && xhr.responseText != null);
	          if (ok) return resolve(String(xhr.responseText || ''));
	          var stText = '';
	          try { stText = String(xhr.statusText || ''); } catch (_) { stText = ''; }
	          var body = '';
	          try { body = String(xhr.responseText || ''); } catch (_) { body = ''; }
	          reject({ code: 'HTTP', url: url, status: st, statusText: stText, body: body });
	        };
	        xhr.onerror = function (ev) {
	          try {
	            for (var i2 = 0; i2 < STATE.activeXhrs.length; i2++) {
	              if (STATE.activeXhrs[i2] === xhr) { STATE.activeXhrs.splice(i2, 1); break; }
	            }
	          } catch (_) { }
	          var st2 = (typeof xhr.status === 'number') ? xhr.status : 0;
	          var stText2 = '';
	          try { stText2 = String(xhr.statusText || ''); } catch (_) { stText2 = ''; }
	          reject({ code: 'XHR_ERR', url: url, status: st2, statusText: stText2, event: ev });
	        };
	        xhr.ontimeout = function (ev2) {
	          try {
	            for (var i3 = 0; i3 < STATE.activeXhrs.length; i3++) {
	              if (STATE.activeXhrs[i3] === xhr) { STATE.activeXhrs.splice(i3, 1); break; }
	            }
	          } catch (_) { }
	          var st3 = (typeof xhr.status === 'number') ? xhr.status : 0;
	          var stText3 = '';
	          try { stText3 = String(xhr.statusText || ''); } catch (_) { stText3 = ''; }
	          reject({ code: 'TIMEOUT', url: url, status: st3, statusText: stText3, event: ev2 });
	        };

        xhr.send(null);
	      } catch (e) {
	        try {
	          for (var i4 = 0; i4 < STATE.activeXhrs.length; i4++) {
	            if (STATE.activeXhrs[i4] === xhr) { STATE.activeXhrs.splice(i4, 1); break; }
	          }
	        } catch (_) { }
	        var st4 = 0;
	        try { st4 = (typeof xhr.status === 'number') ? xhr.status : 0; } catch (_) { st4 = 0; }
	        var stText4 = '';
	        try { stText4 = String(xhr.statusText || ''); } catch (_) { stText4 = ''; }
	        reject({ code: 'XHR_ERR', url: url, status: st4, statusText: stText4, err: e });
	      }
	    });
	  }

  function loadText(url) {
    return fetchText(url, CFG.timeoutMs).catch(function (fe) {
      if (fe && fe.code === 'HTTP') throw fe;

      return xhrText(url, CFG.timeoutMs).catch(function (xe) {
        if (xe && (xe.code === 'HTTP' || xe.code === 'TIMEOUT')) throw xe;
        throw { code: 'BOTH_FAIL', fetchErr: fe, xhrErr: xe };
      });
    });
  }

	  function classifyFail(url, e) {
	    try {
	      var u = String(url || '');
	      var isFile = /^file:/i.test(u);
	      var state = 'ERR';
	      var errCode = 'ERR';
	      var err = 'error';

	      var details = { url: u };
	      try { if (e && e.code) details.code = String(e.code); } catch (_) { }

	      var status = 0;
	      var statusText = '';
	      var body = '';
	      try { if (e && typeof e.status === 'number') status = e.status || 0; } catch (_) { status = 0; }
	      try { if (e && e.statusText) statusText = String(e.statusText || ''); } catch (_) { statusText = ''; }
	      try { if (e && e.body) body = String(e.body || ''); } catch (_) { body = ''; }

	      var fe = null;
	      var xe = null;
	      if (e && e.code === 'BOTH_FAIL') {
	        try { fe = e.fetchErr || null; } catch (_) { fe = null; }
	        try { xe = e.xhrErr || null; } catch (_) { xe = null; }
	        try { details.fetch = fe; } catch (_) { }
	        try { details.xhr = xe; } catch (_) { }
	        if (!status) { try { if (fe && typeof fe.status === 'number') status = fe.status || 0; } catch (_) { } }
	        if (!status) { try { if (xe && typeof xe.status === 'number') status = xe.status || 0; } catch (_) { } }
	        if (!statusText) { try { if (fe && fe.statusText) statusText = String(fe.statusText || ''); } catch (_) { } }
	        if (!statusText) { try { if (xe && xe.statusText) statusText = String(xe.statusText || ''); } catch (_) { } }
	        if (!body) {
	          try { if (fe && fe.body) body = String(fe.body || ''); } catch (_) { }
	          try { if (!body && xe && xe.body) body = String(xe.body || ''); } catch (_) { }
	        }
	      } else {
	        try { if (e && e.err !== undefined) details.error = e.err; } catch (_) { }
	      }

	      try { if (typeof status === 'number') details.status = status; } catch (_) { }
	      try { if (statusText) details.statusText = statusText; } catch (_) { }
	      if (body) details.body = truncateText(body, 1200);

	      var corsLikely = false;
	      try {
	        if (!isFile && e) {
	          if (e.code === 'BOTH_FAIL') {
	            if (fe && fe.code === 'FETCH_ERR' && xe && xe.code === 'XHR_ERR') corsLikely = true;
	            if (!corsLikely && fe && fe.err && fe.err.name === 'TypeError') corsLikely = true;
	          } else if (e.code === 'FETCH_ERR') {
	            var n1 = '';
	            var m1 = '';
	            try { n1 = e.err && e.err.name ? String(e.err.name) : ''; } catch (_) { n1 = ''; }
	            try { m1 = e.err && e.err.message ? String(e.err.message) : ''; } catch (_) { m1 = ''; }
	            var ml = m1.toLowerCase();
	            if (n1 === 'TypeError' && (ml.indexOf('failed to fetch') >= 0 || ml.indexOf('networkerror') >= 0 || ml.indexOf('cors') >= 0)) corsLikely = true;
	          } else if (e.code === 'XHR_ERR') {
	            var st0 = 0;
	            try { st0 = (typeof e.status === 'number') ? e.status : 0; } catch (_) { st0 = 0; }
	            if (st0 === 0) corsLikely = true;
	          }
	        }
	      } catch (_) { corsLikely = false; }

	      var hint = '';
	      if (isFile || corsLikely) hint = 'CORS/blocked';
	      if (hint) details.hint = hint;

	      if (e && e.code === 'HTTP') {
	        if (status === 404) { state = 'MISSING'; errCode = 'MISSING'; err = 'HTTP 404'; }
	        else if (status === 403) { state = isFile ? 'BLOCKED' : 'ERR'; errCode = isFile ? 'BLOCKED' : 'HTTP_403'; err = 'HTTP 403'; }
	        else { state = 'ERR'; errCode = status ? ('HTTP_' + String(status)) : 'HTTP'; err = status ? ('HTTP ' + String(status)) : 'HTTP error'; }
	      } else if (e && e.code === 'TIMEOUT') {
	        state = 'TIMEOUT'; errCode = 'TIMEOUT'; err = 'timeout';
	      } else if (e && e.code === 'BOTH_FAIL') {
	        if (isFile || corsLikely) { state = 'BLOCKED'; errCode = 'BLOCKED'; err = hint || 'CORS/blocked'; }
	        else { state = 'ERR'; errCode = 'FETCH_ERR'; err = 'fetch/xhr error'; }
	      } else if (e && e.code === 'FETCH_ERR') {
	        if (isFile || corsLikely) { state = 'BLOCKED'; errCode = 'BLOCKED'; err = hint || 'fetch blocked'; }
	        else { state = 'ERR'; errCode = 'FETCH_ERR'; err = 'fetch error'; }
	      } else if (e && e.code === 'XHR_ERR') {
	        if (isFile || corsLikely) { state = 'BLOCKED'; errCode = 'BLOCKED'; err = hint || 'xhr blocked'; }
	        else { state = 'ERR'; errCode = 'XHR_ERR'; err = 'xhr error'; }
	      }

	      return { state: state, errCode: errCode, err: err, details: details };
	    } catch (_) { }
	    return { state: 'ERR', errCode: 'ERR', err: 'error', details: { url: String(url || ''), raw: safeStringify(e, 600) } };
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
	        c.errInfo = null;
	        c.text = '';
	        c.ts = Date.now();
	        c.truncated = false;

        scheduleUiUpdate();

	        loadText(u).then(function (text) {
	          try {
	            c.state = 'OK';
	            c.errCode = '';
	            c.err = '';
	            c.errInfo = null;

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

          scheduleUiUpdate();
          resolve(true);
	        }).catch(function (e) {
	          var info = classifyFail(u, e);
	          try {
	            c.state = info.state || 'ERR';
	            c.errCode = info.errCode || 'ERR';
	            c.err = info.err || '';
	            c.errInfo = info.details || null;
	            c.text = '';
	            c.truncated = false;
	            c.ts = Date.now();
	          } catch (_) { }

          scheduleUiUpdate();
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
      STATE.stopRequested = true;
      STATE.workerActive = 0;
      STATE.workerConcurrency = 0;
      STATE.doneSinceYield = 0;
      STATE.scanTotal = 0;
      STATE.scanDone = 0;
      if (STATE.workerTimer) { clearTimeout(STATE.workerTimer); STATE.workerTimer = null; }
      abortInFlight();
      scheduleUiUpdate();
    } catch (_) { }
  }

  function workerMaybeFinish(seq) {
    try {
      if (!STATE.open) return workerStop();
      if (seq !== STATE.workerSeq) return;
      if (!STATE.workerRunning) return;
      if (STATE.queue.length) return;
      if (STATE.workerActive > 0) return;

      STATE.workerRunning = false;
      STATE.workerConcurrency = 0;
      STATE.doneSinceYield = 0;
      STATE.scanTotal = 0;
      STATE.scanDone = 0;
      scheduleUiUpdate();
    } catch (_) { }
  }

  function workerPump(seq) {
    try {
      if (!STATE.open) return workerStop();
      if (seq !== STATE.workerSeq) return;
      if (!STATE.workerRunning) return;
      if (STATE.stopRequested) return;

      var task = null;
      try { task = STATE.queue.shift(); } catch (_) { task = null; }
      if (!task) return workerMaybeFinish(seq);

      STATE.workerActive++;
      loadUrl(task.url, !!task.force).then(function () {
        if (seq !== STATE.workerSeq) return;
        STATE.workerActive--;

        var shouldCount = false;
        try { shouldCount = STATE.scanTotal > 0 && STATE.scanDone < STATE.scanTotal; } catch (_) { shouldCount = false; }
        if (shouldCount) STATE.scanDone++;

        STATE.doneSinceYield++;
        scheduleUiUpdate();

        var yieldNow = false;
        try { yieldNow = (CFG.yieldEvery > 0) && (STATE.doneSinceYield % CFG.yieldEvery === 0); } catch (_) { yieldNow = false; }

        if (yieldNow) STATE.workerTimer = setTimeout(function () { workerPump(seq); }, 0);
        else workerPump(seq);

        workerMaybeFinish(seq);
      });
    } catch (_) { }
  }

  function workerStart() {
    if (STATE.workerRunning) return;
    STATE.workerRunning = true;
    STATE.stopRequested = false;
    STATE.workerSeq++;
    var seq = STATE.workerSeq;
    STATE.workerConcurrency = getConcurrency();
    STATE.workerActive = 0;
    STATE.doneSinceYield = 0;
    scheduleUiUpdate();

    var n = STATE.workerConcurrency || 1;
    for (var i = 0; i < n; i++) workerPump(seq);
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
        scheduleUiUpdate();
      }
    } catch (_) { }
  }

  function refreshSelected() {
    try {
      var it = STATE.items[STATE.selectedIndex || 0];
      if (!it) return;
      var u = String(it.url || '');
      if (!u) return;

      enqueue(u, true, true);
      if (!STATE.workerRunning) {
        STATE.scanTotal = 1;
        STATE.scanDone = 0;
      }
      workerStart();
      scheduleUiUpdate();
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

    if (k === 37 || k === 39) {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (k === 37) setFocus('list');
      else setFocus('content');
      return;
    }

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

      try { if (window.BL && BL.Log && typeof BL.Log.closeViewer === 'function') BL.Log.closeViewer(); } catch (_) { }

      setOpen(true);
      installKeyHandler();
      setFocus('list');

      loadListOnce().then(function () {
        if (!STATE.open) return;
        updateAllRows();
        renderContent();
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

      STATE.queue = [];
      for (var i = 0; i < STATE.items.length; i++) {
        var u = String(STATE.items[i] ? STATE.items[i].url : '');
        if (!u) continue;
        enqueue(u, true, false);
      }
      STATE.scanTotal = STATE.items.length || 0;
      STATE.scanDone = 0;
      workerStart();
      scheduleUiUpdate();
    } catch (_) { }
  };
})();
