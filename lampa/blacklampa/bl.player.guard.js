(function () {
  'use strict';

  var BL = window.BL = window.BL || {};
  BL.PlayerGuard = BL.PlayerGuard || {};

  var API = BL.PlayerGuard;
  if (API.__blPlayerGuardLoadedV1) return;
  API.__blPlayerGuardLoadedV1 = true;

  var LS_PREFIX = 'blacklampa_';
  try { if (BL.Keys && BL.Keys.prefix) LS_PREFIX = String(BL.Keys.prefix || 'blacklampa_'); } catch (_) { }

  var KEY_ENABLED = LS_PREFIX + 'player_guard_enabled';
  var KEY_ATTEMPTS = LS_PREFIX + 'player_guard_attempts';
  var KEY_DEBUG_POPUP = LS_PREFIX + 'player_guard_debug_popup';
  var KEY_STORE_POS = LS_PREFIX + 'player_guard_store_pos';

  var DET = {
    epsilonEndSec: 2.0,
    jumpThresholdSec: 20,
    faultWindowMs: 7000,
    minWatchTimeSec: 5,
    seekGuardMs: 2500,
    saveThrottleMs: 2000,
    saveMaxAgeMs: 72 * 3600 * 1000
  };

  var CFG = {
    enabled: false,
    attempts: 5,
    debugPopup: false,
    storePos: true
  };

  var STATE = {
    installed: false,
    patched: false,
    video: null,
    src: '',
    streamId: '',
    posKey: '',
    lastDurationSec: 0,
    lastGoodTimeSec: 0,
    lastGoodTs: 0,
    lastFaultTs: 0,
    lastFaultType: '',
    buffering: false,
    lastSeekTs: 0,
    recovering: false,
    recoverSeq: 0,
    recoverAttempt: 0,
    recoverMax: 5,
    resumeTimeSec: 0,
    resumeReason: '',
    recoverStartTs: 0,
    recoverLastCurSec: NaN,
    recoverMoved: false,
    recoverTimer: null,
    recoverEvalTimer: null,
    recoverOkTimer: null,
    lastSaveTs: 0,
    lastSavedT: 0,
    lastLogKey: '',
    lastLogTs: 0,
    ui: {
      styleInstalled: false,
      root: null,
      titleEl: null,
      stageEl: null,
      infoEl: null,
      reasonEl: null,
      actionsEl: null,
      btns: [],
      selected: 0,
      mode: 'hidden',
      keyHandler: null
    }
  };

  function safe(fn, fallback) { try { return fn(); } catch (_) { return fallback; } }

  function now() { try { return Date.now(); } catch (_) { return +new Date(); } }

  function lsGet(k) { try { return localStorage.getItem(String(k || '')); } catch (_) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(String(k || ''), String(v)); } catch (_) { } }
  function lsDel(k) { try { localStorage.removeItem(String(k || '')); } catch (_) { } }

  function sGet(k, fallback) {
    var v = null;
    try { if (window.Lampa && Lampa.Storage && Lampa.Storage.get) v = Lampa.Storage.get(String(k)); } catch (_) { v = null; }
    if (v === undefined || v === null) { try { v = lsGet(k); } catch (_) { v = null; } }
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

  function toInt(v, d) {
    var n = parseInt(v, 10);
    return isNaN(n) ? d : n;
  }

  function toNum(v, d) {
    var n = parseFloat(v);
    return isNaN(n) ? d : n;
  }

  function clamp(n, a, b) {
    n = Number(n);
    if (!isFinite(n)) return a;
    if (n < a) return a;
    if (n > b) return b;
    return n;
  }

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

  function logLine(level, msg, extra, dedupKey, dedupMs) {
    try {
      var k = String(dedupKey || '');
      var w = (typeof dedupMs === 'number' && dedupMs >= 0) ? dedupMs : 1200;
      var t = now();
      if (k && STATE.lastLogKey === k && STATE.lastLogTs && (t - STATE.lastLogTs) < w) return;
      if (k) {
        STATE.lastLogKey = k;
        STATE.lastLogTs = t;
      }
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

  function getPlayData() {
    try { return (window.Lampa && Lampa.Player && typeof Lampa.Player.playdata === 'function') ? (Lampa.Player.playdata() || null) : null; } catch (_) { return null; }
  }

  function pickStreamId(video) {
    var pd = null;
    try { pd = getPlayData(); } catch (_) { pd = null; }
    try {
      if (pd && pd.url) return String(pd.url);
      if (pd && pd.stream && pd.stream.url) return String(pd.stream.url);
    } catch (_) { }
    try {
      if (video) {
        if (typeof video.currentSrc === 'string' && video.currentSrc) return String(video.currentSrc);
        if (typeof video.src === 'string' && video.src) return String(video.src);
      }
    } catch (_) { }
    try { if (STATE.src) return String(STATE.src); } catch (_) { }
    try { if (pd && pd.title) return 'title:' + String(pd.title); } catch (_) { }
    return '';
  }

  function pickTitle() {
    var pd = null;
    try { pd = getPlayData(); } catch (_) { pd = null; }
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

  function buildPosKey(streamId) {
    var h = hash32(String(streamId || ''));
    return LS_PREFIX + 'player_guard_pos_v1_' + h;
  }

  function readSavedPos() {
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
      return obj;
    } catch (_) {
      return null;
    }
  }

  function writeSavedPos(t, dur, why) {
    try {
      if (!CFG.storePos) return;
      if (!STATE.posKey) return;

      var tt = toNum(t, -1);
      if (!isFinite(tt) || tt < 0) return;

      var obj = {
        t: Math.max(0, tt),
        ts: now(),
        dur: isFinite(toNum(dur, NaN)) ? toNum(dur, 0) : null,
        title: pickTitle(),
        src: String(STATE.streamId || ''),
        why: String(why || '')
      };
      lsSet(STATE.posKey, JSON.stringify(obj));
    } catch (_) { }
  }

  function deleteSavedPos(why) {
    try {
      if (!STATE.posKey) return;
      lsDel(STATE.posKey);
      logLine('INF', 'position cleared', String(why || ''), 'pos:del:' + STATE.posKey, 2000);
    } catch (_) { }
  }

  function ensureUiStyle() {
    if (STATE.ui.styleInstalled) return;
    STATE.ui.styleInstalled = true;

    safe(function () {
      if (!document || !document.head) return;
      if (document.getElementById('__bl_player_guard_style_v1')) return;
      var st = document.createElement('style');
      st.id = '__bl_player_guard_style_v1';
      st.type = 'text/css';
      st.textContent = ''
        + '#__bl_player_guard_popup_v1{position:fixed;left:50%;bottom:12%;transform:translateX(-50%);min-width:260px;max-width:560px;'
        + 'background:rgba(0,0,0,0.72);color:#fff;padding:14px 16px;border-radius:12px;z-index:2147483646;'
        + 'pointer-events:none;font:13px/1.35 system-ui,-apple-system,\"Segoe UI\",Roboto,Arial,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,0.55);'
        + 'backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px);}'
        + '#__bl_player_guard_popup_v1.bl-pg-hidden{display:none;}'
        + '#__bl_player_guard_popup_v1.bl-pg-fail{pointer-events:auto;}'
        + '#__bl_player_guard_popup_v1 .bl-pg-row{display:flex;align-items:flex-start;gap:12px;}'
        + '#__bl_player_guard_popup_v1 .bl-pg-title{font-weight:700;font-size:14px;margin:0 0 6px 0;}'
        + '#__bl_player_guard_popup_v1 .bl-pg-stage{opacity:0.95;margin:0 0 6px 0;}'
        + '#__bl_player_guard_popup_v1 .bl-pg-info{opacity:0.85;margin:0;}'
        + '#__bl_player_guard_popup_v1 .bl-pg-reason{opacity:0.7;margin:6px 0 0 0;font-size:12px;white-space:pre-wrap;}'
        + '#__bl_player_guard_popup_v1 .bl-pg-spinner{width:18px;height:18px;flex:0 0 18px;margin-top:2px;border-radius:50%;'
        + 'border:2px solid rgba(255,255,255,0.35);border-top-color:#fff;animation:blpgspin 0.9s linear infinite;}'
        + '@keyframes blpgspin{from{transform:rotate(0deg);}to{transform:rotate(360deg);}}'
        + '#__bl_player_guard_popup_v1 .bl-pg-actions{display:none;margin-top:10px;gap:8px;flex-wrap:wrap;}'
        + '#__bl_player_guard_popup_v1.bl-pg-fail .bl-pg-actions{display:flex;}'
        + '#__bl_player_guard_popup_v1 .bl-pg-btn{padding:8px 10px;border-radius:10px;background:rgba(255,255,255,0.12);'
        + 'border:1px solid rgba(255,255,255,0.18);cursor:pointer;user-select:none;}'
        + '#__bl_player_guard_popup_v1 .bl-pg-btn.active{background:rgba(64,169,255,0.25);border-color:rgba(64,169,255,0.55);}'
        + '#__bl_player_guard_popup_v1 .bl-pg-btn:active{transform:scale(0.98);}';
      document.head.appendChild(st);
    });
  }

  function ensureUiRoot() {
    ensureUiStyle();
    if (STATE.ui.root) return STATE.ui.root;

    return safe(function () {
      if (!document || !document.body) return null;
      var el = document.getElementById('__bl_player_guard_popup_v1');
      if (!el) {
        el = document.createElement('div');
        el.id = '__bl_player_guard_popup_v1';
        el.className = 'bl-pg-hidden';

        el.innerHTML = ''
          + '<div class="bl-pg-row">'
          + '  <div class="bl-pg-spinner"></div>'
          + '  <div class="bl-pg-col">'
          + '    <div class="bl-pg-title"></div>'
          + '    <div class="bl-pg-stage"></div>'
          + '    <div class="bl-pg-info"></div>'
          + '    <div class="bl-pg-reason"></div>'
          + '    <div class="bl-pg-actions"></div>'
          + '  </div>'
          + '</div>';
        document.body.appendChild(el);
      }

      STATE.ui.root = el;
      STATE.ui.titleEl = el.querySelector('.bl-pg-title');
      STATE.ui.stageEl = el.querySelector('.bl-pg-stage');
      STATE.ui.infoEl = el.querySelector('.bl-pg-info');
      STATE.ui.reasonEl = el.querySelector('.bl-pg-reason');
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

      if (STATE.ui.mode === 'hidden') {
        root.classList.add('bl-pg-hidden');
        return;
      }
      if (STATE.ui.mode === 'fail') root.classList.add('bl-pg-fail');
    });
  }

  function uiUpdate(title, stage, info, reason) {
    var root = ensureUiRoot();
    if (!root) return;

    safe(function () {
      if (STATE.ui.titleEl) STATE.ui.titleEl.textContent = String(title || '');
      if (STATE.ui.stageEl) STATE.ui.stageEl.textContent = String(stage || '');
      if (STATE.ui.infoEl) STATE.ui.infoEl.textContent = String(info || '');
      if (STATE.ui.reasonEl) STATE.ui.reasonEl.textContent = String(reason || '');
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

        if (isBack) {
          exitPlayer('key:back');
          return;
        }

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

  function uiActivateSelected() {
    var idx = toInt(STATE.ui.selected, 0);
    var btn = (STATE.ui.btns && STATE.ui.btns[idx]) ? STATE.ui.btns[idx] : null;
    if (!btn) return;
    var act = '';
    try { act = String(btn.getAttribute('data-act') || ''); } catch (_) { act = ''; }
    if (!act) return;
    if (act === 'retry') {
      startRecovery('manual_retry', { manual: true });
    } else if (act === 'exit') {
      exitPlayer('manual_exit');
    } else if (act === 'restart') {
      restartFromPosition('manual_restart');
    }
  }

  function uiShowFailActions() {
    var root = ensureUiRoot();
    if (!root) return;

    uiClearActions();

    var actions = [
      { act: 'retry', text: 'Повторить' },
      { act: 'exit', text: 'Выйти из плеера' },
      { act: 'restart', text: 'Старт заново с позиции' }
    ];

    safe(function () {
      if (!STATE.ui.actionsEl) return;
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

  function uiShowRecovering(stage, info, reason) {
    uiRemoveFailKeyHandler();
    uiSetMode('recover');
    uiUpdate('Поток оборвался / восстановление…', stage, info, reason);
  }

  function uiShowOk(msg) {
    uiRemoveFailKeyHandler();
    uiSetMode('recover');
    uiUpdate(String(msg || 'Восстановлено'), '', '', '');
  }

  function uiShowFailed(stage, info, reason) {
    uiSetMode('fail');
    uiUpdate('Поток не восстановился', stage, info, reason);
    uiShowFailActions();
  }

  function clearTimers() {
    safe(function () { if (STATE.recoverTimer) clearTimeout(STATE.recoverTimer); });
    safe(function () { if (STATE.recoverEvalTimer) clearTimeout(STATE.recoverEvalTimer); });
    safe(function () { if (STATE.recoverOkTimer) clearTimeout(STATE.recoverOkTimer); });
    STATE.recoverTimer = null;
    STATE.recoverEvalTimer = null;
    STATE.recoverOkTimer = null;
  }

  function detachVideoListeners() {
    safe(function () {
      var pv = STATE._prevVideo;
      var h = STATE._boundHandlers;
      if (!pv || !h) return;
      if (pv && typeof pv.removeEventListener === 'function') {
        for (var k in h) {
          try { pv.removeEventListener(k, h[k], true); } catch (_) { }
          try { pv.removeEventListener(k, h[k], false); } catch (_) { }
        }
      }
    });
    STATE._boundHandlers = {};
  }

  function isFaultWindowOpen(ts) {
    ts = toInt(ts, 0);
    if (!STATE.lastFaultTs) return false;
    return (ts - STATE.lastFaultTs) >= 0 && (ts - STATE.lastFaultTs) <= DET.faultWindowMs;
  }

  function isSeekRecent(ts) {
    ts = toInt(ts, 0);
    if (!STATE.lastSeekTs) return false;
    return (ts - STATE.lastSeekTs) >= 0 && (ts - STATE.lastSeekTs) <= DET.seekGuardMs;
  }

  function mediaStateLine(video) {
    var parts = [];
    try { if (video && typeof video.networkState !== 'undefined') parts.push('net=' + String(video.networkState)); } catch (_) { }
    try { if (video && typeof video.readyState !== 'undefined') parts.push('ready=' + String(video.readyState)); } catch (_) { }
    try { if (video && typeof video.paused !== 'undefined') parts.push('paused=' + String(!!video.paused)); } catch (_) { }
    try { if (video && typeof video.currentTime !== 'undefined') parts.push('t=' + String(toNum(video.currentTime, 0).toFixed(3))); } catch (_) { }
    try { if (video && typeof video.duration !== 'undefined') parts.push('dur=' + String(toNum(video.duration, 0).toFixed(3))); } catch (_) { }
    try {
      if (video) {
        var s = '';
        try { if (typeof video.currentSrc === 'string' && video.currentSrc) s = String(video.currentSrc); } catch (_) { }
        try { if (!s && typeof video.src === 'string' && video.src) s = String(video.src); } catch (_) { }
        if (s) parts.push('src=' + s.slice(0, 220));
      }
    } catch (_) { }
    return parts.join(' | ');
  }

  function markFault(type, extra) {
    var t = now();
    STATE.lastFaultTs = t;
    STATE.lastFaultType = String(type || '');
    STATE.buffering = (type === 'waiting' || type === 'stalled') ? true : STATE.buffering;

    if (CFG.debugPopup) {
      logLine('DBG', 'fault', (String(type || '') + (extra ? (' | ' + String(extra)) : '')), 'fault:' + String(type || ''), 1500);
    } else {
      // keep quiet by default
    }
  }

  function markPlaying() {
    STATE.buffering = false;
  }

  function markSeeking() {
    STATE.lastSeekTs = now();
  }

  function resetSession(why, preserveTimes) {
    preserveTimes = !!preserveTimes;
    clearTimers();
    uiHide();

    STATE.recovering = false;
    STATE.resumeTimeSec = 0;
    STATE.resumeReason = '';
    STATE.recoverAttempt = 0;
    STATE.recoverMax = CFG.attempts;
    STATE.buffering = false;
    STATE.lastFaultTs = 0;
    STATE.lastFaultType = '';
    STATE.lastSeekTs = 0;

    if (!preserveTimes) {
      STATE.lastGoodTimeSec = 0;
      STATE.lastGoodTs = 0;
      STATE.lastDurationSec = 0;
      STATE.lastSaveTs = 0;
      STATE.lastSavedT = 0;
    }

    if (why) logLine('DBG', 'session reset', String(why || ''), 'sess:reset:' + String(why || ''), 1000);
  }

  function attachToVideo(video, src, opts) {
    opts = opts || {};
    if (!video) return false;

    var preserveTimes = !!opts.preserveTimes;
    var installListeners = ('installListeners' in opts) ? !!opts.installListeners : !!CFG.enabled;

    STATE.video = video;
    try { STATE.src = (src !== undefined && src !== null) ? String(src) : String(STATE.src || ''); } catch (_) { }

    STATE.streamId = pickStreamId(video);
    STATE.posKey = STATE.streamId ? buildPosKey(STATE.streamId) : '';

    if (!preserveTimes) {
      STATE.lastDurationSec = 0;
      STATE.lastGoodTimeSec = 0;
      STATE.lastGoodTs = 0;
      STATE.lastSaveTs = 0;
      STATE.lastSavedT = 0;
    }

    // Best-effort detach from previous HTML5 video
    safe(function () {
      if (!STATE._prevVideo || STATE._prevVideo === video) return;
      var pv = STATE._prevVideo;
      var h = STATE._boundHandlers;
      if (pv && h && pv.removeEventListener) {
        for (var k in h) {
          try { pv.removeEventListener(k, h[k], true); } catch (_) { }
          try { pv.removeEventListener(k, h[k], false); } catch (_) { }
        }
      }
    });

    STATE._prevVideo = video;
    STATE._boundHandlers = {};

    if (!installListeners) return true;

    function on(type, fn) {
      try {
        if (!video || typeof video.addEventListener !== 'function') return;
        STATE._boundHandlers[type] = fn;
        video.addEventListener(type, fn, true);
      } catch (_) {
        try { video.addEventListener(type, fn); } catch (__e) { }
      }
    }

    on('waiting', function () { try { if (!CFG.enabled) return; if (STATE.video === video) markFault('waiting', mediaStateLine(video)); } catch (_) { } });
    on('stalled', function () { try { if (!CFG.enabled) return; if (STATE.video === video) markFault('stalled', mediaStateLine(video)); } catch (_) { } });
    on('error', function () { try { if (!CFG.enabled) return; if (STATE.video === video) markFault('error', mediaStateLine(video)); } catch (_) { } });
    on('abort', function () { try { if (!CFG.enabled) return; if (STATE.video === video) markFault('abort', ''); } catch (_) { } });
    on('emptied', function () { try { if (!CFG.enabled) return; if (STATE.video === video) markFault('emptied', ''); } catch (_) { } });
    on('playing', function () { try { if (!CFG.enabled) return; if (STATE.video === video) markPlaying(); } catch (_) { } });
    on('canplay', function () { try { if (!CFG.enabled) return; if (STATE.video === video) markPlaying(); } catch (_) { } });
    on('seeking', function () { try { if (!CFG.enabled) return; if (STATE.video === video) markSeeking(); } catch (_) { } });
    on('seeked', function () { try { if (!CFG.enabled) return; if (STATE.video === video) markSeeking(); } catch (_) { } });

    return true;
  }

  function pickResumeTime(dur) {
    var t = toNum(STATE.lastGoodTimeSec, 0);
    if (!t || t < 0.001) {
      var saved = readSavedPos();
      if (saved && saved.t !== undefined) t = toNum(saved.t, 0);
    }
    if (isFinite(toNum(dur, NaN)) && toNum(dur, 0) > 0) t = clamp(t, 0, Math.max(0, toNum(dur, 0) - DET.epsilonEndSec));
    return Math.max(0, t);
  }

  function shouldFalseEndByEnded(ts, cur, dur) {
    if (!CFG.enabled) return false;
    if (!isFaultWindowOpen(ts)) return false;
    if (isSeekRecent(ts)) return false;

    dur = toNum(dur, toNum(STATE.lastDurationSec, 0));
    cur = toNum(cur, NaN);

    if (!isFinite(dur) || dur <= 0) return false;

    if (!STATE.lastGoodTimeSec || STATE.lastGoodTimeSec < DET.minWatchTimeSec) return false;
    if (STATE.lastGoodTimeSec >= dur - DET.epsilonEndSec) return false;

    // Avoid false positives near a real end (e.g., brief buffering at the tail).
    var remaining = dur - STATE.lastGoodTimeSec;
    if (isFinite(remaining) && remaining < 10) return false;

    if (isFinite(cur) && cur >= 0 && cur < dur - DET.epsilonEndSec) return true;
    return true;
  }

  function shouldFalseEndByJump(ts, cur, dur) {
    if (!CFG.enabled) return false;
    if (!isFaultWindowOpen(ts)) return false;
    if (isSeekRecent(ts)) return false;

    dur = toNum(dur, toNum(STATE.lastDurationSec, 0));
    cur = toNum(cur, NaN);

    if (!isFinite(dur) || dur <= 0) return false;
    if (!isFinite(cur) || cur < 0) return false;

    if (!STATE.lastGoodTimeSec || STATE.lastGoodTimeSec < DET.minWatchTimeSec) return false;
    if (STATE.lastGoodTimeSec >= dur - DET.epsilonEndSec) return false;

    if (cur < dur - DET.epsilonEndSec) return false;

    var jump = cur - STATE.lastGoodTimeSec;
    if (!isFinite(jump) || jump < DET.jumpThresholdSec) return false;

    return true;
  }

  function updateGoodTime(ts, cur, dur) {
    if (!CFG.enabled) return;
    if (STATE.recovering) return;
    if (!STATE.video) return;
    if (STATE.buffering) return;

    var video = STATE.video;
    try { if (video && video.paused) return; } catch (_) { }

    cur = toNum(cur, NaN);
    dur = toNum(dur, NaN);
    if (!isFinite(cur) || cur < 0) return;
    if (isFinite(dur) && dur > 0) STATE.lastDurationSec = dur;

    // After user seek: accept current position as a new baseline.
    if (isSeekRecent(ts)) {
      STATE.lastGoodTimeSec = cur;
      STATE.lastGoodTs = ts;
      return;
    }

    if (!STATE.lastGoodTs) {
      STATE.lastGoodTimeSec = cur;
      STATE.lastGoodTs = ts;
      return;
    }

    var dT = (ts - STATE.lastGoodTs) / 1000;
    if (!isFinite(dT) || dT <= 0) dT = 0.001;
    var d = cur - STATE.lastGoodTimeSec;

    if (!isFinite(d)) return;
    if (d <= 0) return;

    // Accept only "smooth" progress to keep lastGoodTime reliable.
    // Allow larger steps if timeupdate cadence is low.
    var maxStep = Math.max(3.5, Math.min(15, dT * 2.6 + 1.0));
    if (d > maxStep) return;

    STATE.lastGoodTimeSec = cur;
    STATE.lastGoodTs = ts;
  }

  function maybeSavePos(ts, cur, dur) {
    if (!CFG.enabled || !CFG.storePos) return;
    if (!STATE.posKey) return;
    if (STATE.recovering) return;

    var t = toNum(cur, NaN);
    var d = toNum(dur, toNum(STATE.lastDurationSec, NaN));
    if (!isFinite(t) || t < 0) return;

    // Don't spam storage
    if (STATE.lastSaveTs && (ts - STATE.lastSaveTs) < DET.saveThrottleMs) return;

    // Store only when we have a meaningful "good" time (avoid start glitches)
    if (!STATE.lastGoodTimeSec || STATE.lastGoodTimeSec < DET.minWatchTimeSec) return;
    if (Math.abs(t - STATE.lastGoodTimeSec) > 2.5) return;

    STATE.lastSaveTs = ts;
    STATE.lastSavedT = STATE.lastGoodTimeSec;
    writeSavedPos(STATE.lastGoodTimeSec, d, 'tick');
  }

  function recoverBackoffMs(attempt) {
    attempt = toInt(attempt, 1);
    if (attempt <= 1) return 0;
    if (attempt === 2) return 500;
    if (attempt === 3) return 1000;
    if (attempt === 4) return 2000;
    if (attempt === 5) return 3000;
    return 4000;
  }

  function recoverEvalMs(attempt) {
    attempt = toInt(attempt, 1);
    var ms = 1300 + attempt * 700;
    if (ms > 5200) ms = 5200;
    return ms;
  }

  function stopRecovery(why) {
    if (!STATE.recovering) return;
    STATE.recovering = false;
    clearTimers();
    uiHide();
    logLine('INF', 'recovery stopped', String(why || ''), 'rec:stop:' + String(why || ''), 1200);
  }

  function markRecovered(why) {
    if (!STATE.recovering) return;
    STATE.recovering = false;
    clearTimers();

    logLine('OK', 'recovered', String(why || ''), 'rec:ok', 800);
    uiShowOk('Восстановлено');
    STATE.recoverOkTimer = setTimeout(function () {
      uiHide();
    }, 1500);
  }

  function recoveryFail(why) {
    clearTimers();
    STATE.recovering = true; // keep state, but in fail UI

    var info = 'Позиция: ' + fmtTime(STATE.resumeTimeSec) + ' | попытки: ' + String(STATE.recoverAttempt) + '/' + String(STATE.recoverMax);
    var reason = (CFG.debugPopup ? ('Причина: ' + String(STATE.resumeReason || '') + '\n' + mediaStateLine(STATE.video)) : '');
    uiShowFailed('Не удалось восстановить', info, reason);

    logLine('WRN', 'recovery failed', String(why || ''), 'rec:fail', 1500);
  }

  function trySeekPlay(video, t) {
    try { if (!video) return false; } catch (_) { return false; }

    var ok = false;
    try {
      if (typeof video.currentTime !== 'undefined') {
        try { video.currentTime = t; ok = true; } catch (_) { ok = false; }
      }
    } catch (_) { ok = false; }

    try { if (video && typeof video.play === 'function') video.play(); } catch (_) { }
    return ok;
  }

  function tryPauseLoad(video) {
    try { if (!video) return false; } catch (_) { return false; }
    safe(function () { if (typeof video.pause === 'function') video.pause(); });
    safe(function () { if (typeof video.load === 'function') video.load(); });
    return true;
  }

  function tryReinitUrl(src) {
    try {
      if (!src) return false;
      if (!window.Lampa || !Lampa.PlayerVideo || typeof Lampa.PlayerVideo.url !== 'function') return false;
      Lampa.PlayerVideo.url(String(src), true);
      return true;
    } catch (_) {
      return false;
    }
  }

  function doRecoverAttempt(seq) {
    if (!STATE.recovering) return;
    if (seq !== STATE.recoverSeq) return;
    if (!CFG.enabled) return stopRecovery('disabled');

    var video = null;
    try { video = STATE.video || (window.Lampa && Lampa.PlayerVideo && Lampa.PlayerVideo.video ? Lampa.PlayerVideo.video() : null); } catch (_) { video = STATE.video; }
    if (!video) return recoveryFail('no video');

    var dur = 0;
    try { dur = toNum(video.duration, toNum(STATE.lastDurationSec, 0)); } catch (_) { dur = toNum(STATE.lastDurationSec, 0); }

    STATE.recoverAttempt++;
    var attempt = STATE.recoverAttempt;
    var max = STATE.recoverMax;

    var action = 'seek+play';
    if (attempt === 1) action = 'seek+play';
    else if (attempt === 2) action = 'pause+load → seek+play';
    else if (attempt >= 3) action = 'reinit url → seek+play';

    var stage = 'Попытка ' + String(attempt) + '/' + String(max) + ': ' + action;
    var info = 'Позиция: ' + fmtTime(STATE.resumeTimeSec);
    var reason = '';
    if (CFG.debugPopup) {
      reason = 'Причина: ' + String(STATE.resumeReason || '') + '\n' + mediaStateLine(video);
    }
    uiShowRecovering(stage, info, reason);

    logLine('INF', 'attempt ' + String(attempt) + '/' + String(max), action + ' | ' + mediaStateLine(video), 'rec:attempt:' + String(attempt), 0);

    var t = pickResumeTime(dur);
    if (!isFinite(t) || t < 0) t = 0;
    STATE.resumeTimeSec = t;

    if (CFG.storePos) writeSavedPos(t, dur, 'recovery');

    if (attempt === 1) {
      trySeekPlay(video, Math.max(0, t));
    } else if (attempt === 2) {
      tryPauseLoad(video);
      // Wait a bit, then seek+play again
      setTimeout(function () {
        try { if (seq !== STATE.recoverSeq) return; } catch (_) { }
        trySeekPlay(video, Math.max(0, t));
      }, 250);
    } else {
      var src = '';
      try { src = String(STATE.streamId || STATE.src || ''); } catch (_) { src = ''; }
      if (!tryReinitUrl(src)) {
        // fallback to load()
        tryPauseLoad(video);
      }
      // after reinit, video reference may change; seek will be attempted by next timeupdate + eval; still try quickly
      setTimeout(function () {
        try { if (seq !== STATE.recoverSeq) return; } catch (_) { }
        var v2 = null;
        try { v2 = STATE.video || (window.Lampa && Lampa.PlayerVideo && Lampa.PlayerVideo.video ? Lampa.PlayerVideo.video() : null); } catch (_) { v2 = STATE.video; }
        trySeekPlay(v2 || video, Math.max(0, t));
      }, 450);
    }

    // Evaluate success after some time; if still not ok, schedule next attempt/backoff.
    STATE.recoverEvalTimer = setTimeout(function () {
      try { if (seq !== STATE.recoverSeq) return; } catch (_) { return; }
      if (!STATE.recovering) return;

      var v = null;
      try { v = STATE.video || (window.Lampa && Lampa.PlayerVideo && Lampa.PlayerVideo.video ? Lampa.PlayerVideo.video() : null); } catch (_) { v = STATE.video; }
      var cur = 0;
      var paused = false;
      try { cur = toNum(v.currentTime, 0); } catch (_) { cur = 0; }
      try { paused = !!v.paused; } catch (_) { paused = false; }

      var progressed = false;
      try { progressed = (cur >= STATE.resumeTimeSec - 0.8) && (cur <= STATE.resumeTimeSec + 12); } catch (_) { progressed = false; }

      // "progressed" is a weak signal; final success is confirmed via timeupdate forward movement
      if (progressed && !paused && !STATE.buffering) {
        // wait for timeupdate to confirm, but give a short chance
        setTimeout(function () {
          try { if (seq !== STATE.recoverSeq) return; } catch (_) { return; }
          if (!STATE.recovering) return;
          // if still recovering and we got here, continue attempts
          if (STATE.recoverAttempt >= STATE.recoverMax) recoveryFail('max attempts');
          else {
            STATE.recoverTimer = setTimeout(function () { doRecoverAttempt(seq); }, recoverBackoffMs(STATE.recoverAttempt + 1));
          }
        }, 600);
        return;
      }

      if (STATE.recoverAttempt >= STATE.recoverMax) return recoveryFail('max attempts');
      STATE.recoverTimer = setTimeout(function () { doRecoverAttempt(seq); }, recoverBackoffMs(STATE.recoverAttempt + 1));
    }, recoverEvalMs(attempt));
  }

  function startRecovery(reason, meta) {
    meta = meta || {};
    if (!CFG.enabled) return;

    var ts = now();
    if (STATE.recovering) {
      // allow manual retry to reset attempt counter
      if (!meta.manual) return;
    }

    var video = null;
    try { video = STATE.video || (window.Lampa && Lampa.PlayerVideo && Lampa.PlayerVideo.video ? Lampa.PlayerVideo.video() : null); } catch (_) { video = STATE.video; }
    if (!video) return;

    var dur = 0;
    try { dur = toNum(video.duration, toNum(STATE.lastDurationSec, 0)); } catch (_) { dur = toNum(STATE.lastDurationSec, 0); }
    var resume = pickResumeTime(dur);

    STATE.recovering = true;
    STATE.recoverSeq++;
    STATE.recoverAttempt = 0;
    STATE.recoverMax = CFG.attempts;
    STATE.resumeTimeSec = resume;
    STATE.resumeReason = String(reason || '');
    STATE.recoverStartTs = ts;
    STATE.recoverLastCurSec = NaN;
    STATE.recoverMoved = false;

    clearTimers();

    var info = 'Позиция: ' + fmtTime(resume) + ' | попытки: 0/' + String(STATE.recoverMax);
    var r = '';
    if (CFG.debugPopup) {
      r = 'Причина: ' + String(reason || '') + '\n' + 'fault=' + String(STATE.lastFaultType || '') + ' | dt=' + String(ts - STATE.lastFaultTs) + 'ms\n' + mediaStateLine(video);
    }
    uiShowRecovering('Старт восстановления', info, r);

    logLine('WRN', 'enter recovery', String(reason || '') + ' | resume=' + String(resume.toFixed(3)) + ' | ' + mediaStateLine(video), 'rec:enter', 800);

    // First attempt after small delay (give UI a chance)
    STATE.recoverTimer = setTimeout(function () {
      doRecoverAttempt(STATE.recoverSeq);
    }, 0);
  }

  function exitPlayer(why) {
    safe(function () { logLine('INF', 'exit player', String(why || ''), 'ui:exit', 800); });
    stopRecovery('exit');
    safe(function () { if (window.Lampa && Lampa.Player && typeof Lampa.Player.close === 'function') return Lampa.Player.close(); });
    safe(function () { if (window.Lampa && Lampa.Controller && typeof Lampa.Controller.back === 'function') return Lampa.Controller.back(); });
  }

  function restartFromPosition(why) {
    safe(function () { logLine('INF', 'restart from position', String(why || ''), 'ui:restart', 800); });

    var t = Math.max(0, toNum(STATE.resumeTimeSec, toNum(STATE.lastGoodTimeSec, 0)));
    var src = '';
    try { src = String(STATE.streamId || STATE.src || ''); } catch (_) { src = ''; }

    // Try aggressive reinit and then start recovery again.
    if (tryReinitUrl(src)) {
      // Preserve resumeTime; let attachToVideo update video reference via url wrapper.
      setTimeout(function () {
        startRecovery('manual_restart', { manual: true });
      }, 250);
      return;
    }

    // Fallback: pause+load+seek+play
    var v = null;
    try { v = STATE.video || (window.Lampa && Lampa.PlayerVideo && Lampa.PlayerVideo.video ? Lampa.PlayerVideo.video() : null); } catch (_) { v = STATE.video; }
    tryPauseLoad(v);
    setTimeout(function () { trySeekPlay(v, t); }, 400);
    startRecovery('manual_restart', { manual: true });
  }

  function handleListenerSend(origSend, args) {
    var ts = now();
    var type = (args && args.length) ? args[0] : '';
    var data = (args && args.length > 1) ? args[1] : undefined;
    var t = String(type || '');
    var video = null;
    try { video = STATE.video || (window.Lampa && Lampa.PlayerVideo && Lampa.PlayerVideo.video ? Lampa.PlayerVideo.video() : null); } catch (_) { video = STATE.video; }

    if (t === 'error') {
      markFault('error', safe(function () { return (data && data.error) ? JSON.stringify(data.error) : ''; }, ''));
      return origSend.apply(this, args || []);
    }

    if (t === 'timeupdate') {
      var cur = safe(function () { return (data && data.current !== undefined) ? data.current : (video ? video.currentTime : 0); }, 0);
      var dur = safe(function () { return (data && data.duration !== undefined) ? data.duration : (video ? video.duration : 0); }, 0);

      if (shouldFalseEndByJump(ts, cur, dur)) {
        var extra = 'jump to end | cur=' + String(toNum(cur, 0).toFixed(3)) + ' dur=' + String(toNum(dur, 0).toFixed(3))
          + ' lastGood=' + String(toNum(STATE.lastGoodTimeSec, 0).toFixed(3))
          + ' fault=' + String(STATE.lastFaultType || '') + ' dt=' + String(ts - STATE.lastFaultTs) + 'ms';
        logLine('WRN', 'false-ended (jump)', extra, 'false:jump', 1500);
        startRecovery('jump', { cur: cur, dur: dur });
        // Suppress this bad timeupdate to prevent seekbar from jumping to 100%
        return;
      }

      updateGoodTime(ts, cur, dur);
      maybeSavePos(ts, cur, dur);

      // If we're in recovery, treat forward timeupdate as success signal.
      if (STATE.recovering && isFinite(toNum(cur, NaN))) {
        var cc = toNum(cur, NaN);
        if (isFinite(cc)) {
          var paused = false;
          try { paused = video ? !!video.paused : false; } catch (_) { paused = false; }

          try {
            if (isFinite(STATE.recoverLastCurSec)) {
              var dcur = cc - STATE.recoverLastCurSec;
              if (isFinite(dcur) && dcur > 0.15 && dcur < 8) STATE.recoverMoved = true;
            }
          } catch (_) { }
          STATE.recoverLastCurSec = cc;

          var durOk = toNum(dur, toNum(STATE.lastDurationSec, cc + 9999));
          if (STATE.recoverMoved && !STATE.buffering && !paused && cc >= STATE.resumeTimeSec + 0.5 && cc < durOk - DET.epsilonEndSec) {
            markRecovered('time moving @ ' + String(cc.toFixed(2)));
          }
        }
      }

      return origSend.apply(this, args || []);
    }

    if (t === 'ended') {
      var cur2 = safe(function () { return video ? video.currentTime : 0; }, 0);
      var dur2 = safe(function () { return video ? video.duration : 0; }, 0);

      if (shouldFalseEndByEnded(ts, cur2, dur2)) {
        var extra2 = 'ended after fault | cur=' + String(toNum(cur2, 0).toFixed(3)) + ' dur=' + String(toNum(dur2, 0).toFixed(3))
          + ' lastGood=' + String(toNum(STATE.lastGoodTimeSec, 0).toFixed(3))
          + ' fault=' + String(STATE.lastFaultType || '') + ' dt=' + String(ts - STATE.lastFaultTs) + 'ms';
        logLine('WRN', 'false-ended (ended)', extra2, 'false:ended', 1500);
        startRecovery('ended', { cur: cur2, dur: dur2 });
        // Suppress ended to prevent playlist-next/exit chains
        return;
      }

      // Real ended: clear saved position
      deleteSavedPos('ended');
      return origSend.apply(this, args || []);
    }

    return origSend.apply(this, args || []);
  }

  function patchPlayerVideo() {
    if (STATE.patched) return true;
    if (!window.Lampa || !Lampa.PlayerVideo) return false;

    var pv = Lampa.PlayerVideo;
    if (!pv || typeof pv !== 'object') return false;

    // Wrap seek helpers to avoid false positives on manual rewinds (TV wrappers may not emit "seeking")
    try {
      if (typeof pv.to === 'function' && !pv.to.__blPlayerGuardWrappedV1) {
        var origTo = pv.to;
        pv.to = function () {
          try { if (CFG.enabled) STATE.lastSeekTs = now(); } catch (_) { }
          return origTo.apply(this, arguments);
        };
        pv.to.__blPlayerGuardWrappedV1 = true;
      }
    } catch (_) { }

    try {
      if (typeof pv.rewind === 'function' && !pv.rewind.__blPlayerGuardWrappedV1) {
        var origRewind = pv.rewind;
        pv.rewind = function () {
          try { if (CFG.enabled) STATE.lastSeekTs = now(); } catch (_) { }
          return origRewind.apply(this, arguments);
        };
        pv.rewind.__blPlayerGuardWrappedV1 = true;
      }
    } catch (_) { }

    // Wrap listener.send
    try {
      if (pv.listener && typeof pv.listener.send === 'function' && !pv.listener.send.__blPlayerGuardWrappedV1) {
        var origSend = pv.listener.send;
        pv.listener.send = function () {
          if (!CFG.enabled) return origSend.apply(this, arguments);
          return handleListenerSend.call(this, origSend, arguments);
        };
        pv.listener.send.__blPlayerGuardWrappedV1 = true;
      }
    } catch (_) { }

    // Wrap url()
    try {
      if (typeof pv.url === 'function' && !pv.url.__blPlayerGuardWrappedV1) {
        var origUrl = pv.url;
        pv.url = function (src, change_quality) {
          var preserve = !!change_quality;
          if (!preserve && !STATE.recovering) resetSession('url', false);
          var r = origUrl.apply(this, arguments);
          try {
            var v = null;
            try { v = pv.video ? pv.video() : null; } catch (_) { v = null; }
            attachToVideo(v, src, { preserveTimes: preserve || STATE.recovering, installListeners: CFG.enabled });
          } catch (_) { }
          return r;
        };
        pv.url.__blPlayerGuardWrappedV1 = true;
      }
    } catch (_) { }

    // Wrap destroy()
    try {
      if (typeof pv.destroy === 'function' && !pv.destroy.__blPlayerGuardWrappedV1) {
        var origDestroy = pv.destroy;
        pv.destroy = function () {
          try { stopRecovery('player destroy'); } catch (_) { }
          try { resetSession('destroy', false); } catch (_) { }
          return origDestroy.apply(this, arguments);
        };
        pv.destroy.__blPlayerGuardWrappedV1 = true;
      }
    } catch (_) { }

    // Attach to current video if any
    try {
      if (typeof pv.video === 'function') attachToVideo(pv.video(), '', { preserveTimes: true });
    } catch (_) { }

    STATE.patched = true;
    logLine('OK', 'installed', 'patched Lampa.PlayerVideo', 'pg:installed', 5000);
    return true;
  }

  function readSettingsFromStorage() {
    try {
      CFG.enabled = parseBool(sGet(KEY_ENABLED, '0'), false);
      CFG.debugPopup = parseBool(sGet(KEY_DEBUG_POPUP, '0'), false);
      CFG.storePos = parseBool(sGet(KEY_STORE_POS, '1'), true);

      var a = toInt(sGet(KEY_ATTEMPTS, '5'), 5);
      if (a !== 3 && a !== 5 && a !== 7) a = 5;
      CFG.attempts = a;
    } catch (_) { }

    STATE.recoverMax = CFG.attempts;
    return CFG;
  }

  API.getConfig = function () { return CFG; };

  API.refresh = function () {
    var was = !!CFG.enabled;
    readSettingsFromStorage();

    if (was && !CFG.enabled) {
      stopRecovery('disabled');
      uiHide();
      detachVideoListeners();
    } else if (!was && CFG.enabled) {
      // Enable without restart: attach to current video immediately.
      try { patchPlayerVideo(); } catch (_) { }
      try {
        if (window.Lampa && Lampa.PlayerVideo && typeof Lampa.PlayerVideo.video === 'function') {
          attachToVideo(Lampa.PlayerVideo.video(), STATE.src || '', { preserveTimes: true, installListeners: true });
        }
      } catch (_) { }
      logLine('INF', 'enabled', 'runtime attach', 'pg:enable', 1200);
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
      if (patchPlayerVideo()) {
        clearInterval(t);
        return;
      }
      if (tries >= 120) clearInterval(t);
    }, 250);

    // Watch for config changes (best-effort; menu onChange also calls refresh)
    safe(function () {
      if (window.Lampa && Lampa.Storage && Lampa.Storage.listener && typeof Lampa.Storage.listener.follow === 'function') {
        Lampa.Storage.listener.follow('change', function (e) {
          try {
            if (!e || !e.name) return;
            var n = String(e.name);
            if (n === KEY_ENABLED || n === KEY_ATTEMPTS || n === KEY_DEBUG_POPUP || n === KEY_STORE_POS) API.refresh();
          } catch (_) { }
        });
      }
    });

    return true;
  };

  // Auto-install
  API.install();
})();
