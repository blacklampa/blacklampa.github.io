(function () {
  'use strict';

  var BL = window.BL = window.BL || {};
  BL.PlayerGuard = BL.PlayerGuard || {};

  var API = BL.PlayerGuard;
  if (API.__blPlayerGuardLoadedV2) return;
  API.__blPlayerGuardLoadedV2 = true;

  var LS_PREFIX = 'blacklampa_';
  try { if (BL.Keys && BL.Keys.prefix) LS_PREFIX = String(BL.Keys.prefix || 'blacklampa_'); } catch (_) { }

  var KEY_ENABLED = LS_PREFIX + 'player_guard_enabled';
  var KEY_SOFT_ATTEMPTS = LS_PREFIX + 'player_guard_soft_attempts';
  var KEY_ATTEMPTS_LEGACY = LS_PREFIX + 'player_guard_attempts';
  var KEY_HARD_ATTEMPTS = LS_PREFIX + 'player_guard_hard_attempts';
  var KEY_DELAY_SEC = LS_PREFIX + 'player_guard_attempt_delay_sec';
  var KEY_POPUP_MIN_SEC = LS_PREFIX + 'player_guard_popup_min_sec';
  var KEY_BLOCK_NEXT = LS_PREFIX + 'player_guard_block_next';
  var KEY_DEBUG_POPUP = LS_PREFIX + 'player_guard_debug_popup';
  var KEY_STORE_POS = LS_PREFIX + 'player_guard_store_pos';

  var DET = {
    epsilonEndSec: 2.0,
    jumpThresholdSec: 20,
    faultWindowMs: 10000,
    keepFaultMs: 30000,
    minWatchTimeSec: 5,
    seekGuardMs: 2500,
    reset0EpsSec: 0.5,
    reset0MinTruthSec: 30,
    reset0HardTruthSec: 60,
    saveThrottleMs: 1500,
    saveMaxAgeMs: 72 * 3600 * 1000,
    guardLockMs: 25000,
    stableOkSec: 4.0,
    repeatFaultHardMs: 20000,
    attemptEvalMs: 1200,
    manualNextAllowMs: 1500
  };

  var CFG = {
    enabled: false,
    softAttempts: 4,
    hardAttempts: 1,
    attemptDelaySec: 2,
    popupMinSec: 2,
    blockNext: true,
    debugPopup: true,
    storePos: true
  };

  var MODE_NORMAL = 'NORMAL';
  var MODE_SOFT = 'RECOVERING_SOFT';
  var MODE_HARD = 'RECOVERING_HARD';
  var MODE_FAIL = 'FAILED';

  var STATE = {
    installed: false,
    patched: { video: false, playlist: false, panel: false, player: false },
    video: null,
    streamId: '',
    src: '',
    srcSig: '',
    posKey: '',

    session: {
      startedTs: 0,
      maxTimeSec: 0,
      hadValidDur: false,
      lastValidDurSec: 0,
      lastValidDurTs: 0,
      buffering: false,
      health: 'OK',
      lastSrc: '',
      lastSrcSig: '',
      lastSrcChangeTs: 0
    },

    truth: {
      t: 0,
      ts: 0,
      dur: 0,
      srcSig: '',
      fromSession: false,
      lastSaveTs: 0
    },

    fault: {
      lastTs: 0,
      lastType: '',
      lastDetails: '',
      lastLongTs: 0,
      seq: 0
    },

    seek: {
      lastSeekTs: 0
    },

    guard: {
      lock: false,
      untilTs: 0,
      reason: '',
      lockedWork: null,
      lockedUrl: '',
      lockedSrcSig: '',
      lockedTruthT: 0
    },

    manual: {
      allowNextTs: 0
    },

    rec: {
      mode: MODE_NORMAL,
      seq: 0,
      reason: '',
      resumeTimeSec: 0,
      softAttempt: 0,
      hardAttempt: 0,
      softMax: 4,
      hardMax: 1,
      attemptStartedTs: 0,
      stepShownTs: 0,
      stableSec: 0,
      stableLastCur: NaN,
      stableLastTs: 0,
      lastRecoveryMode: '',
      lastOkTs: 0,
      pendingSeekSec: NaN,
      pendingParams: null,
      nextTimer: null,
      evalTimer: null,
      okTimer: null
    },

    ui: {
      styleInstalled: false,
      root: null,
      titleEl: null,
      stageEl: null,
      infoEl: null,
      detailsEl: null,
      actionsEl: null,
      btns: [],
      selected: 0,
      mode: 'hidden',
      keyHandler: null
    },

    log: {
      lastKey: '',
      lastTs: 0
    },

    _prevVideo: null,
    _boundHandlers: null
  };

  function safe(fn, fallback) { try { return fn(); } catch (_) { return fallback; } }
  function now() { try { return Date.now(); } catch (_) { return +new Date(); } }

  function lsGet(k) { try { return localStorage.getItem(String(k || '')); } catch (_) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(String(k || ''), String(v)); } catch (_) { } }
  function lsDel(k) { try { localStorage.removeItem(String(k || '')); } catch (_) { } }

  function sGet(k, fallback) {
    var v = null;
    try { if (window.Lampa && Lampa.Storage && Lampa.Storage.get) v = Lampa.Storage.get(String(k)); } catch (_) { v = null; }
    if (v === undefined || v === null || v === '') { try { v = lsGet(k); } catch (_) { v = null; } }
    return (v === undefined || v === null || v === '') ? fallback : v;
  }

  function parseBool(v, def) {
    if (v === undefined || v === null || v === '') return !!def;
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return isFinite(v) && v !== 0;
    try { v = String(v).trim(); } catch (_) { return !!def; }
    if (v === '') return !!def;
    return !/^(0|false|off|no)$/i.test(v);
  }

  function toInt(v, d) { var n = parseInt(v, 10); return isNaN(n) ? d : n; }
  function toNum(v, d) { var n = parseFloat(v); return isNaN(n) ? d : n; }
  function clampInt(n, a, b) { n = toInt(n, a); if (n < a) return a; if (n > b) return b; return n; }

  function fmtTime(sec) {
    sec = Math.max(0, Math.floor(toNum(sec, 0)));
    try {
      if (window.Lampa && Lampa.Utils && typeof Lampa.Utils.secondsToTime === 'function') {
        return String(Lampa.Utils.secondsToTime(sec, true) || '');
      }
    } catch (_) { }
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    var mm = (m < 10 ? '0' : '') + String(m);
    var ss = (s < 10 ? '0' : '') + String(s);
    return mm + ':' + ss;
  }

  function hash32(str) {
    str = String(str || '');
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h + (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)) >>> 0;
    }
    var s = h.toString(16);
    return ('00000000' + s).slice(-8);
  }

  function normalizeUrlForSig(url) {
    url = String(url || '');
    if (!url) return '';
    var base = url;
    try { base = String(url).split('|')[0]; } catch (_) { base = String(url || ''); }
    if (!base) return '';

    try {
      var u = new URL(base, (location && location.href) ? location.href : undefined);
      var drop = {
        token: 1, expires: 1, expire: 1, exp: 1, signature: 1, sig: 1, session: 1, sid: 1, jwt: 1,
        hdnea: 1, hdnts: 1, hls: 0, start: 0, end: 0
      };
      var pairs = [];
      u.searchParams.forEach(function (v, k) {
        var kk = String(k || '').toLowerCase();
        if (drop[kk]) return;
        if (v && String(v).length > 64) return;
        pairs.push([String(k), String(v)]);
      });
      pairs.sort(function (a, b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0; });
      var q = '';
      for (var i = 0; i < pairs.length; i++) {
        if (i) q += '&';
        q += encodeURIComponent(pairs[i][0]) + '=' + encodeURIComponent(pairs[i][1]);
      }
      return u.origin + u.pathname + (q ? ('?' + q) : '');
    } catch (_) {
      return base;
    }
  }

  function buildSrcSig(url) {
    try {
      var norm = normalizeUrlForSig(url);
      if (!norm) norm = String(url || '');
      return hash32(norm);
    } catch (_) {
      return hash32(String(url || ''));
    }
  }

  function kv(fields) {
    if (!fields) return '';
    if (typeof fields === 'string') return fields;
    var parts = [];
    try {
      for (var k in fields) {
        if (!Object.prototype.hasOwnProperty.call(fields, k)) continue;
        var v = fields[k];
        if (v === undefined) continue;
        parts.push(String(k) + '=' + String(v));
      }
    } catch (_) { }
    return parts.join(' | ');
  }

  function logLine(level, msg, extra, dedupKey, dedupMs) {
    try {
      var k = String(dedupKey || '');
      var w = (typeof dedupMs === 'number' && dedupMs >= 0) ? dedupMs : 1200;
      var t = now();
      if (k && STATE.log.lastKey === k && STATE.log.lastTs && (t - STATE.log.lastTs) < w) return;
      if (k) { STATE.log.lastKey = k; STATE.log.lastTs = t; }
    } catch (_) { }

    try {
      if (!BL.Log) throw 0;
      if (level === 'ERR' && BL.Log.showError) return BL.Log.showError('PlayerGuard', String(msg || ''), extra);
      if (level === 'WRN' && BL.Log.showWarn) return BL.Log.showWarn('PlayerGuard', String(msg || ''), extra);
      if (level === 'OK' && BL.Log.showOk) return BL.Log.showOk('PlayerGuard', String(msg || ''), extra);
      if (level === 'DBG' && BL.Log.showDbg) return BL.Log.showDbg('PlayerGuard', String(msg || ''), extra);
      if (BL.Log.showInfo) return BL.Log.showInfo('PlayerGuard', String(msg || ''), extra);
    } catch (_) { }

    safe(function () {
      if (window.console && console.log) console.log('[BL][PlayerGuard][' + String(level || 'INF') + '] ' + String(msg || ''), extra || '');
    });
  }

  function logEvt(level, name, fields, dedupKey, dedupMs) {
    logLine(level, String(name || ''), kv(fields), dedupKey || String(name || ''), dedupMs);
  }

  function getPlayData() {
    try { return (window.Lampa && Lampa.Player && typeof Lampa.Player.playdata === 'function') ? (Lampa.Player.playdata() || null) : null; } catch (_) { return null; }
  }

  function pickTitle(pd) {
    try { pd = pd || getPlayData(); } catch (_) { pd = null; }
    try {
      if (pd && pd.title) return String(pd.title);
      if (pd && pd.movie) {
        if (pd.movie.title) return String(pd.movie.title);
        if (pd.movie.name) return String(pd.movie.name);
        if (pd.movie.original_title) return String(pd.movie.original_title);
      }
    } catch (_) { }
    return '';
  }

  function pickSrc(video) {
    var s = '';
    try { if (video && typeof video.currentSrc === 'string' && video.currentSrc) s = String(video.currentSrc); } catch (_) { }
    try { if (!s && video && typeof video.src === 'string' && video.src) s = String(video.src); } catch (_) { }
    if (!s) {
      try { if (STATE.src) s = String(STATE.src || ''); } catch (_) { s = ''; }
    }
    return s;
  }

  function pickStreamId(video) {
    var pd = null;
    try { pd = getPlayData(); } catch (_) { pd = null; }
    try { if (pd && typeof pd.url === 'string' && pd.url) return String(pd.url); } catch (_) { }
    var s = pickSrc(video);
    return s || '';
  }

  function buildPosKey(streamId) {
    var h = hash32(String(streamId || ''));
    return LS_PREFIX + 'player_guard_pos_v1_' + h;
  }

  function readTruthLS() {
    try {
      if (!CFG.storePos) return null;
      if (!STATE.posKey) return null;
      var raw = lsGet(STATE.posKey);
      if (!raw) return null;
      var obj = null;
      try { obj = JSON.parse(String(raw)); } catch (_) { obj = null; }
      if (!obj || typeof obj !== 'object') return null;
      if (!obj.ts) return null;
      var age = now() - toInt(obj.ts, 0);
      if (age < 0 || age > DET.saveMaxAgeMs) return null;
      if (obj.t === undefined || obj.t === null) return null;
      var t = toNum(obj.t, -1);
      if (!isFinite(t) || t < 0) return null;
      var dur = (obj.dur === undefined || obj.dur === null) ? 0 : toNum(obj.dur, 0);
      var srcSig = '';
      try { srcSig = String(obj.srcSig || ''); } catch (_) { srcSig = ''; }
      return { t: t, ts: toInt(obj.ts, 0), dur: isFinite(dur) ? dur : 0, srcSig: srcSig, title: String(obj.title || '') };
    } catch (_) {
      return null;
    }
  }

  function writeTruthLS(t, dur, srcSig, why) {
    try {
      if (!CFG.storePos) return;
      if (!STATE.posKey) return;
      var tt = toNum(t, -1);
      if (!isFinite(tt) || tt < 0) return;
      var d = toNum(dur, 0);
      var obj = {
        v: 2,
        t: Math.max(0, tt),
        ts: now(),
        dur: isFinite(d) && d > 0 ? d : null,
        title: pickTitle(null),
        streamId: String(STATE.streamId || ''),
        srcSig: String(srcSig || ''),
        why: String(why || '')
      };
      lsSet(STATE.posKey, JSON.stringify(obj));
    } catch (_) { }
  }

  function deleteTruthLS(why) {
    try {
      if (!STATE.posKey) return;
      lsDel(STATE.posKey);
      logEvt('INF', 'truth_cleared', { why: String(why || '') }, 'truth:del:' + STATE.posKey, 2000);
    } catch (_) { }
  }

  function updateStreamContext(video, srcHint) {
    try {
      var sid = pickStreamId(video);
      try {
        if (sid && CFG.blockNext && isGuardLocked() && !isManualAllowed() && STATE.guard.lockedUrl && sid !== STATE.guard.lockedUrl) {
          sid = STATE.guard.lockedUrl;
        }
      } catch (_) { }
      if (sid && sid !== STATE.streamId) {
        STATE.streamId = String(sid || '');
        STATE.posKey = STATE.streamId ? buildPosKey(STATE.streamId) : '';
        STATE.truth.t = 0;
        STATE.truth.ts = 0;
        STATE.truth.dur = 0;
        STATE.truth.srcSig = '';
        STATE.truth.fromSession = false;
        STATE.truth.lastSaveTs = 0;
      }
    } catch (_) { }

    try {
      var src = '';
      try { src = (srcHint !== undefined && srcHint !== null) ? String(srcHint) : ''; } catch (_) { src = ''; }
      if (!src) src = pickSrc(video);
      STATE.src = src || STATE.src;
      if (src) {
        var sig = buildSrcSig(src);
        STATE.srcSig = sig;
        STATE.session.lastSrc = src;
        STATE.session.lastSrcSig = sig;
      }
    } catch (_) { }
  }

  function mediaState(video) {
    var out = {};
    try { out.mode = STATE.rec.mode; } catch (_) { }
    try { out.guard = isGuardLocked() ? 1 : 0; } catch (_) { }
    try { out.truth = fmtTime(getTruthTime()); } catch (_) { }
    try { if (video && typeof video.currentTime !== 'undefined') out.t = toNum(video.currentTime, 0).toFixed(3); } catch (_) { }
    try { if (video && typeof video.duration !== 'undefined') out.dur = toNum(video.duration, 0).toFixed(3); } catch (_) { }
    try { if (video && typeof video.readyState !== 'undefined') out.rs = String(video.readyState); } catch (_) { }
    try { if (video && typeof video.networkState !== 'undefined') out.ns = String(video.networkState); } catch (_) { }
    try { if (video && typeof video.paused !== 'undefined') out.paused = video.paused ? 1 : 0; } catch (_) { }
    try { out.srcSig = String(STATE.srcSig || ''); } catch (_) { }
    return kv(out);
  }

  function ensureUiStyle() {
    if (STATE.ui.styleInstalled) return;
    STATE.ui.styleInstalled = true;

    safe(function () {
      if (!document || !document.head) return;
      if (document.getElementById('__bl_player_guard_style_v2')) return;
      var st = document.createElement('style');
      st.id = '__bl_player_guard_style_v2';
      st.type = 'text/css';
      st.textContent = ''
        + '#__bl_player_guard_popup_v2{position:fixed;left:50%;bottom:12%;transform:translateX(-50%);min-width:300px;max-width:640px;'
        + 'background:rgba(0,0,0,0.74);color:#fff;padding:16px 18px;border-radius:14px;z-index:2147483646;'
        + 'pointer-events:none;font:13px/1.35 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;'
        + 'box-shadow:0 10px 28px rgba(0,0,0,0.6);backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px);}'
        + '#__bl_player_guard_popup_v2.bl-pg-hidden{display:none;}'
        + '#__bl_player_guard_popup_v2.bl-pg-fail{pointer-events:auto;}'
        + '#__bl_player_guard_popup_v2 .bl-pg-row{display:flex;align-items:flex-start;gap:12px;}'
        + '#__bl_player_guard_popup_v2 .bl-pg-title{font-weight:800;font-size:15px;margin:0 0 8px 0;}'
        + '#__bl_player_guard_popup_v2 .bl-pg-stage{font-weight:700;font-size:14px;opacity:0.98;margin:0 0 8px 0;}'
        + '#__bl_player_guard_popup_v2 .bl-pg-info{opacity:0.92;margin:0 0 6px 0;}'
        + '#__bl_player_guard_popup_v2 .bl-pg-details{opacity:0.78;margin:0;font-size:12px;white-space:pre-wrap;}'
        + '#__bl_player_guard_popup_v2 .bl-pg-spinner{width:18px;height:18px;flex:0 0 18px;margin-top:3px;border-radius:50%;'
        + 'border:2px solid rgba(255,255,255,0.35);border-top-color:#fff;animation:blpgspin2 0.9s linear infinite;}'
        + '@keyframes blpgspin2{from{transform:rotate(0deg);}to{transform:rotate(360deg);}}'
        + '#__bl_player_guard_popup_v2 .bl-pg-actions{display:none;margin-top:12px;gap:8px;flex-wrap:wrap;}'
        + '#__bl_player_guard_popup_v2.bl-pg-fail .bl-pg-actions{display:flex;}'
        + '#__bl_player_guard_popup_v2 .bl-pg-btn{padding:9px 11px;border-radius:11px;background:rgba(255,255,255,0.12);'
        + 'border:1px solid rgba(255,255,255,0.18);cursor:pointer;user-select:none;}'
        + '#__bl_player_guard_popup_v2 .bl-pg-btn.active{background:rgba(64,169,255,0.25);border-color:rgba(64,169,255,0.55);}';
      document.head.appendChild(st);
    });
  }

  function ensureUiRoot() {
    ensureUiStyle();
    if (STATE.ui.root) return STATE.ui.root;

    return safe(function () {
      if (!document || !document.body) return null;
      var el = document.getElementById('__bl_player_guard_popup_v2');
      if (!el) {
        el = document.createElement('div');
        el.id = '__bl_player_guard_popup_v2';
        el.className = 'bl-pg-hidden';
        el.innerHTML = ''
          + '<div class="bl-pg-row">'
          + '  <div class="bl-pg-spinner"></div>'
          + '  <div class="bl-pg-col">'
          + '    <div class="bl-pg-title"></div>'
          + '    <div class="bl-pg-stage"></div>'
          + '    <div class="bl-pg-info"></div>'
          + '    <div class="bl-pg-details"></div>'
          + '    <div class="bl-pg-actions"></div>'
          + '  </div>'
          + '</div>';
        document.body.appendChild(el);
      }

      STATE.ui.root = el;
      STATE.ui.titleEl = el.querySelector('.bl-pg-title');
      STATE.ui.stageEl = el.querySelector('.bl-pg-stage');
      STATE.ui.infoEl = el.querySelector('.bl-pg-info');
      STATE.ui.detailsEl = el.querySelector('.bl-pg-details');
      STATE.ui.actionsEl = el.querySelector('.bl-pg-actions');
      return el;
    }, null);
  }

  function uiSetMode(mode) {
    var root = ensureUiRoot();
    if (!root) return;
    STATE.ui.mode = String(mode || 'hidden');
    safe(function () {
      root.classList.remove('bl-pg-hidden');
      root.classList.remove('bl-pg-fail');
      if (STATE.ui.mode === 'hidden') root.classList.add('bl-pg-hidden');
      else if (STATE.ui.mode === 'fail') root.classList.add('bl-pg-fail');
    });
  }

  function uiUpdate(title, stage, info, details) {
    var root = ensureUiRoot();
    if (!root) return;
    safe(function () {
      if (STATE.ui.titleEl) STATE.ui.titleEl.textContent = String(title || '');
      if (STATE.ui.stageEl) STATE.ui.stageEl.textContent = String(stage || '');
      if (STATE.ui.infoEl) STATE.ui.infoEl.textContent = String(info || '');
      if (STATE.ui.detailsEl) STATE.ui.detailsEl.textContent = String(details || '');
    });
  }

  function uiClearActions() {
    safe(function () {
      STATE.ui.btns = [];
      STATE.ui.selected = 0;
      if (STATE.ui.actionsEl) STATE.ui.actionsEl.innerHTML = '';
    });
  }

  function uiSelectBtn(idx) {
    idx = toInt(idx, 0);
    if (!STATE.ui.btns || !STATE.ui.btns.length) return;
    if (idx < 0) idx = 0;
    if (idx >= STATE.ui.btns.length) idx = STATE.ui.btns.length - 1;
    STATE.ui.selected = idx;
    for (var i = 0; i < STATE.ui.btns.length; i++) {
      try { STATE.ui.btns[i].classList.toggle('active', i === idx); } catch (_) { }
    }
  }

  function uiActivateSelected() {
    var idx = toInt(STATE.ui.selected, 0);
    var btn = (STATE.ui.btns && STATE.ui.btns[idx]) ? STATE.ui.btns[idx] : null;
    if (!btn) return;
    var act = '';
    try { act = String(btn.getAttribute('data-act') || ''); } catch (_) { act = ''; }
    if (!act) return;
    if (act === 'retry') {
      enterRecovery(MODE_SOFT, 'manual_retry', { manual: true });
    } else if (act === 'exit') {
      exitPlayer('manual_exit');
    } else if (act === 'restart') {
      enterRecovery(MODE_HARD, 'manual_restart', { manual: true, forceHard: true });
    }
  }

  function uiInstallFailKeyHandler() {
    if (STATE.ui.keyHandler) return;
    STATE.ui.keyHandler = function (e) {
      try {
        if (STATE.ui.mode !== 'fail') return;
        if (!e) return;
        var k = '';
        try { k = (typeof e.key === 'string') ? e.key : ''; } catch (_) { k = ''; }
        var kc = 0;
        try { kc = (typeof e.keyCode === 'number') ? e.keyCode : 0; } catch (_) { kc = 0; }

        var isLeft = (k === 'ArrowLeft' || kc === 37);
        var isRight = (k === 'ArrowRight' || kc === 39);
        var isUp = (k === 'ArrowUp' || kc === 38);
        var isDown = (k === 'ArrowDown' || kc === 40);
        var isEnter = (k === 'Enter' || kc === 13);
        var isBack = (k === 'Backspace' || k === 'Escape' || kc === 8 || kc === 27 || kc === 461 || kc === 10009);

        if (!(isLeft || isRight || isUp || isDown || isEnter || isBack)) return;

        try { e.preventDefault(); } catch (_) { }
        try { e.stopPropagation(); } catch (_) { }

        if (isBack) { exitPlayer('key_back'); return; }
        if (isLeft || isUp) uiSelectBtn(STATE.ui.selected - 1);
        else if (isRight || isDown) uiSelectBtn(STATE.ui.selected + 1);
        else if (isEnter) uiActivateSelected();
      } catch (_) { }
    };
    safe(function () { window.addEventListener('keydown', STATE.ui.keyHandler, true); });
  }

  function uiRemoveFailKeyHandler() {
    if (!STATE.ui.keyHandler) return;
    safe(function () { window.removeEventListener('keydown', STATE.ui.keyHandler, true); });
    STATE.ui.keyHandler = null;
  }

  function uiShowFailActions() {
    uiClearActions();
    var root = ensureUiRoot();
    if (!root || !STATE.ui.actionsEl) return;

    var actions = [
      { act: 'retry', text: 'Повторить' },
      { act: 'restart', text: 'Старт заново с позиции' },
      { act: 'exit', text: 'Выйти из плеера' }
    ];

    safe(function () {
      for (var i = 0; i < actions.length; i++) {
        (function (a, idx) {
          var b = document.createElement('div');
          b.className = 'bl-pg-btn';
          b.setAttribute('data-act', String(a.act));
          b.textContent = String(a.text);
          b.onclick = function () { try { STATE.ui.selected = idx; uiSelectBtn(idx); uiActivateSelected(); } catch (_) { } };
          STATE.ui.actionsEl.appendChild(b);
          STATE.ui.btns.push(b);
        })(actions[i], i);
      }
    });

    uiInstallFailKeyHandler();
    uiSelectBtn(0);
  }

  function uiHide() {
    uiRemoveFailKeyHandler();
    uiSetMode('hidden');
  }

  function uiShowRecover(stage, info, details) {
    uiRemoveFailKeyHandler();
    uiSetMode('recover');
    uiUpdate('Поток оборвался / восстановление…', stage, info, details);
    STATE.rec.stepShownTs = now();
  }

  function uiShowOk(text) {
    uiRemoveFailKeyHandler();
    uiSetMode('recover');
    uiUpdate(String(text || 'Восстановлено'), '', '', '');
    STATE.rec.stepShownTs = now();
  }

  function uiShowFail(stage, info, details) {
    uiSetMode('fail');
    uiUpdate('Поток не восстановился', stage, info, details);
    uiShowFailActions();
    STATE.rec.stepShownTs = now();
  }

  function clearTimers() {
    safe(function () { if (STATE.rec.nextTimer) clearTimeout(STATE.rec.nextTimer); });
    safe(function () { if (STATE.rec.evalTimer) clearTimeout(STATE.rec.evalTimer); });
    safe(function () { if (STATE.rec.okTimer) clearTimeout(STATE.rec.okTimer); });
    STATE.rec.nextTimer = null;
    STATE.rec.evalTimer = null;
    STATE.rec.okTimer = null;
  }

  function detachVideoListeners() {
    safe(function () {
      var pv = STATE._prevVideo;
      var h = STATE._boundHandlers;
      if (!pv || !h) return;
      if (typeof pv.removeEventListener === 'function') {
        for (var k in h) {
          try { pv.removeEventListener(k, h[k], true); } catch (_) { }
          try { pv.removeEventListener(k, h[k], false); } catch (_) { }
        }
      }
    });
    STATE._boundHandlers = null;
    STATE._prevVideo = null;
  }

  function isRecovering() { return STATE.rec.mode === MODE_SOFT || STATE.rec.mode === MODE_HARD; }

  function isGuardLocked() {
    var t = now();
    if (STATE.guard.lock && (t < STATE.guard.untilTs)) return true;
    if (STATE.guard.lock && (isRecovering() || STATE.rec.mode === MODE_FAIL)) return true;
    if (STATE.guard.lock && (t - STATE.fault.lastLongTs) < DET.keepFaultMs) return true;
    return false;
  }

  function lockGuard(reason, meta) {
    meta = meta || {};
    if (!CFG.enabled) return;
    STATE.guard.lock = true;
    STATE.guard.reason = String(reason || '');
    STATE.guard.untilTs = Math.max(toInt(STATE.guard.untilTs, 0), now() + DET.guardLockMs);

    if (!STATE.guard.lockedWork || meta.capture) {
      var pd = null;
      try { pd = getPlayData(); } catch (_) { pd = null; }
      STATE.guard.lockedWork = pd;
      try { if (pd && typeof pd.url === 'string') STATE.guard.lockedUrl = String(pd.url); } catch (_) { }
    }
    if (!STATE.guard.lockedSrcSig) {
      try { STATE.guard.lockedSrcSig = String(STATE.truth.srcSig || STATE.srcSig || ''); } catch (_) { }
    }
    try { STATE.guard.lockedTruthT = getTruthTime(); } catch (_) { }

    logEvt('WRN', 'guard_lock', { reason: STATE.guard.reason, untilMs: (STATE.guard.untilTs - now()), url: shortUrl(STATE.guard.lockedUrl), srcSig: STATE.guard.lockedSrcSig }, 'guard:lock:' + reason, 1500);
  }

  function unlockGuard(why) {
    STATE.guard.lock = false;
    STATE.guard.untilTs = 0;
    STATE.guard.reason = '';
    STATE.guard.lockedSrcSig = '';
    STATE.guard.lockedTruthT = 0;
    if (why) logEvt('INF', 'guard_unlock', { why: String(why || '') }, 'guard:unlock', 1500);
  }

  function markManualNext(type) {
    STATE.manual.allowNextTs = now();
    if (type) logEvt('DBG', 'manual_next_marker', { type: String(type) }, 'manual:next', 700);
  }

  function isManualAllowed() {
    var t = now();
    if (STATE.manual.allowNextTs && (t - STATE.manual.allowNextTs) <= DET.manualNextAllowMs) return true;
    try { if (document && document.body && document.body.classList && document.body.classList.contains('selectbox--open')) return true; } catch (_) { }
    return false;
  }

  function isSeekRecent(ts) {
    ts = toInt(ts, 0);
    if (!STATE.seek.lastSeekTs) return false;
    return (ts - STATE.seek.lastSeekTs) >= 0 && (ts - STATE.seek.lastSeekTs) <= DET.seekGuardMs;
  }

  function markSeek() {
    STATE.seek.lastSeekTs = now();
    try {
      var v = null;
      try { v = STATE.video || (window.Lampa && Lampa.PlayerVideo && typeof Lampa.PlayerVideo.video === 'function' ? Lampa.PlayerVideo.video() : null); } catch (_) { v = STATE.video; }
      if (v && typeof v.currentTime !== 'undefined') {
        var ct = toNum(v.currentTime, NaN);
        if (isFinite(ct) && ct >= 0) {
          STATE.truth.t = ct;
          STATE.truth.ts = now();
          try {
            var dur = toNum(v.duration, NaN);
            if (isFinite(dur) && dur > 0) STATE.truth.dur = dur;
          } catch (_) { }
          try { STATE.truth.srcSig = String(STATE.srcSig || ''); } catch (_) { }
          STATE.truth.fromSession = true;
          return;
        }
      }
    } catch (_) { }
    STATE.truth.ts = 0;
    STATE.truth.fromSession = false;
  }

  function markBuffering(on, type, details) {
    STATE.session.buffering = !!on;
    if (on) {
      STATE.fault.lastTs = now();
      STATE.fault.lastType = String(type || 'buffering');
      STATE.fault.lastDetails = String(details || '');
      STATE.fault.lastLongTs = STATE.fault.lastTs;
      STATE.fault.seq++;
      if (CFG.debugPopup) logEvt('DBG', 'fault_detected', { type: STATE.fault.lastType }, 'fault:' + STATE.fault.lastType, 1200);
    }
  }

  function shortUrl(u) {
    try { u = String(u || ''); } catch (_) { u = ''; }
    if (!u) return '';
    if (u.length <= 160) return u;
    return u.slice(0, 140) + '…';
  }

  function getTruthTime() {
    var t0 = toNum(STATE.truth.t, 0);
    if (STATE.truth.fromSession) return Math.max(0, t0);
    var saved = readTruthLS();
    if (saved && isFinite(toNum(saved.t, NaN))) return Math.max(0, toNum(saved.t, 0));
    return Math.max(0, t0);
  }

  function shouldKeepTruthOnEnded(ts) {
    ts = toInt(ts, 0);
    if (isGuardLocked()) return true;
    if (STATE.fault.lastLongTs && (ts - STATE.fault.lastLongTs) < DET.keepFaultMs) return true;
    if (isRecovering()) return true;
    return false;
  }

  function isFaultWindowOpen(ts) {
    ts = toInt(ts, 0);
    if (!STATE.fault.lastTs) return false;
    return (ts - STATE.fault.lastTs) >= 0 && (ts - STATE.fault.lastTs) <= DET.faultWindowMs;
  }

  function shouldFalseEndByEnded(ts, cur, dur) {
    if (!CFG.enabled) return false;
    if (isSeekRecent(ts)) return false;

    var truthT = getTruthTime();
    if (!truthT || truthT < DET.minWatchTimeSec) return false;

    dur = toNum(dur, 0);
    cur = toNum(cur, NaN);

    if (isFinite(dur) && dur > 0) {
      if (truthT >= dur - DET.epsilonEndSec) return false;
      if ((dur - truthT) < 10) return false;
    } else {
      // duration unknown: treat ended as suspicious only if we had recent fault and watched enough
      if (truthT < DET.reset0MinTruthSec) return false;
    }

    if (!isFaultWindowOpen(ts)) return false;
    return true;
  }

  function shouldFalseEndByJump(ts, cur, dur) {
    if (!CFG.enabled) return false;
    if (!isFaultWindowOpen(ts)) return false;
    if (isSeekRecent(ts)) return false;

    var truthT = getTruthTime();
    if (!truthT || truthT < DET.minWatchTimeSec) return false;

    dur = toNum(dur, 0);
    cur = toNum(cur, NaN);
    if (!isFinite(dur) || dur <= 0) return false;
    if (!isFinite(cur) || cur < 0) return false;

    if (truthT >= dur - DET.epsilonEndSec) return false;
    if ((dur - truthT) < 10) return false;

    if (cur < dur - DET.epsilonEndSec) return false;
    var jump = cur - truthT;
    if (!isFinite(jump) || jump < DET.jumpThresholdSec) return false;
    return true;
  }

  function shouldSessionReset0(ts, cur, dur, video) {
    if (!CFG.enabled) return false;
    if (isSeekRecent(ts)) return false;
    if (isRecovering() && STATE.rec.mode !== MODE_SOFT) return false;

    var truthT = getTruthTime();
    if (!STATE.truth.fromSession) return false;
    if (truthT < DET.reset0MinTruthSec) return false;

    cur = toNum(cur, NaN);
    dur = toNum(dur, NaN);
    if (isFinite(cur) && cur <= DET.reset0EpsSec) {
      // after we had a valid session
      if (STATE.session.maxTimeSec > DET.reset0MinTruthSec) return true;
      if (truthT >= DET.reset0HardTruthSec && STATE.session.hadValidDur) return true;
    }
    if (STATE.session.hadValidDur && (!isFinite(dur) || dur <= 0)) {
      if (truthT >= DET.reset0HardTruthSec) return true;
    }

    // src emptied after valid session
    try {
      var s = pickSrc(video);
      if (!s && truthT >= DET.reset0HardTruthSec) return true;
    } catch (_) { }

    return false;
  }

  function shouldSessionSrcChange(ts, cur, dur, video) {
    if (!CFG.enabled) return false;
    if (isSeekRecent(ts)) return false;
    if (!STATE.truth.fromSession) return false;

    var truthT = getTruthTime();
    if (truthT < DET.reset0HardTruthSec) return false;

    var a = '';
    var b = '';
    try { a = String(STATE.truth.srcSig || ''); } catch (_) { a = ''; }
    try { b = String(STATE.srcSig || ''); } catch (_) { b = ''; }
    if (!a || !b) return false;
    if (a === b) return false;

    try { if (STATE.session.lastSrcChangeTs && (ts - STATE.session.lastSrcChangeTs) < 8000) return false; } catch (_) { }

    if (!isFaultWindowOpen(ts) && !isGuardLocked()) return false;

    cur = toNum(cur, NaN);
    dur = toNum(dur, NaN);
    if (!isFinite(dur) || dur <= 0) return true;
    if (!isFinite(cur) || cur <= DET.reset0EpsSec) return true;
    try {
      var rs = video && typeof video.readyState === 'number' ? video.readyState : 0;
      if (rs <= 1) return true;
    } catch (_) { }
    return false;
  }

  function updateTruthFromTimeupdate(ts, cur, dur, video) {
    if (!CFG.enabled) return;
    if (isRecovering()) return;

    var rs = 0;
    try { rs = video && typeof video.readyState === 'number' ? video.readyState : 0; } catch (_) { rs = 0; }
    if (rs < 2) return;

    dur = toNum(dur, NaN);
    cur = toNum(cur, NaN);
    if (!isFinite(dur) || dur <= 0) return;
    if (!isFinite(cur) || cur < 0) return;

    try { if (video && video.paused) return; } catch (_) { }
    if (STATE.session.buffering) return;

    if (cur >= dur - DET.epsilonEndSec) return;

    // smooth progress only
    var prevT = toNum(STATE.truth.t, 0);
    var prevTs = toInt(STATE.truth.ts, 0);

    if (!prevTs) {
      STATE.truth.t = cur;
      STATE.truth.ts = ts;
      STATE.truth.dur = dur;
      STATE.truth.srcSig = String(STATE.srcSig || '');
      STATE.truth.fromSession = true;
      return;
    }

    var dcur = cur - prevT;
    var dts = (ts - prevTs) / 1000;
    if (!isFinite(dts) || dts <= 0) dts = 0.001;
    if (!isFinite(dcur) || dcur <= 0) return;

    var maxStep = Math.max(3.5, Math.min(12, dts * 2.5 + 1.0));
    if (dcur > maxStep) return;

    STATE.truth.t = cur;
    STATE.truth.ts = ts;
    STATE.truth.dur = dur;
    STATE.truth.srcSig = String(STATE.srcSig || '');
    STATE.truth.fromSession = true;

    // throttle storage writes
    if (STATE.truth.lastSaveTs && (ts - STATE.truth.lastSaveTs) < DET.saveThrottleMs) return;
    STATE.truth.lastSaveTs = ts;
    writeTruthLS(cur, dur, STATE.truth.srcSig, 'tick');
  }

  function updateRecoveryStability(ts, cur, dur, video) {
    if (!isRecovering()) return;

    cur = toNum(cur, NaN);
    dur = toNum(dur, NaN);
    if (!isFinite(cur) || cur < 0) return;
    if (!isFinite(dur) || dur <= 0) return;

    var paused = false;
    try { paused = video ? !!video.paused : false; } catch (_) { paused = false; }
    if (paused) return;
    if (STATE.session.buffering) return;

    if (!isFinite(STATE.rec.pendingSeekSec)) STATE.rec.pendingSeekSec = STATE.rec.resumeTimeSec;
    var resume = toNum(STATE.rec.pendingSeekSec, toNum(STATE.rec.resumeTimeSec, 0));
    if (cur < resume - 1.5) return;

    if (isFinite(STATE.rec.stableLastCur)) {
      var dcur = cur - STATE.rec.stableLastCur;
      var dts = (ts - STATE.rec.stableLastTs) / 1000;
      if (isFinite(dcur) && isFinite(dts) && dts > 0) {
        if (dcur > 0.15 && dcur < 8) {
          STATE.rec.stableSec += dcur;
        } else if (dcur < 0 || dcur >= DET.jumpThresholdSec) {
          STATE.rec.stableSec = 0;
        }
      }
    }

    STATE.rec.stableLastCur = cur;
    STATE.rec.stableLastTs = ts;

    if (STATE.rec.stableSec >= DET.stableOkSec && cur >= resume + 1 && cur < dur - DET.epsilonEndSec) {
      recoverySuccess('stable', { stable: STATE.rec.stableSec.toFixed(2), cur: cur.toFixed(2) });
    }
  }

  function applyPendingParamsAndSeek(video, why) {
    if (!isRecovering()) return;

    if (STATE.rec.pendingParams && window.Lampa && Lampa.PlayerVideo && typeof Lampa.PlayerVideo.setParams === 'function') {
      try {
        Lampa.PlayerVideo.setParams(STATE.rec.pendingParams);
        logEvt('DBG', 'apply_params', { why: String(why || '') }, 'rec:params', 800);
      } catch (_) { }
      STATE.rec.pendingParams = null;
    }

    var t = toNum(STATE.rec.pendingSeekSec, NaN);
    if (!isFinite(t) || t < 0) return;

    try {
      // Only force seek if we're at the beginning or at the tail
      var cur = toNum(video.currentTime, NaN);
      var dur = toNum(video.duration, NaN);
      var need = false;
      if (!isFinite(cur) || cur <= 1.0) need = true;
      else if (isFinite(dur) && dur > 0 && cur >= dur - DET.epsilonEndSec) need = true;
      if (need) {
        try { video.currentTime = Math.max(0, t); } catch (_) { }
        try { if (video && typeof video.play === 'function') video.play(); } catch (_) { }
        logEvt('INF', 'force_seek', { why: String(why || ''), to: t.toFixed(2) }, 'rec:seek:' + String(why || ''), 900);
      }
    } catch (_) { }
  }

  function faultDetected(type, meta) {
    meta = meta || {};
    var ts = now();
    STATE.fault.lastTs = ts;
    STATE.fault.lastType = String(type || '');
    STATE.fault.lastDetails = kv(meta) || '';
    STATE.fault.lastLongTs = ts;
    STATE.fault.seq++;

    var video = null;
    try { video = STATE.video || (window.Lampa && Lampa.PlayerVideo && Lampa.PlayerVideo.video ? Lampa.PlayerVideo.video() : null); } catch (_) { video = STATE.video; }

    logEvt('WRN', 'fault_detected', {
      type: STATE.fault.lastType,
      truth: fmtTime(getTruthTime()),
      t: video ? toNum(video.currentTime, 0).toFixed(2) : '',
      dur: video ? toNum(video.duration, 0).toFixed(2) : '',
      rs: video && typeof video.readyState !== 'undefined' ? String(video.readyState) : '',
      ns: video && typeof video.networkState !== 'undefined' ? String(video.networkState) : '',
      srcSig: String(STATE.srcSig || ''),
      reason: meta && meta.reason ? String(meta.reason) : ''
    }, 'fault:' + STATE.fault.lastType, 1400);
  }

  function scheduleNextAttempt(delayMs) {
    clearTimers();
    delayMs = toInt(delayMs, 0);

    var minShow = 0;
    try {
      var popupMinMs = clampInt(CFG.popupMinSec, 1, 5) * 1000;
      if (STATE.rec.stepShownTs) minShow = popupMinMs - (now() - STATE.rec.stepShownTs);
      if (minShow < 0) minShow = 0;
    } catch (_) { minShow = 0; }
    if (minShow > delayMs) delayMs = minShow;

    STATE.rec.nextTimer = setTimeout(function () {
      try {
        if (!CFG.enabled) return;
        if (!isRecovering()) return;

        // If we already have movement, wait a bit more (do not spam attempts).
        if (STATE.rec.stableSec > 0.8 && (now() - STATE.fault.lastTs) > 1200) {
          scheduleNextAttempt(clampInt(CFG.attemptDelaySec, 1, 5) * 1000);
          return;
        }
        runRecoveryAttempt();
      } catch (_) { }
    }, Math.max(0, delayMs));
  }

  function recoveryStop(why) {
    if (STATE.rec.mode === MODE_NORMAL) return;
    clearTimers();
    uiHide();
    STATE.rec.mode = MODE_NORMAL;
    STATE.rec.reason = '';
    STATE.rec.resumeTimeSec = 0;
    STATE.rec.pendingSeekSec = NaN;
    STATE.rec.pendingParams = null;
    STATE.rec.stableSec = 0;
    STATE.rec.stableLastCur = NaN;
    STATE.rec.stableLastTs = 0;
    if (why) logEvt('INF', 'recovery_stop', { why: String(why || '') }, 'rec:stop', 1500);
  }

  function recoveryFail(why) {
    clearTimers();
    STATE.rec.mode = MODE_FAIL;
    var video = null;
    try { video = STATE.video || (window.Lampa && Lampa.PlayerVideo && Lampa.PlayerVideo.video ? Lampa.PlayerVideo.video() : null); } catch (_) { video = STATE.video; }

    var info = 'truth=' + fmtTime(getTruthTime()) + ' | resume=' + fmtTime(STATE.rec.resumeTimeSec);
    var details = CFG.debugPopup ? (String(why || '') + '\n' + mediaState(video)) : '';
    uiShowFail('FAILED', info, details);
    lockGuard('failed', { capture: false });
    logEvt('ERR', 'fail', { why: String(why || ''), truth: fmtTime(getTruthTime()), resume: fmtTime(STATE.rec.resumeTimeSec) }, 'rec:fail', 2000);
  }

  function recoverySuccess(why, meta) {
    if (!isRecovering()) return;
    clearTimers();
    STATE.rec.lastRecoveryMode = STATE.rec.mode;
    STATE.rec.lastOkTs = now();
    STATE.rec.mode = MODE_NORMAL;
    STATE.rec.reason = '';
    STATE.rec.pendingSeekSec = NaN;
    STATE.rec.pendingParams = null;
    STATE.session.health = 'OK';

    logEvt('OK', 'success', {
      why: String(why || ''),
      stable: STATE.rec.stableSec.toFixed(2),
      truth: fmtTime(getTruthTime()),
      srcSig: String(STATE.srcSig || '')
    }, 'rec:ok', 1200);

    uiShowOk('Восстановлено');
    STATE.rec.okTimer = setTimeout(function () { uiHide(); }, 1500);
    unlockGuard('recovered');
  }

  function pickResumeTime(video) {
    var truthT = getTruthTime();
    var t = truthT;
    var dur = 0;
    try { dur = video ? toNum(video.duration, 0) : 0; } catch (_) { dur = 0; }
    if (isFinite(dur) && dur > 0) t = Math.min(t, Math.max(0, dur - DET.epsilonEndSec));
    return Math.max(0, t);
  }

  function enterRecovery(mode, reason, meta) {
    meta = meta || {};
    if (!CFG.enabled) return;

    var hard = (String(mode || '') === MODE_HARD) || !!meta.forceHard;
    var nextMode = hard ? MODE_HARD : MODE_SOFT;

    // Escalate from soft to hard if requested or if we are already failing often.
    if (isRecovering()) {
      if (!hard && STATE.rec.mode === MODE_HARD) nextMode = MODE_HARD;
      if (hard && STATE.rec.mode !== MODE_HARD) {
        logEvt('WRN', 'escalate', { from: STATE.rec.mode, to: MODE_HARD, why: String(reason || '') }, 'rec:escalate', 1200);
        nextMode = MODE_HARD;
      }
    }

    var video = null;
    try { video = STATE.video || (window.Lampa && Lampa.PlayerVideo && Lampa.PlayerVideo.video ? Lampa.PlayerVideo.video() : null); } catch (_) { video = STATE.video; }
    updateStreamContext(video, null);

    // repeated fault after soft success => hard
    try {
      if (!hard && STATE.rec.lastRecoveryMode === MODE_SOFT && STATE.rec.lastOkTs && (now() - STATE.rec.lastOkTs) < DET.repeatFaultHardMs) {
        nextMode = MODE_HARD;
      }
    } catch (_) { }

    STATE.rec.seq++;
    STATE.rec.mode = nextMode;
    STATE.rec.reason = String(reason || '');
    STATE.rec.softMax = clampInt(CFG.softAttempts, 1, 10);
    STATE.rec.hardMax = clampInt(CFG.hardAttempts, 0, 5);
    STATE.rec.softAttempt = 0;
    STATE.rec.hardAttempt = 0;
    STATE.rec.stableSec = 0;
    STATE.rec.stableLastCur = NaN;
    STATE.rec.stableLastTs = 0;

    var resume = pickResumeTime(video);
    STATE.rec.resumeTimeSec = resume;
    STATE.rec.pendingSeekSec = resume;

    if (CFG.storePos) writeTruthLS(resume, safe(function () { return video ? video.duration : 0; }, 0), String(STATE.srcSig || ''), 'recovery_enter');

    lockGuard(String(reason || ''), { capture: true });

    var stage = (nextMode === MODE_HARD ? 'HARD' : 'SOFT') + ' start';
    var info = 'attempt 0/' + String(nextMode === MODE_HARD ? STATE.rec.hardMax : STATE.rec.softMax) + ' | truth=' + fmtTime(getTruthTime()) + ' | video=' + fmtTime(video ? video.currentTime : 0) + ' | dur=' + fmtTime(video ? video.duration : 0);
    var details = CFG.debugPopup ? ('reason=' + String(reason || '') + '\n' + mediaState(video)) : '';
    uiShowRecover(stage, info, details);

    logEvt('WRN', 'enter_recovery', {
      mode: nextMode === MODE_HARD ? 'hard' : 'soft',
      reason: String(reason || ''),
      resume: resume.toFixed(2),
      truth: getTruthTime().toFixed(2),
      srcSig: String(STATE.srcSig || '')
    }, 'rec:enter:' + String(reason || ''), 1200);

    scheduleNextAttempt(0);
  }

  function softActionName(n) {
    if (n === 1) return 'seek_play';
    if (n === 2) return 'pause_load_seek_play';
    if (n === 3) return 'reload_url_seek_play';
    return 'seek_play';
  }

  function hardActionName(n) {
    if (n === 1) return 'hard_reload_video';
    return 'hard_reopen_player';
  }

  function actionSeekPlay(video, t) {
    try { if (!video) return; } catch (_) { return; }
    try { video.currentTime = Math.max(0, t); } catch (_) { }
    try { if (typeof video.play === 'function') video.play(); } catch (_) { }
  }

  function actionPauseLoadSeek(video, t) {
    try { if (!video) return; } catch (_) { return; }
    safe(function () { if (typeof video.pause === 'function') video.pause(); });
    safe(function () { if (typeof video.load === 'function') video.load(); });
    setTimeout(function () { actionSeekPlay(video, t); }, 250);
  }

  function actionReloadUrl(url, t) {
    try {
      if (!window.Lampa || !Lampa.PlayerVideo) return false;
      if (typeof Lampa.PlayerVideo.url !== 'function') return false;
      var params = null;
      try { if (typeof Lampa.PlayerVideo.saveParams === 'function') params = Lampa.PlayerVideo.saveParams(); } catch (_) { params = null; }
      if (params) STATE.rec.pendingParams = params;
      STATE.rec.pendingSeekSec = t;
      Lampa.PlayerVideo.url(String(url || ''), true);
      return true;
    } catch (_) {
      return false;
    }
  }

  function actionHardReloadVideo(url, t) {
    try {
      if (!window.Lampa || !Lampa.PlayerVideo) return false;
      var params = null;
      try { if (typeof Lampa.PlayerVideo.saveParams === 'function') params = Lampa.PlayerVideo.saveParams(); } catch (_) { params = null; }
      if (params) STATE.rec.pendingParams = params;
      STATE.rec.pendingSeekSec = t;
      try { if (typeof Lampa.PlayerVideo.destroy === 'function') Lampa.PlayerVideo.destroy(true); } catch (_) { }
      try { if (typeof Lampa.PlayerVideo.url === 'function') Lampa.PlayerVideo.url(String(url || ''), true); } catch (_) { return false; }
      return true;
    } catch (_) {
      return false;
    }
  }

  function actionHardReopenPlayer(t) {
    try {
      if (!window.Lampa || !Lampa.Player || typeof Lampa.Player.play !== 'function') return false;

      var pd = STATE.guard.lockedWork || getPlayData();
      if (!pd || typeof pd !== 'object') return false;
      if (!pd.url || typeof pd.url !== 'string') return false;

      // try to avoid preroll if possible (playlist continue)
      try { pd.continue_play = true; } catch (_) { }
      try {
        if (pd.timeline && typeof pd.timeline === 'object') {
          pd.timeline.time = t;
          pd.timeline.continued = false;
          pd.timeline.continued_bloc = false;
          pd.timeline.waiting_for_user = false;
        }
      } catch (_) { }

      var params = null;
      try { if (window.Lampa && Lampa.PlayerVideo && typeof Lampa.PlayerVideo.saveParams === 'function') params = Lampa.PlayerVideo.saveParams(); } catch (_) { params = null; }
      if (params) STATE.rec.pendingParams = params;
      STATE.rec.pendingSeekSec = t;

      try { if (typeof Lampa.Player.close === 'function') Lampa.Player.close(); } catch (_) { }

      setTimeout(function () {
        try {
          if (!CFG.enabled) return;
          if (!isRecovering()) return;
          // allow our own reopen while guard lock is active
          Lampa.Player.play(pd);
        } catch (_) { }
      }, 350);

      return true;
    } catch (_) {
      return false;
    }
  }

  function runRecoveryAttempt() {
    if (!CFG.enabled) return;
    if (!isRecovering()) return;

    var video = null;
    try { video = STATE.video || (window.Lampa && Lampa.PlayerVideo && Lampa.PlayerVideo.video ? Lampa.PlayerVideo.video() : null); } catch (_) { video = STATE.video; }
    updateStreamContext(video, null);

    var delayMs = clampInt(CFG.attemptDelaySec, 1, 5) * 1000;
    var resume = pickResumeTime(video);
    STATE.rec.resumeTimeSec = resume;
    STATE.rec.pendingSeekSec = resume;

    var action = '';
    var ok = false;
    var mode = STATE.rec.mode;

    if (mode === MODE_SOFT) {
      if (STATE.rec.softAttempt >= STATE.rec.softMax) {
        if (STATE.rec.hardMax > 0) return enterRecovery(MODE_HARD, 'soft_exhausted', { forceHard: true });
        return recoveryFail('soft_exhausted');
      }

      STATE.rec.softAttempt++;
      action = softActionName(STATE.rec.softAttempt);

      if (STATE.rec.softAttempt === 1) ok = true, actionSeekPlay(video, resume);
      else if (STATE.rec.softAttempt === 2) ok = true, actionPauseLoadSeek(video, resume);
      else {
        var url = '';
        try { url = (STATE.guard.lockedUrl && typeof STATE.guard.lockedUrl === 'string') ? STATE.guard.lockedUrl : String(STATE.streamId || STATE.src || ''); } catch (_) { url = ''; }
        ok = actionReloadUrl(url, resume);
      }
    } else if (mode === MODE_HARD) {
      if (STATE.rec.hardAttempt >= STATE.rec.hardMax) return recoveryFail('hard_exhausted');
      STATE.rec.hardAttempt++;
      action = hardActionName(STATE.rec.hardAttempt);

      var url2 = '';
      try { url2 = (STATE.guard.lockedUrl && typeof STATE.guard.lockedUrl === 'string') ? STATE.guard.lockedUrl : String(STATE.streamId || STATE.src || ''); } catch (_) { url2 = ''; }

      if (STATE.rec.hardAttempt === 1) ok = actionHardReloadVideo(url2, resume);
      else ok = actionHardReopenPlayer(resume);
    }

    STATE.rec.attemptStartedTs = now();
    lockGuard('attempt', { capture: false });

    var total = (mode === MODE_HARD) ? STATE.rec.hardMax : STATE.rec.softMax;
    var n = (mode === MODE_HARD) ? STATE.rec.hardAttempt : STATE.rec.softAttempt;
    var stage = (mode === MODE_HARD ? 'HARD' : 'SOFT') + ' attempt ' + String(n) + '/' + String(total) + ': ' + action;
    var info = 'truth=' + fmtTime(getTruthTime()) + ' | video=' + fmtTime(video ? video.currentTime : 0) + ' | resume=' + fmtTime(resume) + ' | dur=' + fmtTime(video ? video.duration : 0);
    var details = CFG.debugPopup ? ('reason=' + String(STATE.rec.reason || '') + '\n' + mediaState(video)) : '';
    uiShowRecover(stage, info, details);

    logEvt('INF', 'attempt', {
      mode: mode === MODE_HARD ? 'hard' : 'soft',
      n: n,
      m: total,
      action: action,
      ok: ok ? 1 : 0,
      resume: resume.toFixed(2),
      truth: getTruthTime().toFixed(2),
      srcSig: String(STATE.srcSig || '')
    }, 'rec:attempt:' + mode + ':' + action, 0);

    STATE.rec.evalTimer = setTimeout(function () {
      try {
        if (!CFG.enabled) return;
        if (!isRecovering()) return;
        scheduleNextAttempt(delayMs);
      } catch (_) { }
    }, Math.min(DET.attemptEvalMs, delayMs));
  }

  function exitPlayer(why) {
    logEvt('INF', 'exit', { why: String(why || '') }, 'ui:exit', 1200);
    recoveryStop('exit');
    unlockGuard('exit');
    safe(function () { if (window.Lampa && Lampa.Player && typeof Lampa.Player.close === 'function') return Lampa.Player.close(); });
    safe(function () { if (window.Lampa && Lampa.Controller && typeof Lampa.Controller.back === 'function') return Lampa.Controller.back(); });
  }

  function handlePlayerVideoSend(origSend, args) {
    var ts = now();
    var type = (args && args.length) ? args[0] : '';
    var data = (args && args.length > 1) ? args[1] : undefined;
    var t = String(type || '');

    var video = null;
    try { video = STATE.video || (window.Lampa && Lampa.PlayerVideo && Lampa.PlayerVideo.video ? Lampa.PlayerVideo.video() : null); } catch (_) { video = STATE.video; }
    updateStreamContext(video, null);

    if (t === 'timeupdate') {
      var cur = safe(function () { return (data && data.current !== undefined) ? data.current : (video ? video.currentTime : 0); }, 0);
      var dur = safe(function () { return (data && data.duration !== undefined) ? data.duration : (video ? video.duration : 0); }, 0);

      // session baseline update
      try {
        if (isFinite(toNum(dur, NaN)) && toNum(dur, 0) > 0) {
          STATE.session.hadValidDur = true;
          STATE.session.lastValidDurSec = toNum(dur, 0);
          STATE.session.lastValidDurTs = ts;
        }
        if (isFinite(toNum(cur, NaN)) && toNum(cur, 0) > STATE.session.maxTimeSec) STATE.session.maxTimeSec = toNum(cur, 0);
      } catch (_) { }

      if (shouldSessionReset0(ts, cur, dur, video)) {
        STATE.session.health = 'SUSPECT';
        lockGuard('session_reset0', { capture: true });
        faultDetected('reset0', { reason: 't/dur reset', cur: toNum(cur, 0).toFixed(2), dur: toNum(dur, 0).toFixed(2) });
        enterRecovery(MODE_HARD, 'reset0', { forceHard: true });
        return; // suppress bad timeupdate (avoid UI reset to 0)
      }

      if (shouldFalseEndByJump(ts, cur, dur)) {
        STATE.session.health = 'SUSPECT';
        lockGuard('false_jump', { capture: true });
        faultDetected('falseended_jump', { reason: 'jump_to_end', cur: toNum(cur, 0).toFixed(2), dur: toNum(dur, 0).toFixed(2) });
        enterRecovery(MODE_SOFT, 'jump', {});
        return; // suppress bad timeupdate (avoid seekbar 100%)
      }

      if (shouldSessionSrcChange(ts, cur, dur, video)) {
        STATE.session.health = 'SUSPECT';
        lockGuard('srcchange', { capture: true });
        faultDetected('srcchange', { reason: 'srcSig changed', from: String(STATE.truth.srcSig || ''), to: String(STATE.srcSig || '') });
        enterRecovery(MODE_HARD, 'srcchange', { forceHard: true });
        return;
      }

      // during recovery: attempt pending seek on early signals
      if (isRecovering() && video) {
        applyPendingParamsAndSeek(video, 'timeupdate');
      }

      if (!isRecovering()) updateTruthFromTimeupdate(ts, cur, dur, video);
      updateRecoveryStability(ts, cur, dur, video);

      return origSend.apply(this, args || []);
    }

    if (t === 'ended') {
      var cur2 = safe(function () { return video ? video.currentTime : 0; }, 0);
      var dur2 = safe(function () { return video ? video.duration : 0; }, 0);

      if (shouldFalseEndByEnded(ts, cur2, dur2)) {
        STATE.session.health = 'SUSPECT';
        lockGuard('false_ended', { capture: true });
        faultDetected('falseended', { reason: 'ended_after_fault' });
        enterRecovery(MODE_SOFT, 'ended', {});
        return; // suppress ended => no autoplay next
      }

      // If we are recovering or in guardLock: treat ended as suspicious (do not clear truth)
      if (isRecovering() || isGuardLocked()) {
        lockGuard('ended_during_guard', { capture: true });
        faultDetected('ended_guard', { reason: 'ended while guard/recover' });
        enterRecovery(MODE_HARD, 'ended_guard', { forceHard: true });
        return;
      }

      if (!shouldKeepTruthOnEnded(ts)) deleteTruthLS('ended');
      else logEvt('WRN', 'truth_keep_on_ended', { why: 'recent_fault_or_guard' }, 'truth:keep:end', 2500);

      return origSend.apply(this, args || []);
    }

    if (t === 'error') {
      markBuffering(true, 'error', safe(function () { return (data && data.error) ? JSON.stringify(data.error) : ''; }, ''));
      return origSend.apply(this, args || []);
    }

    if (t === 'canplay' || t === 'loadeddata' || t === 'play' || t === 'pause') {
      if (isRecovering() && video) applyPendingParamsAndSeek(video, t);
      if (t === 'play') STATE.session.buffering = false;
      return origSend.apply(this, args || []);
    }

    return origSend.apply(this, args || []);
  }

  function attachToVideo(video, srcHint) {
    if (!video) return false;
    updateStreamContext(video, srcHint);
    STATE.video = video;

    // detach previous
    detachVideoListeners();

    STATE._prevVideo = video;
    STATE._boundHandlers = {};

    function on(type, fn) {
      try {
        if (!video || typeof video.addEventListener !== 'function') return;
        STATE._boundHandlers[type] = fn;
        video.addEventListener(type, fn, true);
      } catch (_) {
        try { video.addEventListener(type, fn); } catch (__e) { }
      }
    }

    on('waiting', function () { try { if (!CFG.enabled) return; if (STATE.video === video) markBuffering(true, 'waiting', ''); } catch (_) { } });
    on('stalled', function () { try { if (!CFG.enabled) return; if (STATE.video === video) markBuffering(true, 'stalled', ''); } catch (_) { } });
    on('error', function () { try { if (!CFG.enabled) return; if (STATE.video === video) markBuffering(true, 'error', ''); } catch (_) { } });
    on('abort', function () { try { if (!CFG.enabled) return; if (STATE.video === video) markBuffering(true, 'abort', ''); } catch (_) { } });
    on('emptied', function () { try { if (!CFG.enabled) return; if (STATE.video === video) markBuffering(true, 'emptied', ''); } catch (_) { } });
    on('playing', function () { try { if (!CFG.enabled) return; if (STATE.video === video) STATE.session.buffering = false; } catch (_) { } });
    on('canplay', function () { try { if (!CFG.enabled) return; if (STATE.video === video) STATE.session.buffering = false; } catch (_) { } });
    on('loadedmetadata', function () { try { if (!CFG.enabled) return; if (STATE.video === video) applyPendingParamsAndSeek(video, 'loadedmetadata'); } catch (_) { } });
    on('loadeddata', function () { try { if (!CFG.enabled) return; if (STATE.video === video) applyPendingParamsAndSeek(video, 'loadeddata_evt'); } catch (_) { } });
    on('seeking', function () { try { if (!CFG.enabled) return; if (STATE.video === video) markSeek(); } catch (_) { } });
    on('seeked', function () { try { if (!CFG.enabled) return; if (STATE.video === video) markSeek(); } catch (_) { } });

    return true;
  }

  function patchPlayerVideo() {
    if (STATE.patched.video) return true;
    if (!window.Lampa || !Lampa.PlayerVideo) return false;
    var pv = Lampa.PlayerVideo;
    if (!pv || typeof pv !== 'object') return false;

    try {
      if (typeof pv.to === 'function' && !pv.to.__blPlayerGuardWrappedV2) {
        var origTo = pv.to;
        pv.to = function () { try { if (CFG.enabled) markSeek(); } catch (_) { } return origTo.apply(this, arguments); };
        pv.to.__blPlayerGuardWrappedV2 = true;
      }
    } catch (_) { }

    try {
      if (typeof pv.rewind === 'function' && !pv.rewind.__blPlayerGuardWrappedV2) {
        var origRewind = pv.rewind;
        pv.rewind = function () { try { if (CFG.enabled) markSeek(); } catch (_) { } return origRewind.apply(this, arguments); };
        pv.rewind.__blPlayerGuardWrappedV2 = true;
      }
    } catch (_) { }

    try {
      if (pv.listener && typeof pv.listener.send === 'function' && !pv.listener.send.__blPlayerGuardWrappedV2) {
        var origSend = pv.listener.send;
        pv.listener.send = function () {
          if (!CFG.enabled) return origSend.apply(this, arguments);
          return handlePlayerVideoSend.call(this, origSend, arguments);
        };
        pv.listener.send.__blPlayerGuardWrappedV2 = true;
      }
    } catch (_) { }

    try {
      if (typeof pv.url === 'function' && !pv.url.__blPlayerGuardWrappedV2) {
        var origUrl = pv.url;
        pv.url = function (src, change_quality) {
          try { if (change_quality) STATE.session.lastSrcChangeTs = now(); } catch (_) { }
          var r = origUrl.apply(this, arguments);
          try {
            var v = null;
            try { v = pv.video ? pv.video() : null; } catch (_) { v = null; }
            if (CFG.enabled) attachToVideo(v, src);
          } catch (_) { }
          return r;
        };
        pv.url.__blPlayerGuardWrappedV2 = true;
      }
    } catch (_) { }

    // do not wrap destroy(): we keep truth across session reset; destroy is used during HARD.

    try { if (typeof pv.video === 'function' && CFG.enabled) attachToVideo(pv.video(), null); } catch (_) { }

    STATE.patched.video = true;
    logEvt('OK', 'installed', { what: 'PlayerVideo' }, 'pg:installed:video', 5000);
    return true;
  }

  function patchPlaylist() {
    if (STATE.patched.playlist) return true;
    if (!window.Lampa || !Lampa.PlayerPlaylist) return false;
    var pl = Lampa.PlayerPlaylist;
    if (!pl || typeof pl !== 'object') return false;

    try {
      if (pl.listener && typeof pl.listener.send === 'function' && !pl.listener.send.__blPlayerGuardWrappedV2) {
        var origSend = pl.listener.send;
        pl.listener.send = function () {
          if (!CFG.enabled) return origSend.apply(this, arguments);
          var type = (arguments && arguments.length) ? arguments[0] : '';
          if (String(type || '') === 'select' && CFG.blockNext && isGuardLocked() && !isManualAllowed()) {
            logEvt('WRN', 'prevent_next', { where: 'playlist.select', reason: String(STATE.guard.reason || '') }, 'prevent:pl', 1200);
            // escalate if needed
            if (!isRecovering()) enterRecovery(MODE_HARD, 'prevent_next', { forceHard: true });
            return;
          }
          return origSend.apply(this, arguments);
        };
        pl.listener.send.__blPlayerGuardWrappedV2 = true;
      }
    } catch (_) { }

    STATE.patched.playlist = true;
    logEvt('OK', 'installed', { what: 'PlayerPlaylist' }, 'pg:installed:pl', 5000);
    return true;
  }

  function patchPanel() {
    if (STATE.patched.panel) return true;
    if (!window.Lampa || !Lampa.PlayerPanel) return false;
    var pp = Lampa.PlayerPanel;
    if (!pp || typeof pp !== 'object') return false;

    try {
      if (pp.listener && typeof pp.listener.send === 'function' && !pp.listener.send.__blPlayerGuardWrappedV2) {
        var origSend = pp.listener.send;
        pp.listener.send = function () {
          try {
            var type = (arguments && arguments.length) ? arguments[0] : '';
            var tt = String(type || '');
            if (tt === 'next' || tt === 'prev' || tt === 'to_end') markManualNext(tt);
          } catch (_) { }
          return origSend.apply(this, arguments);
        };
        pp.listener.send.__blPlayerGuardWrappedV2 = true;
      }
    } catch (_) { }

    STATE.patched.panel = true;
    logEvt('OK', 'installed', { what: 'PlayerPanel' }, 'pg:installed:panel', 5000);
    return true;
  }

  function patchPlayer() {
    if (STATE.patched.player) return true;
    if (!window.Lampa || !Lampa.Player) return false;
    var p = Lampa.Player;
    if (!p || typeof p !== 'object') return false;

    try {
      if (p.listener && typeof p.listener.send === 'function' && !p.listener.send.__blPlayerGuardWrappedV2) {
        var origSend = p.listener.send;
        p.listener.send = function () {
          if (!CFG.enabled) return origSend.apply(this, arguments);
          var type = (arguments && arguments.length) ? arguments[0] : '';
          var payload = (arguments && arguments.length > 1) ? arguments[1] : undefined;
          var t = String(type || '');

          if (t === 'create' && payload && payload.data && typeof payload.abort === 'function') {
            try {
              if (CFG.blockNext && isGuardLocked() && !isManualAllowed()) {
                var u = '';
                try { u = (payload.data && typeof payload.data.url === 'string') ? String(payload.data.url) : ''; } catch (_) { u = ''; }
                if (STATE.guard.lockedUrl && u && u !== STATE.guard.lockedUrl) {
                  payload.abort();
                  logEvt('WRN', 'prevent_next', { where: 'player.create', url: shortUrl(u), locked: shortUrl(STATE.guard.lockedUrl), reason: String(STATE.guard.reason || '') }, 'prevent:create', 1200);
                  if (!isRecovering()) enterRecovery(MODE_HARD, 'prevent_next', { forceHard: true });
                  return;
                }
              }
            } catch (_) { }
          }

          if (t === 'start' && payload && typeof payload === 'object') {
            try {
              if (CFG.blockNext && isGuardLocked() && !isManualAllowed()) {
                var uStart = '';
                try { uStart = (payload && typeof payload.url === 'string') ? String(payload.url) : ''; } catch (_) { uStart = ''; }
                if (STATE.guard.lockedUrl && uStart && uStart !== STATE.guard.lockedUrl) {
                  logEvt('WRN', 'prevent_next', { where: 'player.start', url: shortUrl(uStart), locked: shortUrl(STATE.guard.lockedUrl), reason: String(STATE.guard.reason || '') }, 'prevent:start', 1200);
                  enterRecovery(MODE_HARD, 'next_started', { forceHard: true });
                  return;
                }
              }

              var protect = false;
              try { protect = isRecovering() || isGuardLocked(); } catch (_) { protect = false; }
              try { if (!protect && STATE.fault.lastLongTs && (now() - STATE.fault.lastLongTs) < DET.keepFaultMs) protect = true; } catch (_) { }

              // New session baseline
              STATE.session.startedTs = now();
              STATE.session.buffering = false;
              STATE.session.lastSrcChangeTs = 0;

              if (!protect) {
                STATE.session.maxTimeSec = 0;
                STATE.session.hadValidDur = false;
                STATE.session.lastValidDurSec = 0;
                STATE.session.lastValidDurTs = 0;
                STATE.session.health = 'OK';

                // reset session-truth (LS stays as backup)
                STATE.truth.t = 0;
                STATE.truth.ts = 0;
                STATE.truth.dur = 0;
                STATE.truth.srcSig = '';
                STATE.truth.fromSession = false;
                STATE.truth.lastSaveTs = 0;
              }

              updateStreamContext(STATE.video, payload.url || '');
            } catch (_) { }
          }

          if (t === 'destroy') {
            try {
              if (isRecovering()) logEvt('WRN', 'session_destroy', { reason: String(STATE.guard.reason || ''), mode: STATE.rec.mode }, 'sess:destroy', 1500);
            } catch (_) { }
          }

          if (t === 'ready') {
            try {
              var video = null;
              try { video = STATE.video || (window.Lampa && Lampa.PlayerVideo && Lampa.PlayerVideo.video ? Lampa.PlayerVideo.video() : null); } catch (_) { video = STATE.video; }
              if (isRecovering() && video) applyPendingParamsAndSeek(video, 'player_ready');
            } catch (_) { }
          }

          return origSend.apply(this, arguments);
        };
        p.listener.send.__blPlayerGuardWrappedV2 = true;
      }
    } catch (_) { }

    STATE.patched.player = true;
    logEvt('OK', 'installed', { what: 'Player' }, 'pg:installed:player', 5000);
    return true;
  }

  function patchAll() {
    var ok = true;
    if (!patchPlayerVideo()) ok = false;
    if (!patchPlaylist()) ok = false;
    if (!patchPanel()) ok = false;
    if (!patchPlayer()) ok = false;
    return ok;
  }

  function readSettingsFromStorage() {
    try {
      CFG.enabled = parseBool(sGet(KEY_ENABLED, '0'), false);
      CFG.storePos = parseBool(sGet(KEY_STORE_POS, '1'), true);
      CFG.blockNext = parseBool(sGet(KEY_BLOCK_NEXT, '1'), true);
      CFG.debugPopup = parseBool(sGet(KEY_DEBUG_POPUP, '1'), true);

      var soft = sGet(KEY_SOFT_ATTEMPTS, null);
      if (soft === null || soft === undefined || soft === '') soft = sGet(KEY_ATTEMPTS_LEGACY, '4');
      CFG.softAttempts = clampInt(soft, 1, 10);

      CFG.hardAttempts = clampInt(sGet(KEY_HARD_ATTEMPTS, '1'), 0, 5);
      CFG.attemptDelaySec = clampInt(sGet(KEY_DELAY_SEC, '2'), 1, 5);
      CFG.popupMinSec = clampInt(sGet(KEY_POPUP_MIN_SEC, '2'), 1, 5);
    } catch (_) { }

    STATE.rec.softMax = clampInt(CFG.softAttempts, 1, 10);
    STATE.rec.hardMax = clampInt(CFG.hardAttempts, 0, 5);
    return CFG;
  }

  API.getConfig = function () { return CFG; };

  API.refresh = function () {
    var was = !!CFG.enabled;
    readSettingsFromStorage();

    if (was && !CFG.enabled) {
      recoveryStop('disabled');
      uiHide();
      detachVideoListeners();
      unlockGuard('disabled');
    } else if (!was && CFG.enabled) {
      try { patchAll(); } catch (_) { }
      try {
        if (window.Lampa && Lampa.PlayerVideo && typeof Lampa.PlayerVideo.video === 'function') {
          attachToVideo(Lampa.PlayerVideo.video(), null);
        }
      } catch (_) { }
      logEvt('INF', 'enabled', { soft: CFG.softAttempts, hard: CFG.hardAttempts, delay: CFG.attemptDelaySec, blockNext: CFG.blockNext ? 1 : 0 }, 'pg:enabled', 1500);
    }

    return CFG;
  };

  API.install = function () {
    if (STATE.installed) return true;
    STATE.installed = true;

    readSettingsFromStorage();

    var tries = 0;
    var t = setInterval(function () {
      tries++;
      if (patchAll()) {
        clearInterval(t);
        return;
      }
      if (tries >= 140) clearInterval(t);
    }, 250);

    safe(function () {
      if (window.Lampa && Lampa.Storage && Lampa.Storage.listener && typeof Lampa.Storage.listener.follow === 'function') {
        Lampa.Storage.listener.follow('change', function (e) {
          try {
            if (!e || !e.name) return;
            var n = String(e.name);
            if (n === KEY_ENABLED || n === KEY_STORE_POS || n === KEY_BLOCK_NEXT || n === KEY_DEBUG_POPUP || n === KEY_SOFT_ATTEMPTS || n === KEY_ATTEMPTS_LEGACY || n === KEY_HARD_ATTEMPTS || n === KEY_DELAY_SEC || n === KEY_POPUP_MIN_SEC) API.refresh();
          } catch (_) { }
        });
      }
    });

    return true;
  };

  API.install();
})();
