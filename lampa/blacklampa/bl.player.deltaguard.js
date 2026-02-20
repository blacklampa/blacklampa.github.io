(function () {
  'use strict';

  var BL = window.BL = window.BL || {};
  BL.DeltaGuard = BL.DeltaGuard || {};

  var API = BL.DeltaGuard;
  if (API.__blDeltaGuardLoadedV1) return;
  API.__blDeltaGuardLoadedV1 = true;

  var LS_PREFIX = 'blacklampa_';
  try { if (BL.Keys && BL.Keys.prefix) LS_PREFIX = String(BL.Keys.prefix || 'blacklampa_'); } catch (_) { }

  var K = {
    enabled: LS_PREFIX + 'dg_enabled',
    debugOnOpen: LS_PREFIX + 'dg_debug_on_open',
    debugOnFail: LS_PREFIX + 'dg_debug_on_fail',
    popupOpacity: LS_PREFIX + 'dg_popup_opacity',
    popupAutocloseSec: LS_PREFIX + 'dg_popup_autoclose_sec',
    blockNextMs: LS_PREFIX + 'dg_block_next_ms',
    tailSec: LS_PREFIX + 'dg_tail_sec',
    falseEndJumpSec: LS_PREFIX + 'dg_false_end_jump_sec',
    fakeFullEnabled: LS_PREFIX + 'dg_fake_full_enabled',
    falseEndEnabled: LS_PREFIX + 'dg_false_end_enabled',
    tickMs: LS_PREFIX + 'dg_tick_ms',
    stallSoftMs: LS_PREFIX + 'dg_stall_soft_ms',
    stallHardMs: LS_PREFIX + 'dg_stall_hard_ms',
    recoverCooldownMs: LS_PREFIX + 'dg_recover_cooldown_ms',
    startGraceMs: LS_PREFIX + 'dg_start_grace_ms',
    nextMinRemainSec: LS_PREFIX + 'dg_next_min_remain_sec',
    ctFloorLagSec: LS_PREFIX + 'dg_ct_floor_lag_sec',
    userActionCooldownMs: LS_PREFIX + 'dg_user_action_cooldown_ms',
    verifyMs: LS_PREFIX + 'dg_verify_ms',
    hardResetEnabled: LS_PREFIX + 'dg_hard_reset_enabled',
    hardResetAfterN: LS_PREFIX + 'dg_hard_reset_after_n'
  };

  var DG_DEFAULTS = {
    dg_enabled: 1,
    dg_debug_on_open: 0,
    dg_debug_on_fail: 1,
    dg_popup_opacity: 0.5,
    dg_popup_autoclose_sec: 0,
    dg_block_next_ms: 6000,
    dg_tail_sec: 3.0,
    dg_false_end_jump_sec: 10.0,
    dg_fake_full_enabled: 1,
    dg_false_end_enabled: 1,
    dg_tick_ms: 250,
    dg_stall_soft_ms: 900,
    dg_stall_hard_ms: 2000,
    dg_recover_cooldown_ms: 2500,
    dg_start_grace_ms: 18000,
    dg_next_min_remain_sec: 12.0,
    dg_ct_floor_lag_sec: 30.0,
    dg_user_action_cooldown_ms: 1500,
    dg_verify_ms: 1400,
    dg_hard_reset_enabled: 1,
    dg_hard_reset_after_n: 2
  };

  var ST = {
    IDLE: 'IDLE',
    LOADING: 'LOADING',
    TRACKING: 'TRACKING',
    STALL: 'STALL',
    RECOVERING: 'RECOVERING',
    VERIFYING: 'VERIFYING',
    SUSPENDED: 'SUSPENDED',
    FAILED: 'FAILED'
  };

  var STATE = {
    installed: false,
    enabled: true,
    cfg: {},
    lastCfgReadTs: 0,

    timer: null,
    tickSeq: 0,

    patched: {
      player: false,
      playerVideo: false,
      playlist: false,
      playerNext: false
    },

    input: {
      installed: false,
      lastInputTs: 0,
      lastKeyTs: 0,
      lastKey: '',
      lastPointerTs: 0
    },

    user: {
      pendingCmd: '',
      pendingTs: 0,
      pauseOwner: 'none',
      pauseOwnerTs: 0,
      userPausedLatched: 0,
      userPausedTs: 0,
      userPauseUntilTs: 0,
      userSeekUntilTs: 0,
      userActionUntilTs: 0,
      lastUserSeekCt: NaN,
      lastUserSeekTs: 0,
      userSeekCommitUntilTs: 0,
      lastCmdNorm: '',
      lastCmdTs: 0
    },

    life: {
      active: false,
      sessionActive: false,
      sessionId: 0,
      exitingUntilTs: 0,
      hiddenSinceTs: 0,
      lastSessionReason: '',
      lastDestroyTs: 0,
      lastStartTs: 0,
      lastStopTs: 0
    },

    stage: {
      name: ST.IDLE,
      reason: '',
      ts: 0
    },

    media: {
      video: null,
      listeners: null,
      frameCallbackId: 0,
      frameCallbackBound: null,

      ct: NaN,
      dur: NaN,
      paused: false,
      readyState: 0,
      networkState: 0,

      lastCt: NaN,
      lastCtTs: 0,
      lastTimeupdateTs: 0,
      lastProgressTs: 0,
      lastWaitingTs: 0,
      lastStalledTs: 0,
      lastEndedTs: 0,
      lastPlayingTs: 0,
      lastCanplayTs: 0,
      lastPauseTs: 0,
      lastPlayTs: 0,
      lastSeekTs: 0,
      lastBufMoveTs: 0,

      frameLastTs: 0,
      frameSupported: false,
      frameLastCount: NaN,

      bufferStart: NaN,
      bufferEnd: NaN,
      bufferCount: 0,
      bufferCoverage: 0,
      aheadSec: 0,
      maxSeenCt: NaN,

      srcSig: '',
      contentKey: '',
      contentKeyShort: '',

      ring: [],
      lastGoodCt: NaN,
      lastGoodTs: 0,
      recentCtFloor: 0,
      startupUntilTs: 0,
      startupStartCt: NaN,
      startupSoftTried: 0,
      startupKickTs: 0,
      playbackProven: false,
      playbackProvenTs: 0
    },

    recovery: {
      active: false,
      token: 0,
      trigger: '',
      step: '',
      failCounter: 0,
      hardResetCount: 0,
      nextAllowedTs: 0,
      lastAttemptTs: 0,
      lastAttemptSig: '',
      backoffFactor: 0,
      suppressUntilTs: 0,
      lastTriggerHash: '',
      verifyUntilTs: 0,
      verifyStartCt: NaN,
      verifyStartTimeupdateTs: 0,
      verifyStartFrameTs: 0,
      verifyTarget: NaN,
      sessionId: 0,
      contentKey: '',
      lastAction: '',
      lastErr: '',
      lastFailTs: 0,
      lastOkTs: 0,
      lastTrigger: '',
      lastReason: ''
    },

    guard: {
      blockNextUntilTs: 0,
      blockReason: '',
      falseEndSuspectActive: 0,
      falseEndSuspectTs: 0,
      falseEndSuspectCt: NaN,
      falseEndSuspectPrevCt: NaN,
      falseEndSuspectReason: ''
    },

    popup: {
      open: false,
      host: null,
      shadow: null,
      root: null,
      title: null,
      reason: null,
      body: null,
      closeBtn: null,
      autoCloseTimer: null,
      lastOpenTs: 0,
      lastEdgeOpenTs: 0,
      lastRenderTs: 0,
      lastBodyHtml: ''
    }
  };

  function nowMs() {
    try { return Date.now(); } catch (_) { return +new Date(); }
  }

  function safe(fn, fallback) {
    try { return fn(); } catch (_) { return fallback; }
  }

  function toInt(v, d) {
    var n = parseInt(v, 10);
    return isNaN(n) ? d : n;
  }

  function toNum(v, d) {
    var n = parseFloat(v);
    return isNaN(n) ? d : n;
  }

  function readFloat(key, fallback) {
    return toNum(sGet(String(key || ''), String(fallback)), fallback);
  }

  function clampInt(v, minV, maxV) {
    var n = toInt(v, minV);
    if (n < minV) return minV;
    if (n > maxV) return maxV;
    return n;
  }

  function clampNum(v, minV, maxV) {
    var n = toNum(v, minV);
    if (n < minV) return minV;
    if (n > maxV) return maxV;
    return n;
  }

  function ageMs(ts) {
    ts = toInt(ts, 0);
    if (!ts) return 99999999;
    return Math.max(0, nowMs() - ts);
  }

  function parseBool(v, def) {
    if (v === undefined || v === null || v === '') return !!def;
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return isFinite(v) && v !== 0;
    try { v = String(v).trim(); } catch (_) { return !!def; }
    if (!v) return !!def;
    return !/^(0|false|off|no)$/i.test(v);
  }

  function sGet(key, fallback) {
    var v = null;
    try { if (window.Lampa && Lampa.Storage && Lampa.Storage.get) v = Lampa.Storage.get(String(key)); } catch (_) { v = null; }
    if (v === undefined || v === null || v === '') {
      try { if (window.localStorage) v = localStorage.getItem(String(key)); } catch (_) { v = null; }
    }
    return (v === undefined || v === null || v === '') ? fallback : v;
  }

  function sSet(key, value) {
    try { if (window.Lampa && Lampa.Storage && Lampa.Storage.set) Lampa.Storage.set(String(key), String(value)); } catch (_) { }
    try { if (window.localStorage) localStorage.setItem(String(key), String(value)); } catch (_) { }
  }

  function log(level, msg, fields) {
    level = String(level || 'INF');
    msg = String(msg || '');
    try {
      if (window.console && console.log) {
        if (fields && typeof fields === 'object') console.log('[BL][DG][' + level + '] ' + msg, fields);
        else console.log('[BL][DG][' + level + '] ' + msg);
      }
    } catch (_) { }
  }

  function defaultsCopy() {
    return {
      dg_enabled: DG_DEFAULTS.dg_enabled,
      dg_debug_on_open: DG_DEFAULTS.dg_debug_on_open,
      dg_debug_on_fail: DG_DEFAULTS.dg_debug_on_fail,
      dg_popup_opacity: DG_DEFAULTS.dg_popup_opacity,
      dg_popup_autoclose_sec: DG_DEFAULTS.dg_popup_autoclose_sec,
      dg_block_next_ms: DG_DEFAULTS.dg_block_next_ms,
      dg_tail_sec: DG_DEFAULTS.dg_tail_sec,
      dg_false_end_jump_sec: DG_DEFAULTS.dg_false_end_jump_sec,
      dg_fake_full_enabled: DG_DEFAULTS.dg_fake_full_enabled,
      dg_false_end_enabled: DG_DEFAULTS.dg_false_end_enabled,
      dg_tick_ms: DG_DEFAULTS.dg_tick_ms,
      dg_stall_soft_ms: DG_DEFAULTS.dg_stall_soft_ms,
      dg_stall_hard_ms: DG_DEFAULTS.dg_stall_hard_ms,
      dg_recover_cooldown_ms: DG_DEFAULTS.dg_recover_cooldown_ms,
      dg_start_grace_ms: DG_DEFAULTS.dg_start_grace_ms,
      dg_next_min_remain_sec: DG_DEFAULTS.dg_next_min_remain_sec,
      dg_ct_floor_lag_sec: DG_DEFAULTS.dg_ct_floor_lag_sec,
      dg_user_action_cooldown_ms: DG_DEFAULTS.dg_user_action_cooldown_ms,
      dg_verify_ms: DG_DEFAULTS.dg_verify_ms,
      dg_hard_reset_enabled: DG_DEFAULTS.dg_hard_reset_enabled,
      dg_hard_reset_after_n: DG_DEFAULTS.dg_hard_reset_after_n
    };
  }

  function readConfig() {
    var d = defaultsCopy();
    var cfg = {
      enabled: parseBool(sGet(K.enabled, String(d.dg_enabled)), !!d.dg_enabled),
      debugOnOpen: parseBool(sGet(K.debugOnOpen, String(d.dg_debug_on_open)), !!d.dg_debug_on_open),
      debugOnFail: parseBool(sGet(K.debugOnFail, String(d.dg_debug_on_fail)), !!d.dg_debug_on_fail),
      popupOpacity: clampNum(readFloat(K.popupOpacity, d.dg_popup_opacity), 0.2, 1.0),
      popupAutocloseSec: clampInt(sGet(K.popupAutocloseSec, String(d.dg_popup_autoclose_sec)), 0, 120),
      blockNextMs: clampInt(sGet(K.blockNextMs, String(d.dg_block_next_ms)), 1000, 30000),
      tailSec: clampNum(sGet(K.tailSec, String(d.dg_tail_sec)), 0.5, 12),
      falseEndJumpSec: clampNum(sGet(K.falseEndJumpSec, String(d.dg_false_end_jump_sec)), 1, 120),
      fakeFullEnabled: parseBool(sGet(K.fakeFullEnabled, String(d.dg_fake_full_enabled)), !!d.dg_fake_full_enabled),
      falseEndEnabled: parseBool(sGet(K.falseEndEnabled, String(d.dg_false_end_enabled)), !!d.dg_false_end_enabled),
      tickMs: clampInt(sGet(K.tickMs, String(d.dg_tick_ms)), 100, 2000),
      stallSoftMs: clampInt(sGet(K.stallSoftMs, String(d.dg_stall_soft_ms)), 500, 10000),
      stallHardMs: clampInt(sGet(K.stallHardMs, String(d.dg_stall_hard_ms)), 800, 20000),
      recoverCooldownMs: clampInt(sGet(K.recoverCooldownMs, String(d.dg_recover_cooldown_ms)), 250, 20000),
      startGraceMs: clampInt(sGet(K.startGraceMs, String(d.dg_start_grace_ms)), 5000, 30000),
      nextMinRemainSec: clampNum(sGet(K.nextMinRemainSec, String(d.dg_next_min_remain_sec)), 1.0, 120.0),
      ctFloorLagSec: clampNum(sGet(K.ctFloorLagSec, String(d.dg_ct_floor_lag_sec)), 1.0, 120.0),
      userActionCooldownMs: clampInt(sGet(K.userActionCooldownMs, String(d.dg_user_action_cooldown_ms)), 200, 5000),
      verifyMs: clampInt(sGet(K.verifyMs, String(d.dg_verify_ms)), 500, 10000),
      hardResetEnabled: parseBool(sGet(K.hardResetEnabled, String(d.dg_hard_reset_enabled)), !!d.dg_hard_reset_enabled),
      hardResetAfterN: clampInt(sGet(K.hardResetAfterN, String(d.dg_hard_reset_after_n)), 1, 10)
    };

    if (cfg.stallHardMs <= cfg.stallSoftMs) cfg.stallHardMs = cfg.stallSoftMs + 250;

    STATE.cfg = cfg;
    STATE.enabled = !!cfg.enabled;
    STATE.lastCfgReadTs = nowMs();
    return cfg;
  }

  function hash32(str) {
    str = String(str || '');
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
    }
    return (h >>> 0).toString(16);
  }

  function shortKey(k) {
    k = String(k || '');
    if (!k) return '';
    var h = hash32(k);
    return h.slice(0, 8);
  }

  function nowSec() {
    return nowMs() / 1000;
  }

  function getPlayDataSig() {
    var sig = '';
    try {
      if (window.Lampa && Lampa.Player && typeof Lampa.Player.playdata === 'function') {
        var pd = Lampa.Player.playdata() || null;
        if (pd) {
          sig = [
            String(pd.id || pd.kp || pd.imdb || ''),
            String(pd.season !== undefined ? pd.season : ''),
            String(pd.episode !== undefined ? pd.episode : '')
          ].join('|');
        }
      }
    } catch (_) { sig = ''; }
    return sig;
  }

  function srcSig(src) {
    src = String(src || '');
    if (!src) return '';
    try {
      var u = src;
      var q = u.indexOf('?');
      if (q >= 0) u = u.slice(0, q);
      var h = u.indexOf('#');
      if (h >= 0) u = u.slice(0, h);
      return hash32(u);
    } catch (_) {
      return hash32(src);
    }
  }

  function getVideo() {
    try {
      if (window.Lampa && Lampa.PlayerVideo && typeof Lampa.PlayerVideo.video === 'function') {
        var v = Lampa.PlayerVideo.video();
        if (v && typeof v === 'object') return v;
      }
    } catch (_) { }
    return null;
  }

  function getCurrentSrc(video) {
    video = video || STATE.media.video || getVideo();
    if (!video) return '';
    try {
      if (video.currentSrc) return String(video.currentSrc || '');
      if (video.src) return String(video.src || '');
    } catch (_) { }
    return '';
  }

  function sessionHiddenGraceMs() {
    return 750;
  }

  function sessionExitLeftMs() {
    return Math.max(0, toInt(STATE.life.exitingUntilTs, 0) - nowMs());
  }

  function isVideoUsable(video) {
    if (!video || typeof video !== 'object') return false;

    try {
      if (('isConnected' in video) && video.isConnected === false) return false;
    } catch (_) { }

    var rect = null;
    try { if (typeof video.getBoundingClientRect === 'function') rect = video.getBoundingClientRect(); } catch (_) { rect = null; }
    if (rect) {
      var w = Math.max(0, toNum(rect.width, 0));
      var h = Math.max(0, toNum(rect.height, 0));
      if (w <= 20 || h <= 20 || (w * h) <= 1000) return false;
    }

    var cs = null;
    try { if (window.getComputedStyle) cs = window.getComputedStyle(video); } catch (_) { cs = null; }
    if (cs) {
      try {
        if (String(cs.display || '').toLowerCase() === 'none') return false;
        if (String(cs.visibility || '').toLowerCase() === 'hidden') return false;
        var op = toNum(cs.opacity, 1);
        if (isFinite(op) && op <= 0.01) return false;
      } catch (_) { }
    }

    return true;
  }

  function sessionOperational(video) {
    if (!STATE.enabled) return false;
    if (!STATE.life.sessionActive) return false;
    if (sessionExitLeftMs() > 0) return false;
    video = video || STATE.media.video || getVideo();
    if (!isVideoUsable(video)) return false;
    return true;
  }

  function enterSession(reason, opts) {
    opts = opts || {};
    reason = String(reason || 'enter');
    if (!STATE.enabled) return false;
    if (!opts.force && sessionExitLeftMs() > 0) return false;

    var nowT = nowMs();
    var wasActive = !!STATE.life.sessionActive;
    var prevSessionId = toInt(STATE.life.sessionId, 0);
    var firstEntry = !wasActive && prevSessionId <= 0;

    if (!wasActive) STATE.life.sessionId = prevSessionId + 1;
    STATE.life.sessionActive = true;
    STATE.life.active = true;
    STATE.life.hiddenSinceTs = 0;
    STATE.life.exitingUntilTs = 0;
    STATE.life.lastSessionReason = 'enter:' + reason;
    STATE.life.lastStartTs = nowT;

    if (!!opts.reset || firstEntry) {
      resetRuntimeState('enter:' + reason);
    }

    STATE.media.startupUntilTs = nowT + clampInt(toInt(STATE.cfg.startGraceMs, 18000), 5000, 30000);
    STATE.media.startupStartCt = NaN;
    STATE.media.startupSoftTried = 0;
    STATE.media.startupKickTs = 0;
    STATE.media.playbackProven = false;
    STATE.media.playbackProvenTs = 0;
    clearFalseEndSuspect('enter_session');

    startTimer();
    if (!STATE.recovery.active && STATE.stage.name === ST.IDLE) setStage(ST.LOADING, 'enter:' + reason);
    return true;
  }

  function leaveSession(reason, opts) {
    opts = opts || {};
    reason = String(reason || 'leave');

    var nowT = nowMs();
    var wasSessionActive = !!STATE.life.sessionActive;
    var exitMs = clampInt(toInt(opts.exitMs, 3200), 2500, 4000);
    STATE.life.exitingUntilTs = Math.max(toInt(STATE.life.exitingUntilTs, 0), nowT + exitMs);
    STATE.life.hiddenSinceTs = 0;
    STATE.life.sessionActive = false;
    STATE.life.active = false;
    STATE.life.lastSessionReason = 'leave:' + reason;
    STATE.life.lastStopTs = nowT;

    var v = STATE.media.video || getVideo();
    if (wasSessionActive && opts.bestEffortStop !== false && v) {
      try { if (typeof v.pause === 'function') v.pause(); } catch (_) { }
      if (opts.hardStop) {
        try { if (typeof v.removeAttribute === 'function') v.removeAttribute('src'); } catch (_) { }
        try { v.src = ''; } catch (_) { }
        try { if (typeof v.load === 'function') v.load(); } catch (_) { }
      }
    }

    if (wasSessionActive && opts.destroyOnExit) {
      try {
        if ((nowT - toInt(STATE.life.lastDestroyTs, 0)) > 1000
          && window.Lampa && Lampa.PlayerVideo && typeof Lampa.PlayerVideo.destroy === 'function') {
          STATE.life.lastDestroyTs = nowT;
          try { Lampa.PlayerVideo.destroy(true); } catch (_) { }
        }
      } catch (_) { }
    }

    stopTimer();
    detachVideoListeners();

    STATE.recovery.active = false;
    STATE.recovery.token = toInt(STATE.recovery.token, 0) + 1;
    STATE.recovery.step = '';
    STATE.recovery.verifyUntilTs = 0;
    STATE.recovery.trigger = '';
    STATE.recovery.lastAction = 'leave_session';

    STATE.guard.blockNextUntilTs = 0;
    STATE.guard.blockReason = '';
    clearFalseEndSuspect('leave_session');

    STATE.user.pendingCmd = '';
    STATE.user.pendingTs = 0;
    STATE.user.userPausedLatched = 0;
    STATE.user.userPausedTs = 0;
    STATE.user.userSeekUntilTs = 0;
    STATE.user.userSeekCommitUntilTs = 0;
    STATE.user.lastUserSeekCt = NaN;
    STATE.user.lastUserSeekTs = 0;
    STATE.user.userActionUntilTs = 0;

    setPauseOwner('none', 'leave_session');
    setStage(ST.IDLE, 'leave:' + reason);
    popupHide('leave_session');
    log('INF', 'session_leave', {
      reason: reason,
      exitMs: exitMs,
      sessionId: toInt(STATE.life.sessionId, 0)
    });
    return true;
  }

  function normalizeCommand(rawType) {
    var t = String(rawType || '').toLowerCase().trim();
    if (!t) return '';
    var exitLike = /(^|[._:\-])(exit|back|return|close|destroy|stop|cancel|hide)($|[._:\-])/;

    if (t === 'controller.pause') return 'pause';
    if (t === 'controller.play') return 'play';
    if (t === 'controller.toggle') return 'toggle';
    if (t === 'controller.stop') return 'exit';
    if (t === 'controller.back' || t === 'controller.return' || t === 'controller.exit') return 'exit';
    if (t.indexOf('controller.seek') === 0 || t === 'controller.forward' || t === 'controller.rewind') return 'seek';
    if (exitLike.test(t)) return 'exit';

    if (t === 'pause') return 'pause';
    if (t === 'play' || t === 'resume') return 'play';
    if (t === 'toggle' || t === 'toggle_pause' || t === 'toggle_play') return 'toggle';
    if (t === 'seek' || t === 'forward' || t === 'rewind' || t === 'backward' || t === 'to' || t === 'totime' || t === 'to_time') return 'seek';
    if (t === 'back' || t === 'return' || t === 'exit' || t === 'close' || t === 'cancel') return 'exit';

    return '';
  }

  function isMediaEventType(rawType) {
    var t = String(rawType || '').toLowerCase().trim();
    return t === 'playing' || t === 'canplay' || t === 'timeupdate' || t === 'progress' || t === 'ended';
  }

  function markInput(kind, payload) {
    var ts = nowMs();
    STATE.input.lastInputTs = ts;
    if (kind === 'key') {
      STATE.input.lastKeyTs = ts;
      STATE.input.lastKey = String(payload || '');
    } else if (kind === 'pointer') {
      STATE.input.lastPointerTs = ts;
    }
  }

  function installInputMonitor() {
    if (STATE.input.installed) return true;
    if (!window || !window.addEventListener) return false;

    var onKey = function (e) {
      var k = '';
      try { k = String((e && (e.key || e.code)) || ''); } catch (_) { k = ''; }
      markInput('key', k);
    };

    var onPointer = function () {
      markInput('pointer', '');
    };

    try { window.addEventListener('keydown', onKey, true); } catch (_) { }
    try { window.addEventListener('mousedown', onPointer, true); } catch (_) { }
    try { window.addEventListener('touchstart', onPointer, true); } catch (_) { }

    STATE.input.installed = true;
    return true;
  }

  function isUserIntent(rawType) {
    rawType = String(rawType || '').toLowerCase();
    if (rawType.indexOf('controller.') === 0) return true;
    return ageMs(STATE.input.lastInputTs) <= 600;
  }

  function markUserAction(why) {
    var ms = clampInt(toInt(STATE.cfg.userActionCooldownMs, 1500), 200, 5000);
    STATE.user.userActionUntilTs = Math.max(toInt(STATE.user.userActionUntilTs, 0), nowMs() + ms);
    if (why) log('DBG', 'user_action_cooldown', { why: String(why), ms: ms });
  }

  function userActionCooldownActive() {
    return nowMs() < toInt(STATE.user.userActionUntilTs, 0);
  }

  function isExplicitUserNextIntent(rawType, payload) {
    var t = String(rawType || '').toLowerCase();
    if (!t) return false;
    if (t.indexOf('controller.next') >= 0 || t.indexOf('controller.select') >= 0) return true;
    if (payload && typeof payload === 'object') {
      try {
        if (payload.user === true || payload.by_user === true || payload.byUser === true) return true;
      } catch (_) { }
    }
    if (isUserIntent(t) && (t.indexOf('next') >= 0 || t.indexOf('select') >= 0)) return true;
    return false;
  }

  function userSeekWindowActive() {
    return nowMs() < toInt(STATE.user.userSeekUntilTs, 0);
  }

  function userSeekCommitActive() {
    return nowMs() < toInt(STATE.user.userSeekCommitUntilTs, 0);
  }

  function armUserSeekWindow(ms, why) {
    ms = clampInt(ms || 1200, 300, 6000);
    STATE.user.userSeekUntilTs = Math.max(toInt(STATE.user.userSeekUntilTs, 0), nowMs() + ms);
    if (why) log('DBG', 'user_seek_window', { ms: ms, why: String(why) });
  }

  function setUserPausedLatched(v, why) {
    var on = !!v;
    STATE.user.userPausedLatched = on ? 1 : 0;
    STATE.user.userPausedTs = on ? nowMs() : 0;
    if (on) setPauseOwner('user', why || 'user_pause_latched');
    else setPauseOwner('none', why || 'user_pause_cleared');
  }

  function extractSeekTargetSec(payload) {
    if (!payload || typeof payload !== 'object') return NaN;
    var keys = ['targetSec', 'target', 'sec', 'seconds', 'time', 'to', 'position', 'value', 'currentTime'];
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (!Object.prototype.hasOwnProperty.call(payload, k)) continue;
      var n = toNum(payload[k], NaN);
      if (isFinite(n) && n >= 0) return n;
    }
    return NaN;
  }

  function commitUserSeekPoint(ct, why) {
    var nowT = nowMs();
    ct = toNum(ct, NaN);
    if (!isFinite(ct) || ct < 0) return false;

    STATE.user.lastUserSeekCt = ct;
    STATE.user.lastUserSeekTs = nowT;
    STATE.user.userSeekCommitUntilTs = Math.max(toInt(STATE.user.userSeekCommitUntilTs, 0), nowT + 4000);

    STATE.media.lastGoodCt = ct;
    STATE.media.lastGoodTs = nowT;
    STATE.media.recentCtFloor = Math.max(0, ct - 1.0);
    STATE.media.lastCt = ct;
    STATE.media.lastCtTs = nowT;

    clearFalseEndSuspect('user_seek_commit');

    STATE.recovery.lastReason = '';
    STATE.recovery.lastTrigger = '';
    STATE.recovery.suppressUntilTs = 0;
    if (STATE.recovery.active) {
      STATE.recovery.active = false;
      STATE.recovery.token = toInt(STATE.recovery.token, 0) + 1;
    }
    STATE.recovery.step = '';
    STATE.recovery.verifyUntilTs = 0;

    if (why) {
      log('DBG', 'user_seek_commit', {
        why: String(why),
        ct: toNum(ct, 0),
        commitLeftMs: Math.max(0, toInt(STATE.user.userSeekCommitUntilTs, 0) - nowT)
      });
    }
    return true;
  }

  function setPauseOwner(owner, why) {
    owner = String(owner || 'none');
    STATE.user.pauseOwner = owner;
    STATE.user.pauseOwnerTs = nowMs();
    if (owner === 'user') {
      STATE.user.userPauseUntilTs = Math.max(toInt(STATE.user.userPauseUntilTs, 0), nowMs() + 1200);
    } else if (owner === 'none') {
      STATE.user.userPauseUntilTs = 0;
    }
    if (why) log('DBG', 'pause_owner', { owner: owner, why: String(why || '') });
  }

  function isUserPaused() {
    if (!STATE.media.paused) return false;
    if (toInt(STATE.user.userPausedLatched, 0) === 1) return true;
    if (STATE.user.pendingCmd === 'pause' && ageMs(STATE.user.pendingTs) <= 800) return true;
    return false;
  }

  function isInternalPaused() {
    return !!STATE.media.paused && !isUserPaused();
  }

  function handleUserCommand(rawType, payload) {
    rawType = String(rawType || '').toLowerCase();
    var norm = normalizeCommand(rawType);
    if (!norm) return;
    if (isMediaEventType(rawType)) return;

    var payloadUser = false;
    if (payload && typeof payload === 'object') {
      try { payloadUser = (payload.user === true || payload.by_user === true || payload.byUser === true); } catch (_) { payloadUser = false; }
    }
    var rawIsController = rawType.indexOf('controller.') === 0;
    if (!rawIsController && !payloadUser && (norm === 'pause' || norm === 'play' || norm === 'seek' || norm === 'toggle')) return;

    var intent = rawIsController || payloadUser || isUserIntent(rawType);
    if (!intent) return;
    if (!STATE.life.sessionActive && (norm === 'pause' || norm === 'play' || norm === 'seek' || norm === 'toggle')) return;

    if (norm === 'toggle') {
      norm = (STATE.media.paused || toInt(STATE.user.userPausedLatched, 0) === 1) ? 'play' : 'pause';
    }

    if (norm === 'pause' || norm === 'play' || norm === 'seek' || norm === 'exit') {
      STATE.user.pendingCmd = norm;
      STATE.user.pendingTs = nowMs();
      STATE.user.lastCmdNorm = norm;
      STATE.user.lastCmdTs = nowMs();
      markUserAction('cmd_' + norm);
    }

    if (norm === 'pause') {
      setUserPausedLatched(true, 'cmd_pause');
      setStage(ST.SUSPENDED, 'paused(user)');
    } else if (norm === 'play') {
      setUserPausedLatched(false, 'cmd_play');
      if (!STATE.recovery.active) setStage(ST.TRACKING, 'play(user)');
    } else if (norm === 'seek') {
      armUserSeekWindow(3000, 'cmd_seek');
      var seekTarget = extractSeekTargetSec(payload);
      if (isFinite(seekTarget)) commitUserSeekPoint(seekTarget, 'cmd_seek');
    } else if (norm === 'exit') {
      armUserSeekWindow(1500, 'cmd_exit');
      setUserPausedLatched(false, 'cmd_exit');
      if (STATE.life.sessionActive) leaveSession('user_exit', { destroyOnExit: true, bestEffortStop: true, hardStop: true, exitMs: 3600 });
    }

    if (payload && typeof payload === 'object') {
      // keep for debug only
    }
  }

  function withCacheBust(src) {
    src = String(src || '');
    if (!src) return src;
    var sep = src.indexOf('?') >= 0 ? '&' : '?';
    return src + sep + '__dgts=' + String(nowMs());
  }

  function parseBuffered(video, ct, dur) {
    var out = {
      count: 0,
      start: NaN,
      end: NaN,
      coverage: 0,
      ahead: 0
    };

    if (!video || !video.buffered) return out;
    var b = video.buffered;
    var len = 0;
    try { len = toInt(b.length, 0); } catch (_) { len = 0; }
    if (!len) return out;

    var firstStart = NaN;
    var maxEnd = NaN;
    var activeEnd = NaN;
    var total = 0;

    for (var i = 0; i < len; i++) {
      var s = NaN;
      var e = NaN;
      try {
        s = toNum(b.start(i), NaN);
        e = toNum(b.end(i), NaN);
      } catch (_) { s = NaN; e = NaN; }
      if (!isFinite(s) || !isFinite(e) || e < s) continue;
      out.count++;
      if (!isFinite(firstStart) || s < firstStart) firstStart = s;
      if (!isFinite(maxEnd) || e > maxEnd) maxEnd = e;
      if (isFinite(ct) && ct >= s && ct <= e) activeEnd = e;
      total += Math.max(0, e - s);
    }

    out.start = firstStart;
    out.end = isFinite(activeEnd) ? activeEnd : maxEnd;
    if (isFinite(out.end) && isFinite(ct)) out.ahead = Math.max(0, out.end - ct);
    if (isFinite(dur) && dur > 0) out.coverage = Math.max(0, Math.min(1, total / dur));

    return out;
  }

  function eventAgeTs(ts) {
    return ageMs(toInt(ts, 0));
  }

  function markEvent(name) {
    var ts = nowMs();
    if (name === 'timeupdate') STATE.media.lastTimeupdateTs = ts;
    else if (name === 'progress') STATE.media.lastProgressTs = ts;
    else if (name === 'waiting') STATE.media.lastWaitingTs = ts;
    else if (name === 'stalled') STATE.media.lastStalledTs = ts;
    else if (name === 'ended') STATE.media.lastEndedTs = ts;
    else if (name === 'playing') STATE.media.lastPlayingTs = ts;
    else if (name === 'canplay') STATE.media.lastCanplayTs = ts;
    else if (name === 'pause') STATE.media.lastPauseTs = ts;
    else if (name === 'play') STATE.media.lastPlayTs = ts;
    else if (name === 'seeked' || name === 'seeking') STATE.media.lastSeekTs = ts;
  }

  function readFrameCount(video) {
    if (!video) return NaN;
    try {
      if (typeof video.getVideoPlaybackQuality === 'function') {
        var q = video.getVideoPlaybackQuality();
        if (q && isFinite(toNum(q.totalVideoFrames, NaN))) return toNum(q.totalVideoFrames, NaN);
      }
    } catch (_) { }
    try {
      if (isFinite(toNum(video.webkitDecodedFrameCount, NaN))) return toNum(video.webkitDecodedFrameCount, NaN);
    } catch (_) { }
    return NaN;
  }

  function updateFrameState(video) {
    var ts = nowMs();
    var fc = readFrameCount(video);
    if (!isFinite(fc)) {
      if (toInt(STATE.media.frameCallbackId, 0) > 0 || toInt(STATE.media.frameLastTs, 0) > 0) {
        STATE.media.frameSupported = true;
      }
      return;
    }

    STATE.media.frameSupported = true;
    if (!isFinite(toNum(STATE.media.frameLastCount, NaN))) {
      STATE.media.frameLastCount = fc;
      STATE.media.frameLastTs = ts;
      return;
    }

    if (fc !== toNum(STATE.media.frameLastCount, -1)) {
      STATE.media.frameLastCount = fc;
      STATE.media.frameLastTs = ts;
      return;
    }
  }

  function armVideoFrameCallback(video) {
    if (!video || typeof video.requestVideoFrameCallback !== 'function') return;
    if (STATE.media.frameCallbackId) return;

    var bound = function () {
      if (video !== STATE.media.video) {
        STATE.media.frameCallbackId = 0;
        return;
      }
      STATE.media.frameSupported = true;
      STATE.media.frameLastTs = nowMs();
      try {
        STATE.media.frameCallbackId = video.requestVideoFrameCallback(bound);
      } catch (_) {
        STATE.media.frameCallbackId = 0;
      }
    };

    STATE.media.frameCallbackBound = bound;
    try {
      STATE.media.frameCallbackId = video.requestVideoFrameCallback(bound);
    } catch (_) {
      STATE.media.frameCallbackId = 0;
    }
  }

  function cancelVideoFrameCallback(video) {
    video = video || STATE.media.video;
    if (!video) return;
    try {
      if (STATE.media.frameCallbackId && typeof video.cancelVideoFrameCallback === 'function') {
        video.cancelVideoFrameCallback(STATE.media.frameCallbackId);
      }
    } catch (_) { }
    STATE.media.frameCallbackId = 0;
    STATE.media.frameCallbackBound = null;
  }

  function enforceUserPauseHold(video, why) {
    if (!video || toInt(STATE.user.userPausedLatched, 0) !== 1) return false;
    setTimeout(function () {
      try {
        if (video && !video.paused && typeof video.pause === 'function') video.pause();
      } catch (_) { }
      setPauseOwner('user', why || 'user_paused_hold');
      setStage(ST.SUSPENDED, 'user_paused_hold');
    }, 0);
    return true;
  }

  function attachVideoListeners(video) {
    if (!video) return;
    if (STATE.media.video === video && STATE.media.listeners) return;

    detachVideoListeners();

    var h = {};
    function add(ev, fn) {
      h[ev] = fn;
      try { video.addEventListener(ev, fn, true); } catch (_) { try { video.addEventListener(ev, fn); } catch (__e) { } }
    }

    add('timeupdate', function () { markEvent('timeupdate'); });
    add('progress', function () { markEvent('progress'); });
    add('waiting', function () { markEvent('waiting'); });
    add('stalled', function () { markEvent('stalled'); });
    add('canplay', function () { markEvent('canplay'); });
    add('ended', function () { markEvent('ended'); });
    add('playing', function () {
      markEvent('playing');
      if (enforceUserPauseHold(video, 'video_playing_hold')) return;
      setPauseOwner('none', 'video_playing');
    });
    add('play', function () {
      markEvent('play');
      if (enforceUserPauseHold(video, 'video_play_hold')) return;
      setPauseOwner('none', 'video_play');
    });
    add('pause', function () {
      markEvent('pause');
      if (STATE.user.pendingCmd === 'pause' && ageMs(STATE.user.pendingTs) <= 800) setPauseOwner('user', 'video_pause_user');
      else if (toInt(STATE.user.userPausedLatched, 0) === 1) setPauseOwner('user', 'video_pause_latched');
      else setPauseOwner('internal', 'video_pause_internal');
    });
    add('seeking', function () {
      markEvent('seeking');
      armUserSeekWindow(3000, 'video_seeking');
    });
    add('seeked', function () {
      markEvent('seeked');
      armUserSeekWindow(2500, 'video_seeked');
      commitUserSeekPoint(safe(function () { return toNum(video.currentTime, NaN); }, NaN), 'video_seeked');
    });

    STATE.media.video = video;
    STATE.media.listeners = h;
    armVideoFrameCallback(video);
  }

  function detachVideoListeners() {
    var v = STATE.media.video;
    var h = STATE.media.listeners;
    if (v && h) {
      for (var k in h) {
        if (!Object.prototype.hasOwnProperty.call(h, k)) continue;
        try { v.removeEventListener(k, h[k], true); } catch (_) { try { v.removeEventListener(k, h[k]); } catch (__e) { } }
      }
    }
    cancelVideoFrameCallback(v);
    STATE.media.listeners = null;
    STATE.media.video = null;
  }

  function computeContentKey(video, ct, dur) {
    var src = getCurrentSrc(video);
    var sig = srcSig(src);
    var playSig = getPlayDataSig();
    var dBucket = isFinite(dur) ? String(Math.round(dur)) : '';
    var cKey = [sig, playSig, dBucket].join('|');
    return {
      srcSig: sig,
      contentKey: cKey,
      short: shortKey(cKey)
    };
  }

  function resetRuntimeState(reason) {
    reason = String(reason || 'reset');

    STATE.media.ring = [];
    STATE.media.lastGoodCt = NaN;
    STATE.media.lastGoodTs = 0;
    STATE.media.recentCtFloor = 0;
    STATE.media.maxSeenCt = NaN;
    STATE.media.startupUntilTs = 0;
    STATE.media.startupStartCt = NaN;
    STATE.media.startupSoftTried = 0;
    STATE.media.startupKickTs = 0;
    STATE.media.playbackProven = false;
    STATE.media.playbackProvenTs = 0;

    STATE.user.lastUserSeekCt = NaN;
    STATE.user.lastUserSeekTs = 0;
    STATE.user.userSeekCommitUntilTs = 0;
    STATE.user.userPausedLatched = 0;
    STATE.user.userPausedTs = 0;
    STATE.user.userActionUntilTs = 0;

    STATE.recovery.active = false;
    STATE.recovery.step = '';
    STATE.recovery.trigger = '';
    STATE.recovery.failCounter = 0;
    STATE.recovery.backoffFactor = 0;
    STATE.recovery.lastAttemptTs = 0;
    STATE.recovery.lastAttemptSig = '';
    STATE.recovery.lastTriggerHash = '';
    STATE.recovery.suppressUntilTs = 0;
    STATE.recovery.verifyUntilTs = 0;
    STATE.recovery.verifyStartCt = NaN;
    STATE.recovery.verifyTarget = NaN;
    STATE.recovery.sessionId = 0;
    STATE.recovery.contentKey = '';
    STATE.recovery.lastErr = '';

    STATE.guard.blockNextUntilTs = 0;
    STATE.guard.blockReason = '';
    clearFalseEndSuspect('runtime_reset');

    setStage(ST.IDLE, 'reset:' + reason);
    log('INF', 'state_reset', { reason: reason });
  }

  function onContentChanged(newKey, reason) {
    STATE.media.contentKey = String(newKey.contentKey || '');
    STATE.media.srcSig = String(newKey.srcSig || '');
    STATE.media.contentKeyShort = String(newKey.short || '');

    STATE.media.ring = [];
    STATE.media.lastGoodCt = NaN;
    STATE.media.lastGoodTs = 0;
    STATE.media.recentCtFloor = 0;
    STATE.media.maxSeenCt = NaN;
    STATE.media.startupUntilTs = nowMs() + clampInt(toInt(STATE.cfg.startGraceMs, 18000), 5000, 30000);
    STATE.media.startupStartCt = NaN;
    STATE.media.startupSoftTried = 0;
    STATE.media.startupKickTs = 0;
    STATE.media.playbackProven = false;
    STATE.media.playbackProvenTs = 0;

    STATE.user.lastUserSeekCt = NaN;
    STATE.user.lastUserSeekTs = 0;
    STATE.user.userSeekCommitUntilTs = 0;
    STATE.user.userPausedLatched = 0;
    STATE.user.userPausedTs = 0;
    STATE.user.userActionUntilTs = 0;

    STATE.recovery.failCounter = 0;
    STATE.recovery.backoffFactor = 0;
    STATE.recovery.active = false;
    STATE.recovery.step = '';
    STATE.recovery.trigger = '';
    STATE.recovery.lastAttemptTs = 0;
    STATE.recovery.lastAttemptSig = '';
    STATE.recovery.lastTriggerHash = '';
    STATE.recovery.suppressUntilTs = 0;
    STATE.recovery.verifyUntilTs = 0;
    STATE.recovery.verifyStartCt = NaN;
    STATE.recovery.verifyTarget = NaN;
    STATE.recovery.sessionId = 0;
    STATE.recovery.contentKey = '';
    STATE.recovery.lastErr = '';

    STATE.guard.blockNextUntilTs = 0;
    STATE.guard.blockReason = '';
    clearFalseEndSuspect('content_change');

    setPauseOwner('none', 'content_change');
    setStage(ST.LOADING, 'content_changed:' + String(reason || 'tick'));
    log('INF', 'content_changed', { key: STATE.media.contentKeyShort, reason: String(reason || '') });
  }

  function pushRing(ct, dur, ts) {
    if (!isFinite(ct) || !isFinite(dur) || dur <= 0) return;

    var arr = STATE.media.ring;
    var prev = arr.length ? arr[arr.length - 1] : null;
    var dCt = prev && isFinite(toNum(prev.ct, NaN)) ? (ct - toNum(prev.ct, 0)) : 0;

    arr.push({
      ts: ts,
      ct: ct,
      dur: dur,
      nearTail: ct >= (dur - Math.max(0.5, toNum(STATE.cfg.tailSec, 3.0))),
      dCt: dCt
    });

    if (arr.length > 160) arr.splice(0, arr.length - 160);

    if (userSeekWindowActive() || isUserPaused()) return;
    if (STATE.recovery.active) return;

    if (!isFinite(toNum(STATE.media.maxSeenCt, NaN))) STATE.media.maxSeenCt = ct;
    else STATE.media.maxSeenCt = Math.max(toNum(STATE.media.maxSeenCt, 0), ct);

    var tailSec = Math.max(0.5, toNum(STATE.cfg.tailSec, 3.0));
    var nearTail = ct >= (dur - tailSec);
    var falseTailJump = dur >= 60
      && !userSeekWindowActive()
      && !userSeekCommitActive()
      && nearTail
      && dCt >= Math.max(1, toNum(STATE.cfg.falseEndJumpSec, 10.0));
    if (falseTailJump) {
      setFalseEndSuspect({ ct: ct }, prev ? toNum(prev.ct, NaN) : NaN, 'tail_jump');
      return;
    }

    var suspiciousJump = !userSeekCommitActive() && dCt >= Math.max(6, toNum(STATE.cfg.falseEndJumpSec, 10.0));
    if (suspiciousJump) return;

    if (dCt > 0.03) {
      STATE.media.lastGoodCt = ct;
      STATE.media.recentCtFloor = Math.max(0, ct - Math.max(1, toNum(STATE.cfg.ctFloorLagSec, 30.0)));
      STATE.media.lastGoodTs = ts;
      clearFalseEndSuspect('flow_progress');
    }
  }

  function collectSnapshot() {
    var ts = nowMs();
    var v = getVideo();
    var videoUsable = isVideoUsable(v);

    if (videoUsable) {
      STATE.life.hiddenSinceTs = 0;
      if (!STATE.life.sessionActive) enterSession('video_visible');
      if (v) attachVideoListeners(v);
    } else {
      if (v || STATE.life.sessionActive) {
        if (!toInt(STATE.life.hiddenSinceTs, 0)) STATE.life.hiddenSinceTs = ts;
        if (STATE.life.sessionActive && ageMs(STATE.life.hiddenSinceTs) >= sessionHiddenGraceMs()) {
          leaveSession('video_hidden', { bestEffortStop: true, hardStop: true, exitMs: 3200 });
        }
      } else {
        STATE.life.hiddenSinceTs = 0;
      }
    }

    var ct = NaN;
    var dur = NaN;
    var ctDelta = 0;
    var paused = false;
    var rs = 0;
    var ns = 0;

    if (v) {
      ct = toNum(v.currentTime, NaN);
      dur = toNum(v.duration, NaN);
      paused = !!v.paused;
      rs = toInt(v.readyState, 0);
      ns = toInt(v.networkState, 0);
      updateFrameState(v);
    }

    var prevCt = toNum(STATE.media.lastCt, NaN);
    if (isFinite(ct) && isFinite(prevCt)) ctDelta = ct - prevCt;

    STATE.media.ct = ct;
    STATE.media.dur = dur;
    STATE.media.paused = paused;
    STATE.media.readyState = rs;
    STATE.media.networkState = ns;

    if (isFinite(ct)) {
      if (!isFinite(toNum(STATE.media.lastCt, NaN))) {
        STATE.media.lastCt = ct;
        STATE.media.lastCtTs = ts;
      } else if (Math.abs(ct - toNum(STATE.media.lastCt, 0)) >= 0.02) {
        STATE.media.lastCt = ct;
        STATE.media.lastCtTs = ts;
      }
    }

    if (STATE.life.sessionActive && videoUsable) {
      if (!isFinite(toNum(STATE.media.startupStartCt, NaN)) && isFinite(ct)) STATE.media.startupStartCt = ct;
      if (!STATE.media.playbackProven) {
        var startCt = toNum(STATE.media.startupStartCt, NaN);
        var ctProgress = isFinite(startCt) && isFinite(ct) && (ct - startCt) >= 0.3;
        var tuFresh = eventAgeTs(STATE.media.lastTimeupdateTs) <= 900;
        var playingFresh = eventAgeTs(STATE.media.lastPlayingTs) <= 3000;
        var canplayFresh = eventAgeTs(STATE.media.lastCanplayTs) <= 3000;
        var frameFresh = STATE.media.frameSupported && eventAgeTs(STATE.media.frameLastTs) <= 900;
        if (ctProgress || (tuFresh && (playingFresh || canplayFresh)) || frameFresh) {
          STATE.media.playbackProven = true;
          STATE.media.playbackProvenTs = ts;
          clearFalseEndSuspect('playback_proven');
          log('INF', 'playback_proven', {
            ct: toNum(ct, NaN),
            ctProgress: ctProgress ? 1 : 0,
            tuFresh: tuFresh ? 1 : 0,
            canplayFresh: canplayFresh ? 1 : 0,
            frameFresh: frameFresh ? 1 : 0
          });
        }
      }
    }

    var b = parseBuffered(v, ct, dur);
    STATE.media.bufferStart = b.start;
    STATE.media.bufferEnd = b.end;
    STATE.media.bufferCount = b.count;
    STATE.media.bufferCoverage = b.coverage;
    STATE.media.aheadSec = b.ahead;

    if (isFinite(toNum(b.end, NaN))) {
      if (!isFinite(toNum(STATE.media._lastBufferEnd, NaN))) {
        STATE.media._lastBufferEnd = b.end;
        STATE.media.lastBufMoveTs = ts;
      } else if (Math.abs(toNum(b.end, 0) - toNum(STATE.media._lastBufferEnd, 0)) >= 0.2) {
        STATE.media._lastBufferEnd = b.end;
        STATE.media.lastBufMoveTs = ts;
      }
    }

    if (v) {
      var ck = computeContentKey(v, ct, dur);
      if (String(ck.contentKey || '') !== String(STATE.media.contentKey || '')) {
        onContentChanged(ck, 'snapshot');
      } else {
        STATE.media.srcSig = ck.srcSig;
        STATE.media.contentKeyShort = ck.short;
      }
    }

    pushRing(ct, dur, ts);

    STATE.life.active = !!v;
    if (v && !toInt(STATE.life.lastStartTs, 0)) STATE.life.lastStartTs = ts;

    var hiddenAge = toInt(STATE.life.hiddenSinceTs, 0) ? ageMs(STATE.life.hiddenSinceTs) : 0;
    var hiddenLeft = Math.max(0, sessionHiddenGraceMs() - hiddenAge);
    var startupLeft = Math.max(0, toInt(STATE.media.startupUntilTs, 0) - ts);

    return {
      ts: ts,
      videoUsable: !!videoUsable,
      sessionActive: !!STATE.life.sessionActive,
      exitLeftMs: sessionExitLeftMs(),
      hiddenAgeMs: hiddenAge,
      hiddenLeftMs: hiddenLeft,
      playbackProven: !!STATE.media.playbackProven,
      startupLeftMs: startupLeft,
      ct: ct,
      ctDelta: ctDelta,
      dur: dur,
      paused: paused,
      readyState: rs,
      networkState: ns,
      timeupdateAgeMs: eventAgeTs(STATE.media.lastTimeupdateTs),
      progressAgeMs: eventAgeTs(STATE.media.lastProgressTs),
      waitingAgeMs: eventAgeTs(STATE.media.lastWaitingTs),
      stalledAgeMs: eventAgeTs(STATE.media.lastStalledTs),
      frameStuckMs: STATE.media.frameSupported ? eventAgeTs(STATE.media.frameLastTs) : 99999999,
      bufMoveAgeMs: eventAgeTs(STATE.media.lastBufMoveTs),
      aheadSec: toNum(STATE.media.aheadSec, 0),
      bufferCoverage: toNum(STATE.media.bufferCoverage, 0),
      bufferStart: STATE.media.bufferStart,
      bufferEnd: STATE.media.bufferEnd
    };
  }

  function stageBlocksNext() {
    var n = String(STATE.stage.name || '');
    return n === ST.LOADING || n === ST.STALL || n === ST.RECOVERING || n === ST.VERIFYING;
  }

  function blockNextLeftMs() {
    return Math.max(0, toInt(STATE.guard.blockNextUntilTs, 0) - nowMs());
  }

  function armBlockNext(ms, reason) {
    ms = clampInt(ms || STATE.cfg.blockNextMs, 500, 60000);
    var until = nowMs() + ms;
    if (until > toInt(STATE.guard.blockNextUntilTs, 0)) STATE.guard.blockNextUntilTs = until;
    STATE.guard.blockReason = String(reason || 'guard');
  }

  function clearFalseEndSuspect(why) {
    STATE.guard.falseEndSuspectActive = 0;
    STATE.guard.falseEndSuspectTs = 0;
    STATE.guard.falseEndSuspectCt = NaN;
    STATE.guard.falseEndSuspectPrevCt = NaN;
    STATE.guard.falseEndSuspectReason = '';
    if (why) log('DBG', 'false_end_suspect_clear', { why: String(why) });
  }

  function setFalseEndSuspect(snapshot, prevCt, why) {
    snapshot = snapshot || {};
    STATE.guard.falseEndSuspectActive = 1;
    STATE.guard.falseEndSuspectTs = nowMs();
    STATE.guard.falseEndSuspectCt = toNum(snapshot.ct, NaN);
    STATE.guard.falseEndSuspectPrevCt = toNum(prevCt, NaN);
    STATE.guard.falseEndSuspectReason = String(why || 'false_end_jump');
    armBlockNext(Math.max(toInt(STATE.cfg.blockNextMs, 6000), 4000), 'false_end_suspect');
    log('WRN', 'false_end_suspect', {
      reason: STATE.guard.falseEndSuspectReason,
      ct: toNum(STATE.guard.falseEndSuspectCt, NaN),
      prevCt: toNum(STATE.guard.falseEndSuspectPrevCt, NaN)
    });
  }

  function falseEndSuspectActive() {
    if (!toInt(STATE.guard.falseEndSuspectActive, 0)) return false;
    if (ageMs(STATE.guard.falseEndSuspectTs) > Math.max(2000, toInt(STATE.cfg.blockNextMs, 6000))) {
      clearFalseEndSuspect('expired');
      return false;
    }
    return true;
  }

  function setStage(stage, reason) {
    stage = String(stage || ST.IDLE);
    reason = String(reason || '');
    if (STATE.stage.name === stage && STATE.stage.reason === reason) return;

    var prev = STATE.stage.name;
    STATE.stage.name = stage;
    STATE.stage.reason = reason;
    STATE.stage.ts = nowMs();

    if ((stage === ST.RECOVERING || stage === ST.VERIFYING) && prev !== stage && STATE.cfg.debugOnFail) {
      maybeOpenPopupByEdge('stage:' + stage + ':' + reason);
    }

    if (stage === ST.FAILED && STATE.cfg.debugOnFail) {
      maybeOpenPopupByEdge('failed:' + reason);
    }
  }

  function hasNaturalTailSamples() {
    var arr = STATE.media.ring || [];
    if (arr.length < 4) return false;

    var nowT = nowMs();
    var good = 0;
    var seen = 0;

    for (var i = arr.length - 1; i > 0 && seen < 12; i--) {
      var cur = arr[i];
      var prev = arr[i - 1];
      seen++;
      if (!cur || !prev) continue;
      if ((nowT - toInt(cur.ts, 0)) > 6000) continue;
      var ctA = toNum(prev.ct, NaN);
      var ctB = toNum(cur.ct, NaN);
      var dur = toNum(cur.dur, NaN);
      if (!isFinite(ctA) || !isFinite(ctB) || !isFinite(dur) || dur <= 0) continue;
      if (!cur.nearTail && ctB < (dur - Math.max(2.8, toNum(STATE.cfg.tailSec, 3.0)))) continue;
      if ((ctB - ctA) >= 0.03 && (ctB - ctA) <= 2.5) good++;
      if (good >= 3) return true;
    }

    return false;
  }

  function shouldAllowRealEnd(snapshot) {
    if (!snapshot) return false;
    if (!sessionOperational()) return false;
    if (falseEndSuspectActive()) return false;
    if (stageBlocksNext() || STATE.recovery.active) return false;
    if (!isFinite(toNum(snapshot.ct, NaN)) || !isFinite(toNum(snapshot.dur, NaN))) return false;
    if (toNum(snapshot.ct, 0) < (toNum(snapshot.dur, 0) - 2.6)) return false;
    return hasNaturalTailSamples();
  }

  function fakeFullDetected(snapshot) {
    if (!STATE.cfg.fakeFullEnabled) return false;
    if (!snapshot || !isFinite(toNum(snapshot.dur, NaN)) || toNum(snapshot.dur, 0) <= 20) return false;

    var fullRange = isFinite(toNum(snapshot.bufferStart, NaN))
      && isFinite(toNum(snapshot.bufferEnd, NaN))
      && toNum(snapshot.bufferStart, 99) <= 0.5
      && toNum(snapshot.bufferEnd, 0) >= (toNum(snapshot.dur, 0) - toNum(STATE.cfg.tailSec, 3.0));

    if (!fullRange) return false;

    var soft = toInt(STATE.cfg.stallSoftMs, 900);
    var ctStuck = ageMs(STATE.media.lastCtTs) >= soft;
    var staleTu = toInt(snapshot.timeupdateAgeMs, 0) >= soft;
    var staleFrame = toInt(snapshot.frameStuckMs, 0) >= soft;

    return ctStuck && (staleTu || staleFrame);
  }

  function renderFreezeDetected(snapshot) {
    if (!snapshot) return false;
    if (!STATE.media.frameSupported) return false;
    if (isUserPaused()) return false;
    return toInt(snapshot.frameStuckMs, 0) >= toInt(STATE.cfg.stallHardMs, 2000);
  }

  function fakeEndJumpDetected(snapshot) {
    if (!STATE.cfg.falseEndEnabled) return false;
    if (userSeekWindowActive() || userSeekCommitActive()) return false;
    if (!snapshot || !isFinite(toNum(snapshot.ct, NaN)) || !isFinite(toNum(snapshot.dur, NaN))) return false;

    var tailSec = Math.max(0.5, toNum(STATE.cfg.tailSec, 3.0));
    if (toNum(snapshot.dur, 0) < 60) return false;
    if (toNum(snapshot.ct, 0) < (toNum(snapshot.dur, 0) - tailSec)) return false;
    var jump = Math.max(0, toNum(snapshot.ctDelta, 0));
    return jump >= Math.max(1, toNum(STATE.cfg.falseEndJumpSec, 10.0));
  }

  function stallState(snapshot) {
    var soft = toInt(STATE.cfg.stallSoftMs, 900);
    var hard = toInt(STATE.cfg.stallHardMs, 2000);

    var ctAge = ageMs(STATE.media.lastCtTs);
    var tu = toInt(snapshot.timeupdateAgeMs, 0);
    var fr = toInt(snapshot.frameStuckMs, 999999);

    var softStall = ctAge >= soft && (tu >= soft || fr >= soft);
    var hardStall = ctAge >= hard && (tu >= hard || fr >= hard);

    return {
      soft: !!softStall,
      hard: !!hardStall,
      ctAge: ctAge,
      tuAge: tu,
      frAge: fr
    };
  }

  function triggerSignature(snapshot, trigger) {
    snapshot = snapshot || {};
    var ctAgeB = Math.floor(ageMs(STATE.media.lastCtTs) / 500);
    var tuAgeB = Math.floor(toInt(snapshot.timeupdateAgeMs, 0) / 500);
    var frAgeB = Math.floor(toInt(snapshot.frameStuckMs, 0) / 500);
    var covB = Math.floor(Math.max(0, Math.min(1, toNum(snapshot.bufferCoverage, 0))) * 10);
    var aheadB = Math.floor(Math.max(0, toNum(snapshot.aheadSec, 0)));
    var raw = [
      String(trigger || 'stall'),
      String(STATE.media.contentKeyShort || STATE.media.contentKey || '-'),
      snapshot.paused ? '1' : '0',
      String(ctAgeB),
      String(tuAgeB),
      String(frAgeB),
      String(covB),
      String(aheadB)
    ].join('|');
    return shortKey(raw);
  }

  function recoveryBaseCooldownMs() {
    return clampInt(toInt(STATE.cfg.recoverCooldownMs, 2500), 250, 20000);
  }

  function recoveryInvariantOk(token) {
    if (token !== toInt(STATE.recovery.token, 0)) return false;
    if (toInt(STATE.recovery.sessionId, 0) !== toInt(STATE.life.sessionId, 0)) return false;
    if (String(STATE.recovery.contentKey || '') !== String(STATE.media.contentKey || '')) return false;
    return true;
  }

  function shouldRunRecovery() {
    if (!sessionOperational()) return false;
    if (STATE.recovery.active) return false;
    if (toInt(STATE.user.userPausedLatched, 0) === 1) return false;
    if (userActionCooldownActive()) return false;
    if (isUserPaused()) return false;
    if (nowMs() < toInt(STATE.recovery.nextAllowedTs, 0)) return false;
    return true;
  }

  function targetSec(snapshot) {
    snapshot = snapshot || {};
    var dur = toNum(snapshot.dur, NaN);
    var good = toNum(STATE.media.lastGoodCt, NaN);
    var cur = toNum(snapshot.ct, NaN);
    var nowT = nowMs();
    var prefer = toNum(STATE.user.lastUserSeekCt, NaN);
    var seekCommitActive = nowT < toInt(STATE.user.userSeekCommitUntilTs, 0);

    var t = NaN;
    if (isFinite(good) && good >= 0) t = Math.max(0, good + 0.08);
    else if (isFinite(cur) && cur >= 0) t = Math.max(0, cur);
    else t = 0;

    if (seekCommitActive && isFinite(prefer)) {
      t = Math.max(t, prefer);
    }

    if (isFinite(dur) && dur > 2) {
      t = Math.min(t, Math.max(0, dur - 2));
    }

    if (seekCommitActive && isFinite(prefer)) {
      t = Math.max(t, Math.max(0, prefer - 2.0));
    }

    return Math.max(0, t);
  }

  function waitMs(ms) {
    ms = clampInt(ms, 1, 30000);
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function applySeek(video, sec, why) {
    if (!video) return false;
    if (!sessionOperational(video)) return false;
    try {
      var dur = toNum(video.duration, NaN);
      if (isFinite(dur) && dur > 2) sec = Math.min(Math.max(0, sec), Math.max(0, dur - 1.6));
      video.currentTime = Math.max(0, sec);
      try {
        if (typeof video.play === 'function' && isInternalPaused() && toInt(STATE.user.userPausedLatched, 0) !== 1) {
          var p = video.play();
          if (p && typeof p.catch === 'function') p.catch(function () { });
        }
      } catch (_) { }
      STATE.recovery.lastAction = 'seek:' + String(why || '');
      return true;
    } catch (_) {
      return false;
    }
  }

  async function verifyFlow(token, expectedSec) {
    if (!sessionOperational()) return { ok: false, err: 'session_inactive' };
    STATE.recovery.verifyUntilTs = nowMs() + toInt(STATE.cfg.verifyMs, 1400);
    STATE.recovery.verifyStartCt = toNum(STATE.media.ct, NaN);
    STATE.recovery.verifyStartTimeupdateTs = toInt(STATE.media.lastTimeupdateTs, 0);
    STATE.recovery.verifyStartFrameTs = toInt(STATE.media.frameLastTs, 0);
    STATE.recovery.verifyTarget = toNum(expectedSec, NaN);

    setStage(ST.VERIFYING, 'verify');

    while (nowMs() < toInt(STATE.recovery.verifyUntilTs, 0)) {
      if (!recoveryInvariantOk(token)) return { ok: false, err: 'token_changed' };
      if (!sessionOperational()) return { ok: false, err: 'session_inactive' };
      var s = collectSnapshot();
      if (isUserPaused()) return { ok: false, err: 'user_paused' };

      var startCt = toNum(STATE.recovery.verifyStartCt, NaN);
      var curCt = toNum(s.ct, NaN);
      var moved = isFinite(startCt) && isFinite(curCt) && (curCt - startCt) >= 0.12;
      var tuFresh = toInt(s.timeupdateAgeMs, 999999) <= 500;
      var frameFresh = STATE.media.frameSupported && toInt(s.frameStuckMs, 999999) <= 500;

      if (moved && (tuFresh || frameFresh)) {
        STATE.recovery.verifyUntilTs = 0;
        return { ok: true, err: '' };
      }

      if (!userSeekWindowActive()
        && !userSeekCommitActive()
        && isFinite(curCt)
        && curCt <= 0.2
        && toNum(expectedSec, 0) >= 5
        && String(STATE.recovery.contentKey || '') === String(STATE.media.contentKey || '')) {
        STATE.recovery.verifyUntilTs = 0;
        return { ok: false, err: 'ct_reset_anomaly' };
      }

      await waitMs(120);
    }

    STATE.recovery.verifyUntilTs = 0;
    return { ok: false, err: 'verify_timeout' };
  }

  async function stepWakeup(token) {
    if (!sessionOperational()) return { ok: false, err: 'session_inactive' };
    if (!recoveryInvariantOk(token)) return { ok: false, err: 'session_changed' };
    if (toInt(STATE.user.userPausedLatched, 0) === 1) return { ok: false, err: 'user_paused_latched' };
    if (!isInternalPaused()) return { ok: false, err: 'not_internal_paused' };
    var v = STATE.media.video || getVideo();
    if (!v || typeof v.play !== 'function') return { ok: false, err: 'no_video' };

    STATE.recovery.step = 'wakeup';
    STATE.recovery.lastAction = 'wakeup_play';

    try {
      var p = v.play();
      if (p && typeof p.catch === 'function') p.catch(function () { });
    } catch (_) {
      return { ok: false, err: 'play_throw' };
    }

    await waitMs(120);
    return verifyFlow(token, toNum(STATE.media.ct, 0));
  }

  async function stepSeekVerify(token, trg) {
    if (!sessionOperational()) return { ok: false, err: 'session_inactive' };
    if (!recoveryInvariantOk(token)) return { ok: false, err: 'session_changed' };
    var v = STATE.media.video || getVideo();
    if (!v) return { ok: false, err: 'no_video' };

    STATE.recovery.step = 'seek_verify';
    if (!applySeek(v, trg, 'seek_verify')) return { ok: false, err: 'seek_failed' };
    return verifyFlow(token, trg);
  }

  async function waitVideoReady(token, maxMs) {
    var started = nowMs();
    maxMs = clampInt(maxMs || 3000, 300, 10000);
    while ((nowMs() - started) <= maxMs) {
      if (!recoveryInvariantOk(token)) return null;
      var v = getVideo();
      if (v) return v;
      await waitMs(120);
    }
    return null;
  }

  async function stepInplayerRebuild(token, trg) {
    if (!sessionOperational()) return { ok: false, err: 'session_inactive' };
    var pv = null;
    try { pv = (window.Lampa && Lampa.PlayerVideo) ? Lampa.PlayerVideo : null; } catch (_) { pv = null; }
    var v = STATE.media.video || getVideo();
    var src = getCurrentSrc(v);
    if (!pv || typeof pv.url !== 'function' || !src) return { ok: false, err: 'inplayer_unavailable' };

    STATE.recovery.step = 'inplayer_rebuild';
    STATE.recovery.lastAction = 'inplayer_rebuild';
    if (!recoveryInvariantOk(token) || !sessionOperational()) return { ok: false, err: 'session_changed' };

    try {
      if (typeof pv.destroy === 'function') {
        try { pv.destroy(true); } catch (_) { }
      }
      pv.url(String(withCacheBust(src)), true);
    } catch (_) {
      return { ok: false, err: 'inplayer_throw' };
    }

    v = await waitVideoReady(token, 4200);
    if (!v) return { ok: false, err: 'inplayer_no_video' };

    applySeek(v, trg, 'inplayer_rebuild');
    return verifyFlow(token, trg);
  }

  async function stepHardReset(token, trg) {
    if (!sessionOperational()) return { ok: false, err: 'session_inactive' };
    var pv = null;
    try { pv = (window.Lampa && Lampa.PlayerVideo) ? Lampa.PlayerVideo : null; } catch (_) { pv = null; }
    var v = STATE.media.video || getVideo();
    var src = getCurrentSrc(v);
    if (!pv || typeof pv.url !== 'function' || !src) return { ok: false, err: 'hard_unavailable' };

    STATE.recovery.step = 'hard_reset';
    STATE.recovery.lastAction = 'hard_reset';
    if (!recoveryInvariantOk(token) || !sessionOperational()) return { ok: false, err: 'session_changed' };

    try {
      if (typeof pv.destroy === 'function') {
        try { pv.destroy(true); } catch (_) { }
      }
      pv.url(String(withCacheBust(src)), true);
    } catch (_) {
      return { ok: false, err: 'hard_throw' };
    }

    v = await waitVideoReady(token, 6500);
    if (!v) return { ok: false, err: 'hard_no_video' };

    applySeek(v, trg, 'hard_reset');
    var vr = await verifyFlow(token, trg);
    if (vr.ok) STATE.recovery.hardResetCount = toInt(STATE.recovery.hardResetCount, 0) + 1;
    return vr;
  }

  function recoveryFinish(ok, reason) {
    var nowT = nowMs();
    var baseCooldownMs = recoveryBaseCooldownMs();
    var sessionAlive = sessionOperational();

    STATE.recovery.active = false;
    STATE.recovery.step = '';
    STATE.recovery.verifyUntilTs = 0;
    STATE.recovery.lastAttemptTs = nowT;
    STATE.recovery.lastTriggerHash = String(STATE.recovery.lastAttemptSig || '');

    if (!sessionAlive) {
      STATE.recovery.lastErr = String(reason || 'session_inactive');
      STATE.recovery.nextAllowedTs = nowT + Math.min(baseCooldownMs, 1000);
      setStage(ST.IDLE, 'recover_aborted');
      return false;
    }

    if (ok) {
      STATE.recovery.failCounter = 0;
      STATE.recovery.backoffFactor = 0;
      STATE.recovery.suppressUntilTs = nowT + 500;
      STATE.recovery.nextAllowedTs = nowT + Math.min(baseCooldownMs, 500);
      STATE.recovery.lastErr = '';
      STATE.recovery.lastOkTs = nowT;
      clearFalseEndSuspect('recover_ok');
      setStage(ST.TRACKING, 'recover_ok:' + String(reason || 'ok'));
      log('OK', 'recover_ok', { reason: String(reason || '') });
      return true;
    }

    STATE.recovery.failCounter = toInt(STATE.recovery.failCounter, 0) + 1;
    STATE.recovery.backoffFactor = clampInt(toInt(STATE.recovery.backoffFactor, 0) + 1, 1, 6);
    STATE.recovery.suppressUntilTs = nowT + Math.min(2000, baseCooldownMs);
    STATE.recovery.nextAllowedTs = nowT + Math.min(20000, baseCooldownMs * (1 + toInt(STATE.recovery.backoffFactor, 1)));
    STATE.recovery.lastErr = String(reason || 'recover_fail');
    STATE.recovery.lastFailTs = nowT;
    setStage(ST.FAILED, STATE.recovery.lastErr);
    armBlockNext(Math.max(toInt(STATE.cfg.blockNextMs, 6000), 4000), 'recover_fail');
    log('WRN', 'recover_fail', {
      reason: STATE.recovery.lastErr,
      failCounter: toInt(STATE.recovery.failCounter, 0),
      backoffFactor: toInt(STATE.recovery.backoffFactor, 0),
      nextAllowedLeftMs: Math.max(0, toInt(STATE.recovery.nextAllowedTs, 0) - nowT)
    });
    return false;
  }

  async function recoveryPipeline(trigger, snapshot) {
    var token = toInt(STATE.recovery.token, 0);
    var trg = targetSec(snapshot);
    if (!sessionOperational()) return recoveryFinish(false, 'session_inactive');
    if (!recoveryInvariantOk(token)) return recoveryFinish(false, 'session_changed');

    var step = await stepWakeup(token);
    if (step.ok) return recoveryFinish(true, 'wakeup');
    if (!sessionOperational() || !recoveryInvariantOk(token)) return recoveryFinish(false, step.err || 'session_inactive');

    step = await stepSeekVerify(token, trg);
    if (step.ok) return recoveryFinish(true, 'seek_verify');
    if (!sessionOperational() || !recoveryInvariantOk(token)) return recoveryFinish(false, step.err || 'session_inactive');

    step = await stepInplayerRebuild(token, trg);
    if (step.ok) return recoveryFinish(true, 'inplayer_rebuild');
    if (!sessionOperational() || !recoveryInvariantOk(token)) return recoveryFinish(false, step.err || 'session_inactive');

    var shouldHard = STATE.cfg.hardResetEnabled
      && (toInt(STATE.recovery.failCounter, 0) + 1) >= toInt(STATE.cfg.hardResetAfterN, 2);

    if (shouldHard) {
      step = await stepHardReset(token, trg);
      if (step.ok) return recoveryFinish(true, 'hard_reset');
      return recoveryFinish(false, step.err || 'hard_reset_fail');
    }

    return recoveryFinish(false, step.err || 'pipeline_fail');
  }

  function startRecovery(trigger, snapshot) {
    trigger = String(trigger || 'stall');
    snapshot = snapshot || collectSnapshot();

    if (!sessionOperational()) {
      setStage(ST.IDLE, 'recover_blocked_session');
      return false;
    }
    if (toInt(STATE.user.userPausedLatched, 0) === 1) {
      setStage(ST.SUSPENDED, 'recover_blocked_user_pause');
      return false;
    }
    if (userSeekWindowActive() || userSeekCommitActive()) {
      setStage(ST.SUSPENDED, 'recover_blocked_user_seek');
      return false;
    }

    if (toNum(snapshot.ctDelta, 0) > 0 && toInt(snapshot.timeupdateAgeMs, 999999) < Math.max(120, Math.floor(toInt(STATE.cfg.stallSoftMs, 900) / 2))) {
      setStage(ST.TRACKING, 'flow_restored');
      return false;
    }

    var nowT = nowMs();
    var sig = triggerSignature(snapshot, trigger);
    if (sig && sig === String(STATE.recovery.lastTriggerHash || '') && nowT < toInt(STATE.recovery.suppressUntilTs, 0)) {
      setStage(ST.STALL, trigger + ':suppressed');
      return false;
    }

    if (!shouldRunRecovery()) return false;

    STATE.recovery.active = true;
    STATE.recovery.token = toInt(STATE.recovery.token, 0) + 1;
    STATE.recovery.trigger = trigger;
    STATE.recovery.step = 'start';
    STATE.recovery.lastAttemptSig = sig;
    STATE.recovery.lastTrigger = trigger;
    STATE.recovery.lastReason = trigger;
    STATE.recovery.lastAction = 'recover_start';
    STATE.recovery.sessionId = toInt(STATE.life.sessionId, 0);
    STATE.recovery.contentKey = String(STATE.media.contentKey || '');

    setStage(ST.RECOVERING, trigger);
    armBlockNext(Math.max(toInt(STATE.cfg.blockNextMs, 6000), toInt(STATE.cfg.stallHardMs, 2000) * 2), trigger);
    log('WRN', 'recover_start', {
      trigger: trigger,
      token: toInt(STATE.recovery.token, 0),
      blockMs: toInt(STATE.cfg.blockNextMs, 6000)
    });

    recoveryPipeline(trigger, snapshot).catch(function (e) {
      recoveryFinish(false, e && e.message ? String(e.message) : 'pipeline_exception');
    });

    return true;
  }

  function shouldBlockNextType(type) {
    var t = String(type || '').toLowerCase();
    if (!t) return false;
    if (t === 'ended') return true;
    if (t === 'next' || t === 'select') return true;
    if (t.indexOf('next') >= 0) return true;
    if (t.indexOf('select') >= 0) return true;
    if (t.indexOf('ended') >= 0) return true;
    return false;
  }

  function falseNextFarFromEnd(snapshot, rawType, payload) {
    if (!snapshot) return false;
    var t = String(rawType || '').toLowerCase();
    if (!shouldBlockNextType(t)) return false;
    var dur = toNum(snapshot.dur, NaN);
    var ct = toNum(snapshot.ct, NaN);
    if (!isFinite(dur) || !isFinite(ct)) return false;
    var remain = Math.max(0, dur - ct);
    if (remain <= Math.max(1, toNum(STATE.cfg.nextMinRemainSec, 12.0))) return false;
    if (isExplicitUserNextIntent(t, payload)) return false;
    return true;
  }

  function shouldBlockNextNow(snapshot, rawType, payload) {
    if (!sessionOperational()) return false;
    if (stageBlocksNext()) return true;
    if (blockNextLeftMs() > 0) return true;
    if (falseEndSuspectActive()) return true;

    if (!snapshot) return false;
    if (falseNextFarFromEnd(snapshot, rawType, payload)) return true;

    if (fakeEndJumpDetected(snapshot)) return true;

    return false;
  }

  function handleFalseEndAndRecover(reason, snapshot) {
    if (!snapshot) return false;
    if (!sessionOperational()) return false;
    if (userSeekWindowActive() || userSeekCommitActive()) return false;

    var dur = toNum(snapshot.dur, NaN);
    var good = toNum(STATE.media.lastGoodCt, NaN);
    if (!isFinite(good)) {
      startRecovery(reason || 'false_end_no_good', snapshot);
      return true;
    }

    var target = Math.max(0, good + 0.05);
    if (isFinite(dur) && dur > 2) target = Math.min(target, Math.max(0, dur - 2));

    var v = STATE.media.video || getVideo();
    if (v) applySeek(v, target, 'false_end');
    armBlockNext(Math.max(toInt(STATE.cfg.blockNextMs, 6000), 3500), 'false_end');
    startRecovery(reason || 'false_end', snapshot);
    return true;
  }

  function dgDecisionTick(snapshot) {
    if (!STATE.enabled) {
      setStage(ST.IDLE, 'disabled');
      return;
    }

    if (!snapshot) snapshot = collectSnapshot();

    if (!STATE.life.sessionActive) {
      setStage(ST.IDLE, 'session_inactive');
      return;
    }

    if (sessionExitLeftMs() > 0) {
      setStage(ST.IDLE, 'session_exit_guard');
      return;
    }

    if (!snapshot.videoUsable) {
      setStage(ST.IDLE, 'video_not_usable');
      return;
    }

    if (!STATE.life.active || !snapshot || !isFinite(toNum(snapshot.ct, NaN))) {
      setStage(ST.IDLE, 'no_video');
      return;
    }

    if (toInt(STATE.user.userPausedLatched, 0) === 1 && !STATE.media.paused) {
      var holdV = STATE.media.video || getVideo();
      enforceUserPauseHold(holdV, 'tick_user_paused_hold');
      setStage(ST.SUSPENDED, 'user_paused_hold');
      return;
    }

    if (isUserPaused()) {
      setStage(ST.SUSPENDED, 'paused(user)');
      return;
    }

    if (userActionCooldownActive()) {
      setStage(ST.SUSPENDED, 'user_action_cooldown');
      return;
    }

    if (userSeekWindowActive() || userSeekCommitActive()) {
      setStage(ST.SUSPENDED, 'user_seek');
      return;
    }

    if (!snapshot.playbackProven) {
      if (toInt(snapshot.startupLeftMs, 0) > 0) {
        setStage(ST.LOADING, 'startup_grace');
        return;
      }
      if (!toInt(STATE.media.startupSoftTried, 0)) {
        STATE.media.startupSoftTried = 1;
        STATE.media.startupKickTs = nowMs();
        var kickV = STATE.media.video || getVideo();
        try {
          if (kickV && typeof kickV.play === 'function' && !toInt(STATE.user.userPausedLatched, 0)) {
            var kp = kickV.play();
            if (kp && typeof kp.catch === 'function') kp.catch(function () { });
          }
        } catch (_) { }
        setStage(ST.LOADING, 'startup_soft_kick');
        return;
      }
      if (ageMs(STATE.media.startupKickTs) <= 1500) {
        setStage(ST.LOADING, 'startup_wait');
        return;
      }
      setStage(ST.STALL, 'startup_unproven');
      startRecovery('startup_unproven', snapshot);
      return;
    }

    var st = stallState(snapshot);
    var fakeFull = fakeFullDetected(snapshot);
    var fakeEnd = fakeEndJumpDetected(snapshot);
    var freeze = renderFreezeDetected(snapshot);

    if (STATE.recovery.active) {
      if (STATE.stage.name !== ST.VERIFYING) setStage(ST.RECOVERING, STATE.recovery.trigger || 'recovering');
      return;
    }

    if (falseEndSuspectActive()) {
      setStage(ST.STALL, 'false_end_suspect');
      handleFalseEndAndRecover('false_end_suspect', snapshot);
      return;
    }

    if (isInternalPaused()) {
      if (st.soft) {
        setStage(ST.STALL, 'paused(internal)');
        if (st.hard || freeze || fakeFull) {
          startRecovery(freeze ? 'render_freeze' : (fakeFull ? 'fake_full_internal' : 'internal_pause_stall'), snapshot);
        }
        return;
      }
    }

    if (fakeEnd) {
      setStage(ST.STALL, 'fake_end_jump');
      handleFalseEndAndRecover('fake_end_jump', snapshot);
      return;
    }

    if (freeze) {
      setStage(ST.STALL, 'render_freeze');
      startRecovery('render_freeze', snapshot);
      return;
    }

    if (fakeFull) {
      setStage(ST.STALL, 'fake_full');
      startRecovery('fake_full', snapshot);
      return;
    }

    if (st.hard) {
      setStage(ST.STALL, 'stall_hard');
      startRecovery('stall_hard', snapshot);
      return;
    }

    if (st.soft) {
      setStage(ST.STALL, 'stall_soft');
      return;
    }

    setStage(ST.TRACKING, 'live');
  }

  function cssEsc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function pNorm(v, maxV) {
    var n = toNum(v, 0);
    var m = Math.max(1, toNum(maxV, 1));
    if (!isFinite(n) || n < 0) n = 0;
    var p = n / m;
    if (!isFinite(p) || p < 0) p = 0;
    if (p > 1) p = 1;
    return p;
  }

  function barHtml(label, val, maxV) {
    var p = pNorm(val, maxV);
    var pct = Math.round(p * 100);
    return '<div class="dg-row">'
      + '<div class="dg-lbl">' + cssEsc(label) + '</div>'
      + '<div class="dg-bar"><i style="width:' + String(pct) + '%"></i></div>'
      + '<div class="dg-val">' + String(clampInt(toInt(val, 0), 0, 999999)) + 'ms</div>'
      + '</div>';
  }

  function ensurePopup() {
    if (STATE.popup.root) return STATE.popup.root;
    if (!document) return null;

    var host = document.getElementById('__bl_dg_popup_v1');
    if (host && host.parentNode) {
      try { host.parentNode.removeChild(host); } catch (_) { }
    }

    host = document.createElement('div');
    host.id = '__bl_dg_popup_v1';
    var shadow = host.attachShadow ? host.attachShadow({ mode: 'open' }) : null;
    if (!shadow) return null;

    var style = document.createElement('style');
    style.textContent = ''
      + ':host,.dg-root,.dg-root *{box-sizing:border-box;}'
      + '.dg-root{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:min(92vw,760px);max-height:82vh;'
      + 'background:rgba(10,14,18,0.96);color:#e8edf3;border:1px solid rgba(153,170,188,0.42);border-radius:10px;'
      + 'z-index:2147483647;font:12px/1.35 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;display:flex;flex-direction:column;'
      + 'box-shadow:0 12px 32px rgba(0,0,0,0.55);} '
      + '.dg-hidden{display:none;} '
      + '.dg-head{display:flex;align-items:center;justify-content:space-between;padding:8px 10px;border-bottom:1px solid rgba(255,255,255,0.14);} '
      + '.dg-title{font-weight:700;letter-spacing:0.02em;} '
      + '.dg-badge{padding:2px 8px;border-radius:999px;font-weight:700;background:#34495e;color:#fff;margin-left:8px;} '
      + '.dg-badge.ok{background:#2d8f56;} '
      + '.dg-badge.warn{background:#b37a21;} '
      + '.dg-badge.err{background:#b44343;} '
      + '.dg-close{all:unset;cursor:pointer;font:700 18px/1 monospace;padding:2px 6px;border-radius:6px;} '
      + '.dg-close:hover{background:rgba(255,255,255,0.14);} '
      + '.dg-reason{padding:8px 10px;border-bottom:1px solid rgba(255,255,255,0.12);opacity:0.95;} '
      + '.dg-body{padding:8px 10px;overflow:auto;} '
      + '.dg-sec{margin:0 0 10px 0;} '
      + '.dg-sec h4{margin:0 0 6px 0;font-size:12px;color:#9fd0ff;letter-spacing:0.03em;} '
      + '.dg-row{display:flex;align-items:center;gap:8px;margin:0 0 4px 0;} '
      + '.dg-lbl{width:130px;opacity:0.9;} '
      + '.dg-bar{flex:1;height:6px;background:rgba(255,255,255,0.12);border-radius:999px;overflow:hidden;} '
      + '.dg-bar i{display:block;height:100%;background:linear-gradient(90deg,#63d488,#f3b84a,#e67373);} '
      + '.dg-val{width:60px;text-align:right;opacity:0.9;} '
      + '.dg-mini{opacity:0.9;white-space:pre-wrap;word-break:break-word;}';

    var root = document.createElement('div');
    root.className = 'dg-root dg-hidden';
    root.style.opacity = String(clampNum(toNum(STATE.cfg.popupOpacity, 0.5), 0.2, 1.0));

    var head = document.createElement('div');
    head.className = 'dg-head';

    var title = document.createElement('div');
    title.className = 'dg-title';
    title.innerHTML = 'DeltaGuard <span class="dg-badge">IDLE</span>';

    var close = document.createElement('button');
    close.className = 'dg-close';
    close.type = 'button';
    close.textContent = '×';
    close.onclick = function () { popupHide('close_btn'); };

    var reason = document.createElement('div');
    reason.className = 'dg-reason';
    reason.textContent = 'reason=-';

    var body = document.createElement('div');
    body.className = 'dg-body';

    head.appendChild(title);
    head.appendChild(close);
    root.appendChild(head);
    root.appendChild(reason);
    root.appendChild(body);

    shadow.appendChild(style);
    shadow.appendChild(root);

    try { (document.body || document.documentElement).appendChild(host); } catch (_) { return null; }

    STATE.popup.host = host;
    STATE.popup.shadow = shadow;
    STATE.popup.root = root;
    STATE.popup.title = title;
    STATE.popup.reason = reason;
    STATE.popup.body = body;
    STATE.popup.closeBtn = close;

    return root;
  }

  function stageBadgeClass(name) {
    name = String(name || '');
    if (name === ST.TRACKING) return 'ok';
    if (name === ST.LOADING) return 'warn';
    if (name === ST.RECOVERING || name === ST.VERIFYING || name === ST.STALL) return 'warn';
    if (name === ST.FAILED) return 'err';
    return '';
  }

  function popupRender(snapshot, force) {
    if (!STATE.popup.open) return;
    var nowT = nowMs();
    if (!force && (nowT - toInt(STATE.popup.lastRenderTs, 0)) < 250) return;
    STATE.popup.lastRenderTs = nowT;

    snapshot = snapshot || collectSnapshot();
    var root = ensurePopup();
    if (!root) return;
    root.style.opacity = String(clampNum(toNum(STATE.cfg.popupOpacity, 0.5), 0.2, 1.0));

    var ctAge = ageMs(STATE.media.lastCtTs);
    var tuAge = toInt(snapshot.timeupdateAgeMs, 0);
    var frameAge = toInt(snapshot.frameStuckMs, 0);
    var bufMoveAge = toInt(snapshot.bufMoveAgeMs, 0);

    var cooldownLeft = Math.max(0, toInt(STATE.recovery.nextAllowedTs, 0) - nowMs());
    var verifyLeft = Math.max(0, toInt(STATE.recovery.verifyUntilTs, 0) - nowMs());
    var nextLeft = blockNextLeftMs();

    var badgeCls = stageBadgeClass(STATE.stage.name);
    var badgeHtml = '<span class="dg-badge ' + cssEsc(badgeCls) + '">' + cssEsc(STATE.stage.name) + '</span>';

    if (STATE.popup.title) {
      STATE.popup.title.innerHTML = 'DeltaGuard ' + badgeHtml;
    }
    if (STATE.popup.reason) {
      STATE.popup.reason.textContent = 'reason=' + String(STATE.stage.reason || '-')
        + ' ; trigger=' + String(STATE.recovery.lastTrigger || '-')
        + ' ; action=' + String(STATE.recovery.lastAction || '-');
    }

    var bufCovPct = Math.round(Math.max(0, Math.min(1, toNum(snapshot.bufferCoverage, 0))) * 100);

    var html = '';
    html += '<div class="dg-sec"><h4>Liveness</h4>';
    html += barHtml('ctAge', ctAge, Math.max(1000, toInt(STATE.cfg.stallHardMs, 2000)));
    html += barHtml('timeupdateAge', tuAge, Math.max(1000, toInt(STATE.cfg.stallHardMs, 2000)));
    html += barHtml('frameStuck', frameAge, Math.max(1000, toInt(STATE.cfg.stallHardMs, 2000)));
    html += '</div>';

    html += '<div class="dg-sec"><h4>Buffer</h4>';
    html += '<div class="dg-mini">ahead=' + cssEsc(toNum(snapshot.aheadSec, 0).toFixed(2)) + 's ; coverage=' + cssEsc(String(bufCovPct)) + '% ; start=' + cssEsc(isFinite(toNum(snapshot.bufferStart, NaN)) ? toNum(snapshot.bufferStart, 0).toFixed(2) : '-') + ' ; end=' + cssEsc(isFinite(toNum(snapshot.bufferEnd, NaN)) ? toNum(snapshot.bufferEnd, 0).toFixed(2) : '-') + '</div>';
    html += barHtml('bufMoveAge', bufMoveAge, Math.max(1000, toInt(STATE.cfg.stallHardMs, 2000)));
    html += '</div>';

    html += '<div class="dg-sec"><h4>Recovery</h4>';
    html += barHtml('cooldownLeft', cooldownLeft, Math.max(1000, toInt(STATE.cfg.recoverCooldownMs, 2500)));
    html += barHtml('verifyLeft', verifyLeft, Math.max(500, toInt(STATE.cfg.verifyMs, 1400)));
    html += '</div>';

    html += '<div class="dg-sec"><h4>NextBlock</h4>';
    html += barHtml('blockNextLeft', nextLeft, Math.max(1000, toInt(STATE.cfg.blockNextMs, 6000)));
    html += '</div>';

    html += '<div class="dg-sec"><h4>State</h4>';
    var nowT = nowMs();
    var userSeekCt = toNum(STATE.user.lastUserSeekCt, NaN);
    var userSeekAge = isFinite(userSeekCt) ? ageMs(STATE.user.lastUserSeekTs) : 0;
    var seekCommitLeft = Math.max(0, toInt(STATE.user.userSeekCommitUntilTs, 0) - nowT);
    var suppressLeft = Math.max(0, toInt(STATE.recovery.suppressUntilTs, 0) - nowT);
    var userActLeft = Math.max(0, toInt(STATE.user.userActionUntilTs, 0) - nowT);
    var startupLeft = Math.max(0, toInt(snapshot.startupLeftMs, 0));
    var exitLeft = sessionExitLeftMs();
    var hiddenAge = toInt(snapshot.hiddenAgeMs, 0);
    var hiddenLeft = toInt(snapshot.hiddenLeftMs, 0);
    html += '<div class="dg-mini">paused=' + (STATE.media.paused ? '1' : '0')
      + ' ; userPaused=' + (isUserPaused() ? '1' : '0')
      + ' ; internalPaused=' + (isInternalPaused() ? '1' : '0')
      + ' ; userPausedLatched=' + String(toInt(STATE.user.userPausedLatched, 0))
      + ' ; pauseOwner=' + String(STATE.user.pauseOwner || 'none')
      + ' ; sessionActive=' + (STATE.life.sessionActive ? '1' : '0')
      + ' ; exitLeftMs=' + String(clampInt(exitLeft, 0, 999999))
      + ' ; videoUsable=' + (snapshot.videoUsable ? '1' : '0')
      + ' ; hiddenAgeMs=' + String(clampInt(hiddenAge, 0, 999999))
      + ' ; hiddenLeftMs=' + String(clampInt(hiddenLeft, 0, 999999))
      + ' ; startupLeftMs=' + String(clampInt(startupLeft, 0, 999999))
      + ' ; playbackProven=' + (snapshot.playbackProven ? '1' : '0')
      + ' ; userActionLeftMs=' + String(clampInt(userActLeft, 0, 999999))
      + ' ; falseEndSuspect=' + String(toInt(STATE.guard.falseEndSuspectActive, 0))
      + ' ; content=' + String(STATE.media.contentKeyShort || '-')
      + ' ; lastGood=' + (isFinite(toNum(STATE.media.lastGoodCt, NaN)) ? toNum(STATE.media.lastGoodCt, 0).toFixed(2) : '-')
      + ' ; recentCtFloor=' + toNum(STATE.media.recentCtFloor, 0).toFixed(2)
      + ' ; userSeekCt=' + (isFinite(userSeekCt) ? userSeekCt.toFixed(2) : '-')
      + ' ; userSeekAgeMs=' + String(clampInt(userSeekAge, 0, 999999))
      + ' ; seekCommitLeftMs=' + String(clampInt(seekCommitLeft, 0, 999999))
      + ' ; lastTriggerHash=' + String(STATE.recovery.lastTriggerHash || '-')
      + ' ; suppressLeftMs=' + String(clampInt(suppressLeft, 0, 999999))
      + ' ; backoffFactor=' + String(toInt(STATE.recovery.backoffFactor, 0))
      + ' ; failCounter=' + String(toInt(STATE.recovery.failCounter, 0))
      + ' ; hardResets=' + String(toInt(STATE.recovery.hardResetCount, 0))
      + '</div>';
    html += '</div>';

    if (STATE.popup.body && String(STATE.popup.lastBodyHtml || '') !== String(html)) {
      STATE.popup.body.innerHTML = html;
      STATE.popup.lastBodyHtml = html;
    }
    root.classList.remove('dg-hidden');

    if (toInt(STATE.cfg.popupAutocloseSec, 0) > 0) {
      if (STATE.popup.autoCloseTimer) {
        try { clearTimeout(STATE.popup.autoCloseTimer); } catch (_) { }
        STATE.popup.autoCloseTimer = null;
      }
      STATE.popup.autoCloseTimer = setTimeout(function () {
        popupHide('autoclose');
      }, toInt(STATE.cfg.popupAutocloseSec, 0) * 1000);
    }
  }

  function popupOpen(reason) {
    ensurePopup();
    STATE.popup.open = true;
    STATE.popup.lastRenderTs = 0;
    STATE.popup.lastBodyHtml = '';
    STATE.popup.lastOpenTs = nowMs();
    popupRender(null, true);
    log('INF', 'popup_open', { reason: String(reason || '') });
  }

  function maybeOpenPopupByEdge(reason) {
    var nowT = nowMs();
    if ((nowT - toInt(STATE.popup.lastEdgeOpenTs, 0)) < 1000) return;
    STATE.popup.lastEdgeOpenTs = nowT;
    popupOpen(reason || 'edge');
  }

  function popupHide(reason) {
    if (STATE.popup.autoCloseTimer) {
      try { clearTimeout(STATE.popup.autoCloseTimer); } catch (_) { }
      STATE.popup.autoCloseTimer = null;
    }
    STATE.popup.open = false;
    STATE.popup.lastBodyHtml = '';
    STATE.popup.lastRenderTs = 0;
    try { if (STATE.popup.root) STATE.popup.root.classList.add('dg-hidden'); } catch (_) { }
    log('DBG', 'popup_hide', { reason: String(reason || '') });
  }

  function onTick() {
    try {
      if (!STATE.enabled) return;
      var s = collectSnapshot();
      dgDecisionTick(s);
      if (STATE.popup.open) popupRender(s, false);
    } catch (e) {
      log('ERR', 'tick_exception', { err: e && e.message ? String(e.message) : String(e) });
    }
  }

  function stopTimer() {
    if (!STATE.timer) return;
    try { clearInterval(STATE.timer); } catch (_) { }
    STATE.timer = null;
  }

  function startTimer() {
    if (STATE.timer) return;
    STATE.timer = setInterval(onTick, clampInt(toInt(STATE.cfg.tickMs, 250), 100, 2000));
  }

  function activateRuntime(reason) {
    if (!STATE.enabled) return;
    var v = getVideo();
    if (isVideoUsable(v)) {
      enterSession(reason || 'runtime_activate');
    } else if (STATE.life.sessionActive) {
      startTimer();
    }
    if (STATE.cfg.debugOnOpen && STATE.life.sessionActive) popupOpen(reason || 'debug_on_open');
  }

  function deactivateRuntime(reason) {
    leaveSession('deactivate', { bestEffortStop: false, exitMs: 2500 });
    resetRuntimeState('deactivate:' + String(reason || ''));
    popupHide('deactivate');
  }

  function shouldInterceptNow() {
    return sessionOperational();
  }

  function patchPlayerSend() {
    if (STATE.patched.player) return true;
    if (!window.Lampa || !Lampa.Player || !Lampa.Player.listener || typeof Lampa.Player.listener.send !== 'function') return false;

    var send = Lampa.Player.listener.send;
    if (send.__blDeltaGuardWrappedV1) {
      STATE.patched.player = true;
      return true;
    }

    var orig = send;
    Lampa.Player.listener.send = function () {
      var type = (arguments && arguments.length) ? arguments[0] : '';
      var payload = (arguments && arguments.length > 1) ? arguments[1] : undefined;
      var lower = String(type || '').toLowerCase();
      var norm = normalizeCommand(lower);

      try { handleUserCommand(lower, payload); } catch (_) { }
      try {
        if (lower === 'start') enterSession('player_start', { force: true });
        else if (norm === 'exit' && STATE.life.sessionActive) leaveSession('user_exit', { destroyOnExit: true, bestEffortStop: true, hardStop: true, exitMs: 3600 });
      } catch (_) { }

      if (shouldInterceptNow()) {
        try {
          var s = collectSnapshot();

          if (lower === 'start') {
            STATE.life.lastStartTs = nowMs();
            if (!STATE.recovery.active) setStage(ST.TRACKING, 'player_start');
          }

          if (shouldBlockNextType(lower)) {
            if (lower === 'ended' && shouldAllowRealEnd(s)) {
              // real ending path
            } else if (shouldBlockNextNow(s, lower, payload)) {
              var blockReason = falseNextFarFromEnd(s, lower, payload) ? 'false_next_far_from_end' : ('send:' + lower);
              armBlockNext(STATE.cfg.blockNextMs, 'send:' + lower);
              handleFalseEndAndRecover(blockReason, s);
              log('WRN', 'block_next_send', { type: lower, stage: STATE.stage.name, leftMs: blockNextLeftMs() });
              return;
            }
          }
        } catch (_) { }
      }

      return orig.apply(this, arguments);
    };

    Lampa.Player.listener.send.__blDeltaGuardWrappedV1 = true;
    STATE.patched.player = true;
    return true;
  }

  function patchPlayerVideoSend() {
    if (STATE.patched.playerVideo) return true;
    if (!window.Lampa || !Lampa.PlayerVideo || !Lampa.PlayerVideo.listener || typeof Lampa.PlayerVideo.listener.send !== 'function') return false;

    var send = Lampa.PlayerVideo.listener.send;
    if (send.__blDeltaGuardWrappedV1) {
      STATE.patched.playerVideo = true;
      return true;
    }

    var orig = send;
    Lampa.PlayerVideo.listener.send = function () {
      var type = (arguments && arguments.length) ? arguments[0] : '';
      var payload = (arguments && arguments.length > 1) ? arguments[1] : undefined;
      var lower = String(type || '').toLowerCase();
      var norm = normalizeCommand(lower);

      if (lower.indexOf('controller.') === 0) {
        try { handleUserCommand(lower, payload); } catch (_) { }
      }

      try {
        if (!STATE.life.sessionActive && (lower === 'play' || lower === 'playing' || lower === 'timeupdate' || lower === 'progress')) {
          var autoV = getVideo();
          if (isVideoUsable(autoV)) enterSession('pv_' + lower);
        } else if (norm === 'exit' && STATE.life.sessionActive) {
          leaveSession('user_exit', { destroyOnExit: true, bestEffortStop: true, hardStop: true, exitMs: 3600 });
        }
      } catch (_) { }

      try {
        if (lower === 'timeupdate') markEvent('timeupdate');
        else if (lower === 'progress') markEvent('progress');
        else if (lower === 'waiting') markEvent('waiting');
        else if (lower === 'stalled') markEvent('stalled');
        else if (lower === 'pause') {
          markEvent('pause');
          if (STATE.user.pendingCmd === 'pause' && ageMs(STATE.user.pendingTs) <= 800) setPauseOwner('user', 'pv_pause_user');
          else if (toInt(STATE.user.userPausedLatched, 0) === 1) setPauseOwner('user', 'pv_pause_latched');
          else setPauseOwner('internal', 'pv_pause_internal');
        }
        else if (lower === 'play' || lower === 'playing') {
          markEvent('playing');
          var playV = STATE.media.video || getVideo();
          if (!enforceUserPauseHold(playV, 'pv_playing_hold')) {
            setPauseOwner('none', 'pv_playing');
          }
        }
        else if (lower === 'seeking' || lower === 'seeked') {
          markEvent(lower);
          armUserSeekWindow(lower === 'seeked' ? 2500 : 3000, 'pv_' + lower);
          if (lower === 'seeked') {
            var vv = STATE.media.video || getVideo();
            commitUserSeekPoint(safe(function () { return toNum(vv && vv.currentTime, NaN); }, NaN), 'pv_seeked');
          }
        }
        else if (lower === 'ended') {
          markEvent('ended');
        }
      } catch (_) { }

      if (shouldInterceptNow()) {
        try {
          var s = collectSnapshot();
          if (lower === 'ended') {
            if (shouldAllowRealEnd(s)) {
              // allow true end
            } else if (shouldBlockNextNow(s, lower, payload)) {
              var pvBlockReason = falseNextFarFromEnd(s, lower, payload) ? 'false_next_far_from_end' : 'pv_ended';
              armBlockNext(STATE.cfg.blockNextMs, 'pv_ended');
              if (handleFalseEndAndRecover(pvBlockReason, s)) {
                log('WRN', 'block_pv_ended', { leftMs: blockNextLeftMs(), stage: STATE.stage.name });
                return;
              }
            }
          }
          if (shouldBlockNextType(lower) && lower !== 'ended' && shouldBlockNextNow(s, lower, payload)) {
            var pvReason = falseNextFarFromEnd(s, lower, payload) ? 'false_next_far_from_end' : ('pv:' + lower);
            armBlockNext(STATE.cfg.blockNextMs, 'pv:' + lower);
            handleFalseEndAndRecover(pvReason, s);
            return;
          }
        } catch (_) { }
      }

      return orig.apply(this, arguments);
    };

    Lampa.PlayerVideo.listener.send.__blDeltaGuardWrappedV1 = true;
    STATE.patched.playerVideo = true;
    return true;
  }

  function patchPlaylistMethods() {
    if (STATE.patched.playlist) return true;
    if (!window.Lampa || !Lampa.PlayerPlaylist) return false;

    var pp = Lampa.PlayerPlaylist;
    var wrapped = false;
    var methods = ['next', 'select'];

    for (var i = 0; i < methods.length; i++) {
      (function (name) {
        var fn = pp && pp[name];
        if (typeof fn !== 'function') return;
        if (fn.__blDeltaGuardWrappedV1) { wrapped = true; return; }

        pp[name] = function () {
          var rawType = 'playlist.' + String(name || '');
          var payload = (arguments && arguments.length) ? arguments[0] : undefined;
          if (shouldInterceptNow()) {
            try {
              var s = collectSnapshot();
              if (shouldBlockNextNow(s, rawType, payload)) {
                var plReason = falseNextFarFromEnd(s, rawType, payload) ? 'false_next_far_from_end' : rawType;
                armBlockNext(STATE.cfg.blockNextMs, rawType);
                handleFalseEndAndRecover(plReason, s);
                log('WRN', 'block_playlist', { method: name, stage: STATE.stage.name, leftMs: blockNextLeftMs() });
                return;
              }
            } catch (_) { }
          }
          return fn.apply(this, arguments);
        };
        pp[name].__blDeltaGuardWrappedV1 = true;
        wrapped = true;
      })(methods[i]);
    }

    STATE.patched.playlist = wrapped;
    return wrapped;
  }

  function patchPlayerNext() {
    if (STATE.patched.playerNext) return true;
    if (!window.Lampa || !Lampa.Player || typeof Lampa.Player.next !== 'function') return false;

    var fn = Lampa.Player.next;
    if (fn.__blDeltaGuardWrappedV1) {
      STATE.patched.playerNext = true;
      return true;
    }

    Lampa.Player.next = function () {
      var payload = (arguments && arguments.length) ? arguments[0] : undefined;
      if (shouldInterceptNow()) {
        try {
          var s = collectSnapshot();
          if (shouldBlockNextNow(s, 'player.next', payload)) {
            var pnReason = falseNextFarFromEnd(s, 'player.next', payload) ? 'false_next_far_from_end' : 'player.next';
            armBlockNext(STATE.cfg.blockNextMs, 'player.next');
            handleFalseEndAndRecover(pnReason, s);
            log('WRN', 'block_player_next', { stage: STATE.stage.name, leftMs: blockNextLeftMs() });
            return;
          }
        } catch (_) { }
      }
      return fn.apply(this, arguments);
    };
    Lampa.Player.next.__blDeltaGuardWrappedV1 = true;
    STATE.patched.playerNext = true;
    return true;
  }

  function patchAll() {
    patchPlayerSend();
    patchPlayerVideoSend();
    patchPlaylistMethods();
    patchPlayerNext();
  }

  function installStorageWatcher() {
    try {
      if (!(window.Lampa && Lampa.Storage && Lampa.Storage.listener && typeof Lampa.Storage.listener.follow === 'function')) return;
      if (STATE._storageWatchInstalled) return;
      STATE._storageWatchInstalled = true;

      Lampa.Storage.listener.follow('change', function (e) {
        try {
          if (!e || !e.name) return;
          var n = String(e.name || '');
          if (n.indexOf(String(LS_PREFIX || 'blacklampa_') + 'dg_') === 0) {
            API.refresh();
          }
        } catch (_) { }
      });
    } catch (_) { }
  }

  function installLifecycleMonitor() {
    try {
      if (STATE._lifecycleInstalled) return;
      if (!window || !window.addEventListener) return;
      STATE._lifecycleInstalled = true;

      var onVisibility = function () {
        try {
          if (!document) return;
          if (document.hidden) {
            leaveSession('document_hidden', { bestEffortStop: true, hardStop: true, exitMs: 3200 });
          } else {
            var v = getVideo();
            if (isVideoUsable(v)) enterSession('document_visible');
          }
        } catch (_) { }
      };

      var onPageHide = function () {
        try { leaveSession('pagehide', { bestEffortStop: true, hardStop: true, destroyOnExit: true, exitMs: 3600 }); } catch (_) { }
      };

      try { if (document && document.addEventListener) document.addEventListener('visibilitychange', onVisibility, true); } catch (_) { }
      try { window.addEventListener('pagehide', onPageHide, true); } catch (_) { }
      try { window.addEventListener('beforeunload', onPageHide, true); } catch (_) { }
    } catch (_) { }
  }

  function refreshRuntime(reason) {
    readConfig();
    if (!STATE.enabled) {
      deactivateRuntime(reason || 'disabled');
      return STATE.cfg;
    }

    activateRuntime(reason || 'refresh');
    return STATE.cfg;
  }

  API.install = function () {
    if (STATE.installed) return true;
    STATE.installed = true;

    readConfig();
    installInputMonitor();
    installStorageWatcher();
    installLifecycleMonitor();
    patchAll();

    if (STATE.enabled) activateRuntime('install');
    else deactivateRuntime('install_disabled');

    log('INF', 'installed', { enabled: STATE.enabled ? 1 : 0 });
    return true;
  };

  API.refresh = function () {
    return refreshRuntime('api_refresh');
  };

  API.debugOpen = function () {
    popupOpen('api_open');
  };

  API.debugClose = function () {
    popupHide('api_close');
  };

  API.defaults = function () {
    return defaultsCopy();
  };

  API.isEnabled = function () {
    return !!STATE.enabled;
  };

  API.getStateSnapshot = function () {
    var s = collectSnapshot();
    return {
      enabled: !!STATE.enabled,
      stage: String(STATE.stage.name || ST.IDLE),
      reason: String(STATE.stage.reason || ''),
      contentKey: String(STATE.media.contentKeyShort || ''),
      paused: !!STATE.media.paused,
      userPaused: isUserPaused() ? 1 : 0,
      internalPaused: isInternalPaused() ? 1 : 0,
      life: {
        sessionActive: !!STATE.life.sessionActive,
        sessionId: toInt(STATE.life.sessionId, 0),
        exitLeftMs: sessionExitLeftMs(),
        hiddenAgeMs: toInt(s.hiddenAgeMs, 0),
        hiddenLeftMs: toInt(s.hiddenLeftMs, 0),
        startupLeftMs: toInt(s.startupLeftMs, 0),
        playbackProven: s.playbackProven ? 1 : 0,
        lastSessionReason: String(STATE.life.lastSessionReason || ''),
        videoUsable: !!s.videoUsable
      },
      recovery: {
        active: !!STATE.recovery.active,
        step: String(STATE.recovery.step || ''),
        failCounter: toInt(STATE.recovery.failCounter, 0),
        backoffFactor: toInt(STATE.recovery.backoffFactor, 0),
        hardResetCount: toInt(STATE.recovery.hardResetCount, 0),
        nextAllowedLeftMs: Math.max(0, toInt(STATE.recovery.nextAllowedTs, 0) - nowMs()),
        verifyLeftMs: Math.max(0, toInt(STATE.recovery.verifyUntilTs, 0) - nowMs()),
        suppressLeftMs: Math.max(0, toInt(STATE.recovery.suppressUntilTs, 0) - nowMs()),
        lastTriggerHash: String(STATE.recovery.lastTriggerHash || ''),
        lastAction: String(STATE.recovery.lastAction || ''),
        lastErr: String(STATE.recovery.lastErr || ''),
        lastTrigger: String(STATE.recovery.lastTrigger || '')
      },
      user: {
        userPausedLatched: toInt(STATE.user.userPausedLatched, 0),
        pauseOwner: String(STATE.user.pauseOwner || 'none'),
        userActionLeftMs: Math.max(0, toInt(STATE.user.userActionUntilTs, 0) - nowMs()),
        seekWindowLeftMs: Math.max(0, toInt(STATE.user.userSeekUntilTs, 0) - nowMs()),
        seekCommitLeftMs: Math.max(0, toInt(STATE.user.userSeekCommitUntilTs, 0) - nowMs()),
        lastUserSeekCt: toNum(STATE.user.lastUserSeekCt, NaN),
        lastUserSeekAgeMs: isFinite(toNum(STATE.user.lastUserSeekCt, NaN)) ? ageMs(STATE.user.lastUserSeekTs) : 0
      },
      guard: {
        blockNextLeftMs: blockNextLeftMs(),
        blockReason: String(STATE.guard.blockReason || ''),
        falseEndSuspect: toInt(STATE.guard.falseEndSuspectActive, 0)
      },
      tick: {
        ct: toNum(s.ct, NaN),
        dur: toNum(s.dur, NaN),
        timeupdateAgeMs: toInt(s.timeupdateAgeMs, 0),
        progressAgeMs: toInt(s.progressAgeMs, 0),
        frameStuckMs: toInt(s.frameStuckMs, 0),
        bufMoveAgeMs: toInt(s.bufMoveAgeMs, 0),
        aheadSec: toNum(s.aheadSec, 0),
        coverage: toNum(s.bufferCoverage, 0)
      }
    };
  };

  API.resetState = function () {
    resetRuntimeState('api_reset');
    if (STATE.enabled && STATE.life.sessionActive) setStage(ST.LOADING, 'api_reset');
    else setStage(ST.IDLE, 'api_reset_idle');
    return API.getStateSnapshot();
  };

  API.install();
})();
