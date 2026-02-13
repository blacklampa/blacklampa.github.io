(function () {
  'use strict';

  var BL = window.BL = window.BL || {};
  BL.PlayerOverlay = BL.PlayerOverlay || {};

  var API = BL.PlayerOverlay;
  if (API.__blPlayerOverlayLoadedV2) return;
  API.__blPlayerOverlayLoadedV2 = true;

  var POPUP_FONT = '12px/1.35 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif';

  var LS_PREFIX = 'blacklampa_';
  try { if (BL.Keys && BL.Keys.prefix) LS_PREFIX = String(BL.Keys.prefix || 'blacklampa_'); } catch (_) { }

  var K = {
    enabled: LS_PREFIX + 'player_overlay_enabled',
    debugOnOpen: LS_PREFIX + 'player_overlay_debug_on_open',
    popupOpacity: LS_PREFIX + 'player_overlay_popup_opacity',
    protectNext: LS_PREFIX + 'player_overlay_protect_next',
    storeTruth: LS_PREFIX + 'player_overlay_store_truth',
    truthCommitMs: LS_PREFIX + 'player_overlay_truth_commit_ms',
    hangTimeMs: LS_PREFIX + 'player_overlay_hang_time_ms',
    hangBufMs: LS_PREFIX + 'player_overlay_hang_buf_ms',
    softAttempts: LS_PREFIX + 'player_overlay_soft_attempts',
    inplayerAttempts: LS_PREFIX + 'player_overlay_inplayer_attempts',
    inplayerMode: LS_PREFIX + 'player_overlay_inplayer_rebuild_mode',
    escalateToReopen: LS_PREFIX + 'player_overlay_escalate_to_reopen',
    reopenCooldownMs: LS_PREFIX + 'player_overlay_reopen_cooldown_ms',

    truthSec: LS_PREFIX + 'player_overlay_truth_sec',
    truthTs: LS_PREFIX + 'player_overlay_truth_ts',
    truthSrcSig: LS_PREFIX + 'player_overlay_truth_src_sig',

    // compatibility with previous experimental keys
    oldEnabled: LS_PREFIX + 'player_guard_overlay_enabled',
    oldDebugOnOpen: LS_PREFIX + 'player_guard_overlay_debug_on_open',
    oldHangTimeMs: LS_PREFIX + 'player_guard_overlay_hang_time_ms',
    oldHangBufMs: LS_PREFIX + 'player_guard_overlay_hang_buf_ms'
  };

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
    waitLoopMs: 250,
    softStepWaitMs: 2800,
    inplayerStepWaitMs: 5200,
    reopenStepWaitMs: 8500,
    manualNextBlockMs: 3000,
    falseEndTruthFreshMs: 10000,
    falseEndNearDurSec: 0.5,
    falseEndTruthGapSec: 5,
    truthSmoothMaxStepSec: 8,
    ctEpsSec: 0.05,
    aheadEpsSec: 0.15,
    waitingGraceMs: 2200,
    logLimit: 50
  };

  var CFG = {
    enabled: true,
    debugOnOpen: false,
    popupOpacity: 85,
    protectNext: true,
    storeTruth: true,
    truthCommitMs: 500,
    hangTimeMs: 10000,
    hangBufMs: 8000,
    softAttempts: 2,
    inplayerAttempts: 3,
    inplayerMode: 'refresh_src',
    escalateToReopen: true,
    reopenCooldownMs: 8000
  };

  var STATE = {
    installed: false,
    patched: { player: false, playlist: false, controller: false },
    timer: null,
    lastCfgReadTs: 0,

    phase: ST.IDLE,
    phaseReason: '',
    phaseTs: 0,

    video: null,
    listeners: null,

    userPausedIntent: false,
    pendingUserCommand: '',

    rec: {
      active: false,
      token: 0,
      reason: '',
      step: '',
      softTry: 0,
      inpTry: 0,
      reopenTry: 0,
      softMax: 2,
      inpMax: 3,
      lastAction: '',
      lastErr: '',
      startedTs: 0,
      lastReopenTs: 0
    },

    guard: {
      blockNextUntilTs: 0,
      lastFalseEndTs: 0,
      falseEndCount: 0
    },

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

    truth: {
      lastGoodSec: 0,
      lastGoodTs: 0,
      lastCommitTs: 0,
      srcSig: '',
      srcRaw: ''
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
      aheadSec: 0,
      src: '',
      srcSig: ''
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

  function sSet(k, v) {
    try { if (window.Lampa && Lampa.Storage && Lampa.Storage.set) Lampa.Storage.set(String(k), String(v)); } catch (_) { }
    try { if (window.localStorage) localStorage.setItem(String(k), String(v)); } catch (_) { }
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

  function ageMs(ts) {
    ts = toInt(ts, 0);
    if (!ts) return 0;
    var a = now() - ts;
    if (!isFinite(a) || a < 0) a = 0;
    return toInt(a, 0);
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

  function normalizeSrc(url) {
    url = String(url || '');
    if (!url) return '';
    var base = '';
    try { base = String(url).split('|')[0]; } catch (_) { base = String(url || ''); }
    if (!base) return '';

    try {
      var u = new URL(base, (location && location.href) ? location.href : undefined);
      try { u.searchParams.delete('bl_ov'); } catch (_) { }
      try { u.searchParams.delete('bl_pg'); } catch (_) { }
      return String(u.href || '');
    } catch (_) {
      return base;
    }
  }

  function withCacheBust(url) {
    url = String(url || '');
    if (!url) return '';
    try {
      var u = new URL(url, (location && location.href) ? location.href : undefined);
      u.searchParams.set('bl_ov', String(now()));
      return String(u.href || '');
    } catch (_) {
      var sep = (url.indexOf('?') >= 0) ? '&' : '?';
      return url + sep + 'bl_ov=' + String(now());
    }
  }

  function getVideo() {
    try {
      if (window.Lampa && Lampa.PlayerVideo && typeof Lampa.PlayerVideo.video === 'function') return Lampa.PlayerVideo.video();
    } catch (_) { }
    return null;
  }

  function getCurrentSrc(video) {
    var s = '';
    try { if (video && typeof video.currentSrc === 'string' && video.currentSrc) s = String(video.currentSrc); } catch (_) { s = ''; }
    try { if (!s && video && typeof video.src === 'string' && video.src) s = String(video.src); } catch (_) { }
    if (!s) {
      try {
        if (window.Lampa && Lampa.Player && typeof Lampa.Player.playdata === 'function') {
          var pd = Lampa.Player.playdata() || null;
          if (pd && typeof pd.url === 'string') s = String(pd.url || '');
        }
      } catch (_) { }
    }
    return normalizeSrc(s);
  }

  function srcSig(url) {
    return hash32(normalizeSrc(url));
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

  function phaseColor(phase) {
    phase = String(phase || '');
    if (phase === ST.PLAYING) return '#67c27a';
    if (phase === ST.BUFFERING || phase === ST.RECOVERING_SOFT || phase === ST.RECOVERING_INPLAYER || phase === ST.RECOVERING_REOPEN) return '#d9b24c';
    if (phase === ST.HUNG || phase === ST.FAILED) return '#e06b6b';
    if (phase === ST.PAUSED_BY_USER) return '#8eb4ff';
    return '#b7bec7';
  }

  function normalizeInplayerMode(v) {
    try { v = String(v || '').toLowerCase(); } catch (_) { v = ''; }
    if (v === 'destroy_url' || v === 'video_src' || v === 'refresh_src') return v;
    return 'refresh_src';
  }

  function readSettingsFromStorage() {
    var enRaw = sGet(K.enabled, null);
    if (enRaw === null || enRaw === undefined || enRaw === '') enRaw = sGet(K.oldEnabled, '1');
    CFG.enabled = parseBool(enRaw, true);

    var dbgRaw = sGet(K.debugOnOpen, null);
    if (dbgRaw === null || dbgRaw === undefined || dbgRaw === '') dbgRaw = sGet(K.oldDebugOnOpen, '0');
    CFG.debugOnOpen = parseBool(dbgRaw, false);

    CFG.popupOpacity = clampInt(sGet(K.popupOpacity, '85'), 20, 100);
    CFG.protectNext = parseBool(sGet(K.protectNext, '1'), true);
    CFG.storeTruth = parseBool(sGet(K.storeTruth, '1'), true);
    CFG.truthCommitMs = clampInt(sGet(K.truthCommitMs, '500'), 250, 2000);

    var htRaw = sGet(K.hangTimeMs, null);
    if (htRaw === null || htRaw === undefined || htRaw === '') htRaw = sGet(K.oldHangTimeMs, '10000');
    CFG.hangTimeMs = clampInt(htRaw, 3000, 60000);

    var hbRaw = sGet(K.hangBufMs, null);
    if (hbRaw === null || hbRaw === undefined || hbRaw === '') hbRaw = sGet(K.oldHangBufMs, '8000');
    CFG.hangBufMs = clampInt(hbRaw, 3000, 60000);

    CFG.softAttempts = clampInt(sGet(K.softAttempts, '2'), 0, 5);
    CFG.inplayerAttempts = clampInt(sGet(K.inplayerAttempts, '3'), 0, 6);
    CFG.inplayerMode = normalizeInplayerMode(sGet(K.inplayerMode, 'refresh_src'));
    CFG.escalateToReopen = parseBool(sGet(K.escalateToReopen, '1'), true);
    CFG.reopenCooldownMs = clampInt(sGet(K.reopenCooldownMs, '8000'), 1000, 60000);

    STATE.lastCfgReadTs = now();
    return CFG;
  }

  function setPhase(next, reason) {
    next = String(next || ST.IDLE);
    reason = String(reason || '');
    if (STATE.phase === next && STATE.phaseReason === reason) return;
    STATE.phase = next;
    STATE.phaseReason = reason;
    STATE.phaseTs = now();
    logLine('DBG', 'state', { phase: next, reason: reason, rec: STATE.rec.active ? 1 : 0 });
  }

  function bumpEvent(name) {
    name = String(name || '');
    if (!name) return;
    try {
      if (!Object.prototype.hasOwnProperty.call(STATE.events.count, name)) STATE.events.count[name] = 0;
      STATE.events.count[name] = toInt(STATE.events.count[name], 0) + 1;
      STATE.events.last[name] = now();
    } catch (_) { }

    if (name === 'progress' || name === 'timeupdate' || name === 'play' || name === 'playing') {
      STATE.monitor.lastProgressSignalTs = now();
    }
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

  function truthReadFromStorage() {
    try {
      var sec = toNum(sGet(K.truthSec, ''), NaN);
      var ts = toInt(sGet(K.truthTs, '0'), 0);
      var sig = String(sGet(K.truthSrcSig, '') || '');
      if (!isFinite(sec) || sec < 0 || !ts) return null;
      return { sec: sec, ts: ts, sig: sig };
    } catch (_) {
      return null;
    }
  }

  function truthCommit(reason) {
    if (!CFG.storeTruth) return;
    var t = STATE.truth;
    if (!isFinite(toNum(t.lastGoodSec, NaN))) return;
    if (!t.lastGoodTs) return;

    try {
      sSet(K.truthSec, String(toNum(t.lastGoodSec, 0)));
      sSet(K.truthTs, String(toInt(t.lastGoodTs, 0)));
      sSet(K.truthSrcSig, String(t.srcSig || ''));
      STATE.truth.lastCommitTs = now();
      logLine('DBG', 'truth_commit', { sec: toNum(t.lastGoodSec, 0).toFixed(2), reason: String(reason || '') });
    } catch (_) { }
  }

  function truthSeedFromStorage(video) {
    if (!CFG.storeTruth) return;
    if (isFinite(toNum(STATE.truth.lastGoodSec, NaN)) && STATE.truth.lastGoodTs) return;

    var saved = truthReadFromStorage();
    if (!saved) return;

    var sig = '';
    try { sig = srcSig(getCurrentSrc(video)); } catch (_) { sig = ''; }
    if (saved.sig && sig && saved.sig !== sig) return;

    STATE.truth.lastGoodSec = Math.max(0, toNum(saved.sec, 0));
    STATE.truth.lastGoodTs = toInt(saved.ts, 0);
    STATE.truth.srcSig = String(saved.sig || sig || '');
    STATE.truth.lastCommitTs = toInt(saved.ts, 0);
  }

  function truthUpdate(video, reason) {
    if (!CFG.storeTruth) return;
    if (!video) return;

    var ct = toNum(video.currentTime, NaN);
    var dur = toNum(video.duration, NaN);
    if (!isFinite(ct) || ct < 0) return;
    if (isFinite(dur) && dur > 0 && ct >= dur - DET.falseEndNearDurSec) return;

    var prev = toNum(STATE.truth.lastGoodSec, NaN);
    if (isFinite(prev)) {
      var d = ct - prev;
      if (d < -2) return;
      if (d > DET.truthSmoothMaxStepSec) return;
      if (d < 0.02) return;
    }

    STATE.truth.lastGoodSec = ct;
    STATE.truth.lastGoodTs = now();
    STATE.truth.srcRaw = getCurrentSrc(video);
    STATE.truth.srcSig = srcSig(STATE.truth.srcRaw);

    if (!STATE.truth.lastCommitTs || (now() - toInt(STATE.truth.lastCommitTs, 0)) >= CFG.truthCommitMs) {
      truthCommit(reason || 'tick');
    }
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

    on('timeupdate', function () { bumpEvent('timeupdate'); try { truthUpdate(video, 'timeupdate'); } catch (_) { } });
    on('progress', function () { bumpEvent('progress'); });
    on('waiting', function () { bumpEvent('waiting'); });
    on('stalled', function () { bumpEvent('stalled'); });
    on('error', function () { bumpEvent('error'); });
    on('play', function () { bumpEvent('play'); if (!STATE.rec.active) STATE.userPausedIntent = false; });
    on('playing', function () { bumpEvent('playing'); if (!STATE.rec.active) STATE.userPausedIntent = false; });
    on('pause', function () {
      bumpEvent('pause');
      if (STATE.rec.active) return;
      try { if (video.paused) STATE.userPausedIntent = true; } catch (_) { }
      try { truthCommit('pause'); } catch (_) { }
    });
    on('canplay', function () { bumpEvent('canplay'); });
    on('loadeddata', function () { bumpEvent('loadeddata'); });
    on('ended', function () {
      bumpEvent('ended');
      try { maybeHandleFalseEnd('ended_evt'); } catch (_) { }
    });

    truthSeedFromStorage(video);
    logLine('INF', 'video_listeners_bound', { ok: 1 });
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

  function fmtBuffered(video) {
    var out = {
      rangesCount: 0,
      rangesText: '',
      aheadSec: 0,
      totalBufferedSec: 0
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
      out.totalBufferedSec = total;
      out.aheadSec = ahead;
      return out;
    } catch (_) {
      return out;
    }
  }

  function collectTick(video) {
    var ts = now();
    var s = {
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
      aheadSec: 0,
      src: '',
      srcSig: ''
    };

    if (video) {
      s.ct = toNum(video.currentTime, NaN);
      s.dur = toNum(video.duration, NaN);
      s.paused = !!video.paused;
      s.readyState = toInt(video.readyState, 0);
      s.networkState = toInt(video.networkState, 0);
      s.src = getCurrentSrc(video);
      s.srcSig = srcSig(s.src);

      var b = fmtBuffered(video);
      s.rangesCount = toInt(b.rangesCount, 0);
      s.rangesText = String(b.rangesText || '');
      s.totalBufferedSec = toNum(b.totalBufferedSec, 0);
      s.aheadSec = toNum(b.aheadSec, 0);

      if (!isFinite(STATE.monitor.lastCt)) {
        STATE.monitor.lastCt = s.ct;
        STATE.monitor.lastCtChangeTs = ts;
      } else if (isFinite(s.ct) && Math.abs(s.ct - STATE.monitor.lastCt) >= DET.ctEpsSec) {
        STATE.monitor.lastCt = s.ct;
        STATE.monitor.lastCtChangeTs = ts;
      }

      if (!isFinite(STATE.monitor.lastAheadSec)) {
        STATE.monitor.lastAheadSec = s.aheadSec;
        STATE.monitor.lastAheadChangeTs = ts;
      } else if (Math.abs(s.aheadSec - STATE.monitor.lastAheadSec) >= DET.aheadEpsSec) {
        STATE.monitor.lastAheadSec = s.aheadSec;
        STATE.monitor.lastAheadChangeTs = ts;
      }

      if (CFG.storeTruth) truthUpdate(video, 'tick');
    }

    STATE.tick = s;
    return s;
  }

  function ensureUiStyle() {
    try {
      if (!document || !document.head) return;
      if (document.getElementById('__bl_player_overlay_style_v2')) return;

      var st = document.createElement('style');
      st.id = '__bl_player_overlay_style_v2';
      st.type = 'text/css';
      st.textContent = ''
        + '#__bl_player_overlay_popup_v2{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);min-width:360px;max-width:760px;max-height:75vh;'
        + 'background:rgba(0,0,0,0.86);color:#fff;padding:12px 14px;border-radius:14px;z-index:2147483646;'
        + 'box-shadow:0 10px 28px rgba(0,0,0,0.6);backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px);pointer-events:auto;overflow:hidden;}'
        + '#__bl_player_overlay_popup_v2.bl-ov-hidden{display:none;}'
        + '#__bl_player_overlay_popup_v2 .bl-ov-title{font-weight:800;font-size:15px;margin:0 0 8px 0;}'
        + '#__bl_player_overlay_popup_v2 .bl-ov-body{margin:0;opacity:0.95;white-space:pre-wrap;word-break:break-word;overflow:auto;max-height:66vh;}';

      document.head.appendChild(st);
    } catch (_) { }
  }

  function ensureUiRoot() {
    if (STATE.ui.root) return STATE.ui.root;

    ensureUiStyle();

    var root = null;
    try { if (document) root = document.getElementById('__bl_player_overlay_popup_v2'); } catch (_) { root = null; }

    if (!root) {
      try {
        root = document.createElement('div');
        root.id = '__bl_player_overlay_popup_v2';
        root.className = 'bl-ov-hidden';
        root.style.font = POPUP_FONT;

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
        root.style.font = POPUP_FONT;
        STATE.ui.titleEl = root.querySelector('.bl-ov-title');
        STATE.ui.bodyEl = root.querySelector('.bl-ov-body');
      } catch (_) { }
    }

    STATE.ui.root = root;
    return root;
  }

  function popupOpacity() {
    var op = toNum(CFG.popupOpacity, 85) / 100;
    if (!isFinite(op)) op = 0.85;
    if (op < 0.2) op = 0.2;
    if (op > 1.0) op = 1.0;
    return op;
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

    var drift = 0;
    try {
      if (isFinite(toNum(t.ct, NaN)) && isFinite(toNum(STATE.truth.lastGoodSec, NaN))) {
        drift = toNum(t.ct, 0) - toNum(STATE.truth.lastGoodSec, 0);
      }
    } catch (_) { drift = 0; }

    lines.push('state=' + String(STATE.phase || '')
      + ' lock=' + (STATE.rec.active ? '1' : '0')
      + ' step=' + String(STATE.rec.step || '')
      + ' userPausedIntent=' + (STATE.userPausedIntent ? '1' : '0'));

    lines.push('recovery: soft ' + String(toInt(STATE.rec.softTry, 0)) + '/' + String(toInt(STATE.rec.softMax, 0))
      + ' | inplayer ' + String(toInt(STATE.rec.inpTry, 0)) + '/' + String(toInt(STATE.rec.inpMax, 0))
      + ' | reopen ' + String(toInt(STATE.rec.reopenTry, 0)) + '/1'
      + ' | lastAction=' + String(STATE.rec.lastAction || '')
      + ' | lastErr=' + String(STATE.rec.lastErr || ''));

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
      + ' timeupdate=' + toInt(STATE.events.count.timeupdate, 0));

    lines.push('agesMs: ct=' + String(ageMs(STATE.monitor.lastCtChangeTs))
      + ' progress=' + String(ageMs(STATE.monitor.lastProgressSignalTs))
      + ' ahead=' + String(ageMs(STATE.monitor.lastAheadChangeTs))
      + ' waiting=' + String(ageMs(STATE.events.last.waiting))
      + ' stalled=' + String(ageMs(STATE.events.last.stalled)));

    var blockUntil = toInt(STATE.guard.blockNextUntilTs, 0);
    var blockLeft = Math.max(0, blockUntil - now());
    lines.push('protect_next=' + (CFG.protectNext ? 'ON' : 'OFF')
      + ' blockNextUntilTs=' + String(blockUntil)
      + ' blockLeftMs=' + String(toInt(blockLeft, 0))
      + ' falseEndCount=' + String(toInt(STATE.guard.falseEndCount, 0)));

    lines.push('truth: ct=' + toNum(t.ct, 0).toFixed(2)
      + ' lastGood=' + toNum(STATE.truth.lastGoodSec, 0).toFixed(2)
      + ' drift=' + toNum(drift, 0).toFixed(2)
      + ' ageMs=' + String(ageMs(STATE.truth.lastGoodTs))
      + ' srcSig=' + String(STATE.truth.srcSig || t.srcSig || ''));

    var pg = null;
    try {
      if (window.BL && BL.PlayerGuard && typeof BL.PlayerGuard.getRuntimeSnapshot === 'function') pg = BL.PlayerGuard.getRuntimeSnapshot() || null;
    } catch (_) { pg = null; }

    if (pg && typeof pg === 'object') {
      var pgCfg = pg.cfg || {};
      var pgRec = pg.rec || {};
      var pgGuard = pg.guard || {};
      lines.push('pg: enabled=' + (pgCfg.enabled ? 1 : 0)
        + ' mode=' + String(pgRec.mode || '')
        + ' intent=' + String(pgRec.hardIntent || '')
        + ' action=' + String(pgRec.lastHardAction || '')
        + ' lock=' + (pgGuard.lock ? 1 : 0));
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
      root.style.opacity = String(popupOpacity());
      root.style.font = POPUP_FONT;

      if (STATE.ui.titleEl) {
        STATE.ui.titleEl.textContent = 'BL Player Overlay DEBUG';
        STATE.ui.titleEl.style.color = phaseColor(STATE.phase);
      }

      root.style.border = '1px solid ' + phaseColor(STATE.phase);
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
    try { if (STATE.ui.root) STATE.ui.root.classList.add('bl-ov-hidden'); } catch (_) { }
    STATE.ui.open = false;
    uiRemoveKeyHandler();
    logLine('DBG', 'debug_hide', { reason: String(reason || '') });
  }

  function normalizeCommand(cmd) {
    cmd = String(cmd || '').toLowerCase();
    if (!cmd) return '';

    if (cmd.indexOf('back') >= 0 || cmd === 'exit' || cmd === 'close' || cmd.indexOf('return') >= 0 || cmd.indexOf('stop') >= 0) return 'exit';
    if (cmd.indexOf('pause') >= 0) return 'pause';
    if (cmd.indexOf('play') >= 0 && cmd !== 'playlist') return 'play';
    if (cmd.indexOf('seek') >= 0 || cmd === 'rewind' || cmd === 'forward' || cmd === 'backward' || cmd === 'to' || cmd === 'totime' || cmd === 'to_time') return 'seek';

    return '';
  }

  function getPg() {
    try { if (window.BL && BL.PlayerGuard) return BL.PlayerGuard; } catch (_) { }
    return null;
  }

  function beginCritical(tag, ttlMs) {
    var pg = getPg();
    try { if (pg && typeof pg.beginOverlayCritical === 'function') pg.beginOverlayCritical(String(tag || 'overlay_recover'), ttlMs || 2500); } catch (_) { }
  }

  function endCritical(tag) {
    var pg = getPg();
    try { if (pg && typeof pg.endOverlayCritical === 'function') pg.endOverlayCritical(String(tag || 'overlay_recover')); } catch (_) { }
  }

  function isBlockNextActive() {
    return now() < toInt(STATE.guard.blockNextUntilTs, 0);
  }

  function armBlockNext(ms, why) {
    ms = clampInt(ms, 1000, 10000);
    STATE.guard.blockNextUntilTs = Math.max(toInt(STATE.guard.blockNextUntilTs, 0), now() + ms);
    logLine('WRN', 'block_next_window', { ms: ms, why: String(why || '') });
  }

  function shouldBlockNextType(type) {
    var t = String(type || '').toLowerCase();
    if (!t) return false;
    if (t === 'select' || t === 'next' || t === 'to_end' || t === 'ended' || t === 'destroy') return true;
    if (t.indexOf('next') >= 0) return true;
    if (t.indexOf('select') >= 0) return true;
    if (t.indexOf('ended') >= 0) return true;
    return false;
  }

  function truthTarget() {
    var t = toNum(STATE.truth.lastGoodSec, NaN);
    if (isFinite(t) && t >= 0) return t;
    var cur = toNum(STATE.tick.ct, NaN);
    if (isFinite(cur) && cur >= 0) return cur;
    return 0;
  }

  function applyTruthSeekAndPlay(tag) {
    var v = STATE.video || getVideo();
    if (!v) return false;

    var target = Math.max(0, toNum(truthTarget(), 0));
    try { v.currentTime = target; } catch (_) { }

    if (!STATE.userPausedIntent) {
      try {
        if (typeof v.play === 'function') {
          var p = v.play();
          if (p && typeof p.catch === 'function') p.catch(function () { });
        }
      } catch (_) { }
    }

    STATE.rec.lastAction = String(tag || 'seek_truth') + ':' + target.toFixed(2);
    return true;
  }

  function waitForProgress(token, timeoutMs, cb) {
    var started = now();
    var startCt = toNum(STATE.tick.ct, NaN);

    function loop() {
      if (token !== toInt(STATE.rec.token, 0)) return cb(false, 'canceled');

      var v = STATE.video || getVideo();
      if (v) {
        var ct = toNum(v.currentTime, NaN);
        var ctMoved = isFinite(startCt) && isFinite(ct) && (ct - startCt) > 0.35;
        if (ctMoved) return cb(true, 'ct_moved');
      }

      var ctAge = ageMs(STATE.monitor.lastCtChangeTs);
      var progAge = ageMs(STATE.monitor.lastProgressSignalTs);
      if (ctAge < 1400 && progAge < 1400) return cb(true, 'signal_ok');

      if ((now() - started) >= timeoutMs) return cb(false, 'timeout');
      setTimeout(loop, DET.waitLoopMs);
    }

    loop();
  }

  function actionSoftAttempt(idx) {
    var v = STATE.video || getVideo();
    if (!v) return false;

    var target = truthTarget();
    if (idx <= 1) {
      try { v.currentTime = Math.max(0, target); } catch (_) { }
      if (!STATE.userPausedIntent) {
        try {
          var p1 = v.play ? v.play() : null;
          if (p1 && typeof p1.catch === 'function') p1.catch(function () { });
        } catch (_) { }
      }
      STATE.rec.lastAction = 'soft_seek_play';
      return true;
    }

    try { if (typeof v.pause === 'function') v.pause(); } catch (_) { }
    try { if (typeof v.load === 'function') v.load(); } catch (_) { }
    setTimeout(function () {
      try { v.currentTime = Math.max(0, target); } catch (_) { }
      if (!STATE.userPausedIntent) {
        try {
          var p2 = v.play ? v.play() : null;
          if (p2 && typeof p2.catch === 'function') p2.catch(function () { });
        } catch (_) { }
      }
    }, 120);

    STATE.rec.lastAction = 'soft_pause_load_seek_play';
    return true;
  }

  function actionInplayerRebuild(mode) {
    mode = normalizeInplayerMode(mode);

    var pv = null;
    try { pv = (window.Lampa && Lampa.PlayerVideo) ? Lampa.PlayerVideo : null; } catch (_) { pv = null; }
    var v = STATE.video || getVideo();
    if (!v && pv && typeof pv.video === 'function') {
      try { v = pv.video(); } catch (_) { v = null; }
    }
    if (!v) {
      STATE.rec.lastErr = 'no_video';
      return false;
    }

    var src = getCurrentSrc(v);
    if (!src) {
      STATE.rec.lastErr = 'empty_src';
      return false;
    }

    var busted = withCacheBust(src);
    var ok = false;

    beginCritical('overlay_recover', 2500);

    try {
      if (mode === 'destroy_url') {
        if (pv && typeof pv.destroy === 'function' && typeof pv.url === 'function') {
          try { pv.destroy(true); } catch (_) { }
          pv.url(String(busted || src), true);
          STATE.rec.lastAction = 'inplayer_destroy_url';
          ok = true;
        }
      }

      if (!ok && mode === 'video_src') {
        try { if (typeof v.pause === 'function') v.pause(); } catch (_) { }
        try { if (typeof v.removeAttribute === 'function') v.removeAttribute('src'); } catch (_) { }
        try { v.src = ''; } catch (_) { }
        try { if (typeof v.load === 'function') v.load(); } catch (_) { }
        try { v.src = String(busted || src); } catch (_) { }
        try { if (typeof v.load === 'function') v.load(); } catch (_) { }
        STATE.rec.lastAction = 'inplayer_video_src';
        ok = true;
      }

      if (!ok) {
        if (pv && typeof pv.url === 'function') {
          pv.url(String(busted || src), true);
          STATE.rec.lastAction = 'inplayer_refresh_src:url';
          ok = true;
        } else {
          try { v.src = String(busted || src); } catch (_) { }
          try { if (typeof v.load === 'function') v.load(); } catch (_) { }
          STATE.rec.lastAction = 'inplayer_refresh_src:video';
          ok = true;
        }
      }
    } catch (e) {
      STATE.rec.lastErr = e && e.message ? String(e.message) : 'inplayer_exception';
      ok = false;
    }

    setTimeout(function () {
      try { applyTruthSeekAndPlay('inplayer_seek_truth'); } catch (_) { }
    }, 280);

    setTimeout(function () {
      try { applyTruthSeekAndPlay('inplayer_seek_truth2'); } catch (_) { }
      try { endCritical('overlay_recover'); } catch (_) { }
    }, 1100);

    return ok;
  }

  function actionReopenViaPg() {
    if (!CFG.escalateToReopen) {
      STATE.rec.lastErr = 'reopen_disabled';
      return false;
    }

    var t = now();
    if ((t - toInt(STATE.rec.lastReopenTs, 0)) < CFG.reopenCooldownMs) {
      STATE.rec.lastErr = 'reopen_cooldown';
      return false;
    }

    var pg = getPg();
    if (!pg || typeof pg.requestRecover !== 'function') {
      STATE.rec.lastErr = 'pg_request_missing';
      return false;
    }

    STATE.rec.lastReopenTs = t;

    beginCritical('overlay_recover', 2500);
    var r = null;
    try { r = pg.requestRecover('overlay_reopen', { prefer: 'reopen' }); } catch (_) { r = null; }

    STATE.rec.lastAction = 'reopen_via_pg';

    setTimeout(function () {
      try { endCritical('overlay_recover'); } catch (_) { }
    }, 1200);

    if (!r || typeof r !== 'object') {
      STATE.rec.lastErr = 'reopen_request_invalid';
      return false;
    }

    if (r.started || String(r.why || '') === 'busy') return true;
    STATE.rec.lastErr = String(r.why || 'reopen_rejected');
    return false;
  }

  function recoveryFinish(ok, why) {
    STATE.rec.active = false;
    STATE.rec.step = '';
    STATE.rec.reason = '';
    if (ok) {
      setPhase(ST.PLAYING, 'recovered:' + String(why || 'ok'));
      logLine('OK', 'recover_done', { why: String(why || 'ok') });
    } else {
      setPhase(ST.FAILED, String(why || 'failed'));
      logLine('ERR', 'recover_failed', { why: String(why || ''), lastErr: String(STATE.rec.lastErr || '') });
    }
  }

  function recoveryCancel(reason) {
    var was = !!STATE.rec.active;
    STATE.rec.token = toInt(STATE.rec.token, 0) + 1;
    STATE.rec.active = false;
    STATE.rec.step = '';
    STATE.rec.reason = '';
    endCritical('overlay_recover');

    if (STATE.tick.hasVideo) {
      if (STATE.userPausedIntent || STATE.tick.paused) setPhase(ST.PAUSED_BY_USER, String(reason || 'cancel'));
      else setPhase(ST.PLAYING, String(reason || 'cancel'));
    } else setPhase(ST.IDLE, String(reason || 'cancel'));

    if (was) logLine('WRN', 'recover_cancel', { reason: String(reason || '') });
    return was;
  }

  function runReopenStep(token) {
    if (token !== toInt(STATE.rec.token, 0)) return;

    STATE.rec.step = 'reopen';
    STATE.rec.reopenTry = 1;
    setPhase(ST.RECOVERING_REOPEN, 'reopen');

    var ok = actionReopenViaPg();
    if (!ok) return recoveryFinish(false, 'reopen_rejected');

    waitForProgress(token, DET.reopenStepWaitMs, function (success, why) {
      if (token !== toInt(STATE.rec.token, 0)) return;
      if (success) return recoveryFinish(true, 'reopen_' + String(why || 'ok'));
      recoveryFinish(false, 'reopen_timeout');
    });
  }

  function runInplayerStep(token) {
    if (token !== toInt(STATE.rec.token, 0)) return;

    if (STATE.rec.inpTry >= STATE.rec.inpMax) {
      if (CFG.escalateToReopen) return runReopenStep(token);
      return recoveryFinish(false, 'inplayer_exhausted');
    }

    STATE.rec.inpTry++;
    STATE.rec.step = 'inplayer';
    setPhase(ST.RECOVERING_INPLAYER, 'inplayer:' + String(STATE.rec.inpTry) + '/' + String(STATE.rec.inpMax));

    var ok = actionInplayerRebuild(CFG.inplayerMode);
    if (!ok) {
      setTimeout(function () {
        runInplayerStep(token);
      }, 250);
      return;
    }

    waitForProgress(token, DET.inplayerStepWaitMs, function (success, why) {
      if (token !== toInt(STATE.rec.token, 0)) return;
      if (success) return recoveryFinish(true, 'inplayer_' + String(why || 'ok'));
      STATE.rec.lastErr = 'inplayer_no_progress';
      runInplayerStep(token);
    });
  }

  function runSoftStep(token) {
    if (token !== toInt(STATE.rec.token, 0)) return;

    if (STATE.rec.softTry >= STATE.rec.softMax) return runInplayerStep(token);

    STATE.rec.softTry++;
    STATE.rec.step = 'soft';
    setPhase(ST.RECOVERING_SOFT, 'soft:' + String(STATE.rec.softTry) + '/' + String(STATE.rec.softMax));

    var ok = actionSoftAttempt(STATE.rec.softTry);
    if (!ok) {
      setTimeout(function () {
        runSoftStep(token);
      }, 150);
      return;
    }

    waitForProgress(token, DET.softStepWaitMs, function (success, why) {
      if (token !== toInt(STATE.rec.token, 0)) return;
      if (success) return recoveryFinish(true, 'soft_' + String(why || 'ok'));
      STATE.rec.lastErr = 'soft_no_progress';
      runSoftStep(token);
    });
  }

  function startRecovery(reason) {
    reason = String(reason || 'hang');

    if (!CFG.enabled) return false;
    if (STATE.rec.active) return false;

    STATE.rec.active = true;
    STATE.rec.token = toInt(STATE.rec.token, 0) + 1;
    STATE.rec.reason = reason;
    STATE.rec.step = '';
    STATE.rec.softTry = 0;
    STATE.rec.inpTry = 0;
    STATE.rec.reopenTry = 0;
    STATE.rec.softMax = clampInt(CFG.softAttempts, 0, 5);
    STATE.rec.inpMax = clampInt(CFG.inplayerAttempts, 0, 6);
    STATE.rec.lastAction = '';
    STATE.rec.lastErr = '';
    STATE.rec.startedTs = now();

    logLine('WRN', 'recover_begin', {
      reason: reason,
      soft: STATE.rec.softMax,
      inplayer: STATE.rec.inpMax,
      mode: CFG.inplayerMode,
      reopen: CFG.escalateToReopen ? 1 : 0
    });

    var token = toInt(STATE.rec.token, 0);
    runSoftStep(token);
    return true;
  }

  function handleUserCommand(cmd, payload) {
    cmd = normalizeCommand(cmd);
    if (!cmd) return;

    STATE.pendingUserCommand = cmd;

    if (cmd === 'pause') STATE.userPausedIntent = true;
    else if (cmd === 'play') STATE.userPausedIntent = false;

    if (STATE.rec.active) recoveryCancel('user:' + cmd);

    if (cmd === 'exit') setPhase(ST.IDLE, 'user_exit');

    try {
      logLine('DBG', 'user_command', { cmd: cmd, src: payload && payload.type ? String(payload.type) : '' });
    } catch (_) { }
  }

  function isFalseEnd(ct, dur) {
    if (!CFG.protectNext) return false;
    if (!isFinite(toNum(ct, NaN)) || !isFinite(toNum(dur, NaN)) || dur <= 0) return false;
    if (ct < dur - DET.falseEndNearDurSec) return false;

    var tr = toNum(STATE.truth.lastGoodSec, NaN);
    if (!isFinite(tr) || tr < 0) return false;
    if ((dur - tr) < DET.falseEndTruthGapSec) return false;
    if (ageMs(STATE.truth.lastGoodTs) > DET.falseEndTruthFreshMs) return false;

    return true;
  }

  function maybeHandleFalseEnd(reason) {
    if (!CFG.enabled || !CFG.protectNext) return false;

    var t = STATE.tick;
    var ct = toNum(t && t.ct, NaN);
    var dur = toNum(t && t.dur, NaN);

    if (!isFalseEnd(ct, dur)) return false;

    var ts = now();
    if ((ts - toInt(STATE.guard.lastFalseEndTs, 0)) < 1000) return false;
    STATE.guard.lastFalseEndTs = ts;
    STATE.guard.falseEndCount = toInt(STATE.guard.falseEndCount, 0) + 1;

    armBlockNext(DET.manualNextBlockMs, 'false_end');

    var v = STATE.video || getVideo();
    var target = Math.max(0, toNum(STATE.truth.lastGoodSec, 0) - 0.7);
    try { if (v) v.currentTime = target; } catch (_) { }
    if (!STATE.userPausedIntent) {
      try {
        if (v && typeof v.play === 'function') {
          var p = v.play();
          if (p && typeof p.catch === 'function') p.catch(function () { });
        }
      } catch (_) { }
    }

    logLine('WRN', 'FALSE_END prevented', {
      reason: String(reason || ''),
      ct: isFinite(ct) ? ct.toFixed(2) : '',
      dur: isFinite(dur) ? dur.toFixed(2) : '',
      truth: toNum(STATE.truth.lastGoodSec, 0).toFixed(2),
      blockNextUntilTs: toInt(STATE.guard.blockNextUntilTs, 0)
    });

    if (!STATE.rec.active) {
      setPhase(ST.HUNG, 'false_end');
      startRecovery('false_end');
    }

    return true;
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
      recoveryCancel('player_destroy');
      setPhase(ST.IDLE, 'player_destroy');
      return;
    }

    handleUserCommand(tl, { type: t, payload: payload });
  }

  function patchPlayerSend() {
    if (STATE.patched.player) return true;
    if (!window.Lampa || !Lampa.Player || !Lampa.Player.listener || typeof Lampa.Player.listener.send !== 'function') return false;

    var send = Lampa.Player.listener.send;
    if (send.__blPlayerOverlayWrappedV2) {
      STATE.patched.player = true;
      return true;
    }

    var orig = send;
    Lampa.Player.listener.send = function () {
      var type = (arguments && arguments.length) ? arguments[0] : '';
      var payload = (arguments && arguments.length > 1) ? arguments[1] : undefined;

      try { handlePlayerSend(type, payload); } catch (_) { }

      try {
        if (CFG.enabled && CFG.protectNext && isBlockNextActive() && shouldBlockNextType(type)) {
          logLine('WRN', 'prevent_next_overlay', { where: 'player.send', type: String(type || ''), untilTs: toInt(STATE.guard.blockNextUntilTs, 0) });
          return;
        }
      } catch (_) { }

      return orig.apply(this, arguments);
    };

    Lampa.Player.listener.send.__blPlayerOverlayWrappedV2 = true;
    STATE.patched.player = true;
    logLine('OK', 'patched', { what: 'Player.listener.send' });
    return true;
  }

  function patchPlaylistSend() {
    if (STATE.patched.playlist) return true;
    if (!window.Lampa || !Lampa.PlayerPlaylist || !Lampa.PlayerPlaylist.listener || typeof Lampa.PlayerPlaylist.listener.send !== 'function') return false;

    var send = Lampa.PlayerPlaylist.listener.send;
    if (send.__blPlayerOverlayWrappedV2) {
      STATE.patched.playlist = true;
      return true;
    }

    var orig = send;
    Lampa.PlayerPlaylist.listener.send = function () {
      var type = (arguments && arguments.length) ? arguments[0] : '';

      try {
        if (CFG.enabled && CFG.protectNext && isBlockNextActive() && shouldBlockNextType(type)) {
          logLine('WRN', 'prevent_next_overlay', { where: 'playlist.send', type: String(type || ''), untilTs: toInt(STATE.guard.blockNextUntilTs, 0) });
          return;
        }
      } catch (_) { }

      return orig.apply(this, arguments);
    };

    Lampa.PlayerPlaylist.listener.send.__blPlayerOverlayWrappedV2 = true;
    STATE.patched.playlist = true;
    logLine('OK', 'patched', { what: 'PlayerPlaylist.listener.send' });
    return true;
  }

  function patchControllerBack() {
    if (STATE.patched.controller) return true;
    if (!window.Lampa || !Lampa.Controller || typeof Lampa.Controller.back !== 'function') return false;

    var back = Lampa.Controller.back;
    if (back.__blPlayerOverlayWrappedV2) {
      STATE.patched.controller = true;
      return true;
    }

    var orig = back;
    Lampa.Controller.back = function () {
      try { handleUserCommand('back', { type: 'controller.back' }); } catch (_) { }
      return orig.apply(this, arguments);
    };

    Lampa.Controller.back.__blPlayerOverlayWrappedV2 = true;
    STATE.patched.controller = true;
    logLine('OK', 'patched', { what: 'Controller.back' });
    return true;
  }

  function patchAll() {
    patchPlayerSend();
    patchPlaylistSend();
    patchControllerBack();
  }

  function updatePhaseByTick() {
    if (STATE.rec.active) return;

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

  function maybeDetectHang() {
    if (!CFG.enabled) return false;
    if (STATE.rec.active) return false;

    var t = STATE.tick;
    if (!t || !t.hasVideo) return false;
    if (STATE.userPausedIntent || t.paused) return false;

    var ctAge = ageMs(STATE.monitor.lastCtChangeTs);
    var progAge = ageMs(STATE.monitor.lastProgressSignalTs);
    var aheadAge = ageMs(STATE.monitor.lastAheadChangeTs);

    var hang = ctAge >= CFG.hangTimeMs && progAge >= CFG.hangBufMs && aheadAge >= CFG.hangBufMs;
    if (!hang) return false;

    if (ageMs(STATE.events.last.waiting) < DET.waitingGraceMs && toNum(t.aheadSec, 0) > 2.0) return false;

    setPhase(ST.HUNG, 'watchdog_hang');
    logLine('WRN', 'hang_detected', {
      ctAge: ctAge,
      progAge: progAge,
      aheadAge: aheadAge,
      ahead: toNum(t.aheadSec, 0).toFixed(1)
    });

    return startRecovery('watchdog_hang');
  }

  function tick() {
    try {
      if ((now() - toInt(STATE.lastCfgReadTs, 0)) > 1200) readSettingsFromStorage();

      patchAll();
      rebindVideoListeners();
      collectTick(STATE.video);

      if (!CFG.enabled) {
        if (STATE.rec.active) recoveryCancel('disabled');
        if (STATE.ui.open) uiHide('disabled');
        setPhase(ST.IDLE, 'disabled');
        return;
      }

      updatePhaseByTick();
      maybeHandleFalseEnd('tick_check');
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
        popupOpacity: toInt(CFG.popupOpacity, 85),
        protectNext: !!CFG.protectNext,
        storeTruth: !!CFG.storeTruth,
        truthCommitMs: toInt(CFG.truthCommitMs, 0),
        hangTimeMs: toInt(CFG.hangTimeMs, 0),
        hangBufMs: toInt(CFG.hangBufMs, 0),
        softAttempts: toInt(CFG.softAttempts, 0),
        inplayerAttempts: toInt(CFG.inplayerAttempts, 0),
        inplayerMode: String(CFG.inplayerMode || ''),
        escalateToReopen: !!CFG.escalateToReopen,
        reopenCooldownMs: toInt(CFG.reopenCooldownMs, 0)
      },
      phase: String(STATE.phase || ''),
      phaseReason: String(STATE.phaseReason || ''),
      recoverLock: !!STATE.rec.active,
      userPausedIntent: !!STATE.userPausedIntent,
      rec: {
        step: String(STATE.rec.step || ''),
        softTry: toInt(STATE.rec.softTry, 0),
        inplayerTry: toInt(STATE.rec.inpTry, 0),
        reopenTry: toInt(STATE.rec.reopenTry, 0),
        softMax: toInt(STATE.rec.softMax, 0),
        inplayerMax: toInt(STATE.rec.inpMax, 0),
        lastAction: String(STATE.rec.lastAction || ''),
        lastErr: String(STATE.rec.lastErr || '')
      },
      protect: {
        blockNextUntilTs: toInt(STATE.guard.blockNextUntilTs, 0),
        falseEndCount: toInt(STATE.guard.falseEndCount, 0)
      },
      truth: {
        sec: toNum(STATE.truth.lastGoodSec, 0),
        ts: toInt(STATE.truth.lastGoodTs, 0),
        srcSig: String(STATE.truth.srcSig || '')
      },
      tick: {
        ts: toInt(STATE.tick.ts, 0),
        hasVideo: !!STATE.tick.hasVideo,
        ct: toNum(STATE.tick.ct, NaN),
        dur: toNum(STATE.tick.dur, NaN),
        paused: !!STATE.tick.paused,
        readyState: toInt(STATE.tick.readyState, 0),
        networkState: toInt(STATE.tick.networkState, 0),
        aheadSec: toNum(STATE.tick.aheadSec, 0),
        rangesCount: toInt(STATE.tick.rangesCount, 0)
      },
      events: {
        count: safe(function () { return JSON.parse(JSON.stringify(STATE.events.count)); }, {}),
        last: safe(function () { return JSON.parse(JSON.stringify(STATE.events.last)); }, {})
      },
      logs: safe(function () { return STATE.logs.slice(-DET.logLimit); }, [])
    };
  };

  API.cancel = function (reason) {
    return recoveryCancel(reason || 'api_cancel');
  };

  API.forceRecover = function (reason, prefer) {
    reason = String(reason || 'force_recover');
    if (prefer) {
      if (String(prefer).toLowerCase() === 'inplayer') {
        CFG.softAttempts = 0;
        CFG.inplayerAttempts = Math.max(1, toInt(CFG.inplayerAttempts, 3));
      }
    }
    return startRecovery(reason);
  };

  API.command = function (cmd, payload) {
    cmd = normalizeCommand(cmd);
    if (!cmd) return false;

    handleUserCommand(cmd, payload || null);

    var v = STATE.video || getVideo();
    if (cmd === 'pause') {
      try { if (v && typeof v.pause === 'function') v.pause(); } catch (_) { }
      return true;
    }

    if (cmd === 'play') {
      try {
        if (v && typeof v.play === 'function') {
          var p = v.play();
          if (p && typeof p.catch === 'function') p.catch(function () { });
        }
      } catch (_) { }
      return true;
    }

    if (cmd === 'seek') {
      var sec = 0;
      try { sec = toNum(payload && payload.sec !== undefined ? payload.sec : payload, 0); } catch (_) { sec = 0; }
      try { if (v && isFinite(sec) && sec >= 0) v.currentTime = sec; } catch (_) { }
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
      recoveryCancel('refresh_disabled');
      if (STATE.ui.open) uiHide('refresh_disabled');
    }
    return CFG;
  };

  API.debugOpen = function () { uiShow('api_open'); };
  API.debugClose = function () { uiHide('api_close'); };

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
            if (n === K.enabled || n === K.debugOnOpen || n === K.popupOpacity || n === K.protectNext || n === K.storeTruth || n === K.truthCommitMs || n === K.hangTimeMs || n === K.hangBufMs || n === K.softAttempts || n === K.inplayerAttempts || n === K.inplayerMode || n === K.escalateToReopen || n === K.reopenCooldownMs || n === K.oldEnabled || n === K.oldDebugOnOpen || n === K.oldHangTimeMs || n === K.oldHangBufMs) API.refresh();
          } catch (_) { }
        });
      }
    } catch (_) { }

    try { if (STATE.timer) clearInterval(STATE.timer); } catch (_) { }
    STATE.timer = setInterval(tick, DET.tickMs);

    logLine('OK', 'installed', { tickMs: DET.tickMs });
    return true;
  };

  API.install();
})();
