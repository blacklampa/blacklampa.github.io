(function () {
  'use strict';

  var BL = window.BL = window.BL || {};
  BL.PlayerOverlay = BL.PlayerOverlay || {};

  var API = BL.PlayerOverlay;
  if (API.__blPlayerOverlayLoadedV1) return;
  API.__blPlayerOverlayLoadedV1 = true;

  var LS_PREFIX = 'blacklampa_';
  try { if (BL.Keys && BL.Keys.prefix) LS_PREFIX = String(BL.Keys.prefix || 'blacklampa_'); } catch (_) { }

  var KEY_ENABLED = LS_PREFIX + 'player_guard_overlay_enabled';
  var KEY_DEBUG_ON_OPEN = LS_PREFIX + 'player_guard_overlay_debug_on_open';
  var KEY_HANG_TIME_MS = LS_PREFIX + 'player_guard_overlay_hang_time_ms';
  var KEY_HANG_BUF_MS = LS_PREFIX + 'player_guard_overlay_hang_buf_ms';

  var ST = {
    IDLE: 'IDLE',
    PLAYING: 'PLAYING',
    PAUSED_BY_USER: 'PAUSED_BY_USER',
    BUFFERING: 'BUFFERING',
    STALLED: 'STALLED',
    HUNG: 'HUNG',
    RECOVERING_SOFT: 'RECOVERING_SOFT',
    RECOVERING_INPLAYER: 'RECOVERING_INPLAYER',
    RECOVERING_REOPEN: 'RECOVERING_REOPEN',
    FAILED: 'FAILED'
  };

  var DET = {
    tickMs: 400,
    recoverStepTimeoutMs: 9000,
    recoverBusyTimeoutMs: 7000,
    recoverCooldownMs: 6000,
    ctEpsSec: 0.05,
    aheadEpsSec: 0.15,
    waitingGraceMs: 2500,
    logLimit: 50
  };

  var CFG = {
    enabled: true,
    debugOnOpen: false,
    hangTimeMs: 10000,
    hangBufMs: 8000
  };

  var STATE = {
    installed: false,
    patched: { player: false, controller: false },
    timer: null,
    lastCfgReadTs: 0,

    phase: ST.IDLE,
    phaseReason: '',
    phaseTs: 0,

    video: null,
    listeners: null,

    userPausedIntent: false,
    recoverLock: false,
    recoverToken: 0,
    recoverReason: '',
    recoverStep: '',
    pendingUserCommand: '',
    lastRecoverTs: 0,

    events: {
      count: {
        timeupdate: 0,
        progress: 0,
        waiting: 0,
        stalled: 0,
        error: 0,
        play: 0,
        pause: 0,
        canplay: 0,
        loadeddata: 0,
        ended: 0,
        playing: 0
      },
      last: {
        timeupdate: 0,
        progress: 0,
        waiting: 0,
        stalled: 0,
        error: 0,
        play: 0,
        pause: 0,
        canplay: 0,
        loadeddata: 0,
        ended: 0,
        playing: 0
      }
    },

    monitor: {
      lastCt: NaN,
      lastCtChangeTs: 0,
      lastAheadSec: NaN,
      lastAheadChangeTs: 0,
      lastProgressSignalTs: 0
    },

    tick: {
      ts: 0,
      hasVideo: false,
      ct: NaN,
      dur: NaN,
      paused: false,
      readyState: 0,
      networkState: 0,
      rangesCount: 0,
      rangesText: '',
      totalBufferedSec: 0,
      aheadSec: 0
    },

    logs: [],

    ui: {
      open: false,
      root: null,
      titleEl: null,
      bodyEl: null,
      keyHandler: null
    }
  };

  function safe(fn, fallback) { try { return fn(); } catch (_) { return fallback; } }
  function now() { try { return Date.now(); } catch (_) { return +new Date(); } }
  function toInt(v, d) { var n = parseInt(v, 10); return isNaN(n) ? d : n; }
  function toNum(v, d) { var n = parseFloat(v); return isNaN(n) ? d : n; }
  function clampInt(n, a, b) { n = toInt(n, a); if (n < a) return a; if (n > b) return b; return n; }

  function sGet(k, fallback) {
    var v = null;
    try { if (window.Lampa && Lampa.Storage && Lampa.Storage.get) v = Lampa.Storage.get(String(k)); } catch (_) { v = null; }
    if (v === undefined || v === null || v === '') {
      try { if (window.localStorage) v = localStorage.getItem(String(k)); } catch (_) { v = null; }
    }
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

  function kv(obj) {
    if (!obj || typeof obj !== 'object') return '';
    var out = [];
    for (var k in obj) {
      if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
      try {
        var v = obj[k];
        if (v === undefined || v === null || v === '') continue;
        out.push(String(k) + '=' + String(v));
      } catch (_) { }
    }
    return out.join(' ');
  }

  function logLine(level, name, fields) {
    var msg = String(name || '');
    var extra = kv(fields);

    try {
      if (window.BL && BL.Log) {
        if (level === 'ERR' && BL.Log.showError) BL.Log.showError('PlayerOverlay', msg, extra);
        else if (level === 'WRN' && BL.Log.showWarn) BL.Log.showWarn('PlayerOverlay', msg, extra);
        else if (level === 'OK' && BL.Log.showOk) BL.Log.showOk('PlayerOverlay', msg, extra);
        else if (level === 'DBG' && BL.Log.showDbg) BL.Log.showDbg('PlayerOverlay', msg, extra);
        else if (BL.Log.showInfo) BL.Log.showInfo('PlayerOverlay', msg, extra);
      }
    } catch (_) { }

    try {
      if (window.console && console.log) console.log('[BL][PlayerOverlay][' + String(level || 'INF') + '] ' + msg, extra || '');
    } catch (_) { }

    try {
      var line = '[' + String(level || 'INF') + '] ' + msg + (extra ? (' | ' + extra) : '');
      STATE.logs.push(line);
      if (STATE.logs.length > DET.logLimit) STATE.logs.splice(0, STATE.logs.length - DET.logLimit);
    } catch (_) { }
  }

  function ageMs(ts) {
    ts = toInt(ts, 0);
    if (!ts) return 0;
    var a = now() - ts;
    if (!isFinite(a) || a < 0) a = 0;
    return toInt(a, 0);
  }

  function getVideo() {
    try {
      if (window.Lampa && Lampa.PlayerVideo && typeof Lampa.PlayerVideo.video === 'function') return Lampa.PlayerVideo.video();
    } catch (_) { }
    return null;
  }

  function fmtBuffered(video) {
    var out = {
      rangesCount: 0,
      rangesText: '',
      aheadSec: 0,
      totalBufferedSec: 0,
      text: 'ranges=0 ahead=0.0 total=0.0'
    };

    try {
      if (!video || !video.buffered || typeof video.buffered.length !== 'number') return out;
      var b = video.buffered;
      var cur = toNum(video.currentTime, 0);
      var parts = [];
      var maxEnd = NaN;
      var total = 0;
      var cnt = 0;

      for (var i = 0; i < b.length; i++) {
        var s = toNum(b.start(i), NaN);
        var e = toNum(b.end(i), NaN);
        if (!isFinite(s) || !isFinite(e) || e < s) continue;
        cnt++;
        total += Math.max(0, e - s);
        if (!isFinite(maxEnd) || e > maxEnd) maxEnd = e;
        parts.push('[' + s.toFixed(1) + '-' + e.toFixed(1) + ']');
      }

      var ahead = 0;
      if (isFinite(maxEnd)) ahead = Math.max(0, maxEnd - Math.max(0, cur));

      out.rangesCount = cnt;
      out.rangesText = parts.join(' ');
      out.aheadSec = ahead;
      out.totalBufferedSec = total;
      out.text = 'ranges=' + String(cnt) + ' ahead=' + ahead.toFixed(1) + ' total=' + total.toFixed(1) + (out.rangesText ? (' ' + out.rangesText) : '');
      return out;
    } catch (_) {
      return out;
    }
  }

  function setPhase(next, reason) {
    next = String(next || ST.IDLE);
    if (STATE.phase === next && STATE.phaseReason === String(reason || '')) return;
    STATE.phase = next;
    STATE.phaseReason = String(reason || '');
    STATE.phaseTs = now();
    logLine('DBG', 'state', { phase: STATE.phase, reason: STATE.phaseReason, lock: STATE.recoverLock ? 1 : 0 });
  }

  function readSettingsFromStorage() {
    CFG.enabled = parseBool(sGet(KEY_ENABLED, '1'), true);
    CFG.debugOnOpen = parseBool(sGet(KEY_DEBUG_ON_OPEN, '0'), false);
    CFG.hangTimeMs = clampInt(sGet(KEY_HANG_TIME_MS, '10000'), 3000, 60000);
    CFG.hangBufMs = clampInt(sGet(KEY_HANG_BUF_MS, '8000'), 3000, 60000);
    STATE.lastCfgReadTs = now();
    return CFG;
  }

  function bumpEvent(name) {
    name = String(name || '');
    if (!name) return;
    try {
      if (!Object.prototype.hasOwnProperty.call(STATE.events.count, name)) STATE.events.count[name] = 0;
      STATE.events.count[name] = toInt(STATE.events.count[name], 0) + 1;
      STATE.events.last[name] = now();
    } catch (_) { }

    try {
      if (name === 'progress' || name === 'timeupdate' || name === 'playing' || name === 'play') {
        STATE.monitor.lastProgressSignalTs = now();
      }
    } catch (_) { }
  }

  function detachVideoListeners() {
    var v = STATE.video;
    var h = STATE.listeners;
    if (!v || !h) {
      STATE.video = null;
      STATE.listeners = null;
      return;
    }

    try {
      for (var k in h) {
        if (!Object.prototype.hasOwnProperty.call(h, k)) continue;
        try { v.removeEventListener(k, h[k], true); } catch (_) { try { v.removeEventListener(k, h[k]); } catch (__e) { } }
      }
    } catch (_) { }

    STATE.video = null;
    STATE.listeners = null;
  }

  function attachVideoListeners(video) {
    detachVideoListeners();

    if (!video || typeof video.addEventListener !== 'function') return false;

    STATE.video = video;
    STATE.listeners = {};

    function on(type, fn) {
      try {
        STATE.listeners[type] = fn;
        video.addEventListener(type, fn, true);
      } catch (_) {
        try { video.addEventListener(type, fn); } catch (__e) { }
      }
    }

    on('timeupdate', function () { bumpEvent('timeupdate'); });
    on('progress', function () { bumpEvent('progress'); });
    on('waiting', function () { bumpEvent('waiting'); });
    on('stalled', function () { bumpEvent('stalled'); });
    on('error', function () { bumpEvent('error'); });
    on('play', function () { bumpEvent('play'); if (!STATE.recoverLock) STATE.userPausedIntent = false; });
    on('playing', function () { bumpEvent('playing'); if (!STATE.recoverLock) STATE.userPausedIntent = false; });
    on('pause', function () {
      bumpEvent('pause');
      if (STATE.recoverLock) return;
      try { if (video.paused) STATE.userPausedIntent = true; } catch (_) { }
    });
    on('canplay', function () { bumpEvent('canplay'); });
    on('loadeddata', function () { bumpEvent('loadeddata'); });
    on('ended', function () { bumpEvent('ended'); });

    logLine('INF', 'video_listeners_bound', { has: 1 });
    return true;
  }

  function rebindVideoListeners() {
    var v = getVideo();
    if (v === STATE.video) return;
    if (!v) {
      detachVideoListeners();
      return;
    }
    attachVideoListeners(v);
  }

  function collectTick(video) {
    var ts = now();
    var snap = {
      ts: ts,
      hasVideo: !!video,
      ct: NaN,
      dur: NaN,
      paused: false,
      readyState: 0,
      networkState: 0,
      rangesCount: 0,
      rangesText: '',
      totalBufferedSec: 0,
      aheadSec: 0
    };

    if (video) {
      try { snap.ct = toNum(video.currentTime, NaN); } catch (_) { snap.ct = NaN; }
      try { snap.dur = toNum(video.duration, NaN); } catch (_) { snap.dur = NaN; }
      try { snap.paused = !!video.paused; } catch (_) { snap.paused = false; }
      try { snap.readyState = toInt(video.readyState, 0); } catch (_) { snap.readyState = 0; }
      try { snap.networkState = toInt(video.networkState, 0); } catch (_) { snap.networkState = 0; }

      var b = fmtBuffered(video);
      snap.rangesCount = toInt(b.rangesCount, 0);
      snap.rangesText = String(b.rangesText || '');
      snap.totalBufferedSec = toNum(b.totalBufferedSec, 0);
      snap.aheadSec = toNum(b.aheadSec, 0);

      if (!isFinite(STATE.monitor.lastCt)) {
        STATE.monitor.lastCt = snap.ct;
        STATE.monitor.lastCtChangeTs = ts;
      } else if (isFinite(snap.ct) && Math.abs(snap.ct - STATE.monitor.lastCt) >= DET.ctEpsSec) {
        STATE.monitor.lastCt = snap.ct;
        STATE.monitor.lastCtChangeTs = ts;
      }

      if (!isFinite(STATE.monitor.lastAheadSec)) {
        STATE.monitor.lastAheadSec = snap.aheadSec;
        STATE.monitor.lastAheadChangeTs = ts;
      } else if (Math.abs(snap.aheadSec - STATE.monitor.lastAheadSec) >= DET.aheadEpsSec) {
        STATE.monitor.lastAheadSec = snap.aheadSec;
        STATE.monitor.lastAheadChangeTs = ts;
      }
    }

    STATE.tick = snap;
    return snap;
  }

  function ensureUiStyle() {
    try {
      if (!document || !document.head) return;
      if (document.getElementById('__bl_player_overlay_style_v1')) return;
      var st = document.createElement('style');
      st.id = '__bl_player_overlay_style_v1';
      st.type = 'text/css';
      st.textContent = ''
        + '#__bl_player_overlay_popup_v1{position:fixed;left:50%;bottom:10%;transform:translateX(-50%);min-width:320px;max-width:700px;'
        + 'background:rgba(0,0,0,0.78);color:#fff;padding:14px 16px;border-radius:14px;z-index:2147483646;'
        + 'font:12px/1.35 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;'
        + 'box-shadow:0 10px 28px rgba(0,0,0,0.6);backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px);pointer-events:auto;}'
        + '#__bl_player_overlay_popup_v1.bl-ov-hidden{display:none;}'
        + '#__bl_player_overlay_popup_v1 .bl-ov-title{font-weight:800;font-size:15px;margin:0 0 8px 0;}'
        + '#__bl_player_overlay_popup_v1 .bl-ov-body{margin:0;opacity:0.92;white-space:pre-wrap;word-break:break-word;max-height:54vh;overflow:auto;}';
      document.head.appendChild(st);
    } catch (_) { }
  }

  function ensureUiRoot() {
    if (STATE.ui.root) return STATE.ui.root;
    ensureUiStyle();

    var root = null;
    try { if (document) root = document.getElementById('__bl_player_overlay_popup_v1'); } catch (_) { root = null; }

    if (!root) {
      try {
        root = document.createElement('div');
        root.id = '__bl_player_overlay_popup_v1';
        root.className = 'bl-ov-hidden';

        var title = document.createElement('div');
        title.className = 'bl-ov-title';
        title.textContent = 'BL Player Overlay DEBUG';

        var body = document.createElement('pre');
        body.className = 'bl-ov-body';

        root.appendChild(title);
        root.appendChild(body);
        (document.body || document.documentElement).appendChild(root);

        STATE.ui.titleEl = title;
        STATE.ui.bodyEl = body;
      } catch (_) { root = null; }
    } else {
      try {
        STATE.ui.titleEl = root.querySelector('.bl-ov-title');
        STATE.ui.bodyEl = root.querySelector('.bl-ov-body');
      } catch (_) { }
    }

    STATE.ui.root = root;
    return root;
  }

  function uiInstallKeyHandler() {
    if (STATE.ui.keyHandler) return;

    STATE.ui.keyHandler = function (e) {
      try {
        if (!STATE.ui.open) return;
        if (!e) return;
        var k = '';
        var kc = 0;
        try { k = (typeof e.key === 'string') ? e.key : ''; } catch (_) { k = ''; }
        try { kc = (typeof e.keyCode === 'number') ? e.keyCode : 0; } catch (_) { kc = 0; }

        var isBack = (k === 'Backspace' || k === 'Escape' || kc === 8 || kc === 27 || kc === 461 || kc === 10009 || kc === 4);
        if (!isBack) return;

        try { e.preventDefault(); } catch (_) { }
        try { e.stopPropagation(); } catch (_) { }

        uiHide('key_back');
      } catch (_) { }
    };

    try { window.addEventListener('keydown', STATE.ui.keyHandler, true); } catch (_) { }
  }

  function uiRemoveKeyHandler() {
    if (!STATE.ui.keyHandler) return;
    try { window.removeEventListener('keydown', STATE.ui.keyHandler, true); } catch (_) { }
    STATE.ui.keyHandler = null;
  }

  function buildDebugText() {
    var t = STATE.tick || {};
    var lines = [];

    lines.push('state=' + String(STATE.phase || '')
      + ' lock=' + (STATE.recoverLock ? '1' : '0')
      + ' userPausedIntent=' + (STATE.userPausedIntent ? '1' : '0')
      + ' pendingCmd=' + String(STATE.pendingUserCommand || ''));

    lines.push('media: t=' + fmtTime(t.ct)
      + ' dur=' + fmtTime(t.dur)
      + ' paused=' + (t.paused ? 1 : 0)
      + ' rs=' + String(toInt(t.readyState, 0))
      + ' ns=' + String(toInt(t.networkState, 0)));

    lines.push('buffered: ranges=' + String(toInt(t.rangesCount, 0))
      + ' ahead=' + toNum(t.aheadSec, 0).toFixed(1)
      + ' total=' + toNum(t.totalBufferedSec, 0).toFixed(1)
      + (t.rangesText ? (' ' + String(t.rangesText)) : ''));

    lines.push('events: waiting=' + toInt(STATE.events.count.waiting, 0)
      + ' stalled=' + toInt(STATE.events.count.stalled, 0)
      + ' error=' + toInt(STATE.events.count.error, 0)
      + ' progress=' + toInt(STATE.events.count.progress, 0)
      + ' timeupdate=' + toInt(STATE.events.count.timeupdate, 0)
      + ' play=' + toInt(STATE.events.count.play, 0)
      + ' pause=' + toInt(STATE.events.count.pause, 0));

    lines.push('agesMs: ct=' + String(ageMs(STATE.monitor.lastCtChangeTs))
      + ' ahead=' + String(ageMs(STATE.monitor.lastAheadChangeTs))
      + ' progress=' + String(ageMs(STATE.monitor.lastProgressSignalTs))
      + ' waiting=' + String(ageMs(STATE.events.last.waiting))
      + ' stalled=' + String(ageMs(STATE.events.last.stalled)));

    var pg = null;
    try {
      if (window.BL && BL.PlayerGuard && typeof BL.PlayerGuard.getRuntimeSnapshot === 'function') {
        pg = BL.PlayerGuard.getRuntimeSnapshot() || null;
      }
    } catch (_) { pg = null; }

    if (pg && typeof pg === 'object') {
      var cfg = pg.cfg || {};
      var rec = pg.rec || {};
      var guard = pg.guard || {};
      var fault = pg.fault || {};
      lines.push('pg: mode=' + String(rec.mode || '')
        + ' intent=' + String(rec.hardIntent || '')
        + ' action=' + String(rec.lastHardAction || '')
        + ' strategy=' + String(cfg.hardStrategy || '')
        + ' reopen=' + (cfg.reopenOnFault ? 1 : 0));
      lines.push('pg_guard: lock=' + (guard.lock ? 1 : 0)
        + ' reason=' + String(guard.reason || '')
        + ' untilAgeMs=' + String(ageMs(toInt(guard.untilTs, 0))));
      lines.push('pg_fault: type=' + String(fault.lastType || '')
        + ' ageMs=' + String(ageMs(toInt(fault.lastTs, 0))));
    } else {
      lines.push('pg: snapshot unavailable');
    }

    lines.push('logs:');
    try {
      var tail = STATE.logs.slice(-DET.logLimit);
      for (var i = 0; i < tail.length; i++) lines.push(tail[i]);
    } catch (_) { }

    return lines.join('\n');
  }

  function uiRender(reason) {
    var root = ensureUiRoot();
    if (!root) return;

    try {
      if (STATE.ui.titleEl) STATE.ui.titleEl.textContent = 'BL Player Overlay DEBUG';
      if (STATE.ui.bodyEl) STATE.ui.bodyEl.textContent = buildDebugText();
      root.classList.remove('bl-ov-hidden');
      STATE.ui.open = true;
    } catch (_) { }

    if (reason) logLine('DBG', 'debug_render', { reason: String(reason || '') });
  }

  function uiShow(reason) {
    uiInstallKeyHandler();
    uiRender(reason || 'show');
  }

  function uiHide(reason) {
    try {
      if (STATE.ui.root) STATE.ui.root.classList.add('bl-ov-hidden');
    } catch (_) { }
    STATE.ui.open = false;
    uiRemoveKeyHandler();
    logLine('DBG', 'debug_hide', { reason: String(reason || '') });
  }

  function normalizeCommand(cmd) {
    cmd = String(cmd || '').toLowerCase();
    if (!cmd) return '';
    if (cmd === 'back' || cmd === 'exit' || cmd === 'close' || cmd === 'return' || cmd === 'stop') return 'exit';
    if (cmd === 'pause') return 'pause';
    if (cmd === 'play') return 'play';
    if (cmd === 'seek' || cmd === 'rewind' || cmd === 'forward' || cmd === 'backward' || cmd === 'to' || cmd === 'totime' || cmd === 'to_time') return 'seek';
    return '';
  }

  function mapRecoverState(prefer) {
    prefer = String(prefer || 'auto');
    if (prefer === 'soft') return ST.RECOVERING_SOFT;
    if (prefer === 'reopen') return ST.RECOVERING_REOPEN;
    return ST.RECOVERING_INPLAYER;
  }

  function getPg() {
    try {
      if (window.BL && BL.PlayerGuard) return BL.PlayerGuard;
    } catch (_) { }
    return null;
  }

  function waitForPgResult(token, startedTs, cb) {
    function loop() {
      if (token !== STATE.recoverToken) return cb(false, 'canceled');

      var pg = getPg();
      var snap = null;
      try { snap = (pg && pg.getRuntimeSnapshot) ? (pg.getRuntimeSnapshot() || null) : null; } catch (_) { snap = null; }

      var mode = '';
      try { mode = snap && snap.rec ? String(snap.rec.mode || '') : ''; } catch (_) { mode = ''; }

      if (mode === 'NORMAL') return cb(true, 'normal');
      if (mode === 'FAILED') return cb(false, 'failed');

      if ((now() - startedTs) >= DET.recoverStepTimeoutMs) return cb(false, 'timeout');
      setTimeout(loop, 500);
    }

    loop();
  }

  function waitForPgBusyRelease(token, startedTs, cb) {
    function loop() {
      if (token !== STATE.recoverToken) return cb(false, 'canceled');

      var pg = getPg();
      var snap = null;
      try { snap = (pg && pg.getRuntimeSnapshot) ? (pg.getRuntimeSnapshot() || null) : null; } catch (_) { snap = null; }

      var mode = '';
      try { mode = snap && snap.rec ? String(snap.rec.mode || '') : ''; } catch (_) { mode = ''; }

      if (mode === 'NORMAL') return cb(true, 'normal');
      if (mode === 'FAILED') return cb(false, 'failed');

      if ((now() - startedTs) >= DET.recoverBusyTimeoutMs) return cb(false, 'busy_timeout');
      setTimeout(loop, 400);
    }

    loop();
  }

  function normalizePrefer(v) {
    try { v = String(v || '').toLowerCase(); } catch (_) { v = ''; }
    if (v === 'soft' || v === 'inplayer' || v === 'reopen' || v === 'auto') return v;
    return 'auto';
  }

  function buildPreferList(prefer) {
    if (Array.isArray(prefer)) {
      var out = [];
      for (var i = 0; i < prefer.length; i++) {
        var p = normalizePrefer(prefer[i]);
        if (out.indexOf(p) === -1) out.push(p);
      }
      if (out.length) return out;
    }

    var one = normalizePrefer(prefer);
    if (one && one !== 'auto') return [one];

    return ['soft', 'inplayer', 'reopen'];
  }

  function endCritical(tag) {
    var pg = getPg();
    try { if (pg && typeof pg.endOverlayCritical === 'function') pg.endOverlayCritical(tag || 'recover'); } catch (_) { }
  }

  function beginCritical(tag, ttlMs) {
    var pg = getPg();
    try { if (pg && typeof pg.beginOverlayCritical === 'function') pg.beginOverlayCritical(tag || 'recover', ttlMs || 2500); } catch (_) { }
  }

  function runRecoverStep(token, list, idx) {
    if (token !== STATE.recoverToken) return;

    if (idx >= list.length) {
      STATE.recoverLock = false;
      STATE.recoverStep = '';
      setPhase(ST.FAILED, 'recover_exhausted');
      logLine('ERR', 'recover_failed', { reason: STATE.recoverReason || '', steps: list.join('>') });
      endCritical('recover');
      return;
    }

    var prefer = normalizePrefer(list[idx]);
    STATE.recoverStep = prefer;
    setPhase(mapRecoverState(prefer), 'recover:' + prefer);

    var pg = getPg();
    if (!pg || typeof pg.requestRecover !== 'function') {
      STATE.recoverLock = false;
      STATE.recoverStep = '';
      setPhase(ST.FAILED, 'pg_request_missing');
      logLine('ERR', 'pg_missing', { where: 'requestRecover' });
      endCritical('recover');
      return;
    }

    beginCritical('recover', 2500);

    var res = null;
    try { res = pg.requestRecover('overlay_hang', { prefer: prefer }); } catch (_) { res = { started: false, why: 'exception' }; }
    if (!res || typeof res !== 'object') res = { started: false, why: 'invalid' };

    logLine('INF', 'recover_request', {
      prefer: prefer,
      started: res.started ? 1 : 0,
      why: String(res.why || ''),
      mode: String(res.mode || ''),
      intent: String(res.intent || '')
    });

    if (res.started) {
      waitForPgResult(token, now(), function (ok, why) {
        endCritical('recover');
        if (token !== STATE.recoverToken) return;
        if (ok) {
          STATE.recoverLock = false;
          STATE.recoverStep = '';
          setPhase(ST.PLAYING, 'recovered:' + prefer);
          logLine('OK', 'recover_success', { prefer: prefer, why: String(why || '') });
          return;
        }
        logLine('WRN', 'recover_step_fail', { prefer: prefer, why: String(why || '') });
        runRecoverStep(token, list, idx + 1);
      });
      return;
    }

    if (String(res.why || '') === 'busy') {
      waitForPgBusyRelease(token, now(), function (ok, why) {
        endCritical('recover');
        if (token !== STATE.recoverToken) return;
        if (ok) {
          STATE.recoverLock = false;
          STATE.recoverStep = '';
          setPhase(ST.PLAYING, 'busy_done');
          logLine('OK', 'recover_busy_done', { why: String(why || '') });
          return;
        }
        runRecoverStep(token, list, idx + 1);
      });
      return;
    }

    endCritical('recover');
    setTimeout(function () {
      if (token !== STATE.recoverToken) return;
      runRecoverStep(token, list, idx + 1);
    }, 250);
  }

  function startRecover(reason, prefer) {
    reason = String(reason || 'hang');
    if (!CFG.enabled) return false;
    if (STATE.recoverLock) return false;

    if ((now() - toInt(STATE.lastRecoverTs, 0)) < DET.recoverCooldownMs) return false;
    STATE.lastRecoverTs = now();

    var list = buildPreferList(prefer);

    STATE.recoverLock = true;
    STATE.recoverReason = reason;
    STATE.recoverStep = '';
    STATE.recoverToken = toInt(STATE.recoverToken, 0) + 1;

    logLine('WRN', 'recover_begin', { reason: reason, list: list.join('>') });
    runRecoverStep(STATE.recoverToken, list, 0);
    return true;
  }

  function cancelRecover(reason) {
    reason = String(reason || 'cancel');

    var wasLocked = !!STATE.recoverLock;
    STATE.recoverToken = toInt(STATE.recoverToken, 0) + 1;
    STATE.recoverLock = false;
    STATE.recoverReason = '';
    STATE.recoverStep = '';
    endCritical('recover');

    if (STATE.tick && STATE.tick.hasVideo) {
      if (STATE.userPausedIntent || STATE.tick.paused) setPhase(ST.PAUSED_BY_USER, reason);
      else setPhase(ST.PLAYING, reason);
    } else setPhase(ST.IDLE, reason);

    if (wasLocked) logLine('WRN', 'recover_cancel', { reason: reason });
    return wasLocked;
  }

  function handleUserCommand(cmd, payload) {
    cmd = normalizeCommand(cmd);
    if (!cmd) return;

    STATE.pendingUserCommand = cmd;

    if (cmd === 'pause') STATE.userPausedIntent = true;
    else if (cmd === 'play') STATE.userPausedIntent = false;

    if (STATE.recoverLock) {
      cancelRecover('user:' + cmd);
    }

    if (cmd === 'exit') {
      cancelRecover('user_exit');
      setPhase(ST.IDLE, 'user_exit');
    }

    if (payload) {
      try {
        if (typeof payload === 'object' && payload.type) {
          logLine('DBG', 'user_command', { cmd: cmd, src: String(payload.type || '') });
        } else {
          logLine('DBG', 'user_command', { cmd: cmd });
        }
      } catch (_) { }
    }
  }

  function handlePlayerSend(type, payload) {
    var t = String(type || '');
    var tl = t.toLowerCase();

    if (tl === 'start') {
      STATE.userPausedIntent = false;
      setPhase(ST.PLAYING, 'player_start');
      logLine('INF', 'player_start', { hasPayload: payload ? 1 : 0 });
      if (CFG.enabled && CFG.debugOnOpen) uiShow('player_start');
      return;
    }

    if (tl === 'destroy') {
      cancelRecover('player_destroy');
      setPhase(ST.IDLE, 'player_destroy');
      return;
    }

    handleUserCommand(tl, { type: t, payload: payload });
  }

  function patchPlayerSend() {
    if (STATE.patched.player) return true;
    if (!window.Lampa || !Lampa.Player || !Lampa.Player.listener || typeof Lampa.Player.listener.send !== 'function') return false;

    var send = Lampa.Player.listener.send;
    if (send.__blPlayerOverlayWrappedV1) {
      STATE.patched.player = true;
      return true;
    }

    var origSend = send;
    Lampa.Player.listener.send = function () {
      try {
        var type = (arguments && arguments.length) ? arguments[0] : '';
        var payload = (arguments && arguments.length > 1) ? arguments[1] : undefined;
        handlePlayerSend(type, payload);
      } catch (_) { }
      return origSend.apply(this, arguments);
    };

    Lampa.Player.listener.send.__blPlayerOverlayWrappedV1 = true;
    STATE.patched.player = true;
    logLine('OK', 'patched', { what: 'Player.listener.send' });
    return true;
  }

  function patchControllerBack() {
    if (STATE.patched.controller) return true;
    if (!window.Lampa || !Lampa.Controller || typeof Lampa.Controller.back !== 'function') return false;

    var back = Lampa.Controller.back;
    if (back.__blPlayerOverlayWrappedV1) {
      STATE.patched.controller = true;
      return true;
    }

    var origBack = back;
    Lampa.Controller.back = function () {
      try {
        handleUserCommand('back', { type: 'controller.back' });
      } catch (_) { }
      return origBack.apply(this, arguments);
    };

    Lampa.Controller.back.__blPlayerOverlayWrappedV1 = true;
    STATE.patched.controller = true;
    logLine('OK', 'patched', { what: 'Controller.back' });
    return true;
  }

  function patchAll() {
    patchPlayerSend();
    patchControllerBack();
  }

  function maybeDetectHang() {
    if (!CFG.enabled) return false;
    if (STATE.recoverLock) return false;

    var t = STATE.tick;
    if (!t || !t.hasVideo) return false;
    if (STATE.userPausedIntent) return false;
    if (t.paused) return false;

    var ctAge = ageMs(STATE.monitor.lastCtChangeTs);
    var progressAge = ageMs(STATE.monitor.lastProgressSignalTs);
    var aheadAge = ageMs(STATE.monitor.lastAheadChangeTs);
    var waitingAge = ageMs(STATE.events.last.waiting);
    var stalledAge = ageMs(STATE.events.last.stalled);

    var hang = ctAge >= CFG.hangTimeMs
      && progressAge >= CFG.hangBufMs
      && aheadAge >= CFG.hangBufMs;

    if (!hang) return false;

    if ((waitingAge < DET.waitingGraceMs || stalledAge < DET.waitingGraceMs) && toNum(t.aheadSec, 0) > 2.0) {
      return false;
    }

    setPhase(ST.HUNG, 'watchdog_hang');
    logLine('WRN', 'hang_detected', {
      ctAge: ctAge,
      progressAge: progressAge,
      aheadAge: aheadAge,
      aheadSec: toNum(t.aheadSec, 0).toFixed(1)
    });

    return startRecover('watchdog_hang', null);
  }

  function updatePhaseByTick() {
    if (STATE.recoverLock) return;

    var t = STATE.tick;
    if (!t || !t.hasVideo) {
      setPhase(ST.IDLE, 'no_video');
      return;
    }

    if (STATE.userPausedIntent || t.paused) {
      setPhase(ST.PAUSED_BY_USER, 'paused');
      return;
    }

    var waitingAge = ageMs(STATE.events.last.waiting);
    var stalledAge = ageMs(STATE.events.last.stalled);

    if (stalledAge > 0 && stalledAge < DET.waitingGraceMs) {
      setPhase(ST.STALLED, 'stalled');
      return;
    }

    if (waitingAge > 0 && waitingAge < DET.waitingGraceMs) {
      setPhase(ST.BUFFERING, 'waiting');
      return;
    }

    setPhase(ST.PLAYING, 'tick');
  }

  function tick() {
    try {
      if ((now() - toInt(STATE.lastCfgReadTs, 0)) > 1200) readSettingsFromStorage();
      patchAll();
      rebindVideoListeners();
      collectTick(STATE.video);

      if (!CFG.enabled) {
        if (STATE.recoverLock) cancelRecover('disabled');
        if (STATE.ui.open) uiHide('disabled');
        setPhase(ST.IDLE, 'disabled');
        return;
      }

      updatePhaseByTick();
      maybeDetectHang();

      if (STATE.ui.open) uiRender('tick');
    } catch (e) {
      logLine('ERR', 'tick_error', { msg: e && e.message ? e.message : String(e) });
    }
  }

  API.state = function () {
    return {
      cfg: {
        enabled: !!CFG.enabled,
        debugOnOpen: !!CFG.debugOnOpen,
        hangTimeMs: toInt(CFG.hangTimeMs, 0),
        hangBufMs: toInt(CFG.hangBufMs, 0)
      },
      phase: String(STATE.phase || ''),
      phaseReason: String(STATE.phaseReason || ''),
      phaseTs: toInt(STATE.phaseTs, 0),
      recoverLock: !!STATE.recoverLock,
      recoverReason: String(STATE.recoverReason || ''),
      recoverStep: String(STATE.recoverStep || ''),
      userPausedIntent: !!STATE.userPausedIntent,
      pendingUserCommand: String(STATE.pendingUserCommand || ''),
      tick: {
        ts: toInt(STATE.tick.ts, 0),
        hasVideo: !!STATE.tick.hasVideo,
        ct: toNum(STATE.tick.ct, NaN),
        dur: toNum(STATE.tick.dur, NaN),
        paused: !!STATE.tick.paused,
        readyState: toInt(STATE.tick.readyState, 0),
        networkState: toInt(STATE.tick.networkState, 0),
        rangesCount: toInt(STATE.tick.rangesCount, 0),
        totalBufferedSec: toNum(STATE.tick.totalBufferedSec, 0),
        aheadSec: toNum(STATE.tick.aheadSec, 0)
      },
      events: {
        count: safe(function () { return JSON.parse(JSON.stringify(STATE.events.count)); }, {}),
        last: safe(function () { return JSON.parse(JSON.stringify(STATE.events.last)); }, {})
      },
      logs: safe(function () { return STATE.logs.slice(-DET.logLimit); }, [])
    };
  };

  API.cancel = function (reason) {
    return cancelRecover(reason || 'api_cancel');
  };

  API.forceRecover = function (reason, prefer) {
    return startRecover(String(reason || 'force_recover'), prefer || null);
  };

  API.command = function (cmd, payload) {
    cmd = normalizeCommand(cmd);
    if (!cmd) return false;

    handleUserCommand(cmd, payload || null);

    var video = STATE.video || getVideo();

    if (cmd === 'pause') {
      try { if (video && typeof video.pause === 'function') video.pause(); } catch (_) { }
      return true;
    }

    if (cmd === 'play') {
      try { if (video && typeof video.play === 'function') video.play(); } catch (_) { }
      return true;
    }

    if (cmd === 'seek') {
      var sec = 0;
      try { sec = toNum(payload && payload.sec !== undefined ? payload.sec : payload, 0); } catch (_) { sec = 0; }
      try { if (video && isFinite(sec) && sec >= 0) video.currentTime = sec; } catch (_) { }
      return true;
    }

    if (cmd === 'exit') {
      try {
        if (window.Lampa && Lampa.Controller && typeof Lampa.Controller.back === 'function') Lampa.Controller.back();
        else if (window.Lampa && Lampa.Player && typeof Lampa.Player.close === 'function') Lampa.Player.close();
      } catch (_) { }
      return true;
    }

    return false;
  };

  API.refresh = function () {
    readSettingsFromStorage();
    if (!CFG.enabled) {
      cancelRecover('refresh_disabled');
      if (STATE.ui.open) uiHide('refresh_disabled');
    }
    return CFG;
  };

  API.install = function () {
    if (STATE.installed) return true;
    STATE.installed = true;

    readSettingsFromStorage();
    patchAll();

    try {
      if (window.Lampa && Lampa.Storage && Lampa.Storage.listener && typeof Lampa.Storage.listener.follow === 'function') {
        Lampa.Storage.listener.follow('change', function (e) {
          try {
            if (!e || !e.name) return;
            var n = String(e.name || '');
            if (n === KEY_ENABLED || n === KEY_DEBUG_ON_OPEN || n === KEY_HANG_TIME_MS || n === KEY_HANG_BUF_MS) API.refresh();
          } catch (_) { }
        });
      }
    } catch (_) { }

    try {
      if (STATE.timer) clearInterval(STATE.timer);
    } catch (_) { }

    STATE.timer = setInterval(tick, DET.tickMs);
    logLine('OK', 'installed', { tickMs: DET.tickMs });
    return true;
  };

  API.debugOpen = function () { uiShow('api_open'); };
  API.debugClose = function () { uiHide('api_close'); };

  API.install();
})();
