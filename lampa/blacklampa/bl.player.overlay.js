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
    resumeGuardMs: LS_PREFIX + 'player_overlay_resume_guard_ms',
    falseEndStaleAllow: LS_PREFIX + 'player_overlay_false_end_stale_allow',
    fakeFullEnabled: LS_PREFIX + 'player_overlay_fake_full_enabled',
    fakeFullNoProgMs: LS_PREFIX + 'player_overlay_fake_full_no_prog_ms',
    fakeFullNoMoveMs: LS_PREFIX + 'player_overlay_fake_full_no_move_ms',
    minAheadSec: LS_PREFIX + 'player_overlay_min_ahead_sec',
    underrunNoProgMs: LS_PREFIX + 'player_overlay_underrun_no_prog_ms',
    underrunNoAheadMoveMs: LS_PREFIX + 'player_overlay_underrun_no_ahead_move_ms',
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
    resumeGuardMs: 180000,
    falseEndStaleAllow: true,
    fakeFullEnabled: true,
    fakeFullNoProgMs: 6000,
    fakeFullNoMoveMs: 6000,
    minAheadSec: 0.5,
    underrunNoProgMs: 4000,
    underrunNoAheadMoveMs: 4000,
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
    user: {
      pauseIntent: 0,
      lastCmdTs: 0
    },
    media: {
      paused: false,
      lastPauseTs: 0,
      lastPlayTs: 0
    },
    pendingUserCommand: '',
    pause: {
      lastPauseTs: 0,
      lastResumeTs: 0
    },

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

    buf: {
      lastRangesSig: '',
      lastRangesTs: 0,
      lastAhead: null,
      lastAheadMoveTs: 0,
      lastProgTs: 0,
      lastTimeupdateTs: 0,
      lastBufferedEnd: null,
      lastBufferedEndMoveTs: 0,
      fakeFullTs: 0,
      fakeFullCount: 0,
      underrunTs: 0,
      underrunCount: 0
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

    ev: {
      lastTimeupdateTs: 0,
      lastProgressTs: 0,
      lastPlayingTs: 0,
      lastWaitingTs: 0,
      lastStalledTs: 0,
      lastErrorTs: 0
    },

    ct: {
      lastSec: null,
      lastChangeTs: 0,
      lastSampleTs: 0,
      stuckMs: 0
    },

    monitor: {
      lastCt: NaN,
      lastCtChangeTs: 0,
      lastAheadSec: NaN,
      lastAheadChangeTs: 0,
      lastProgressSignalTs: 0
    },

    hang: {
      active: false,
      reason: '',
      ctStuckMs: 0,
      timeupdateAge: 0,
      progressAge: 0,
      aheadAge: 0,
      waitingAge: 0,
      resumeAge: 0,
      evalTs: 0
    },

    truth: {
      lastGoodSec: 0,
      lastGoodTs: 0,
      lastCommitTs: 0,
      srcSig: '',
      srcRaw: '',
      frozen: false
    },

    resume: {
      ticket: null,
      lastTicket: null,
      unfreezeTimer: null,
      lastSeekSec: NaN,
      lastSeekTs: 0,
      lastSeekOk: 0,
      lastSeekErr: '',
      reopenRequestedSec: NaN,
      reopenRequestedTs: 0,
      reopenAppliedSec: NaN,
      reopenAppliedTs: 0,
      reopenDeltaSec: NaN,
      reopenSeekTs: 0
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
      rangesSig: '',
      rangeStartAtCt: NaN,
      rangeEndAtCt: NaN,
      bufferedEndAtCt: NaN,
      firstRangeStart: NaN,
      firstRangeEnd: NaN,
      totalBufferedSec: 0,
      aheadSec: 0,
      src: '',
      srcSig: ''
    },

    log: {
      rows: [],
      cap: 120
    },

    ui: {
      open: false,
      host: null,
      shadow: null,
      root: null,
      titleEl: null,
      bodyEl: null,
      closeEl: null,
      keyHandler: null
    }
  };

  function safe(fn, fallback) { try { return fn(); } catch (_) { return fallback; } }
  function nowMs() { try { return Date.now(); } catch (_) { return +new Date(); } }
  function now() { return nowMs(); }
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
    if (!ts) return 1000000000000000;
    var a = nowMs() - ts;
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

  function logRowsTail(limit) {
    try {
      var rows = (STATE.log && STATE.log.rows) ? STATE.log.rows : [];
      var n = clampInt(limit || DET.logLimit, 1, 500);
      if (rows.length <= n) return rows.slice(0);
      return rows.slice(rows.length - n);
    } catch (_) {
      return [];
    }
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
      var rows = (STATE.log && STATE.log.rows) ? STATE.log.rows : null;
      if (!rows) return;
      var t = nowMs();
      var last = rows.length ? rows[rows.length - 1] : null;
      if (last && last.msg === line) {
        last.n = toInt(last.n, 1) + 1;
        last.ts = t;
        return;
      }
      rows.push({ msg: line, n: 1, ts: t });
      var cap = clampInt((STATE.log && STATE.log.cap) ? STATE.log.cap : 120, 20, 500);
      if (rows.length > cap) rows.splice(0, rows.length - cap);
    } catch (_) { }
  }

  function logRec(step, idx, max, action, result, err) {
    var f = {
      step: String(step || ''),
      try: String(toInt(idx, 0)) + '/' + String(toInt(max, 0)),
      action: String(action || ''),
      result: String(result || '')
    };
    if (err) f.err = String(err || '');
    logLine('INF', 'REC', f);
  }

  function hangUpdate(active, reason, ages) {
    ages = ages || {};
    STATE.hang.active = !!active;
    STATE.hang.reason = String(reason || '');
    STATE.hang.ctStuckMs = toInt(ages.ctAge, 0);
    STATE.hang.timeupdateAge = toInt(ages.timeupdateAge, 0);
    STATE.hang.progressAge = toInt(ages.progAge, 0);
    STATE.hang.aheadAge = toInt(ages.aheadAge, 0);
    STATE.hang.waitingAge = toInt(ages.waitingAge, 0);
    STATE.hang.resumeAge = toInt(ages.resumeAge, 0);
    STATE.hang.evalTs = now();
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

  function setUserPauseIntent(on, why) {
    var val = on ? 1 : 0;
    STATE.user.pauseIntent = val;
    STATE.user.lastCmdTs = nowMs();
    STATE.userPausedIntent = !!val; // legacy mirror
    if (why) logLine('DBG', 'pause_intent', { on: val, why: String(why || '') });
  }

  function isUserPauseIntent() {
    return !!(STATE.user && toInt(STATE.user.pauseIntent, 0));
  }

  function isPlayingLike(tick) {
    tick = tick || STATE.tick;
    if (!tick || !tick.hasVideo) return false;
    if (isUserPauseIntent()) return false;
    return !tick.paused;
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
    CFG.resumeGuardMs = clampInt(sGet(K.resumeGuardMs, '180000'), 30000, 600000);
    CFG.falseEndStaleAllow = parseBool(sGet(K.falseEndStaleAllow, '1'), true);
    CFG.fakeFullEnabled = parseBool(sGet(K.fakeFullEnabled, '1'), true);
    CFG.fakeFullNoProgMs = clampInt(sGet(K.fakeFullNoProgMs, '6000'), 1000, 30000);
    CFG.fakeFullNoMoveMs = clampInt(sGet(K.fakeFullNoMoveMs, '6000'), 1000, 30000);
    CFG.minAheadSec = Math.max(0, Math.min(3, toNum(sGet(K.minAheadSec, '0.5'), 0.5)));
    CFG.underrunNoProgMs = clampInt(sGet(K.underrunNoProgMs, '4000'), 1000, 30000);
    CFG.underrunNoAheadMoveMs = clampInt(sGet(K.underrunNoAheadMoveMs, '4000'), 1000, 30000);

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
    var t = nowMs();
    try {
      if (!Object.prototype.hasOwnProperty.call(STATE.events.count, name)) STATE.events.count[name] = 0;
      STATE.events.count[name] = toInt(STATE.events.count[name], 0) + 1;
      STATE.events.last[name] = t;
    } catch (_) { }

    if (name === 'progress' || name === 'timeupdate' || name === 'play' || name === 'playing') {
      STATE.monitor.lastProgressSignalTs = t;
    }

    if (name === 'timeupdate') STATE.ev.lastTimeupdateTs = t;
    else if (name === 'progress') STATE.ev.lastProgressTs = t;
    else if (name === 'play' || name === 'playing') STATE.ev.lastPlayingTs = t;
    else if (name === 'waiting') STATE.ev.lastWaitingTs = t;
    else if (name === 'stalled') STATE.ev.lastStalledTs = t;
    else if (name === 'error') STATE.ev.lastErrorTs = t;

    if (name === 'progress') STATE.buf.lastProgTs = t;
    if (name === 'timeupdate') STATE.buf.lastTimeupdateTs = t;
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

  function truthFreeze(on, why) {
    if (on) {
      STATE.truth.frozen = true;
      logLine('DBG', 'truth_frozen', { why: String(why || '') });
      return;
    }
    STATE.truth.frozen = false;
    logLine('DBG', 'truth_unfrozen', { why: String(why || '') });
  }

  function clearResumeUnfreezeTimer() {
    try {
      if (STATE.resume.unfreezeTimer) clearTimeout(STATE.resume.unfreezeTimer);
    } catch (_) { }
    STATE.resume.unfreezeTimer = null;
  }

  function resumeFinalizeDelayed(delayMs, why) {
    clearResumeUnfreezeTimer();
    delayMs = clampInt(delayMs, 0, 10000);
    STATE.resume.unfreezeTimer = setTimeout(function () {
      STATE.resume.unfreezeTimer = null;
      truthFreeze(false, 'resume_final:' + String(why || ''));
      STATE.resume.ticket = null;
      if (STATE.resume.reopenAppliedTs && ageMs(STATE.resume.reopenAppliedTs) > 1200) {
        STATE.resume.reopenRequestedSec = NaN;
        STATE.resume.reopenRequestedTs = 0;
        STATE.resume.reopenSeekTs = 0;
      }
    }, delayMs);
  }

  function isValidTruthFrame(video, ct, dur) {
    if (!isFinite(ct) || ct < 0) return false;
    if (!isFinite(dur) || dur <= 5) return false;
    if (ct > dur - 0.25) return false;
    if (STATE.rec.active || STATE.truth.frozen) return false;
    try {
      if (video && video.paused && !isUserPauseIntent()) return false;
    } catch (_) { }
    return true;
  }

  function truthCommit(reason) {
    if (!CFG.storeTruth) return;
    if (STATE.truth.frozen || STATE.rec.active) return;
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
    if (STATE.rec.active || STATE.truth.frozen) return;

    var ct = toNum(video.currentTime, NaN);
    var dur = toNum(video.duration, NaN);
    if (!isValidTruthFrame(video, ct, dur)) return;

    var prev = toNum(STATE.truth.lastGoodSec, NaN);
    var sig = srcSig(getCurrentSrc(video));
    if (STATE.truth.srcSig && sig && sig !== STATE.truth.srcSig) {
      // New stream source: reset anchor for new src when not in recovery.
      STATE.truth.lastGoodSec = 0;
      STATE.truth.lastGoodTs = 0;
      STATE.truth.lastCommitTs = 0;
      STATE.truth.srcSig = sig;
      STATE.truth.srcRaw = getCurrentSrc(video);
      prev = NaN;
    }
    if (isFinite(prev)) {
      var d = ct - prev;
      if (d < -1.2) return;
      if (d > DET.truthSmoothMaxStepSec) return;
      if (d < 0.02) return;
    }

    STATE.truth.lastGoodSec = ct;
    STATE.truth.lastGoodTs = nowMs();
    STATE.truth.srcRaw = getCurrentSrc(video);
    STATE.truth.srcSig = sig || srcSig(STATE.truth.srcRaw);

    if (!STATE.truth.lastCommitTs || (nowMs() - toInt(STATE.truth.lastCommitTs, 0)) >= CFG.truthCommitMs) {
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
    on('play', function () {
      bumpEvent('play');
      STATE.pause.lastResumeTs = now();
      STATE.media.paused = false;
      STATE.media.lastPlayTs = nowMs();
      if (!STATE.rec.active && isUserPauseIntent()) setUserPauseIntent(false, 'media_play');
    });
    on('playing', function () {
      bumpEvent('playing');
      STATE.pause.lastResumeTs = now();
      STATE.media.paused = false;
      STATE.media.lastPlayTs = nowMs();
      if (!STATE.rec.active && isUserPauseIntent()) setUserPauseIntent(false, 'media_playing');
    });
    on('pause', function () {
      bumpEvent('pause');
      STATE.pause.lastPauseTs = now();
      STATE.media.paused = true;
      STATE.media.lastPauseTs = nowMs();
      if (STATE.rec.active) return;
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
      rangesSig: '',
      rangeStartAtCt: NaN,
      rangeEndAtCt: NaN,
      bufferedEndAtCt: NaN,
      firstRangeStart: NaN,
      firstRangeEnd: NaN,
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
      var sigParts = [];
      var activeStart = NaN;
      var activeEnd = NaN;
      var nearestFutureStart = NaN;
      var nearestFutureEnd = NaN;
      var firstStart = NaN;
      var firstEnd = NaN;

      for (var i = 0; i < b.length; i++) {
        var s = toNum(b.start(i), NaN);
        var e = toNum(b.end(i), NaN);
        if (!isFinite(s) || !isFinite(e) || e < s) continue;
        cnt++;
        if (!isFinite(firstStart)) {
          firstStart = s;
          firstEnd = e;
        }
        total += Math.max(0, e - s);
        if (!isFinite(maxEnd) || e > maxEnd) maxEnd = e;
        parts.push('[' + s.toFixed(1) + '-' + e.toFixed(1) + ']');
        sigParts.push(String(Math.round(s * 10) / 10) + '-' + String(Math.round(e * 10) / 10));

        if (cur >= s && cur <= e) {
          activeStart = s;
          activeEnd = e;
        } else if (s > cur && (!isFinite(nearestFutureStart) || s < nearestFutureStart)) {
          nearestFutureStart = s;
          nearestFutureEnd = e;
        }
      }

      var bufferedEnd = NaN;
      var rangeStart = NaN;
      var rangeEnd = NaN;
      if (isFinite(activeEnd)) {
        bufferedEnd = activeEnd;
        rangeStart = activeStart;
        rangeEnd = activeEnd;
      } else if (isFinite(nearestFutureEnd)) {
        bufferedEnd = nearestFutureEnd;
        rangeStart = nearestFutureStart;
        rangeEnd = nearestFutureEnd;
      } else if (isFinite(maxEnd)) {
        bufferedEnd = maxEnd;
      }

      var ahead = 0;
      if (isFinite(bufferedEnd)) ahead = Math.max(0, bufferedEnd - Math.max(0, cur));

      out.rangesCount = cnt;
      out.rangesText = parts.join(' ');
      out.rangesSig = String(cnt) + '|' + sigParts.join('|');
      out.rangeStartAtCt = rangeStart;
      out.rangeEndAtCt = rangeEnd;
      out.bufferedEndAtCt = bufferedEnd;
      out.firstRangeStart = firstStart;
      out.firstRangeEnd = firstEnd;
      out.totalBufferedSec = total;
      out.aheadSec = ahead;
      return out;
    } catch (_) {
      return out;
    }
  }

  function collectTick(video) {
    var ts = nowMs();
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
      rangesSig: '',
      rangeStartAtCt: NaN,
      rangeEndAtCt: NaN,
      bufferedEndAtCt: NaN,
      firstRangeStart: NaN,
      firstRangeEnd: NaN,
      totalBufferedSec: 0,
      aheadSec: 0,
      src: '',
      srcSig: ''
    };

    if (video) {
      s.ct = toNum(video.currentTime, NaN);
      s.dur = toNum(video.duration, NaN);
      s.paused = !!video.paused;
      STATE.media.paused = !!s.paused;
      s.readyState = toInt(video.readyState, 0);
      s.networkState = toInt(video.networkState, 0);
      s.src = getCurrentSrc(video);
      s.srcSig = srcSig(s.src);

      var b = fmtBuffered(video);
      s.rangesCount = toInt(b.rangesCount, 0);
      s.rangesText = String(b.rangesText || '');
      s.rangesSig = String(b.rangesSig || '');
      s.rangeStartAtCt = toNum(b.rangeStartAtCt, NaN);
      s.rangeEndAtCt = toNum(b.rangeEndAtCt, NaN);
      s.bufferedEndAtCt = toNum(b.bufferedEndAtCt, NaN);
      s.firstRangeStart = toNum(b.firstRangeStart, NaN);
      s.firstRangeEnd = toNum(b.firstRangeEnd, NaN);
      s.totalBufferedSec = toNum(b.totalBufferedSec, 0);
      s.aheadSec = toNum(b.aheadSec, 0);

      if (!isFinite(STATE.monitor.lastCt)) {
        STATE.monitor.lastCt = s.ct;
        STATE.monitor.lastCtChangeTs = ts;
      } else if (isFinite(s.ct) && Math.abs(s.ct - STATE.monitor.lastCt) >= DET.ctEpsSec) {
        STATE.monitor.lastCt = s.ct;
        STATE.monitor.lastCtChangeTs = ts;
      }

      if (STATE.ct.lastSec === null || !isFinite(toNum(STATE.ct.lastSec, NaN))) {
        STATE.ct.lastSec = isFinite(s.ct) ? s.ct : 0;
        STATE.ct.lastChangeTs = ts;
        STATE.ct.lastSampleTs = ts;
        STATE.ct.stuckMs = 0;
      } else if (isFinite(s.ct) && Math.abs(s.ct - toNum(STATE.ct.lastSec, 0)) >= 0.15) {
        STATE.ct.lastSec = s.ct;
        STATE.ct.lastChangeTs = ts;
        STATE.ct.lastSampleTs = ts;
        STATE.ct.stuckMs = 0;
      } else {
        STATE.ct.lastSampleTs = ts;
        STATE.ct.stuckMs = Math.max(0, ts - toInt(STATE.ct.lastChangeTs, ts));
      }

      if (!isFinite(STATE.monitor.lastAheadSec)) {
        STATE.monitor.lastAheadSec = s.aheadSec;
        STATE.monitor.lastAheadChangeTs = ts;
      } else if (Math.abs(s.aheadSec - STATE.monitor.lastAheadSec) >= DET.aheadEpsSec) {
        STATE.monitor.lastAheadSec = s.aheadSec;
        STATE.monitor.lastAheadChangeTs = ts;
      }

      if (!STATE.buf.lastRangesSig) {
        STATE.buf.lastRangesSig = s.rangesSig;
        STATE.buf.lastRangesTs = ts;
      } else if (s.rangesSig !== STATE.buf.lastRangesSig) {
        STATE.buf.lastRangesSig = s.rangesSig;
        STATE.buf.lastRangesTs = ts;
      }

      if (STATE.buf.lastAhead === null || !isFinite(toNum(STATE.buf.lastAhead, NaN))) {
        STATE.buf.lastAhead = s.aheadSec;
        STATE.buf.lastAheadMoveTs = ts;
      } else if (Math.abs(toNum(s.aheadSec, 0) - toNum(STATE.buf.lastAhead, 0)) >= 0.25) {
        STATE.buf.lastAhead = s.aheadSec;
        STATE.buf.lastAheadMoveTs = ts;
      }

      if (STATE.buf.lastBufferedEnd === null || !isFinite(toNum(STATE.buf.lastBufferedEnd, NaN))) {
        STATE.buf.lastBufferedEnd = isFinite(toNum(s.bufferedEndAtCt, NaN)) ? s.bufferedEndAtCt : NaN;
        STATE.buf.lastBufferedEndMoveTs = ts;
      } else if (isFinite(toNum(s.bufferedEndAtCt, NaN)) && Math.abs(toNum(s.bufferedEndAtCt, 0) - toNum(STATE.buf.lastBufferedEnd, 0)) >= 0.25) {
        STATE.buf.lastBufferedEnd = s.bufferedEndAtCt;
        STATE.buf.lastBufferedEndMoveTs = ts;
      }

      if (CFG.storeTruth) truthUpdate(video, 'tick');
    }

    STATE.tick = s;
    return s;
  }

  function cleanupLegacyUi() {
    try {
      if (!document) return;
      var oldRoot = document.getElementById('__bl_player_overlay_popup_v2');
      if (oldRoot && oldRoot.parentNode) oldRoot.parentNode.removeChild(oldRoot);
    } catch (_) { }
    try {
      if (!document) return;
      var hosts = document.getElementsByClassName('bl-overlay-host');
      while (hosts && hosts.length) {
        var h = hosts[0];
        if (!h || !h.parentNode) break;
        h.parentNode.removeChild(h);
      }
    } catch (_) { }
    try {
      if (!document) return;
      var oldStyle = document.getElementById('__bl_player_overlay_style_v2');
      if (oldStyle && oldStyle.parentNode) oldStyle.parentNode.removeChild(oldStyle);
    } catch (_) { }
  }

  function ensureUiRoot() {
    if (STATE.ui.root) return STATE.ui.root;

    cleanupLegacyUi();

    var host = null;
    var shadow = null;
    var root = null;
    try {
      if (!document) return null;
      host = document.createElement('div');
      host.className = 'bl-overlay-host';
      shadow = host.attachShadow ? host.attachShadow({ mode: 'open' }) : null;
      if (!shadow) return null;

      var st = document.createElement('style');
      st.textContent = ''
        + ':host, .ov-root, .ov-root *{box-sizing:border-box;}'
        + '.ov-root{all:initial;font:' + POPUP_FONT + ';position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);'
        + 'max-width:80vw;max-height:75vh;overflow:hidden;border-radius:10px;background:rgba(0,0,0,0.92);color:#eaeaea;display:flex;flex-direction:column;'
        + 'z-index:2147483647;min-width:360px;box-shadow:0 10px 28px rgba(0,0,0,0.6);border:1px solid #b7bec7;pointer-events:auto;}'
        + '.ov-hidden{display:none;}'
        + '.ov-header{display:flex;align-items:center;justify-content:space-between;padding:10px 12px 8px 12px;border-bottom:1px solid rgba(255,255,255,0.15);}'
        + '.ov-title{all:unset;font:700 14px/1.35 system-ui,-apple-system,\"Segoe UI\",Roboto,Arial,sans-serif;color:#eaeaea;}'
        + '.ov-close{all:unset;cursor:pointer;font:700 18px/1 system-ui,-apple-system,\"Segoe UI\",Roboto,Arial,sans-serif;color:#cfd8dc;padding:2px 6px;border-radius:6px;}'
        + '.ov-close:hover{background:rgba(255,255,255,0.12);color:#ffffff;}'
        + '.ov-body{overflow:auto;padding:10px;flex:1;white-space:pre-wrap;word-break:break-word;margin:0;font:' + POPUP_FONT + ';color:#eaeaea;}'
        + '.ov-footer{padding:6px 10px;border-top:1px solid rgba(255,255,255,0.12);font:500 11px/1.3 system-ui,-apple-system,\"Segoe UI\",Roboto,Arial,sans-serif;color:#90a4ae;}'
        + '.state-playing{border-color:#4caf50;}'
        + '.state-buffering{border-color:#ffb300;}'
        + '.state-hung{border-color:#ff5252;}'
        + '.state-recovering{border-color:#ff9800;}'
        + '.state-failed{border-color:#f44336;}';
      shadow.appendChild(st);

      root = document.createElement('div');
      root.className = 'ov-root ov-hidden';

      var header = document.createElement('div');
      header.className = 'ov-header';

      var title = document.createElement('div');
      title.className = 'ov-title';
      title.textContent = 'BL Player Overlay DEBUG';

      var close = document.createElement('button');
      close.className = 'ov-close';
      close.type = 'button';
      close.textContent = '×';
      close.onclick = function () { try { uiHide('btn_close'); } catch (_) { } };

      var body = document.createElement('pre');
      body.className = 'ov-body';

      var footer = document.createElement('div');
      footer.className = 'ov-footer';
      footer.textContent = 'Back/Esc or × to close';

      header.appendChild(title);
      header.appendChild(close);
      root.appendChild(header);
      root.appendChild(body);
      root.appendChild(footer);
      shadow.appendChild(root);

      (document.body || document.documentElement).appendChild(host);

      STATE.ui.host = host;
      STATE.ui.shadow = shadow;
      STATE.ui.root = root;
      STATE.ui.titleEl = title;
      STATE.ui.bodyEl = body;
      STATE.ui.closeEl = close;
    } catch (_) {
      root = null;
    }

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

  function uiStateClass(phase) {
    phase = String(phase || '');
    if (phase === ST.PLAYING) return 'state-playing';
    if (phase === ST.BUFFERING || phase === ST.STALLED) return 'state-buffering';
    if (phase === ST.HUNG) return 'state-hung';
    if (phase === ST.RECOVERING_SOFT || phase === ST.RECOVERING_INPLAYER || phase === ST.RECOVERING_REOPEN) return 'state-recovering';
    if (phase === ST.FAILED) return 'state-failed';
    return '';
  }

  function uiDestroy(reason) {
    uiRemoveKeyHandler();
    try { if (STATE.ui.closeEl) STATE.ui.closeEl.onclick = null; } catch (_) { }
    try {
      if (STATE.ui.host && STATE.ui.host.parentNode) STATE.ui.host.parentNode.removeChild(STATE.ui.host);
    } catch (_) { }
    STATE.ui.open = false;
    STATE.ui.root = null;
    STATE.ui.host = null;
    STATE.ui.shadow = null;
    STATE.ui.titleEl = null;
    STATE.ui.bodyEl = null;
    STATE.ui.closeEl = null;
    if (reason) logLine('DBG', 'debug_destroy', { reason: String(reason || '') });
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
      + ' pauseIntent=' + (isUserPauseIntent() ? '1' : '0')
      + ' mediaPaused=' + (t.paused ? '1' : '0'));

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

    var ba = bufferAges();
    var fakeFullFlag = 0;
    try {
      var dur0 = toNum(t.dur, NaN);
      if (CFG.fakeFullEnabled && isFinite(dur0) && dur0 > 60 && toInt(t.rangesCount, 0) === 1 && toNum(t.firstRangeStart, NaN) <= 0.5 && toNum(t.firstRangeEnd, NaN) >= dur0 - 0.5 && ba.progAge >= toInt(CFG.fakeFullNoProgMs, 6000) && ba.bufEndMoveAge >= toInt(CFG.fakeFullNoMoveMs, 6000)) fakeFullFlag = 1;
    } catch (_) { fakeFullFlag = 0; }
    var underrunFlag = 0;
    try {
      if (isPlayingLike(t) && toNum(t.aheadSec, 0) <= toNum(CFG.minAheadSec, 0.5) && ba.progAge >= toInt(CFG.underrunNoProgMs, 4000) && ba.aheadMoveAge >= toInt(CFG.underrunNoAheadMoveMs, 4000)) underrunFlag = 1;
    } catch (_) { underrunFlag = 0; }
    lines.push('BUFFER: rangesCount=' + String(toInt(t.rangesCount, 0))
      + ' sigAgeMs=' + String(toInt(ba.sigAge, 0))
      + ' curRange=' + (isFinite(toNum(t.rangeStartAtCt, NaN)) ? toNum(t.rangeStartAtCt, 0).toFixed(2) : '') + '-' + (isFinite(toNum(t.rangeEndAtCt, NaN)) ? toNum(t.rangeEndAtCt, 0).toFixed(2) : '')
      + ' bufEndAtCt=' + (isFinite(toNum(t.bufferedEndAtCt, NaN)) ? toNum(t.bufferedEndAtCt, 0).toFixed(2) : '')
      + ' aheadSec=' + toNum(t.aheadSec, 0).toFixed(2));
    lines.push('BUFFER ages: progAge=' + String(toInt(ba.progAge, 0))
      + ' aheadMoveAge=' + String(toInt(ba.aheadMoveAge, 0))
      + ' bufEndMoveAge=' + String(toInt(ba.bufEndMoveAge, 0)));
    lines.push('BUFFER flags: fakeFull=' + String(fakeFullFlag)
      + ' fakeFullAge=' + String(ageMs(STATE.buf.fakeFullTs))
      + ' fakeFullCount=' + String(toInt(STATE.buf.fakeFullCount, 0))
      + ' underrun=' + String(underrunFlag)
      + ' underrunAge=' + String(ageMs(STATE.buf.underrunTs))
      + ' underrunCount=' + String(toInt(STATE.buf.underrunCount, 0)));

    lines.push('events: waiting=' + toInt(STATE.events.count.waiting, 0)
      + ' stalled=' + toInt(STATE.events.count.stalled, 0)
      + ' error=' + toInt(STATE.events.count.error, 0)
      + ' progress=' + toInt(STATE.events.count.progress, 0)
      + ' timeupdate=' + toInt(STATE.events.count.timeupdate, 0));

    var ra = runtimeAges();
    lines.push('ctStuckMs=' + String(toInt(STATE.ct.stuckMs, 0))
      + ' timeupdateAge=' + String(toInt(ra.timeupdateAge, 0))
      + ' progressAge=' + String(toInt(ra.progAge, 0))
      + ' aheadAge=' + String(toInt(ra.aheadAge, 0)));
    lines.push('hung=' + (STATE.hang && STATE.hang.active ? '1' : '0')
      + ' hungReason=' + String(STATE.hang && STATE.hang.reason ? STATE.hang.reason : '')
      + ' rec.active=' + (STATE.rec.active ? '1' : '0')
      + ' rec.step=' + String(STATE.rec.step || '')
      + ' rec.try=' + String(toInt(STATE.rec.softTry, 0)) + '/' + String(toInt(STATE.rec.softMax, 0))
      + '|' + String(toInt(STATE.rec.inpTry, 0)) + '/' + String(toInt(STATE.rec.inpMax, 0))
      + ' lastAction=' + String(STATE.rec.lastAction || '')
      + ' lastErr=' + String(STATE.rec.lastErr || ''));

    var strictFalseEnd = isFalseEnd(toNum(t.ct, NaN), toNum(t.dur, NaN));
    var looseFalseEnd = isFalseEndLooser(toNum(t.ct, NaN), toNum(t.dur, NaN), ra);
    lines.push('resumeAgeMs=' + String(toInt(ra.resumeAge, 0))
      + ' resumeGuardMs=' + String(toInt(CFG.resumeGuardMs, 0))
      + ' staleAllow=' + (CFG.falseEndStaleAllow ? '1' : '0')
      + ' falseEnd(strict)=' + (strictFalseEnd ? '1' : '0')
      + ' falseEnd(loose)=' + (looseFalseEnd ? '1' : '0'));

    var blockUntil = toInt(STATE.guard.blockNextUntilTs, 0);
    var blockLeft = Math.max(0, blockUntil - now());
    lines.push('protect_next=' + (CFG.protectNext ? 'ON' : 'OFF')
      + ' blockNextUntilTs=' + String(blockUntil)
      + ' blockLeftMs=' + String(toInt(blockLeft, 0))
      + ' falseEndCount=' + String(toInt(STATE.guard.falseEndCount, 0))
      + ' lastFalseEndTs=' + String(toInt(STATE.guard.lastFalseEndTs, 0)));

    var ticket = STATE.resume.ticket || STATE.resume.lastTicket || null;
    lines.push('resumeTicket: sec=' + (ticket && isFinite(toNum(ticket.sec, NaN)) ? toNum(ticket.sec, 0).toFixed(2) : '')
      + ' srcSig=' + String(ticket && ticket.srcSig ? ticket.srcSig : '')
      + ' age=' + String(resumeTicketAgeMs())
      + ' frozen=' + (STATE.truth.frozen ? '1' : '0'));
    lines.push('lastSeek: sec=' + (isFinite(toNum(STATE.resume.lastSeekSec, NaN)) ? toNum(STATE.resume.lastSeekSec, 0).toFixed(2) : '')
      + ' ts=' + String(toInt(STATE.resume.lastSeekTs, 0))
      + ' ok=' + String(toInt(STATE.resume.lastSeekOk, 0))
      + ' err=' + String(STATE.resume.lastSeekErr || ''));
    lines.push('reopenAt: requestedSec=' + (isFinite(toNum(STATE.resume.reopenRequestedSec, NaN)) ? toNum(STATE.resume.reopenRequestedSec, 0).toFixed(2) : '')
      + ' applied=' + (isFinite(toNum(STATE.resume.reopenAppliedSec, NaN)) ? toNum(STATE.resume.reopenAppliedSec, 0).toFixed(2) : '')
      + ' delta=' + (isFinite(toNum(STATE.resume.reopenDeltaSec, NaN)) ? toNum(STATE.resume.reopenDeltaSec, 0).toFixed(2) : ''));

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
      var tail = logRowsTail(DET.logLimit);
      for (var i = 0; i < tail.length; i++) {
        var row = tail[i] || {};
        var msg = String(row.msg || '');
        var n = toInt(row.n, 1);
        lines.push(n > 1 ? ('×' + String(n) + ' ' + msg) : msg);
      }
    } catch (_) { }

    return lines.join('\n');
  }

  function uiRender(reason) {
    var root = ensureUiRoot();
    if (!root) return;

    try {
      root.classList.remove('ov-hidden');
      root.style.opacity = String(popupOpacity());
      root.style.font = POPUP_FONT;

      if (STATE.ui.titleEl) {
        STATE.ui.titleEl.textContent = 'BL Player Overlay DEBUG';
        STATE.ui.titleEl.style.color = phaseColor(STATE.phase);
      }

      root.classList.remove('state-playing');
      root.classList.remove('state-buffering');
      root.classList.remove('state-hung');
      root.classList.remove('state-recovering');
      root.classList.remove('state-failed');
      var stClass = uiStateClass(STATE.phase);
      if (stClass) root.classList.add(stClass);

      root.style.border = '1px solid ' + phaseColor(STATE.phase);
      if (STATE.ui.bodyEl) STATE.ui.bodyEl.textContent = buildDebugText();

      STATE.ui.open = true;
    } catch (_) { }

    if (reason && String(reason || '') !== 'tick') logLine('DBG', 'debug_render', { reason: String(reason || '') });
  }

  function uiShow(reason) {
    uiInstallKeyHandler();
    uiRender(reason || 'show');
  }

  function uiHide(reason) {
    try { if (STATE.ui.root) STATE.ui.root.classList.add('ov-hidden'); } catch (_) { }
    uiDestroy('hide:' + String(reason || ''));
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

  function isLikelyUserCmdType(type) {
    var t = String(type || '').toLowerCase();
    if (!t) return false;
    if (t === 'pause' || t === 'play' || t === 'toggle' || t === 'toggle_pause' || t === 'toggle_play') return true;
    if (t === 'seek' || t === 'forward' || t === 'backward' || t === 'rewind' || t === 'to' || t === 'totime' || t === 'to_time') return true;
    if (t === 'exit' || t === 'back' || t === 'return' || t === 'close' || t === 'stop') return true;
    return false;
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
    if (t === 'select' || t === 'next' || t === 'to_end' || t === 'ended') return true;
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

  function resumeTicketAgeMs() {
    var ticket = STATE.resume.ticket || STATE.resume.lastTicket || null;
    if (!ticket) return 0;
    return ageMs(toInt(ticket.createdTs, 0));
  }

  function resumeSecFromTicketOrTruth(preferTicket) {
    if (preferTicket !== false) {
      var ticket = STATE.resume.ticket || null;
      if (ticket && isFinite(toNum(ticket.sec, NaN)) && toNum(ticket.sec, NaN) >= 0) return Math.max(0, toNum(ticket.sec, 0));
    }

    var sig = '';
    try { sig = String(STATE.tick && STATE.tick.srcSig ? STATE.tick.srcSig : ''); } catch (_) { sig = ''; }
    if (!sig) {
      try { sig = srcSig(getCurrentSrc(STATE.video || getVideo())); } catch (_) { sig = ''; }
    }

    var tr = toNum(STATE.truth.lastGoodSec, NaN);
    if (isFinite(tr) && tr >= 0) {
      var trSig = '';
      try { trSig = String(STATE.truth.srcSig || ''); } catch (_) { trSig = ''; }
      if (!sig || !trSig || sig === trSig) return Math.max(0, tr);
    }

    var cur = toNum(STATE.tick.ct, NaN);
    var dur = toNum(STATE.tick.dur, NaN);
    if (isFinite(cur) && cur >= 0 && isFinite(dur) && dur > 5) return Math.max(0, cur - 1.0);
    return Math.max(0, truthTarget());
  }

  function makeResumeTicket(reason, kind) {
    reason = String(reason || 'recover');
    kind = String(kind || 'overlay');

    var v = STATE.video || getVideo();
    var sig = '';
    try { sig = String(STATE.tick && STATE.tick.srcSig ? STATE.tick.srcSig : ''); } catch (_) { sig = ''; }
    if (!sig) {
      try { sig = srcSig(getCurrentSrc(v)); } catch (_) { sig = ''; }
    }

    var sec = resumeSecFromTicketOrTruth(false);
    var dur = toNum(v ? v.duration : NaN, NaN);
    if (isFinite(dur) && dur > 0) sec = Math.min(Math.max(0, sec), Math.max(0, dur - 0.5));
    sec = Math.max(0, toNum(sec, 0));

    STATE.resume.ticket = {
      sec: sec,
      srcSig: String(sig || ''),
      createdTs: nowMs(),
      reason: reason,
      kind: kind
    };
    STATE.resume.lastTicket = {
      sec: sec,
      srcSig: String(sig || ''),
      createdTs: nowMs(),
      reason: reason,
      kind: kind
    };

    logLine('INF', 'TICKET create', {
      sec: sec.toFixed(2),
      srcSig: String(sig || ''),
      reason: reason,
      kind: kind
    });

    return STATE.resume.ticket;
  }

  function seekAfterReady(video, sec, why, cb) {
    if (!video) {
      if (cb) cb(false, 'no_video');
      return;
    }

    var done = false;
    var timer = null;
    var handlers = {};
    sec = Math.max(0, toNum(sec, 0));

    function cleanup() {
      try { if (timer) clearTimeout(timer); } catch (_) { }
      timer = null;
      var keys = ['loadedmetadata', 'canplay', 'loadeddata'];
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        var h = handlers[k];
        if (!h) continue;
        try { video.removeEventListener(k, h, true); } catch (_) { }
        try { video.removeEventListener(k, h); } catch (_) { }
      }
      handlers = {};
    }

    function apply(trigger) {
      if (done) return;
      done = true;
      cleanup();

      var ok = true;
      var err = '';
      var target = sec;
      try {
        var dur = toNum(video.duration, NaN);
        if (isFinite(dur) && dur > 0) target = Math.min(Math.max(0, sec), Math.max(0, dur - 0.5));
        video.currentTime = target;
      } catch (e) {
        ok = false;
        err = e && e.message ? String(e.message) : 'seek_error';
      }

      if (ok && !isUserPauseIntent()) {
        try {
          if (typeof video.play === 'function') {
            var p = video.play();
            if (p && typeof p.catch === 'function') p.catch(function () { });
          }
        } catch (_) { }
      }

      STATE.resume.lastSeekSec = target;
      STATE.resume.lastSeekTs = nowMs();
      STATE.resume.lastSeekOk = ok ? 1 : 0;
      STATE.resume.lastSeekErr = err;

      logLine(ok ? 'INF' : 'WRN', ok ? 'INPLAYER seek' : 'INPLAYER seek_failed', {
        sec: toNum(target, 0).toFixed(2),
        why: String(why || ''),
        trig: String(trigger || ''),
        err: err
      });

      if (cb) cb(ok, err);
    }

    function on(evt) {
      return function () { apply(String(evt || 'evt')); };
    }

    handlers.loadedmetadata = on('loadedmetadata');
    handlers.canplay = on('canplay');
    handlers.loadeddata = on('loadeddata');

    try { video.addEventListener('loadedmetadata', handlers.loadedmetadata, true); } catch (_) { try { video.addEventListener('loadedmetadata', handlers.loadedmetadata); } catch (__e) { } }
    try { video.addEventListener('canplay', handlers.canplay, true); } catch (_) { try { video.addEventListener('canplay', handlers.canplay); } catch (__e) { } }
    try { video.addEventListener('loadeddata', handlers.loadeddata, true); } catch (_) { try { video.addEventListener('loadeddata', handlers.loadeddata); } catch (__e) { } }

    timer = setTimeout(function () { apply('timeout'); }, 2600);

    try {
      var rs = toInt(video.readyState, 0);
      if (rs >= 1) setTimeout(function () { apply('ready'); }, 0);
    } catch (_) { }
  }

  function applyTruthSeekAndPlay(tag) {
    var v = STATE.video || getVideo();
    if (!v) return false;

    var target = Math.max(0, toNum(resumeSecFromTicketOrTruth(), 0));
    try { v.currentTime = target; } catch (_) { }

    if (!isUserPauseIntent()) {
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

    var target = resumeSecFromTicketOrTruth();
    if (idx <= 1) {
      try { v.currentTime = Math.max(0, target); } catch (_) { }
      if (!isUserPauseIntent()) {
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
      if (!isUserPauseIntent()) {
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
    var criticalTag = (/fake_full|underrun|buffer/i.test(String(STATE.rec.reason || ''))) ? 'bufguard' : 'overlay_recover';

    beginCritical(criticalTag, 2500);

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

    if (ok) {
      var resumeSec = resumeSecFromTicketOrTruth();
      logLine('INF', 'INPLAYER set src ok', { mode: mode, seek: toNum(resumeSec, 0).toFixed(2) });
      seekAfterReady(v, resumeSec, 'inplayer_resume', function (seekOk, seekErr) {
        if (!seekOk) {
          setTimeout(function () {
            try { seekAfterReady(STATE.video || getVideo(), resumeSec, 'inplayer_resume_retry', function () { }); } catch (_) { }
          }, 450);
          if (seekErr) STATE.rec.lastErr = String(seekErr || '');
        }
      });
    }

    setTimeout(function () {
      try { endCritical(criticalTag); } catch (_) { }
    }, 1200);

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
    if (!pg || (typeof pg.reopenAt !== 'function' && typeof pg.reopenFromPosition !== 'function' && typeof pg.requestRecover !== 'function')) {
      STATE.rec.lastErr = 'pg_request_missing';
      return false;
    }

    STATE.rec.lastReopenTs = t;
    var sec = Math.max(0, toNum(resumeSecFromTicketOrTruth(), 0));
    STATE.resume.reopenRequestedSec = sec;
    STATE.resume.reopenRequestedTs = nowMs();
    STATE.resume.reopenAppliedSec = NaN;
    STATE.resume.reopenAppliedTs = 0;
    STATE.resume.reopenDeltaSec = NaN;
    STATE.resume.reopenSeekTs = 0;
    logLine('INF', 'REOPEN requested', { sec: sec.toFixed(2), age: resumeTicketAgeMs() });

    beginCritical('overlay_recover', 2500);
    var r = null;
    try {
      if (typeof pg.reopenAt === 'function') r = pg.reopenAt(sec, 'overlay_reopen', { srcSig: String(STATE.tick && STATE.tick.srcSig ? STATE.tick.srcSig : ''), ticketTs: toInt(STATE.resume.reopenRequestedTs, 0) });
      else if (typeof pg.reopenFromPosition === 'function') r = { started: !!pg.reopenFromPosition('overlay_reopen', sec, { manual: true, overlay: true }) };
      else r = pg.requestRecover('overlay_reopen', { prefer: 'reopen' });
    } catch (_) { r = null; }

    STATE.rec.lastAction = 'reopen_via_pg:' + sec.toFixed(2);

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
      resumeFinalizeDelayed(1500, 'success');
    } else {
      setPhase(ST.FAILED, String(why || 'failed'));
      logLine('ERR', 'recover_failed', { why: String(why || ''), lastErr: String(STATE.rec.lastErr || '') });
      resumeFinalizeDelayed(2200, 'fail');
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
      if (isUserPauseIntent()) setPhase(ST.PAUSED_BY_USER, String(reason || 'cancel'));
      else setPhase(ST.PLAYING, String(reason || 'cancel'));
    } else setPhase(ST.IDLE, String(reason || 'cancel'));

    if (was) logLine('WRN', 'recover_cancel', { reason: String(reason || '') });
    resumeFinalizeDelayed(800, 'cancel');
    return was;
  }

  function runReopenStep(token) {
    if (token !== toInt(STATE.rec.token, 0)) return;

    STATE.rec.step = 'reopen';
    STATE.rec.reopenTry = 1;
    setPhase(ST.RECOVERING_REOPEN, 'reopen');
    STATE.rec.lastErr = '';
    if (CFG.protectNext) armBlockNext(5000, 'rec_step:reopen');
    logRec('reopen', STATE.rec.reopenTry, 1, 'pg_reopen', 'start');

    var ok = actionReopenViaPg();
    if (!ok) {
      logRec('reopen', STATE.rec.reopenTry, 1, String(STATE.rec.lastAction || 'pg_reopen'), 'fail', String(STATE.rec.lastErr || 'reopen_rejected'));
      return recoveryFinish(false, 'reopen_rejected');
    }

    waitForProgress(token, DET.reopenStepWaitMs, function (success, why) {
      if (token !== toInt(STATE.rec.token, 0)) return;
      if (success) {
        logRec('reopen', STATE.rec.reopenTry, 1, String(STATE.rec.lastAction || 'pg_reopen'), 'ok');
        return recoveryFinish(true, 'reopen_' + String(why || 'ok'));
      }
      logRec('reopen', STATE.rec.reopenTry, 1, String(STATE.rec.lastAction || 'pg_reopen'), 'timeout', 'reopen_no_progress');
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
    STATE.rec.lastErr = '';
    if (CFG.protectNext) armBlockNext(5000, 'rec_step:inplayer');
    logRec('inplayer', STATE.rec.inpTry, STATE.rec.inpMax, CFG.inplayerMode, 'start');

    var ok = actionInplayerRebuild(CFG.inplayerMode);
    if (!ok) {
      logRec('inplayer', STATE.rec.inpTry, STATE.rec.inpMax, String(STATE.rec.lastAction || CFG.inplayerMode), 'fail', String(STATE.rec.lastErr || 'inplayer_action_failed'));
      setTimeout(function () {
        runInplayerStep(token);
      }, 250);
      return;
    }

    waitForProgress(token, DET.inplayerStepWaitMs, function (success, why) {
      if (token !== toInt(STATE.rec.token, 0)) return;
      if (success) {
        logRec('inplayer', STATE.rec.inpTry, STATE.rec.inpMax, String(STATE.rec.lastAction || CFG.inplayerMode), 'ok');
        return recoveryFinish(true, 'inplayer_' + String(why || 'ok'));
      }
      STATE.rec.lastErr = 'inplayer_no_progress';
      logRec('inplayer', STATE.rec.inpTry, STATE.rec.inpMax, String(STATE.rec.lastAction || CFG.inplayerMode), 'timeout', 'inplayer_no_progress');
      runInplayerStep(token);
    });
  }

  function runSoftStep(token) {
    if (token !== toInt(STATE.rec.token, 0)) return;

    if (STATE.rec.softTry >= STATE.rec.softMax) return runInplayerStep(token);

    STATE.rec.softTry++;
    STATE.rec.step = 'soft';
    setPhase(ST.RECOVERING_SOFT, 'soft:' + String(STATE.rec.softTry) + '/' + String(STATE.rec.softMax));
    STATE.rec.lastErr = '';
    if (CFG.protectNext) armBlockNext(4000, 'rec_step:soft');
    logRec('soft', STATE.rec.softTry, STATE.rec.softMax, 'seek/load/play', 'start');

    var ok = actionSoftAttempt(STATE.rec.softTry);
    if (!ok) {
      logRec('soft', STATE.rec.softTry, STATE.rec.softMax, String(STATE.rec.lastAction || 'seek/load/play'), 'fail', String(STATE.rec.lastErr || 'soft_action_failed'));
      setTimeout(function () {
        runSoftStep(token);
      }, 150);
      return;
    }

    waitForProgress(token, DET.softStepWaitMs, function (success, why) {
      if (token !== toInt(STATE.rec.token, 0)) return;
      if (success) {
        logRec('soft', STATE.rec.softTry, STATE.rec.softMax, String(STATE.rec.lastAction || 'seek/load/play'), 'ok');
        return recoveryFinish(true, 'soft_' + String(why || 'ok'));
      }
      STATE.rec.lastErr = 'soft_no_progress';
      logRec('soft', STATE.rec.softTry, STATE.rec.softMax, String(STATE.rec.lastAction || 'seek/load/play'), 'timeout', 'soft_no_progress');
      runSoftStep(token);
    });
  }

  function startRecovery(reason) {
    reason = String(reason || 'hang');

    if (!CFG.enabled) {
      STATE.rec.lastErr = 'disabled';
      logLine('DBG', 'REC skip', { reason: reason, why: 'disabled' });
      return false;
    }
    if (STATE.rec.active) {
      STATE.rec.lastErr = 'busy';
      logLine('DBG', 'REC skip', { reason: reason, why: 'busy', step: String(STATE.rec.step || '') });
      return false;
    }

    STATE.rec.active = true;
    STATE.rec.token = toInt(STATE.rec.token, 0) + 1;
    STATE.rec.reason = reason;
    STATE.rec.step = '';
    STATE.rec.softTry = 0;
    STATE.rec.inpTry = 0;
    STATE.rec.reopenTry = 0;
    STATE.rec.softMax = clampInt(CFG.softAttempts, 0, 5);
    if (reason === 'fake_full_buffer') STATE.rec.softMax = Math.min(1, STATE.rec.softMax);
    if (reason === 'buffer_underrun') STATE.rec.softMax = Math.min(1, STATE.rec.softMax);
    STATE.rec.inpMax = clampInt(CFG.inplayerAttempts, 0, 6);
    STATE.rec.lastAction = '';
    STATE.rec.lastErr = '';
    STATE.rec.startedTs = now();
    clearResumeUnfreezeTimer();
    makeResumeTicket(reason, 'recovery');
    truthFreeze(true, 'recover:' + reason);
    if (CFG.protectNext) armBlockNext(6000, 'recover:' + reason);

    logLine('WRN', 'recover_begin', {
      reason: reason,
      soft: STATE.rec.softMax,
      inplayer: STATE.rec.inpMax,
      mode: CFG.inplayerMode,
      reopen: CFG.escalateToReopen ? 1 : 0,
      resume: toNum(resumeSecFromTicketOrTruth(), 0).toFixed(2)
    });

    var token = toInt(STATE.rec.token, 0);
    runSoftStep(token);
    return true;
  }

  function handleUserCommand(cmd, payload) {
    cmd = normalizeCommand(cmd);
    if (!cmd) return;

    STATE.pendingUserCommand = cmd;

    if (cmd === 'pause') {
      setUserPauseIntent(true, 'cmd_pause');
      STATE.pause.lastPauseTs = now();
    }
    else if (cmd === 'play') {
      setUserPauseIntent(false, 'cmd_play');
      STATE.pause.lastResumeTs = now();
    }

    if (STATE.rec.active) recoveryCancel('user:' + cmd);

    if (cmd === 'exit') setPhase(ST.IDLE, 'user_exit');

    try {
      logLine('DBG', 'user_command', { cmd: cmd, src: payload && payload.type ? String(payload.type) : '' });
    } catch (_) { }
  }

  function runtimeAges() {
    return {
      ctAge: toInt(STATE.ct.stuckMs, 0),
      timeupdateAge: ageMs(STATE.ev.lastTimeupdateTs || STATE.events.last.timeupdate),
      progAge: ageMs(STATE.ev.lastProgressTs || STATE.monitor.lastProgressSignalTs),
      aheadAge: ageMs(STATE.monitor.lastAheadChangeTs),
      waitingAge: ageMs(STATE.ev.lastWaitingTs || STATE.events.last.waiting),
      stalledAge: ageMs(STATE.ev.lastStalledTs || STATE.events.last.stalled),
      resumeAge: ageMs(STATE.pause.lastResumeTs)
    };
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

  function isFalseEndLooser(ct, dur, ages) {
    if (!CFG.protectNext) return false;
    if (!CFG.falseEndStaleAllow) return false;
    if (!isFinite(toNum(ct, NaN)) || !isFinite(toNum(dur, NaN)) || dur <= 0) return false;
    if (ct < dur - DET.falseEndNearDurSec) return false;

    var tr = toNum(STATE.truth.lastGoodSec, NaN);
    if (!isFinite(tr) || tr < 0) return false;
    if ((dur - tr) < DET.falseEndTruthGapSec) return false;

    var tickSig = '';
    var truthSig = '';
    try { tickSig = String(STATE.tick && STATE.tick.srcSig ? STATE.tick.srcSig : ''); } catch (_) { tickSig = ''; }
    try { truthSig = String(STATE.truth.srcSig || ''); } catch (_) { truthSig = ''; }
    if (tickSig && truthSig && tickSig !== truthSig) return false;

    if (isFalseEnd(ct, dur)) return true;

    ages = ages || runtimeAges();

    var hangTime = Math.max(1500, toInt(CFG.hangTimeMs, 10000));
    var hangBuf = Math.max(1500, toInt(CFG.hangBufMs, 8000));
    var ctStall = toInt(ages.ctAge, 0) >= Math.floor(hangTime * 0.8);
    var progStall = toInt(ages.progAge, 0) >= Math.floor(hangBuf * 0.8);
    var aheadStall = toInt(ages.aheadAge, 0) >= Math.floor(hangBuf * 0.8);
    var resumeWindow = toInt(ages.resumeAge, 0) > 0 && toInt(ages.resumeAge, 0) <= Math.max(10000, toInt(CFG.resumeGuardMs, 180000));

    return !!(ctStall || progStall || aheadStall || resumeWindow);
  }

  function maybeHandleFalseEnd(reason) {
    if (!CFG.enabled || !CFG.protectNext) return false;
    if (STATE.rec.active) return false;

    var t = STATE.tick;
    var ct = toNum(t && t.ct, NaN);
    var dur = toNum(t && t.dur, NaN);
    var strict = isFalseEnd(ct, dur);
    var loose = isFalseEndLooser(ct, dur);

    if (!(strict || loose)) return false;

    var ts = now();
    if ((ts - toInt(STATE.guard.lastFalseEndTs, 0)) < 1000) return false;
    STATE.guard.lastFalseEndTs = ts;
    STATE.guard.falseEndCount = toInt(STATE.guard.falseEndCount, 0) + 1;

    armBlockNext(DET.manualNextBlockMs, 'false_end');

    var v = STATE.video || getVideo();
    var target = Math.max(0, toNum(STATE.truth.lastGoodSec, 0) - 0.7);
    try { if (v) v.currentTime = target; } catch (_) { }
    if (!isUserPauseIntent()) {
      try {
        if (v && typeof v.play === 'function') {
          var p = v.play();
          if (p && typeof p.catch === 'function') p.catch(function () { });
        }
      } catch (_) { }
    }
    STATE.rec.lastAction = 'false_end_prevented';

    logLine('WRN', 'FALSE_END prevented', {
      reason: String(reason || ''),
      ct: isFinite(ct) ? ct.toFixed(2) : '',
      dur: isFinite(dur) ? dur.toFixed(2) : '',
      strict: strict ? 1 : 0,
      loose: loose ? 1 : 0,
      truth: toNum(STATE.truth.lastGoodSec, 0).toFixed(2),
      blockNextUntilTs: toInt(STATE.guard.blockNextUntilTs, 0)
    });

    if (!STATE.rec.active) {
      setPhase(ST.HUNG, 'false_end');
      startRecovery('false_end');
    } else {
      armBlockNext(DET.manualNextBlockMs + 2000, 'false_end_busy');
    }

    return true;
  }

  function maybeHandleForcedNext(reason, payload) {
    if (!CFG.enabled || !CFG.protectNext) return false;
    if (STATE.rec.active) return false;

    var t = STATE.tick;
    var ct = toNum(t && t.ct, NaN);
    var dur = toNum(t && t.dur, NaN);
    var ages = runtimeAges();
    var strict = isFalseEnd(ct, dur);
    var loose = isFalseEndLooser(ct, dur, ages);

    if (!(strict || loose)) return false;

    var ts = now();
    if ((ts - toInt(STATE.guard.lastFalseEndTs, 0)) < 700) {
      armBlockNext(DET.manualNextBlockMs + 2000, 'forced_next_debounce');
      return true;
    }

    STATE.guard.lastFalseEndTs = ts;
    STATE.guard.falseEndCount = toInt(STATE.guard.falseEndCount, 0) + 1;
    armBlockNext(DET.manualNextBlockMs + (STATE.rec.active ? 3000 : 0), 'forced_next');

    var v = STATE.video || getVideo();
    var target = Math.max(0, toNum(STATE.truth.lastGoodSec, 0) - 0.7);
    try { if (v) v.currentTime = target; } catch (_) { }
    if (!isUserPauseIntent()) {
      try {
        if (v && typeof v.play === 'function') {
          var p = v.play();
          if (p && typeof p.catch === 'function') p.catch(function () { });
        }
      } catch (_) { }
    }

    STATE.rec.lastAction = 'forced_next_prevented';

    logLine('WRN', 'FORCED_NEXT prevented', {
      reason: String(reason || ''),
      type: payload && payload.type ? String(payload.type || '') : '',
      ct: isFinite(ct) ? ct.toFixed(2) : '',
      dur: isFinite(dur) ? dur.toFixed(2) : '',
      truth: toNum(STATE.truth.lastGoodSec, 0).toFixed(2),
      strict: strict ? 1 : 0,
      loose: loose ? 1 : 0,
      ctAge: toInt(ages.ctAge, 0),
      progAge: toInt(ages.progAge, 0),
      aheadAge: toInt(ages.aheadAge, 0),
      resumeAge: toInt(ages.resumeAge, 0),
      blockNextUntilTs: toInt(STATE.guard.blockNextUntilTs, 0)
    });

    if (!STATE.rec.active) {
      setPhase(ST.HUNG, 'forced_next');
      startRecovery('forced_next');
    } else {
      armBlockNext(DET.manualNextBlockMs + 2000, 'forced_next_busy');
      logLine('DBG', 'forced_next_recover_busy', { rec: 1, hold: toInt(STATE.guard.blockNextUntilTs, 0) });
    }

    return true;
  }

  function handlePlayerSend(type, payload) {
    var t = String(type || '');
    var tl = t.toLowerCase();

    if (tl === 'start') {
      setUserPauseIntent(false, 'player_start');
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

    if (isLikelyUserCmdType(tl)) handleUserCommand(tl, { type: t, payload: payload });
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
      var lowerType = String(type || '').toLowerCase();

      try { handlePlayerSend(type, payload); } catch (_) { }

      try {
        if (CFG.enabled && CFG.protectNext && shouldBlockNextType(type)) {
          if (STATE.rec.active) {
            armBlockNext(5000, 'rec_active_player');
            logLine('WRN', 'BLOCK next/select while recovering', { where: 'player.send', type: String(type || '') });
            return;
          }
          collectTick(STATE.video || getVideo());
          if (maybeHandleFalseEnd('player:' + lowerType)) return;
          if (maybeHandleForcedNext('player:' + lowerType, { type: type, payload: payload })) return;
          if (isBlockNextActive()) {
            logLine('WRN', 'prevent_next_overlay', { where: 'player.send', type: String(type || ''), untilTs: toInt(STATE.guard.blockNextUntilTs, 0) });
            return;
          }
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
      var payload = (arguments && arguments.length > 1) ? arguments[1] : undefined;
      var lowerType = String(type || '').toLowerCase();

      try {
        if (CFG.enabled && CFG.protectNext && shouldBlockNextType(type)) {
          if (STATE.rec.active) {
            armBlockNext(5000, 'rec_active_playlist');
            logLine('WRN', 'BLOCK next/select while recovering', { where: 'playlist.send', type: String(type || '') });
            return;
          }
          collectTick(STATE.video || getVideo());
          if (maybeHandleFalseEnd('playlist:' + lowerType)) return;
          if (maybeHandleForcedNext('playlist:' + lowerType, { type: type, payload: payload })) return;
          if (isBlockNextActive()) {
            logLine('WRN', 'prevent_next_overlay', { where: 'playlist.send', type: String(type || ''), untilTs: toInt(STATE.guard.blockNextUntilTs, 0) });
            return;
          }
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

    if (isUserPauseIntent()) {
      setPhase(ST.PAUSED_BY_USER, 'paused');
      return;
    }
    if (t.paused) {
      setPhase(ST.BUFFERING, 'media_paused');
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
    if (!CFG.enabled) {
      hangUpdate(false, 'disabled', { ctAge: 0, timeupdateAge: 0, progAge: 0, aheadAge: 0, waitingAge: 0, resumeAge: 0 });
      return false;
    }
    if (STATE.rec.active) {
      hangUpdate(false, 'recovering', runtimeAges());
      return false;
    }

    var t = STATE.tick;
    if (!t || !t.hasVideo) {
      hangUpdate(false, 'no_video', { ctAge: 0, timeupdateAge: 0, progAge: 0, aheadAge: 0, waitingAge: 0, resumeAge: 0 });
      return false;
    }
    if (isUserPauseIntent()) {
      hangUpdate(false, 'paused', runtimeAges());
      return false;
    }

    var ages = runtimeAges();
    var ctStuckMs = ages.ctAge;
    var timeupdateAge = ages.timeupdateAge;
    var progAge = ages.progAge;
    var aheadAge = ages.aheadAge;
    var resumeAge = ages.resumeAge;

    var hangTimeMs = toInt(CFG.hangTimeMs, 10000);
    var hangBufMs = toInt(CFG.hangBufMs, 8000);
    if (resumeAge > 0 && resumeAge <= Math.max(10000, toInt(CFG.resumeGuardMs, 180000))) {
      hangTimeMs = Math.max(2500, Math.min(hangTimeMs, 4000));
      hangBufMs = Math.max(2500, Math.floor(hangBufMs * 0.75));
    }

    var noTimeupdate = timeupdateAge >= hangTimeMs;
    var noProgress = progAge >= hangBufMs;
    var noAhead = aheadAge >= hangBufMs;
    var lowReady = toInt(t.readyState, 0) <= 2 && ctStuckMs >= Math.max(hangTimeMs, 2000);
    var hang = ctStuckMs >= hangTimeMs && (noTimeupdate || noProgress || noAhead || lowReady);

    if (!hang) {
      var why = 'ct_moving_or_signals';
      if (ctStuckMs < hangTimeMs) why = 'ct_not_stuck';
      else if (!(noTimeupdate || noProgress || noAhead || lowReady)) why = 'signals_alive';
      hangUpdate(false, why, ages);
      return false;
    }

    hangUpdate(true, 'playing_stuck', ages);
    setPhase(ST.HUNG, 'playing_stuck');
    logLine('WRN', 'DETECT playing_stuck', {
      ctStuckMs: ctStuckMs,
      timeupdateAge: timeupdateAge,
      progAge: progAge,
      aheadAge: aheadAge,
      resumeAge: resumeAge,
      hangTimeMs: hangTimeMs,
      hangBufMs: hangBufMs,
      rs: toInt(t.readyState, 0),
      ahead: toNum(t.aheadSec, 0).toFixed(1)
    });

    var started = startRecovery('playing_stuck');
    if (!started) {
      hangUpdate(true, 'playing_stuck_no_recover', ages);
      armBlockNext(DET.manualNextBlockMs + 2000, 'hang_no_recover');
      logLine('WRN', 'hang_recovery_not_started', { recActive: STATE.rec.active ? 1 : 0, lastErr: String(STATE.rec.lastErr || '') });
    }
    return started;
  }

  function bufferAges() {
    return {
      progAge: ageMs(STATE.buf.lastProgTs || STATE.ev.lastProgressTs || STATE.monitor.lastProgressSignalTs),
      aheadMoveAge: ageMs(STATE.buf.lastAheadMoveTs),
      bufEndMoveAge: ageMs(STATE.buf.lastBufferedEndMoveTs),
      sigAge: ageMs(STATE.buf.lastRangesTs),
      timeupdateAge: ageMs(STATE.buf.lastTimeupdateTs || STATE.ev.lastTimeupdateTs || STATE.events.last.timeupdate)
    };
  }

  function maybeDetectFakeFullBuffer() {
    if (!CFG.enabled || !CFG.fakeFullEnabled) return false;
    if (STATE.rec.active) return false;
    if (isUserPauseIntent()) return false;

    var t = STATE.tick || {};
    if (!t.hasVideo) return false;
    var dur = toNum(t.dur, NaN);
    if (!isFinite(dur) || dur <= 60) return false;
    if (toInt(t.rangesCount, 0) !== 1) return false;

    var fs = toNum(t.firstRangeStart, NaN);
    var fe = toNum(t.firstRangeEnd, NaN);
    if (!isFinite(fs) || fs > 0.5) return false;
    if (!isFinite(fe) || fe < dur - 0.5) return false;

    var ba = bufferAges();
    var ra = runtimeAges();
    var noMove = ba.bufEndMoveAge >= toInt(CFG.fakeFullNoMoveMs, 6000);
    var noProg = ba.progAge >= toInt(CFG.fakeFullNoProgMs, 6000);
    var stuck = toInt(STATE.ct.stuckMs, 0) >= Math.max(1500, Math.floor(toInt(CFG.hangTimeMs, 10000) * 0.75));
    if (!(noMove && noProg && (stuck || ba.timeupdateAge >= toInt(CFG.hangTimeMs, 10000)))) return false;

    var ts = nowMs();
    if ((ts - toInt(STATE.buf.fakeFullTs, 0)) < 1200) return false;
    STATE.buf.fakeFullTs = ts;
    STATE.buf.fakeFullCount = toInt(STATE.buf.fakeFullCount, 0) + 1;

    setPhase(ST.HUNG, 'fake_full');
    if (CFG.protectNext) armBlockNext(6000, 'fake_full');
    logLine('WRN', 'DETECT fake_full', {
      dur: dur.toFixed(2),
      range: fs.toFixed(2) + '-' + fe.toFixed(2),
      progAge: toInt(ba.progAge, 0),
      bufMoveAge: toInt(ba.bufEndMoveAge, 0),
      ctStuckMs: toInt(STATE.ct.stuckMs, 0),
      cnt: toInt(STATE.buf.fakeFullCount, 0)
    });

    var started = startRecovery('fake_full_buffer');
    if (!started && CFG.protectNext) armBlockNext(8000, 'fake_full_busy');
    return started;
  }

  function maybeDetectBufferUnderrun() {
    if (!CFG.enabled) return false;
    if (STATE.rec.active) return false;
    if (!isPlayingLike(STATE.tick)) return false;

    var t = STATE.tick || {};
    if (!t.hasVideo) return false;
    var ahead = toNum(t.aheadSec, 0);
    if (ahead > toNum(CFG.minAheadSec, 0.5)) return false;

    var ba = bufferAges();
    var noProg = ba.progAge >= toInt(CFG.underrunNoProgMs, 4000);
    var noAheadMove = ba.aheadMoveAge >= toInt(CFG.underrunNoAheadMoveMs, 4000);
    if (!(noProg && noAheadMove)) return false;

    var ts = nowMs();
    if ((ts - toInt(STATE.buf.underrunTs, 0)) < 1200) return false;
    STATE.buf.underrunTs = ts;
    STATE.buf.underrunCount = toInt(STATE.buf.underrunCount, 0) + 1;

    setPhase(ST.HUNG, 'underrun');
    if (CFG.protectNext) armBlockNext(6000, 'underrun');
    logLine('WRN', 'DETECT underrun', {
      ahead: ahead.toFixed(2),
      progAge: toInt(ba.progAge, 0),
      aheadMoveAge: toInt(ba.aheadMoveAge, 0),
      cnt: toInt(STATE.buf.underrunCount, 0)
    });

    var started = startRecovery('buffer_underrun');
    if (!started && CFG.protectNext) armBlockNext(8000, 'underrun_busy');
    return started;
  }

  function trackReopenApply() {
    var req = toNum(STATE.resume.reopenRequestedSec, NaN);
    if (!isFinite(req) || req < 0) return;
    if (STATE.resume.reopenAppliedTs) {
      if (ageMs(STATE.resume.reopenAppliedTs) > 12000) {
        STATE.resume.reopenRequestedSec = NaN;
        STATE.resume.reopenRequestedTs = 0;
        STATE.resume.reopenSeekTs = 0;
      }
      return;
    }

    var t = STATE.tick || {};
    var ct = toNum(t.ct, NaN);
    if (isFinite(ct)) {
      var delta = ct - req;
      STATE.resume.reopenDeltaSec = delta;
      if (!STATE.resume.reopenAppliedTs && Math.abs(delta) <= 2.0) {
        STATE.resume.reopenAppliedTs = nowMs();
        STATE.resume.reopenAppliedSec = ct;
        logLine('INF', 'REOPEN applied', {
          requestedSec: req.toFixed(2),
          applied: ct.toFixed(2),
          delta: delta.toFixed(2),
          ok: 1
        });
        return;
      }
    }

    var ts = nowMs();
    if ((ts - toInt(STATE.resume.reopenRequestedTs, 0)) < 1400) return;
    if ((ts - toInt(STATE.resume.reopenSeekTs, 0)) < 2800) return;

    var v = STATE.video || getVideo();
    if (!v) return;

    STATE.resume.reopenSeekTs = ts;
    seekAfterReady(v, req, 'reopen_apply', function (ok, err) {
      if (ok) {
        var cur = toNum(v.currentTime, NaN);
        STATE.resume.reopenAppliedTs = nowMs();
        STATE.resume.reopenAppliedSec = isFinite(cur) ? cur : req;
        STATE.resume.reopenDeltaSec = isFinite(cur) ? (cur - req) : 0;
        logLine('INF', 'REOPEN applied', {
          requestedSec: req.toFixed(2),
          applied: isFinite(cur) ? cur.toFixed(2) : req.toFixed(2),
          delta: isFinite(cur) ? (cur - req).toFixed(2) : '0.00',
          ok: 1
        });
      } else {
        logLine('WRN', 'REOPEN apply_failed', {
          requestedSec: req.toFixed(2),
          err: String(err || '')
        });
      }
    });
  }

  function tick() {
    try {
      if ((now() - toInt(STATE.lastCfgReadTs, 0)) > 1200) readSettingsFromStorage();

      patchAll();
      rebindVideoListeners();
      collectTick(STATE.video);

      if (!CFG.enabled) {
        if (STATE.rec.active) recoveryCancel('disabled');
        if (STATE.ui.open || STATE.ui.root) uiDestroy('disabled');
        setPhase(ST.IDLE, 'disabled');
        return;
      }

      updatePhaseByTick();
      maybeDetectHang();
      maybeDetectFakeFullBuffer();
      maybeDetectBufferUnderrun();
      maybeHandleFalseEnd('tick_check');
      trackReopenApply();

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
        resumeGuardMs: toInt(CFG.resumeGuardMs, 0),
        falseEndStaleAllow: !!CFG.falseEndStaleAllow,
        fakeFullEnabled: !!CFG.fakeFullEnabled,
        fakeFullNoProgMs: toInt(CFG.fakeFullNoProgMs, 0),
        fakeFullNoMoveMs: toInt(CFG.fakeFullNoMoveMs, 0),
        minAheadSec: toNum(CFG.minAheadSec, 0),
        underrunNoProgMs: toInt(CFG.underrunNoProgMs, 0),
        underrunNoAheadMoveMs: toInt(CFG.underrunNoAheadMoveMs, 0),
        softAttempts: toInt(CFG.softAttempts, 0),
        inplayerAttempts: toInt(CFG.inplayerAttempts, 0),
        inplayerMode: String(CFG.inplayerMode || ''),
        escalateToReopen: !!CFG.escalateToReopen,
        reopenCooldownMs: toInt(CFG.reopenCooldownMs, 0)
      },
      phase: String(STATE.phase || ''),
      phaseReason: String(STATE.phaseReason || ''),
      recoverLock: !!STATE.rec.active,
      userPausedIntent: isUserPauseIntent(),
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
      hang: {
        active: !!(STATE.hang && STATE.hang.active),
        reason: String(STATE.hang && STATE.hang.reason ? STATE.hang.reason : ''),
        ctStuckMs: toInt(STATE.ct.stuckMs, 0),
        timeupdateAge: ageMs(STATE.ev.lastTimeupdateTs || STATE.events.last.timeupdate),
        progressAge: ageMs(STATE.ev.lastProgressTs || STATE.monitor.lastProgressSignalTs),
        aheadAge: ageMs(STATE.monitor.lastAheadChangeTs),
        resumeAge: ageMs(STATE.pause.lastResumeTs)
      },
      resume: {
        ticketSec: toNum(STATE.resume.ticket && STATE.resume.ticket.sec, NaN),
        ticketSrcSig: String(STATE.resume.ticket && STATE.resume.ticket.srcSig ? STATE.resume.ticket.srcSig : ''),
        ticketAge: resumeTicketAgeMs(),
        frozen: !!STATE.truth.frozen,
        lastSeekSec: toNum(STATE.resume.lastSeekSec, NaN),
        lastSeekTs: toInt(STATE.resume.lastSeekTs, 0),
        lastSeekOk: toInt(STATE.resume.lastSeekOk, 0),
        reopenRequestedSec: toNum(STATE.resume.reopenRequestedSec, NaN),
        reopenAppliedSec: toNum(STATE.resume.reopenAppliedSec, NaN),
        reopenDeltaSec: toNum(STATE.resume.reopenDeltaSec, NaN)
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
      logs: safe(function () {
        var rows = logRowsTail(DET.logLimit);
        var out = [];
        for (var i = 0; i < rows.length; i++) {
          var row = rows[i] || {};
          var msg = String(row.msg || '');
          var n = toInt(row.n, 1);
          out.push(n > 1 ? ('×' + String(n) + ' ' + msg) : msg);
        }
        return out;
      }, [])
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
      if (STATE.ui.open || STATE.ui.root) uiDestroy('refresh_disabled');
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
            if (n === K.enabled || n === K.debugOnOpen || n === K.popupOpacity || n === K.protectNext || n === K.storeTruth || n === K.truthCommitMs || n === K.hangTimeMs || n === K.hangBufMs || n === K.resumeGuardMs || n === K.falseEndStaleAllow || n === K.fakeFullEnabled || n === K.fakeFullNoProgMs || n === K.fakeFullNoMoveMs || n === K.minAheadSec || n === K.underrunNoProgMs || n === K.underrunNoAheadMoveMs || n === K.softAttempts || n === K.inplayerAttempts || n === K.inplayerMode || n === K.escalateToReopen || n === K.reopenCooldownMs || n === K.oldEnabled || n === K.oldDebugOnOpen || n === K.oldHangTimeMs || n === K.oldHangBufMs) API.refresh();
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
