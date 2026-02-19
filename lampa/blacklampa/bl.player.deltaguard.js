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
    verifyMs: LS_PREFIX + 'dg_verify_ms',
    hardResetEnabled: LS_PREFIX + 'dg_hard_reset_enabled',
    hardResetAfterN: LS_PREFIX + 'dg_hard_reset_after_n'
  };

  var DG_DEFAULTS = {
    dg_enabled: 1,
    dg_debug_on_open: 0,
    dg_debug_on_fail: 1,
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
    dg_verify_ms: 1400,
    dg_hard_reset_enabled: 1,
    dg_hard_reset_after_n: 2
  };

  var ST = {
    IDLE: 'IDLE',
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
      playerVideo: false
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
      userPauseUntilTs: 0,
      userSeekUntilTs: 0,
      lastCmdNorm: '',
      lastCmdTs: 0
    },

    life: {
      active: false,
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

      srcSig: '',
      contentKey: '',
      contentKeyShort: '',

      ring: [],
      lastGoodCt: NaN,
      lastGoodTs: 0,
      recentCtFloor: 0
    },

    recovery: {
      active: false,
      token: 0,
      trigger: '',
      step: '',
      failCounter: 0,
      hardResetCount: 0,
      nextAllowedTs: 0,
      verifyUntilTs: 0,
      verifyStartCt: NaN,
      verifyStartTimeupdateTs: 0,
      verifyStartFrameTs: 0,
      verifyTarget: NaN,
      lastAction: '',
      lastErr: '',
      lastFailTs: 0,
      lastOkTs: 0,
      lastTrigger: '',
      lastReason: ''
    },

    guard: {
      blockNextUntilTs: 0,
      blockReason: ''
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
      lastEdgeOpenTs: 0
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
      popupAutocloseSec: clampInt(sGet(K.popupAutocloseSec, String(d.dg_popup_autoclose_sec)), 0, 120),
      blockNextMs: clampInt(sGet(K.blockNextMs, String(d.dg_block_next_ms)), 1000, 30000),
      tailSec: clampNum(sGet(K.tailSec, String(d.dg_tail_sec)), 0.5, 12),
      falseEndJumpSec: clampNum(sGet(K.falseEndJumpSec, String(d.dg_false_end_jump_sec)), 1, 120),
      fakeFullEnabled: parseBool(sGet(K.fakeFullEnabled, String(d.dg_fake_full_enabled)), !!d.dg_fake_full_enabled),
      falseEndEnabled: parseBool(sGet(K.falseEndEnabled, String(d.dg_false_end_enabled)), !!d.dg_false_end_enabled),
      tickMs: clampInt(sGet(K.tickMs, String(d.dg_tick_ms)), 100, 2000),
      stallSoftMs: clampInt(sGet(K.stallSoftMs, String(d.dg_stall_soft_ms)), 500, 10000),
      stallHardMs: clampInt(sGet(K.stallHardMs, String(d.dg_stall_hard_ms)), 800, 20000),
      recoverCooldownMs: clampInt(sGet(K.recoverCooldownMs, String(d.dg_recover_cooldown_ms)), 500, 30000),
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

  function normalizeCommand(rawType) {
    var t = String(rawType || '').toLowerCase().trim();
    if (!t) return '';

    if (t === 'controller.pause') return 'pause';
    if (t === 'controller.play') return 'play';
    if (t === 'controller.toggle') return 'toggle';
    if (t === 'controller.stop') return 'pause';
    if (t === 'controller.back' || t === 'controller.return' || t === 'controller.exit') return 'exit';
    if (t.indexOf('controller.seek') === 0 || t === 'controller.forward' || t === 'controller.rewind') return 'seek';

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

  function userSeekWindowActive() {
    return nowMs() < toInt(STATE.user.userSeekUntilTs, 0);
  }

  function armUserSeekWindow(ms, why) {
    ms = clampInt(ms || 1200, 300, 6000);
    STATE.user.userSeekUntilTs = Math.max(toInt(STATE.user.userSeekUntilTs, 0), nowMs() + ms);
    if (why) log('DBG', 'user_seek_window', { ms: ms, why: String(why) });
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
    if (STATE.user.pauseOwner === 'user' && nowMs() <= toInt(STATE.user.userPauseUntilTs, 0)) return true;
    if (STATE.user.pendingCmd === 'pause' && ageMs(STATE.user.pendingTs) <= 1200) return true;
    return false;
  }

  function isInternalPaused() {
    return !!STATE.media.paused && !isUserPaused();
  }

  function handleUserCommand(rawType, payload) {
    var norm = normalizeCommand(rawType);
    if (!norm) return;
    if (isMediaEventType(rawType)) return;

    var intent = isUserIntent(rawType);
    if (!intent) return;

    if (norm === 'toggle') {
      norm = STATE.media.paused ? 'play' : 'pause';
    }

    if (norm === 'pause' || norm === 'play' || norm === 'seek' || norm === 'exit') {
      STATE.user.pendingCmd = norm;
      STATE.user.pendingTs = nowMs();
      STATE.user.lastCmdNorm = norm;
      STATE.user.lastCmdTs = nowMs();
    }

    if (norm === 'pause') {
      setPauseOwner('user', 'cmd_pause');
      setStage(ST.SUSPENDED, 'paused(user)');
    } else if (norm === 'play') {
      setPauseOwner('none', 'cmd_play');
      if (!STATE.recovery.active) setStage(ST.TRACKING, 'play(user)');
    } else if (norm === 'seek') {
      armUserSeekWindow(1200, 'cmd_seek');
      setPauseOwner('none', 'cmd_seek');
    } else if (norm === 'exit') {
      armUserSeekWindow(1500, 'cmd_exit');
      setPauseOwner('none', 'cmd_exit');
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
    add('ended', function () { markEvent('ended'); });
    add('playing', function () { markEvent('playing'); setPauseOwner('none', 'video_playing'); });
    add('play', function () { markEvent('play'); setPauseOwner('none', 'video_play'); });
    add('pause', function () {
      markEvent('pause');
      if (STATE.user.pendingCmd === 'pause' && ageMs(STATE.user.pendingTs) <= 1200) setPauseOwner('user', 'video_pause_user');
      else if (isUserIntent('pause')) setPauseOwner('user', 'video_pause_recent_input');
      else setPauseOwner('internal', 'video_pause_internal');
    });
    add('seeking', function () {
      markEvent('seeking');
      armUserSeekWindow(1200, 'video_seeking');
    });
    add('seeked', function () {
      markEvent('seeked');
      armUserSeekWindow(900, 'video_seeked');
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

    STATE.recovery.active = false;
    STATE.recovery.step = '';
    STATE.recovery.trigger = '';
    STATE.recovery.verifyUntilTs = 0;
    STATE.recovery.verifyStartCt = NaN;
    STATE.recovery.verifyTarget = NaN;
    STATE.recovery.lastErr = '';

    STATE.guard.blockNextUntilTs = 0;
    STATE.guard.blockReason = '';

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

    STATE.recovery.failCounter = 0;
    STATE.recovery.active = false;
    STATE.recovery.step = '';
    STATE.recovery.trigger = '';
    STATE.recovery.verifyUntilTs = 0;
    STATE.recovery.verifyStartCt = NaN;
    STATE.recovery.verifyTarget = NaN;
    STATE.recovery.lastErr = '';

    STATE.guard.blockNextUntilTs = 0;
    STATE.guard.blockReason = '';

    setPauseOwner('none', 'content_change');
    setStage(ST.TRACKING, 'content_changed:' + String(reason || 'tick'));
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

    if (dCt > 0.03) {
      STATE.media.recentCtFloor = Math.max(toNum(STATE.media.recentCtFloor, 0), Math.max(0, ct - 30));
      if (!isFinite(toNum(STATE.media.lastGoodCt, NaN))) STATE.media.lastGoodCt = ct;
      else STATE.media.lastGoodCt = Math.max(toNum(STATE.media.lastGoodCt, 0), ct);
      STATE.media.lastGoodCt = Math.max(toNum(STATE.media.lastGoodCt, 0), toNum(STATE.media.recentCtFloor, 0));
      STATE.media.lastGoodTs = ts;
    }
  }

  function collectSnapshot() {
    var v = getVideo();
    if (v) attachVideoListeners(v);

    var ts = nowMs();
    var ct = NaN;
    var dur = NaN;
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

    var ck = computeContentKey(v, ct, dur);
    if (String(ck.contentKey || '') !== String(STATE.media.contentKey || '')) {
      onContentChanged(ck, 'snapshot');
    } else {
      STATE.media.srcSig = ck.srcSig;
      STATE.media.contentKeyShort = ck.short;
    }

    pushRing(ct, dur, ts);

    STATE.life.active = !!v;
    if (v && !toInt(STATE.life.lastStartTs, 0)) STATE.life.lastStartTs = ts;

    return {
      ts: ts,
      ct: ct,
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
    return n === ST.STALL || n === ST.RECOVERING || n === ST.VERIFYING;
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
    if (userSeekWindowActive()) return false;
    if (!snapshot || !isFinite(toNum(snapshot.ct, NaN)) || !isFinite(toNum(snapshot.dur, NaN))) return false;

    var tailSec = Math.max(0.5, toNum(STATE.cfg.tailSec, 3.0));
    if (toNum(snapshot.ct, 0) < (toNum(snapshot.dur, 0) - tailSec)) return false;

    var good = toNum(STATE.media.lastGoodCt, NaN);
    if (!isFinite(good)) return false;

    var jump = (toNum(snapshot.dur, 0) - tailSec) - good;
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

  function shouldRunRecovery() {
    if (!STATE.enabled) return false;
    if (STATE.recovery.active) return false;
    if (isUserPaused()) return false;
    if (nowMs() < toInt(STATE.recovery.nextAllowedTs, 0)) return false;
    return true;
  }

  function targetSec(snapshot) {
    snapshot = snapshot || {};
    var dur = toNum(snapshot.dur, NaN);
    var good = toNum(STATE.media.lastGoodCt, NaN);
    var cur = toNum(snapshot.ct, NaN);

    var t = NaN;
    if (isFinite(good) && good >= 0) t = Math.max(0, good + 0.08);
    else if (isFinite(cur) && cur >= 0) t = Math.max(0, cur);
    else t = 0;

    if (isFinite(dur) && dur > 2) {
      t = Math.min(t, Math.max(0, dur - 2));
    }

    return Math.max(0, t);
  }

  function waitMs(ms) {
    ms = clampInt(ms, 1, 30000);
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function applySeek(video, sec, why) {
    if (!video) return false;
    try {
      var dur = toNum(video.duration, NaN);
      if (isFinite(dur) && dur > 2) sec = Math.min(Math.max(0, sec), Math.max(0, dur - 1.6));
      video.currentTime = Math.max(0, sec);
      try {
        if (typeof video.play === 'function' && isInternalPaused()) {
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
    STATE.recovery.verifyUntilTs = nowMs() + toInt(STATE.cfg.verifyMs, 1400);
    STATE.recovery.verifyStartCt = toNum(STATE.media.ct, NaN);
    STATE.recovery.verifyStartTimeupdateTs = toInt(STATE.media.lastTimeupdateTs, 0);
    STATE.recovery.verifyStartFrameTs = toInt(STATE.media.frameLastTs, 0);
    STATE.recovery.verifyTarget = toNum(expectedSec, NaN);

    setStage(ST.VERIFYING, 'verify');

    while (nowMs() < toInt(STATE.recovery.verifyUntilTs, 0)) {
      if (token !== toInt(STATE.recovery.token, 0)) return { ok: false, err: 'token_changed' };
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

      await waitMs(120);
    }

    STATE.recovery.verifyUntilTs = 0;
    return { ok: false, err: 'verify_timeout' };
  }

  async function stepWakeup(token) {
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
      if (token !== toInt(STATE.recovery.token, 0)) return null;
      var v = getVideo();
      if (v) return v;
      await waitMs(120);
    }
    return null;
  }

  async function stepInplayerRebuild(token, trg) {
    var pv = null;
    try { pv = (window.Lampa && Lampa.PlayerVideo) ? Lampa.PlayerVideo : null; } catch (_) { pv = null; }
    var v = STATE.media.video || getVideo();
    var src = getCurrentSrc(v);
    if (!pv || typeof pv.url !== 'function' || !src) return { ok: false, err: 'inplayer_unavailable' };

    STATE.recovery.step = 'inplayer_rebuild';
    STATE.recovery.lastAction = 'inplayer_rebuild';

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
    var pv = null;
    try { pv = (window.Lampa && Lampa.PlayerVideo) ? Lampa.PlayerVideo : null; } catch (_) { pv = null; }
    var v = STATE.media.video || getVideo();
    var src = getCurrentSrc(v);
    if (!pv || typeof pv.url !== 'function' || !src) return { ok: false, err: 'hard_unavailable' };

    STATE.recovery.step = 'hard_reset';
    STATE.recovery.lastAction = 'hard_reset';

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
    STATE.recovery.active = false;
    STATE.recovery.step = '';
    STATE.recovery.verifyUntilTs = 0;
    STATE.recovery.nextAllowedTs = nowMs() + toInt(STATE.cfg.recoverCooldownMs, 2500);

    if (ok) {
      STATE.recovery.failCounter = 0;
      STATE.recovery.lastErr = '';
      STATE.recovery.lastOkTs = nowMs();
      setStage(ST.TRACKING, 'recover_ok:' + String(reason || 'ok'));
      log('OK', 'recover_ok', { reason: String(reason || '') });
      return true;
    }

    STATE.recovery.failCounter = toInt(STATE.recovery.failCounter, 0) + 1;
    STATE.recovery.lastErr = String(reason || 'recover_fail');
    STATE.recovery.lastFailTs = nowMs();
    setStage(ST.FAILED, STATE.recovery.lastErr);
    armBlockNext(Math.max(toInt(STATE.cfg.blockNextMs, 6000), 4000), 'recover_fail');
    log('WRN', 'recover_fail', {
      reason: STATE.recovery.lastErr,
      failCounter: toInt(STATE.recovery.failCounter, 0)
    });
    return false;
  }

  async function recoveryPipeline(trigger, snapshot) {
    var token = toInt(STATE.recovery.token, 0);
    var trg = targetSec(snapshot);

    var step = await stepWakeup(token);
    if (step.ok) return recoveryFinish(true, 'wakeup');

    step = await stepSeekVerify(token, trg);
    if (step.ok) return recoveryFinish(true, 'seek_verify');

    step = await stepInplayerRebuild(token, trg);
    if (step.ok) return recoveryFinish(true, 'inplayer_rebuild');

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
    if (!shouldRunRecovery()) return false;

    trigger = String(trigger || 'stall');
    STATE.recovery.active = true;
    STATE.recovery.token = toInt(STATE.recovery.token, 0) + 1;
    STATE.recovery.trigger = trigger;
    STATE.recovery.step = 'start';
    STATE.recovery.lastTrigger = trigger;
    STATE.recovery.lastReason = trigger;
    STATE.recovery.lastAction = 'recover_start';

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

  function shouldBlockNextNow(snapshot) {
    if (!STATE.enabled) return false;
    if (stageBlocksNext()) return true;
    if (blockNextLeftMs() > 0) return true;

    if (!snapshot) return false;
    if (fakeEndJumpDetected(snapshot)) return true;

    return false;
  }

  function handleFalseEndAndRecover(reason, snapshot) {
    if (!STATE.cfg.falseEndEnabled) return false;
    if (!snapshot) return false;

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

    if (!STATE.life.active || !snapshot || !isFinite(toNum(snapshot.ct, NaN))) {
      setStage(ST.IDLE, 'no_video');
      return;
    }

    if (isUserPaused()) {
      setStage(ST.SUSPENDED, 'paused(user)');
      return;
    }

    if (userSeekWindowActive()) {
      setStage(ST.SUSPENDED, 'user_seek_window');
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
    if (name === ST.RECOVERING || name === ST.VERIFYING || name === ST.STALL) return 'warn';
    if (name === ST.FAILED) return 'err';
    return '';
  }

  function popupRender(snapshot) {
    if (!STATE.popup.open) return;

    snapshot = snapshot || collectSnapshot();
    var root = ensurePopup();
    if (!root) return;

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
    html += '<div class="dg-mini">paused=' + (STATE.media.paused ? '1' : '0')
      + ' ; userPaused=' + (isUserPaused() ? '1' : '0')
      + ' ; internalPaused=' + (isInternalPaused() ? '1' : '0')
      + ' ; content=' + String(STATE.media.contentKeyShort || '-')
      + ' ; lastGood=' + (isFinite(toNum(STATE.media.lastGoodCt, NaN)) ? toNum(STATE.media.lastGoodCt, 0).toFixed(2) : '-')
      + ' ; failCounter=' + String(toInt(STATE.recovery.failCounter, 0))
      + ' ; hardResets=' + String(toInt(STATE.recovery.hardResetCount, 0))
      + '</div>';
    html += '</div>';

    if (STATE.popup.body) STATE.popup.body.innerHTML = html;
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
    STATE.popup.lastOpenTs = nowMs();
    popupRender();
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
    try { if (STATE.popup.root) STATE.popup.root.classList.add('dg-hidden'); } catch (_) { }
    log('DBG', 'popup_hide', { reason: String(reason || '') });
  }

  function onTick() {
    try {
      if (!STATE.enabled) return;
      var s = collectSnapshot();
      dgDecisionTick(s);
      if (STATE.popup.open) popupRender(s);
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
    startTimer();
    if (STATE.cfg.debugOnOpen) popupOpen(reason || 'debug_on_open');
  }

  function deactivateRuntime(reason) {
    stopTimer();
    detachVideoListeners();
    resetRuntimeState('deactivate:' + String(reason || ''));
    popupHide('deactivate');
  }

  function shouldInterceptNow() {
    return !!STATE.enabled;
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

      try { handleUserCommand(lower, payload); } catch (_) { }

      if (shouldInterceptNow()) {
        try {
          var s = collectSnapshot();

          if (lower === 'start') {
            STATE.life.lastStartTs = nowMs();
            setPauseOwner('none', 'player_start');
            if (!STATE.recovery.active) setStage(ST.TRACKING, 'player_start');
          }

          if (shouldBlockNextType(lower)) {
            if (lower === 'ended' && shouldAllowRealEnd(s)) {
              // real ending path
            } else if (shouldBlockNextNow(s)) {
              armBlockNext(STATE.cfg.blockNextMs, 'send:' + lower);
              handleFalseEndAndRecover('send:' + lower, s);
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

      try {
        if (lower === 'timeupdate') markEvent('timeupdate');
        else if (lower === 'progress') markEvent('progress');
        else if (lower === 'waiting') markEvent('waiting');
        else if (lower === 'stalled') markEvent('stalled');
        else if (lower === 'pause') {
          markEvent('pause');
          if (STATE.user.pendingCmd === 'pause' && ageMs(STATE.user.pendingTs) <= 1200) setPauseOwner('user', 'pv_pause_user');
          else if (isUserIntent('pause')) setPauseOwner('user', 'pv_pause_recent_input');
          else setPauseOwner('internal', 'pv_pause_internal');
        }
        else if (lower === 'play' || lower === 'playing') {
          markEvent('playing');
          setPauseOwner('none', 'pv_playing');
        }
        else if (lower === 'seeking' || lower === 'seeked') {
          markEvent(lower);
          armUserSeekWindow(1200, 'pv_' + lower);
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
            } else if (STATE.cfg.falseEndEnabled) {
              armBlockNext(STATE.cfg.blockNextMs, 'pv_ended');
              handleFalseEndAndRecover('pv_ended', s);
              log('WRN', 'block_pv_ended', { leftMs: blockNextLeftMs(), stage: STATE.stage.name });
              return;
            }
          }
          if (shouldBlockNextType(lower) && lower !== 'ended' && shouldBlockNextNow(s)) {
            armBlockNext(STATE.cfg.blockNextMs, 'pv:' + lower);
            handleFalseEndAndRecover('pv:' + lower, s);
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

  function patchAll() {
    patchPlayerSend();
    patchPlayerVideoSend();
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
      recovery: {
        active: !!STATE.recovery.active,
        step: String(STATE.recovery.step || ''),
        failCounter: toInt(STATE.recovery.failCounter, 0),
        hardResetCount: toInt(STATE.recovery.hardResetCount, 0),
        nextAllowedLeftMs: Math.max(0, toInt(STATE.recovery.nextAllowedTs, 0) - nowMs()),
        verifyLeftMs: Math.max(0, toInt(STATE.recovery.verifyUntilTs, 0) - nowMs()),
        lastAction: String(STATE.recovery.lastAction || ''),
        lastErr: String(STATE.recovery.lastErr || ''),
        lastTrigger: String(STATE.recovery.lastTrigger || '')
      },
      guard: {
        blockNextLeftMs: blockNextLeftMs(),
        blockReason: String(STATE.guard.blockReason || '')
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
    if (STATE.enabled) setStage(ST.TRACKING, 'api_reset');
    return API.getStateSnapshot();
  };

  API.install();
})();
