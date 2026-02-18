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
    mode: LS_PREFIX + 'player_overlay_mode',
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
    resumeBackoffSec: LS_PREFIX + 'player_overlay_resume_backoff_sec',
    resumeMinStepSec: LS_PREFIX + 'player_overlay_resume_min_step_sec',
    seekVerifyDelayMs: LS_PREFIX + 'player_overlay_seek_verify_delay_ms',
    seekDeltaSec: LS_PREFIX + 'player_overlay_seek_delta_sec',
    warmupAfterRecoverMs: LS_PREFIX + 'player_overlay_warmup_ms_after_recover',
    userSeekWindowMs: LS_PREFIX + 'player_overlay_user_seek_window_ms',
    userNavWindowMs: LS_PREFIX + 'player_overlay_user_nav_window_ms',

    dgStallSoftMs: LS_PREFIX + 'player_overlay_dg_stall_soft_ms',
    dgStallHardMs: LS_PREFIX + 'player_overlay_dg_stall_hard_ms',
    dgWarmupGraceMs: LS_PREFIX + 'player_overlay_dg_warmup_grace_ms',
    dgResumeToleranceSec: LS_PREFIX + 'player_overlay_dg_resume_tolerance_sec',
    dgResumeSeekRetryMax: LS_PREFIX + 'player_overlay_dg_resume_seek_retry_max',
    dgRecoverRetryMax: LS_PREFIX + 'player_overlay_dg_recover_retry_max',
    dgFailsafeCooldownMs: LS_PREFIX + 'player_overlay_dg_failsafe_cooldown_ms',
    dgDebugLevel: LS_PREFIX + 'player_overlay_dg_debug_level',
    dgBlockNextMs: LS_PREFIX + 'player_overlay_dg_block_next_ms',
    dgTailSec: LS_PREFIX + 'player_overlay_dg_tail_sec',
    dgFalseEndJumpSec: LS_PREFIX + 'player_overlay_dg_false_end_jump_sec',
    dgFakeFullEnabled: LS_PREFIX + 'player_overlay_dg_fake_full_enabled',
    dgFalseEndEnabled: LS_PREFIX + 'player_overlay_dg_false_end_enabled',

    truthSec: LS_PREFIX + 'player_overlay_truth_sec',
    truthTs: LS_PREFIX + 'player_overlay_truth_ts',
    truthSrcSig: LS_PREFIX + 'player_overlay_truth_src_sig',
    truthMap: LS_PREFIX + 'player_overlay_truth_map_v1',

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
    PAUSED_MEDIA: 'PAUSED_MEDIA',
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
    inactiveGraceMs: 2500,
    dgUserPauseWindowMs: 2200,
    dgWakeupPlayCooldownMs: 1600,
    dgWakeupVerifyMs: 700,
    dgWakeupMoveSec: 0.12,
    logLimit: 50
  };

  var CFG = {
    enabled: true,
    mode: 'legacy',
    debugOnOpen: false,
    popupOpacity: 85,
    protectNext: true,
    storeTruth: true,
    truthCommitMs: 100,
    hangTimeMs: 12000,
    hangBufMs: 18000,
    resumeGuardMs: 180000,
    falseEndStaleAllow: true,
    fakeFullEnabled: true,
    fakeFullNoProgMs: 6000,
    fakeFullNoMoveMs: 6000,
    minAheadSec: 0.1,
    underrunNoProgMs: 4000,
    underrunNoAheadMoveMs: 4000,
    softAttempts: 2,
    inplayerAttempts: 3,
    inplayerMode: 'destroy_url',
    escalateToReopen: true,
    reopenCooldownMs: 8000,
    frameHangMs: 3200,
    frameCtDeltaSec: 1.0,
    frameGraceMs: 12000,
    resumeBackoffSec: 0.3,
    resumeMinStepSec: 0.1,
    seekVerifyDelayMs: 900,
    seekDeltaSec: 0.1,
    warmupAfterRecoverMs: 18000,
    userSeekWindowMs: 1800,
    userNavWindowMs: 2500,

    dgStallSoftMs: 1200,
    dgStallHardMs: 2500,
    dgWarmupGraceMs: 1200,
    dgResumeToleranceSec: 0.12,
    dgResumeSeekRetryMax: 2,
    dgRecoverRetryMax: 2,
    dgFailsafeCooldownMs: 8000,
    dgDebugLevel: 'normal',
    dgBlockNextMs: 6000,
    dgTailSec: 3.0,
    dgFalseEndJumpSec: 10.0,
    dgFakeFullEnabled: true,
    dgFalseEndEnabled: true
  };

  var OVERLAY_DEFAULTS = {
    enabled: 1,
    mode: 'legacy',
    debug_on_open: 0,
    debug_opacity: 0.85,

    protect_next: 1,
    store_truth: 1,
    truth_commit_ms: 100,

    min_ahead_sec: 0.1,
    underrun_no_prog_ms: 4500,
    underrun_no_ahead_move_ms: 4500,

    fake_full_enabled: 1,
    fake_full_no_prog_ms: 6500,
    fake_full_no_move_ms: 6500,

    hang_time_ms: 12000,
    hang_buf_ms: 18000,
    resume_guard_ms: 180000,
    false_end_stale_allow: 1,

    frame_hang_ms: 3500,
    frame_ct_delta_sec: 1.0,
    frame_grace_ms: 12000,

    critical_window_ms: 30000,
    block_next_ms: 30000,

    seek_verify_delay_ms: 900,
    seek_delta_sec: 0.1,
    resume_backoff_sec: 0.3,
    resume_min_step_sec: 0.1,
    warmup_ms_after_recover: 18000,

    user_seek_window_ms: 1800,
    user_nav_window_ms: 2500,
    pause_hold_ms: 15000,

    dg_stall_soft_ms: 1200,
    dg_stall_hard_ms: 2500,
    dg_warmup_grace_ms: 1200,
    dg_resume_tolerance_sec: 0.12,
    dg_resume_seek_retry_max: 2,
    dg_recover_retry_max: 2,
    dg_failsafe_cooldown_ms: 8000,
    dg_debug_level: 'normal',
    dg_block_next_ms: 6000,
    dg_tail_sec: 3.0,
    dg_false_end_jump_sec: 10.0,
    dg_fake_full_enabled: 1,
    dg_false_end_enabled: 1,

    soft_attempts: 0,
    inplayer_attempts: 2,
    reopen_attempts: 2,
    inplayer_rebuild_mode: 'destroy_url',
    escalate_to_reopen: 1,
    reopen_cooldown_ms: 8000
  };

  function overlayDefaultsCopy() {
    var out = {};
    var kx;
    for (kx in OVERLAY_DEFAULTS) {
      if (!Object.prototype.hasOwnProperty.call(OVERLAY_DEFAULTS, kx)) continue;
      out[kx] = OVERLAY_DEFAULTS[kx];
    }
    return out;
  }

  function overlayStorageDefaultsList() {
    var d = overlayDefaultsCopy();
    return [
      { key: K.enabled, def: toInt(d.enabled, 1) ? 1 : 0 },
      { key: K.mode, def: normalizeOverlayMode(d.mode || 'legacy') },
      { key: K.debugOnOpen, def: toInt(d.debug_on_open, 0) ? 1 : 0 },
      { key: K.popupOpacity, def: clampInt(Math.round(toNum(d.debug_opacity, 0.85) * 100), 20, 100) },
      { key: K.protectNext, def: toInt(d.protect_next, 1) ? 1 : 0 },
      { key: K.storeTruth, def: toInt(d.store_truth, 1) ? 1 : 0 },
      { key: K.truthCommitMs, def: clampInt(toInt(d.truth_commit_ms, 100), 100, 2000) },
      { key: K.hangTimeMs, def: clampInt(toInt(d.hang_time_ms, 12000), 3000, 60000) },
      { key: K.hangBufMs, def: clampInt(toInt(d.hang_buf_ms, 18000), 3000, 60000) },
      { key: K.resumeGuardMs, def: clampInt(toInt(d.resume_guard_ms, 180000), 30000, 600000) },
      { key: K.falseEndStaleAllow, def: toInt(d.false_end_stale_allow, 1) ? 1 : 0 },
      { key: K.fakeFullEnabled, def: toInt(d.fake_full_enabled, 1) ? 1 : 0 },
      { key: K.fakeFullNoProgMs, def: clampInt(toInt(d.fake_full_no_prog_ms, 6500), 1000, 30000) },
      { key: K.fakeFullNoMoveMs, def: clampInt(toInt(d.fake_full_no_move_ms, 6500), 1000, 30000) },
      { key: K.minAheadSec, def: Math.max(0, Math.min(3, toNum(d.min_ahead_sec, 0.1))) },
      { key: K.underrunNoProgMs, def: clampInt(toInt(d.underrun_no_prog_ms, 4500), 1000, 30000) },
      { key: K.underrunNoAheadMoveMs, def: clampInt(toInt(d.underrun_no_ahead_move_ms, 4500), 1000, 30000) },
      { key: K.softAttempts, def: clampInt(toInt(d.soft_attempts, 0), 0, 5) },
      { key: K.inplayerAttempts, def: clampInt(toInt(d.inplayer_attempts, 2), 0, 6) },
      { key: K.inplayerMode, def: normalizeInplayerMode(d.inplayer_rebuild_mode || 'destroy_url') },
      { key: K.escalateToReopen, def: toInt(d.escalate_to_reopen, 1) ? 1 : 0 },
      { key: K.reopenCooldownMs, def: clampInt(toInt(d.reopen_cooldown_ms, 8000), 1000, 60000) },
      { key: K.resumeBackoffSec, def: Math.max(0.05, Math.min(4, toNum(d.resume_backoff_sec, 0.3))) },
      { key: K.resumeMinStepSec, def: Math.max(0.05, Math.min(2, toNum(d.resume_min_step_sec, 0.1))) },
      { key: K.seekVerifyDelayMs, def: clampInt(toInt(d.seek_verify_delay_ms, 900), 250, 5000) },
      { key: K.seekDeltaSec, def: Math.max(0.05, Math.min(10, toNum(d.seek_delta_sec, 0.1))) },
      { key: K.warmupAfterRecoverMs, def: clampInt(toInt(d.warmup_ms_after_recover, 18000), 2000, 60000) },
      { key: K.userSeekWindowMs, def: clampInt(toInt(d.user_seek_window_ms, 1800), 300, 15000) },
      { key: K.userNavWindowMs, def: clampInt(toInt(d.user_nav_window_ms, 2500), 300, 15000) },
      { key: K.dgStallSoftMs, def: clampInt(toInt(d.dg_stall_soft_ms, 1200), 500, 15000) },
      { key: K.dgStallHardMs, def: clampInt(toInt(d.dg_stall_hard_ms, 2500), 900, 30000) },
      { key: K.dgWarmupGraceMs, def: clampInt(toInt(d.dg_warmup_grace_ms, 1200), 300, 10000) },
      { key: K.dgResumeToleranceSec, def: Math.max(0.05, Math.min(2, toNum(d.dg_resume_tolerance_sec, 0.12))) },
      { key: K.dgResumeSeekRetryMax, def: clampInt(toInt(d.dg_resume_seek_retry_max, 2), 0, 5) },
      { key: K.dgRecoverRetryMax, def: clampInt(toInt(d.dg_recover_retry_max, 2), 0, 5) },
      { key: K.dgFailsafeCooldownMs, def: clampInt(toInt(d.dg_failsafe_cooldown_ms, 8000), 1000, 120000) },
      { key: K.dgDebugLevel, def: normalizeDgDebugLevel(d.dg_debug_level || 'normal') },
      { key: K.dgBlockNextMs, def: clampInt(toInt(d.dg_block_next_ms, 6000), 1000, 30000) },
      { key: K.dgTailSec, def: Math.max(0.5, Math.min(12, toNum(d.dg_tail_sec, 3.0))) },
      { key: K.dgFalseEndJumpSec, def: Math.max(1, Math.min(120, toNum(d.dg_false_end_jump_sec, 10.0))) },
      { key: K.dgFakeFullEnabled, def: toInt(d.dg_fake_full_enabled, 1) ? 1 : 0 },
      { key: K.dgFalseEndEnabled, def: toInt(d.dg_false_end_enabled, 1) ? 1 : 0 }
    ];
  }

  var STATE = {
    installed: false,
    patched: { player: false, playlist: false, controller: false, video: false },
    timer: null,
    lastCfgReadTs: 0,
    settingsMigrated: false,

    phase: ST.IDLE,
    phaseReason: '',
    phaseTs: 0,

    video: null,
    listeners: null,

    userPausedIntent: false,
    user: {
      pauseIntent: 0,
      pauseHoldUntilTs: 0,
      pauseHoldWhy: '',
      lastCmdTs: 0,
      lastCmd: '',
      lastCmdRaw: '',
      lastCmdNorm: '',
      lastIntentTs: 0
    },
    media: {
      paused: false,
      lastPauseTs: 0,
      lastPlayTs: 0
    },
    pendingUserCommand: '',
    pendingUserCommandTs: 0,
    pendingUserCommandTimer: null,
    pause: {
      lastPauseTs: 0,
      lastResumeTs: 0
    },
    life: {
      active: 0,
      closedTs: 0,
      openedTs: 0,
      exitIntent: 0,
      suspendDetectors: 0,
      detectorsAllowed: 0,
      detectorsReason: 'init',
      lastAutoPlaySuppressed: '',
      lastAutoPlaySuppressedTs: 0
    },
    session: {
      id: 0,
      srcSig: '',
      startedTs: 0
    },
    intent: {
      userSeekUntilTs: 0,
      guardSeekUntilTs: 0,
      userNavUntilTs: 0,
      userPausedIntent: 0,
      guardPlayLockUntilTs: 0,
      userLastSeekTs: 0
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
      lastReopenTs: 0,
      lastSoftTs: 0
    },

    guard: {
      blockNextUntilTs: 0,
      preventStartUntilTs: 0,
      preventEndedUntilTs: 0,
      falseEndCriticalUntilTs: 0,
      allowStartUntilTs: 0,
      allowStartSig: '',
      lastTailClampTs: 0,
      lastTailClampKind: '',
      tailJumpClampCount: 0,
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
        playing: 0,
        seeking: 0,
        seeked: 0
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
        playing: 0,
        seeking: 0,
        seeked: 0
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

    det: {
      warmupUntilTs: 0,
      lastStartTs: 0,
      lastReadyTs: 0,
      hadTimeupdate: 0,
      hadProgress: 0,
      hadBufferMove: 0,
      lastRecoverTs: 0,
      recoverLoopCount: 0,
      recoverBackoffUntilTs: 0,
      lastResetSignalsReason: ''
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

    frames: {
      supported: 0,
      lastFrames: -1,
      lastFrameTs: 0,
      lastFrameCt: NaN,
      frameStuckMs: 0,
      ctDeltaSinceFrame: 0,
      graceUntilTs: 0,
      lastWhy: '',
      lastDetectTs: 0,
      detectCount: 0
    },

    truth: {
      lastGoodSec: 0,
      lastGoodTs: 0,
      lastCommitTs: 0,
      srcSig: '',
      srcRaw: '',
      frozen: false,
      bySig: {}
    },

    pos: {
      lastStableSec: NaN,
      lastStableTs: 0,
      lastStableSrcSig: '',
      lastStableReason: ''
    },

    resume: {
      ticket: null,
      lastTicket: null,
      carry: null,
      unfreezeTimer: null,
      lastApplyStage: '',
      lastApplyTs: 0,
      lastVerifyOk: 0,
      lastVerifyDelta: NaN,
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
      rawCurrent: NaN,
      rawDuration: NaN,
      vidCurrent: NaN,
      vidDuration: NaN,
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

    flags: {
      fakeFull: { on: 0, ts: 0, count: 0, details: '', lastStartTs: 0 },
      underrun: { on: 0, ts: 0, count: 0, details: '', lastStartTs: 0 },
      playingStuck: { on: 0, ts: 0, count: 0, details: '', lastStartTs: 0 }
    },

    trace: {
      lastTs: 0
    },

    dg: {
      state: 'IDLE',
      reason: '',
      stateTs: 0,
      contentKey: '',
      lastContentKey: '',
      samples: [],
      sampleCap: 120,
      lastSampleTs: 0,
      lastGoodSample: null,
      lastStableSample: null,
      stallCandidateTs: 0,
      targetSec: NaN,
      targetKey: '',
      recoverAttempts: 0,
      recoverRetry: 0,
      verifyAttempts: 0,
      corrections: 0,
      recoverToken: 0,
      recoverActive: false,
      verifyTimer: null,
      failsafeUntilTs: 0,
      suspendUntilTs: 0,
      userPauseUntilTs: 0,
      userSeekUntilTs: 0,
      pauseByUser: 0,
      internalPause: 0,
      wakeupPlayTs: 0,
      wakeupVerifyUntilTs: 0,
      wakeupStartCt: NaN,
      wakeupResult: '',
      wakeupReason: '',
      pauseProbeUntilTs: 0,
      lastPauseSignalTs: 0,
      lastTrigger: '',
      lastAction: '',
      lastErr: '',
      lastVerifyOk: 0,
      lastVerifyStage: '',
      lastVerifyReason: '',
      lastVerifyTs: 0,
      endGuard: {
        blockNextUntilTs: 0,
        blockContentKey: '',
        falseEndDetected: 0,
        falseEndReason: '',
        falseEndTs: 0,
        ctJumpDelta: 0,
        nearEnd: 0
      },
      bufferGuard: {
        fakeFullDetected: 0,
        underrunDetected: 0,
        reason: '',
        reasonTs: 0,
        bufferSig: '',
        ranges: ''
      }
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
      subTitleEl: null,
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

  function extractStartSig(payload) {
    try {
      if (!payload) return '';
      if (typeof payload === 'string') {
        if (payload.indexOf('http') === 0 || payload.indexOf('blob:') === 0) return String(srcSig(payload));
        return '';
      }

      var u = payload.url || payload.src || payload.source || payload.stream || payload.file;
      if (typeof u === 'string' && u) return String(srcSig(u));

      if (payload.video && typeof payload.video === 'string') return String(srcSig(payload.video));
      if (payload.data && typeof payload.data.url === 'string') return String(srcSig(payload.data.url));
      return '';
    } catch (_) {
      return '';
    }
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
    if (phase === ST.PAUSED_BY_USER || phase === ST.PAUSED_MEDIA) return '#8eb4ff';
    return '#b7bec7';
  }

  function normalizeInplayerMode(v) {
    try { v = String(v || '').toLowerCase(); } catch (_) { v = ''; }
    if (v === 'destroy_url' || v === 'video_src' || v === 'refresh_src') return v;
    return 'refresh_src';
  }

  function normalizeOverlayMode(v) {
    try { v = String(v || '').toLowerCase(); } catch (_) { v = ''; }
    if (v === 'off') return 'off';
    if (v === 'delta' || v === 'deltaguard' || v === 'delta_guard') return 'delta';
    return 'legacy';
  }

  function normalizeDgDebugLevel(v) {
    try { v = String(v || '').toLowerCase(); } catch (_) { v = ''; }
    if (v === 'silent' || v === 'trace') return v;
    return 'normal';
  }

  function isModeOff() {
    return !CFG.enabled || String(CFG.mode || 'legacy') === 'off';
  }

  function isModeDelta() {
    return !!CFG.enabled && String(CFG.mode || 'legacy') === 'delta';
  }

  function isModeLegacy() {
    return !!CFG.enabled && String(CFG.mode || 'legacy') === 'legacy';
  }

  function setUserPauseIntent(on, why) {
    var val = on ? 1 : 0;
    var ts = nowMs();
    STATE.user.pauseIntent = val;
    STATE.user.lastIntentTs = ts;
    STATE.userPausedIntent = !!val; // legacy mirror
    STATE.intent.userPausedIntent = val;
    if (val) {
      STATE.intent.guardPlayLockUntilTs = Math.max(toInt(STATE.intent.guardPlayLockUntilTs, 0), ts + 60000);
      STATE.dg.userPauseUntilTs = Math.max(toInt(STATE.dg.userPauseUntilTs, 0), ts + clampInt(toInt(DET.dgUserPauseWindowMs, 2200), 800, 15000));
      STATE.dg.pauseByUser = 1;
      STATE.dg.internalPause = 0;
    } else {
      STATE.intent.guardPlayLockUntilTs = 0;
      STATE.dg.userPauseUntilTs = 0;
      STATE.dg.pauseByUser = 0;
      STATE.dg.internalPause = 0;
    }
    if (why) logLine('DBG', 'pause_intent', {
      on: val,
      why: String(why || ''),
      lockLeftMs: Math.max(0, toInt(STATE.intent.guardPlayLockUntilTs, 0) - ts)
    });
  }

  function isUserPauseIntent() {
    return !!(STATE.user && toInt(STATE.user.pauseIntent, 0));
  }

  function dgUserPauseWindowMs() {
    return clampInt(Math.max(900, toInt(DET.dgUserPauseWindowMs, 2200)), 800, 15000);
  }

  function markDgUserPauseIntent(ms, why) {
    ms = clampInt(ms || dgUserPauseWindowMs(), 800, 15000);
    var until = nowMs() + ms;
    STATE.dg.userPauseUntilTs = Math.max(toInt(STATE.dg.userPauseUntilTs, 0), until);
    STATE.dg.pauseByUser = 1;
    STATE.dg.internalPause = 0;
    if (why) logLine('DBG', 'DG_USER_PAUSE', { ms: ms, why: String(why || '') });
  }

  function dgPauseByUser(tick) {
    tick = tick || STATE.tick || {};
    if (isUserPauseIntent()) return true;
    if (nowMs() < toInt(STATE.dg.userPauseUntilTs, 0)) return true;
    if (String(STATE.user.lastCmdNorm || '') === 'pause' && ageMs(toInt(STATE.user.lastCmdTs, 0)) <= dgUserPauseWindowMs()) return true;
    if (!tick || !tick.paused) return false;
    return false;
  }

  function dgUserPauseLeftMs(tick) {
    tick = tick || STATE.tick || {};
    if (!tick || !tick.paused) return 0;
    var left = Math.max(0, toInt(STATE.dg.userPauseUntilTs, 0) - nowMs());
    if (isUserPauseIntent()) {
      left = Math.max(left, Math.max(0, toInt(STATE.user.pauseHoldUntilTs, 0) - nowMs()));
    }
    return left;
  }

  function dgClearWakeupState(result, why) {
    if (result) STATE.dg.wakeupResult = String(result || '');
    if (why) STATE.dg.wakeupReason = String(why || '');
    STATE.dg.wakeupVerifyUntilTs = 0;
    STATE.dg.wakeupStartCt = NaN;
  }

  function dgOnPauseSignal(origin) {
    origin = String(origin || 'pause_signal');
    var ts = nowMs();
    STATE.dg.lastPauseSignalTs = ts;
    STATE.pause.lastPauseTs = now();
    STATE.media.paused = true;
    STATE.media.lastPauseTs = ts;

    var byUser = dgPauseByUser(STATE.tick || {});
    if (!byUser && String(STATE.user.lastCmdNorm || '') === 'pause' && ageMs(toInt(STATE.user.lastCmdTs, 0)) <= dgUserPauseWindowMs()) {
      markDgUserPauseIntent(dgUserPauseWindowMs(), origin + ':recent_cmd_pause');
      byUser = true;
    }
    var pendingAge = ageMs(toInt(STATE.pendingUserCommandTs, 0));
    if (!byUser && String(STATE.pendingUserCommand || '') === 'pause' && pendingAge <= 1200) {
      markDgUserPauseIntent(dgUserPauseWindowMs(), origin + ':pending_cmd_pause');
      byUser = true;
    }

    STATE.dg.pauseByUser = byUser ? 1 : 0;
    STATE.dg.internalPause = byUser ? 0 : 1;

    if (byUser) {
      setUserPauseIntent(true, 'onpause:' + origin);
      if (!STATE.rec.active) {
        STATE.user.pauseHoldUntilTs = ts + 15000;
        STATE.user.pauseHoldWhy = 'video_onpause_user';
      }
      STATE.dg.pauseProbeUntilTs = 0;
      if (isModeDelta()) dgSetState(DG_ST.SUSPENDED, 'paused(user)');
      logLine('DBG', 'pause_hold', { ms: Math.max(0, toInt(STATE.user.pauseHoldUntilTs, 0) - ts), why: origin, byUser: 1 });
      return;
    }

    STATE.user.pauseHoldUntilTs = 0;
    STATE.user.pauseHoldWhy = '';
    STATE.dg.pauseProbeUntilTs = Math.max(toInt(STATE.dg.pauseProbeUntilTs, 0), ts + 350);
    if (isModeDelta()) dgSetState(DG_ST.STALL_CANDIDATE, 'paused_internal');
    logLine('WRN', 'DG internal pause', { why: origin, byUser: 0, rec: STATE.rec.active ? 1 : 0 });
  }

  function dgOnPlaySignal(origin) {
    origin = String(origin || 'play_signal');
    STATE.pause.lastResumeTs = now();
    STATE.media.paused = false;
    STATE.media.lastPlayTs = nowMs();
    STATE.user.pauseHoldUntilTs = 0;
    STATE.user.pauseHoldWhy = '';
    if (!toInt(STATE.life.exitIntent, 0)) STATE.life.suspendDetectors = 0;
    STATE.dg.pauseByUser = 0;
    STATE.dg.internalPause = 0;
    STATE.dg.pauseProbeUntilTs = 0;
    if (String(STATE.dg.wakeupResult || '') === 'attempted') {
      STATE.dg.wakeupResult = 'ok';
      STATE.dg.wakeupReason = origin;
    }
    dgClearWakeupState('', origin);
    if (!STATE.rec.active && isUserPauseIntent() && String(STATE.user.lastCmdNorm || '') === 'play' && ageMs(STATE.user.lastCmdTs) < 4000) {
      setUserPauseIntent(false, 'media_' + origin);
    }
  }

  function markUserSeekIntent(ms, why) {
    ms = clampInt(ms || toInt(CFG.userSeekWindowMs, 1800), 300, 15000);
    var until = nowMs() + ms;
    STATE.intent.userSeekUntilTs = Math.max(toInt(STATE.intent.userSeekUntilTs, 0), until);
    STATE.intent.userLastSeekTs = nowMs();
    STATE.dg.suspendUntilTs = Math.max(toInt(STATE.dg.suspendUntilTs, 0), until);
    STATE.dg.userSeekUntilTs = Math.max(toInt(STATE.dg.userSeekUntilTs, 0), until);
    if (isModeDelta()) dgSetState('SUSPENDED', 'user_seek');
    if (why) logLine('INF', 'USER_SEEK intent', { ms: ms, why: String(why || '') });
  }

  function markGuardSeekIntent(ms, why) {
    ms = clampInt(ms || toInt(CFG.userSeekWindowMs, 1800), 300, 15000);
    STATE.intent.guardSeekUntilTs = Math.max(toInt(STATE.intent.guardSeekUntilTs, 0), nowMs() + ms);
    armWarmup(6000, String(why || 'guard_seek'));
    if (why) logLine('DBG', 'GUARD_SEEK intent', { ms: ms, why: String(why || '') });
  }

  function isUserSeekWindowActive() {
    return nowMs() < toInt(STATE.intent.userSeekUntilTs, 0);
  }

  function markUserNavIntent(ms, why) {
    ms = clampInt(ms || toInt(CFG.userNavWindowMs, 2500), 300, 15000);
    var ts = nowMs();
    STATE.intent.userNavUntilTs = Math.max(toInt(STATE.intent.userNavUntilTs, 0), ts + ms);
    STATE.dg.suspendUntilTs = Math.max(toInt(STATE.dg.suspendUntilTs, 0), ts + ms);
    if (isModeDelta()) dgSetState('SUSPENDED', 'user_nav');
    if (STATE.rec.active) recoveryCancel('user_nav');
    if (STATE.resume && STATE.resume.carry) clearCarry('user_nav', true);
    if (STATE.resume && STATE.resume.ticket) {
      STATE.resume.ticket = null;
      syncResumeTicket({
        id: '',
        recToken: toInt(STATE.rec.token, 0),
        sec: null,
        srcSig: '',
        createdTs: ts,
        reason: 'user_nav',
        kind: 'discard',
        source: 'user_nav',
        applied: 0,
        applyTs: 0,
        lastApplyErr: 'user_nav',
        verifyOk: 0,
        verifyDelta: NaN
      });
    }
    truthFreeze(false, 'user_nav');
    logLine('INF', 'USER_NAV intent', { ms: ms, why: String(why || '') });
  }

  function isUserNavWindowActive() {
    return nowMs() < toInt(STATE.intent.userNavUntilTs, 0);
  }

  function isNavType(type) {
    var t = String(type || '').toLowerCase();
    if (!t) return false;
    if (t === 'next' || t === 'select' || t === 'start' || t === 'open' || t === 'open_episode') return true;
    if (t.indexOf('next') >= 0) return true;
    if (t.indexOf('select') >= 0) return true;
    if (t.indexOf('open') >= 0 && t.indexOf('popup') < 0) return true;
    return false;
  }

  function isLikelyManualNavPayload(payload) {
    if (!payload || typeof payload !== 'object') return false;
    try {
      if (payload.manual === true || payload.user === true) return true;
      if (String(payload.by || '').toLowerCase() === 'user') return true;
      if (String(payload.source || '').toLowerCase() === 'user') return true;
      if (String(payload.origin || '').toLowerCase() === 'user') return true;
      if (String(payload.reason || '').toLowerCase().indexOf('manual') >= 0) return true;
    } catch (_) { }
    return false;
  }

  function isPlayingLike(tick) {
    tick = tick || STATE.tick;
    if (!tick || !tick.hasVideo) return false;
    if (isUserPauseIntent()) return false;
    return !tick.paused;
  }

  function markLifeOpen(reason) {
    var was = toInt(STATE.life.active, 0) === 1;
    STATE.life.active = 1;
    STATE.life.openedTs = nowMs();
    STATE.life.exitIntent = 0;
    if (!isUserPauseIntent()) STATE.life.suspendDetectors = 0;
    if (!was) logLine('INF', 'life.active', { on: 1, reason: String(reason || '') });
  }

  function markLifeClosed(reason) {
    var was = toInt(STATE.life.active, 0) === 1;
    STATE.life.active = 0;
    STATE.life.closedTs = nowMs();
    if (was) logLine('WRN', 'life.active', { on: 0, reason: String(reason || '') });
  }

  function detectPlayerActive() {
    if (toInt(STATE.life.exitIntent, 0) === 1) return false;
    if (STATE.rec.active) return true;

    var t = STATE.tick || {};
    if (t && t.hasVideo && String(STATE.phase || '') !== ST.IDLE) return true;
    if (!t.hasVideo && String(STATE.phase || '') !== ST.IDLE && ageMs(STATE.life.openedTs) < DET.inactiveGraceMs) return true;
    return false;
  }

  function detectAllowedInfo() {
    var reason = 'ok';
    if (!CFG.enabled) reason = 'disabled';
    else if (String(CFG.mode || 'legacy') === 'off') reason = 'mode_off';
    else if (!toInt(STATE.life.active, 0)) reason = 'inactive';
    else if (toInt(STATE.life.exitIntent, 0)) reason = 'exit_intent';
    else if (!(STATE.tick && STATE.tick.hasVideo)) reason = 'no_video';
    return { ok: reason === 'ok', reason: reason };
  }

  function detectorsAllowedInfo() {
    var d = detectAllowedInfo();
    if (!d.ok) {
      STATE.life.detectorsAllowed = 0;
      STATE.life.detectorsReason = String(d.reason || 'blocked');
      return d;
    }

    var holdLeft = Math.max(0, toInt(STATE.user.pauseHoldUntilTs, 0) - nowMs());
    if (holdLeft > 0) {
      STATE.life.detectorsAllowed = 0;
      STATE.life.detectorsReason = 'pause_hold';
      return { ok: false, reason: 'pause_hold' };
    }

    var reason = 'ok';
    var tk = STATE.tick || {};
    if (tk && tk.hasVideo && tk.paused) {
      if (isModeDelta()) {
        if (isUserPauseIntent() || dgPauseByUser(tk)) reason = 'paused_by_user';
      } else {
        reason = 'media_paused';
      }
    } else if (isUserPauseIntent()) reason = 'paused_by_user';
    else if (isUserSeekWindowActive()) reason = 'user_seek';
    else if (isUserNavWindowActive()) reason = 'user_nav';
    else if (toInt(STATE.life.suspendDetectors, 0)) reason = 'suspended';
    else if (String(STATE.phase || '') === ST.IDLE) reason = 'idle';

    var ok = reason === 'ok';
    STATE.life.detectorsAllowed = ok ? 1 : 0;
    STATE.life.detectorsReason = reason;
    return { ok: ok, reason: reason };
  }

  function detectorsAllowed() {
    return !!detectorsAllowedInfo().ok;
  }

  function shouldAutoPlay(reason) {
    var why = '';
    var tk = STATE.tick || {};
    if (tk && tk.hasVideo && tk.paused) {
      if (isModeDelta()) {
        if (isUserPauseIntent() || dgPauseByUser(tk)) why = 'user_paused';
      } else why = 'media_paused';
    }
    else if (!toInt(STATE.life.active, 0)) why = 'inactive';
    else if (toInt(STATE.life.exitIntent, 0)) why = 'exit_intent';
    else if (isUserPauseIntent()) why = 'user_paused';
    else if (nowMs() < toInt(STATE.intent.guardPlayLockUntilTs, 0)) why = 'guard_play_lock';

    if (why) {
      STATE.life.lastAutoPlaySuppressed = String(reason || why);
      STATE.life.lastAutoPlaySuppressedTs = nowMs();
      logLine('DBG', 'SUPPRESS play', {
        reason: why,
        ctx: String(reason || ''),
        lockLeftMs: Math.max(0, toInt(STATE.intent.guardPlayLockUntilTs, 0) - nowMs())
      });
      return false;
    }
    var st = detectorsAllowedInfo();
    if (!st.ok) {
      STATE.life.lastAutoPlaySuppressed = String(reason || st.reason || 'blocked');
      STATE.life.lastAutoPlaySuppressedTs = nowMs();
      logLine('DBG', 'SUPPRESS play', { reason: String(st.reason || ''), ctx: String(reason || '') });
      return false;
    }
    return true;
  }

  function warmupLeftMs() {
    return Math.max(0, toInt(STATE.det.warmupUntilTs, 0) - nowMs());
  }

  function inWarmup() {
    return warmupLeftMs() > 0;
  }

  function armWarmup(ms, why) {
    ms = clampInt(ms, 1000, 60000);
    STATE.det.warmupUntilTs = Math.max(toInt(STATE.det.warmupUntilTs, 0), nowMs() + ms);
    logLine('INF', 'WARMUP armed', { ms: ms, why: String(why || '') });
  }

  function recoverBackoffLeftMs() {
    return Math.max(0, toInt(STATE.det.recoverBackoffUntilTs, 0) - nowMs());
  }

  function hasPlaybackEvidence() {
    if (toInt(STATE.det.hadTimeupdate, 0)) return true;
    if (toInt(STATE.det.hadProgress, 0)) return true;
    if (toInt(STATE.det.hadBufferMove, 0)) return true;
    return false;
  }

  function resetSignalAges(why) {
    var ts = nowMs();
    var reason = String(why || '');

    STATE.events.last.timeupdate = ts;
    STATE.events.last.progress = ts;
    STATE.events.last.waiting = 0;
    STATE.events.last.stalled = 0;
    STATE.events.last.seeking = ts;
    STATE.events.last.seeked = ts;
    STATE.events.last.canplay = ts;
    STATE.events.last.loadeddata = ts;

    STATE.ev.lastTimeupdateTs = ts;
    STATE.ev.lastProgressTs = ts;
    STATE.ev.lastWaitingTs = 0;
    STATE.ev.lastStalledTs = 0;

    STATE.buf.lastProgTs = ts;
    STATE.buf.lastTimeupdateTs = ts;
    STATE.buf.lastRangesTs = ts;
    STATE.buf.lastAheadMoveTs = ts;
    STATE.buf.lastBufferedEndMoveTs = ts;

    STATE.monitor.lastProgressSignalTs = ts;
    STATE.monitor.lastAheadChangeTs = ts;
    STATE.monitor.lastCtChangeTs = ts;
    STATE.ct.lastChangeTs = ts;
    STATE.ct.lastSampleTs = ts;
    STATE.ct.stuckMs = 0;

    STATE.det.hadTimeupdate = 0;
    STATE.det.hadProgress = 0;
    STATE.det.hadBufferMove = 0;
    STATE.det.lastResetSignalsReason = reason;

    logLine('DBG', 'signal ages reset', { why: reason });
  }

  function canRunDetectors() {
    var d = detectAllowedInfo();
    if (!d.ok) return { ok: false, reason: String(d.reason || 'blocked') };
    if (isModeDelta()) return { ok: false, reason: 'delta_mode' };
    if (toInt(STATE.user.pauseHoldUntilTs, 0) > nowMs()) return { ok: false, reason: 'pause_hold' };
    if (STATE.tick && STATE.tick.hasVideo && STATE.tick.paused) return { ok: false, reason: 'media_paused' };
    if (isUserPauseIntent()) return { ok: false, reason: 'paused_by_user' };
    if (isUserSeekWindowActive()) return { ok: false, reason: 'user_seek' };
    if (isUserNavWindowActive()) return { ok: false, reason: 'user_nav' };
    if (toInt(STATE.life.suspendDetectors, 0)) return { ok: false, reason: 'suspended' };
    if (String(STATE.phase || '') === ST.IDLE) return { ok: false, reason: 'idle' };
    if (STATE.rec.active) return { ok: false, reason: 'recovering' };
    if (inWarmup()) return { ok: false, reason: 'warmup' };
    if (recoverBackoffLeftMs() > 0) return { ok: false, reason: 'recover_backoff' };
    var sinceStart = ageMs(STATE.det.lastStartTs);
    if (sinceStart < 12000 && !hasPlaybackEvidence()) return { ok: false, reason: 'no_evidence_startup' };
    return { ok: true, reason: 'ok' };
  }

  function flagSet(name, on, details) {
    name = String(name || '');
    if (!name || !STATE.flags || !STATE.flags[name]) return;
    var f = STATE.flags[name];
    if (on) {
      f.on = 1;
      f.ts = nowMs();
      f.count = toInt(f.count, 0) + 1;
      f.details = String(details || '');
      return;
    }
    f.on = 0;
    f.details = '';
  }

  function maybeTraceDetectors() {
    if (!CFG.debugOnOpen) return;
    var ts = nowMs();
    if ((ts - toInt(STATE.trace.lastTs, 0)) < 2000) return;
    STATE.trace.lastTs = ts;

    var t = STATE.tick || {};
    var dDetect = detectAllowedInfo();
    var dRecover = detectorsAllowedInfo();
    var ba = bufferAges();
    logLine('DBG', 'TRACE', {
      detect: dDetect.ok ? 1 : 0,
      detectReason: String(dDetect.reason || ''),
      recover: dRecover.ok ? 1 : 0,
      recoverReason: String(dRecover.reason || ''),
      phase: String(STATE.phase || ''),
      paused: t.paused ? 1 : 0,
      ct: isFinite(toNum(t.ct, NaN)) ? toNum(t.ct, 0).toFixed(2) : '',
      dur: isFinite(toNum(t.dur, NaN)) ? toNum(t.dur, 0).toFixed(2) : '',
      ranges: toInt(t.rangesCount, 0),
      r0: (isFinite(toNum(t.firstRangeStart, NaN)) ? toNum(t.firstRangeStart, 0).toFixed(1) : '') + '-' + (isFinite(toNum(t.firstRangeEnd, NaN)) ? toNum(t.firstRangeEnd, 0).toFixed(1) : ''),
      progAge: toInt(ba.progAge, 0),
      bufMoveAge: toInt(ba.bufEndMoveAge, 0),
      frames: toInt(STATE.frames.supported, 0),
      fc: toNum(STATE.frames.lastFrames, -1),
      frameStuckMs: toInt(STATE.frames.frameStuckMs, 0),
      frameCtDelta: toNum(STATE.frames.ctDeltaSinceFrame, 0).toFixed(2),
      frameGraceLeftMs: frameGraceLeftMs(),
      warmupLeftMs: warmupLeftMs(),
      backoffLeftMs: recoverBackoffLeftMs(),
      hadTU: toInt(STATE.det.hadTimeupdate, 0),
      hadProg: toInt(STATE.det.hadProgress, 0),
      hadBuf: toInt(STATE.det.hadBufferMove, 0)
    });
  }

  function numEq(raw, expected) {
    var n = toNum(raw, NaN);
    if (!isFinite(n)) return false;
    return Math.abs(n - toNum(expected, 0)) < 0.0001;
  }

  function maybeMigrateLegacyDefaults(defMap) {
    if (STATE.settingsMigrated) return;
    STATE.settingsMigrated = true;

    function d(key, fallback) {
      key = String(key || '');
      if (key && Object.prototype.hasOwnProperty.call(defMap, key)) return defMap[key];
      return fallback;
    }

    function migrateNumKey(key, oldNum, newVal) {
      var raw = sGet(key, null);
      if (raw === null || raw === undefined || raw === '') return false;
      if (!numEq(raw, oldNum)) return false;
      if (numEq(raw, newVal)) return false;
      sSet(key, String(newVal));
      return true;
    }

    function migrateStrKey(key, oldVal, newVal) {
      var raw = sGet(key, null);
      if (raw === null || raw === undefined || raw === '') return false;
      if (String(raw) !== String(oldVal)) return false;
      if (String(raw) === String(newVal)) return false;
      sSet(key, String(newVal));
      return true;
    }

    var moved = 0;
    if (migrateNumKey(K.hangTimeMs, 3500, d(K.hangTimeMs, 12000))) moved++;
    if (migrateNumKey(K.hangBufMs, 4500, d(K.hangBufMs, 18000))) moved++;
    if (migrateNumKey(K.truthCommitMs, 500, d(K.truthCommitMs, 100))) moved++;
    if (migrateNumKey(K.minAheadSec, 0.6, d(K.minAheadSec, 0.1))) moved++;
    if (migrateNumKey(K.seekDeltaSec, 3.0, d(K.seekDeltaSec, 0.1))) moved++;
    if (migrateStrKey(K.inplayerMode, 'refresh_src', d(K.inplayerMode, 'destroy_url'))) moved++;
    if (migrateNumKey(K.warmupAfterRecoverMs, 12000, d(K.warmupAfterRecoverMs, 18000))) moved++;
    if (migrateNumKey(K.resumeBackoffSec, 0.8, d(K.resumeBackoffSec, 0.3))) moved++;
    if (migrateNumKey(K.resumeMinStepSec, 0.35, d(K.resumeMinStepSec, 0.1))) moved++;

    var htRaw = sGet(K.hangTimeMs, null);
    var hbRaw = sGet(K.hangBufMs, null);
    if (htRaw === null || htRaw === undefined || htRaw === '') {
      var oldHt = sGet(K.oldHangTimeMs, null);
      if (numEq(oldHt, 3500)) {
        sSet(K.hangTimeMs, String(d(K.hangTimeMs, 12000)));
        moved++;
      }
    }
    if (hbRaw === null || hbRaw === undefined || hbRaw === '') {
      var oldHb = sGet(K.oldHangBufMs, null);
      if (numEq(oldHb, 4500)) {
        sSet(K.hangBufMs, String(d(K.hangBufMs, 18000)));
        moved++;
      }
    }

    if (moved > 0) logLine('INF', 'settings_migrated', { changed: moved });
  }

  function readSettingsFromStorage() {
    var defs = overlayStorageDefaultsList();
    var defMap = {};
    var i = 0;
    for (i = 0; i < defs.length; i++) {
      try {
        var di = defs[i] || {};
        var dk = String(di.key || '');
        if (!dk) continue;
        defMap[dk] = di.def;
      } catch (_) { }
    }
    function d(key, fallback) {
      key = String(key || '');
      if (!key) return fallback;
      if (Object.prototype.hasOwnProperty.call(defMap, key)) return defMap[key];
      return fallback;
    }
    maybeMigrateLegacyDefaults(defMap);

    var enRaw = sGet(K.enabled, null);
    if (enRaw === null || enRaw === undefined || enRaw === '') enRaw = sGet(K.oldEnabled, String(d(K.enabled, 1)));
    CFG.enabled = parseBool(enRaw, !!toInt(d(K.enabled, 1), 1));
    CFG.mode = normalizeOverlayMode(sGet(K.mode, String(d(K.mode, 'legacy'))));

    var dbgRaw = sGet(K.debugOnOpen, null);
    if (dbgRaw === null || dbgRaw === undefined || dbgRaw === '') dbgRaw = sGet(K.oldDebugOnOpen, String(d(K.debugOnOpen, 0)));
    CFG.debugOnOpen = parseBool(dbgRaw, !!toInt(d(K.debugOnOpen, 0), 0));

    CFG.popupOpacity = clampInt(sGet(K.popupOpacity, String(d(K.popupOpacity, 85))), 20, 100);
    CFG.protectNext = parseBool(sGet(K.protectNext, String(d(K.protectNext, 1))), !!toInt(d(K.protectNext, 1), 1));
    CFG.storeTruth = parseBool(sGet(K.storeTruth, String(d(K.storeTruth, 1))), !!toInt(d(K.storeTruth, 1), 1));
    CFG.truthCommitMs = clampInt(sGet(K.truthCommitMs, String(d(K.truthCommitMs, 100))), 100, 2000);

    var htRaw = sGet(K.hangTimeMs, null);
    if (htRaw === null || htRaw === undefined || htRaw === '') htRaw = sGet(K.oldHangTimeMs, String(d(K.hangTimeMs, 12000)));
    CFG.hangTimeMs = clampInt(htRaw, 3000, 60000);

    var hbRaw = sGet(K.hangBufMs, null);
    if (hbRaw === null || hbRaw === undefined || hbRaw === '') hbRaw = sGet(K.oldHangBufMs, String(d(K.hangBufMs, 18000)));
    CFG.hangBufMs = clampInt(hbRaw, 3000, 60000);
    CFG.resumeGuardMs = clampInt(sGet(K.resumeGuardMs, String(d(K.resumeGuardMs, 180000))), 30000, 600000);
    CFG.falseEndStaleAllow = parseBool(sGet(K.falseEndStaleAllow, String(d(K.falseEndStaleAllow, 1))), !!toInt(d(K.falseEndStaleAllow, 1), 1));
    CFG.fakeFullEnabled = parseBool(sGet(K.fakeFullEnabled, String(d(K.fakeFullEnabled, 1))), !!toInt(d(K.fakeFullEnabled, 1), 1));
    CFG.fakeFullNoProgMs = clampInt(sGet(K.fakeFullNoProgMs, String(d(K.fakeFullNoProgMs, 6500))), 1000, 30000);
    CFG.fakeFullNoMoveMs = clampInt(sGet(K.fakeFullNoMoveMs, String(d(K.fakeFullNoMoveMs, 6500))), 1000, 30000);
    CFG.minAheadSec = Math.max(0, Math.min(3, toNum(sGet(K.minAheadSec, String(d(K.minAheadSec, 0.1))), toNum(d(K.minAheadSec, 0.1), 0.1))));
    CFG.underrunNoProgMs = clampInt(sGet(K.underrunNoProgMs, String(d(K.underrunNoProgMs, 4500))), 1000, 30000);
    CFG.underrunNoAheadMoveMs = clampInt(sGet(K.underrunNoAheadMoveMs, String(d(K.underrunNoAheadMoveMs, 4500))), 1000, 30000);

    CFG.softAttempts = clampInt(sGet(K.softAttempts, String(d(K.softAttempts, 0))), 0, 5);
    CFG.inplayerAttempts = clampInt(sGet(K.inplayerAttempts, String(d(K.inplayerAttempts, 2))), 0, 6);
    CFG.inplayerMode = normalizeInplayerMode(sGet(K.inplayerMode, String(d(K.inplayerMode, 'destroy_url'))));
    CFG.escalateToReopen = parseBool(sGet(K.escalateToReopen, String(d(K.escalateToReopen, 1))), !!toInt(d(K.escalateToReopen, 1), 1));
    CFG.reopenCooldownMs = clampInt(sGet(K.reopenCooldownMs, String(d(K.reopenCooldownMs, 8000))), 1000, 60000);
    CFG.resumeBackoffSec = Math.max(0.05, Math.min(4, toNum(sGet(K.resumeBackoffSec, String(d(K.resumeBackoffSec, 0.3))), toNum(d(K.resumeBackoffSec, 0.3), 0.3))));
    CFG.resumeMinStepSec = Math.max(0.05, Math.min(2, toNum(sGet(K.resumeMinStepSec, String(d(K.resumeMinStepSec, 0.1))), toNum(d(K.resumeMinStepSec, 0.1), 0.1))));
    CFG.seekVerifyDelayMs = clampInt(sGet(K.seekVerifyDelayMs, String(d(K.seekVerifyDelayMs, 900))), 250, 5000);
    CFG.seekDeltaSec = Math.max(0.05, Math.min(10, toNum(sGet(K.seekDeltaSec, String(d(K.seekDeltaSec, 0.1))), toNum(d(K.seekDeltaSec, 0.1), 0.1))));
    CFG.warmupAfterRecoverMs = clampInt(sGet(K.warmupAfterRecoverMs, String(d(K.warmupAfterRecoverMs, 18000))), 2000, 60000);
    CFG.userSeekWindowMs = clampInt(sGet(K.userSeekWindowMs, String(d(K.userSeekWindowMs, 1800))), 300, 15000);
    CFG.userNavWindowMs = clampInt(sGet(K.userNavWindowMs, String(d(K.userNavWindowMs, 2500))), 300, 15000);
    CFG.dgStallSoftMs = clampInt(sGet(K.dgStallSoftMs, String(d(K.dgStallSoftMs, 1200))), 500, 15000);
    CFG.dgStallHardMs = clampInt(sGet(K.dgStallHardMs, String(d(K.dgStallHardMs, 2500))), 900, 30000);
    if (CFG.dgStallHardMs <= CFG.dgStallSoftMs) CFG.dgStallHardMs = Math.min(30000, CFG.dgStallSoftMs + 800);
    CFG.dgWarmupGraceMs = clampInt(sGet(K.dgWarmupGraceMs, String(d(K.dgWarmupGraceMs, 1200))), 300, 10000);
    CFG.dgResumeToleranceSec = Math.max(0.05, Math.min(2, toNum(sGet(K.dgResumeToleranceSec, String(d(K.dgResumeToleranceSec, 0.12))), toNum(d(K.dgResumeToleranceSec, 0.12), 0.12))));
    CFG.dgResumeSeekRetryMax = clampInt(sGet(K.dgResumeSeekRetryMax, String(d(K.dgResumeSeekRetryMax, 2))), 0, 5);
    CFG.dgRecoverRetryMax = clampInt(sGet(K.dgRecoverRetryMax, String(d(K.dgRecoverRetryMax, 2))), 0, 5);
    CFG.dgFailsafeCooldownMs = clampInt(sGet(K.dgFailsafeCooldownMs, String(d(K.dgFailsafeCooldownMs, 8000))), 1000, 120000);
    CFG.dgDebugLevel = normalizeDgDebugLevel(sGet(K.dgDebugLevel, String(d(K.dgDebugLevel, 'normal'))));
    CFG.dgBlockNextMs = clampInt(sGet(K.dgBlockNextMs, String(d(K.dgBlockNextMs, 6000))), 1000, 30000);
    CFG.dgTailSec = Math.max(0.5, Math.min(12, toNum(sGet(K.dgTailSec, String(d(K.dgTailSec, 3.0))), toNum(d(K.dgTailSec, 3.0), 3.0))));
    CFG.dgFalseEndJumpSec = Math.max(1, Math.min(120, toNum(sGet(K.dgFalseEndJumpSec, String(d(K.dgFalseEndJumpSec, 10.0))), toNum(d(K.dgFalseEndJumpSec, 10.0), 10.0))));
    CFG.dgFakeFullEnabled = parseBool(sGet(K.dgFakeFullEnabled, String(d(K.dgFakeFullEnabled, 1))), !!toInt(d(K.dgFakeFullEnabled, 1), 1));
    CFG.dgFalseEndEnabled = parseBool(sGet(K.dgFalseEndEnabled, String(d(K.dgFalseEndEnabled, 1))), !!toInt(d(K.dgFalseEndEnabled, 1), 1));
    CFG.frameHangMs = clampInt(toInt(CFG.frameHangMs, toInt(OVERLAY_DEFAULTS.frame_hang_ms, 3500)), 1200, 15000);
    CFG.frameCtDeltaSec = Math.max(0.2, Math.min(5, toNum(CFG.frameCtDeltaSec, toNum(OVERLAY_DEFAULTS.frame_ct_delta_sec, 1.0))));
    CFG.frameGraceMs = clampInt(toInt(CFG.frameGraceMs, toInt(OVERLAY_DEFAULTS.frame_grace_ms, 12000)), 1000, 20000);

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

    if (name === 'timeupdate') {
      STATE.ev.lastTimeupdateTs = t;
      STATE.det.hadTimeupdate = 1;
    }
    else if (name === 'progress') {
      STATE.ev.lastProgressTs = t;
      STATE.det.hadProgress = 1;
    }
    else if (name === 'play' || name === 'playing') STATE.ev.lastPlayingTs = t;
    else if (name === 'waiting') STATE.ev.lastWaitingTs = t;
    else if (name === 'stalled') STATE.ev.lastStalledTs = t;
    else if (name === 'error') STATE.ev.lastErrorTs = t;
    else if (name === 'canplay' || name === 'loadeddata') STATE.det.lastReadyTs = t;

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

  function truthReadFromStorage(video) {
    try {
      var sig = '';
      try { sig = srcSig(getCurrentSrc(video)); } catch (_) { sig = ''; }
      if (!sig) {
        try { sig = String(STATE.tick && STATE.tick.srcSig ? STATE.tick.srcSig : ''); } catch (_) { sig = ''; }
      }
      if (!sig) {
        try { sig = String(STATE.session && STATE.session.srcSig ? STATE.session.srcSig : ''); } catch (_) { sig = ''; }
      }

      if (sig) {
        var rawMap = sGet(K.truthMap, '');
        if (rawMap && typeof rawMap === 'string') {
          var map = null;
          try { map = JSON.parse(rawMap); } catch (_) { map = null; }
          if (map && typeof map === 'object' && map[sig]) {
            var row = map[sig];
            var secM = toNum(row && row.sec, NaN);
            var tsM = toInt(row && row.ts, 0);
            if (isFinite(secM) && secM >= 0 && tsM > 0) return { sec: secM, ts: tsM, sig: sig };
          }
        }
      }

      var sec = toNum(sGet(K.truthSec, ''), NaN);
      var ts = toInt(sGet(K.truthTs, '0'), 0);
      var savedSig = String(sGet(K.truthSrcSig, '') || '');
      if (!isFinite(sec) || sec < 0 || !ts) return null;
      return { sec: sec, ts: ts, sig: savedSig };
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

  function clearCarry(why, unfreeze) {
    var had = !!(STATE.resume && STATE.resume.carry);
    STATE.resume.carry = null;
    STATE.guard.allowStartUntilTs = 0;
    STATE.guard.allowStartSig = '';
    if (unfreeze) truthFreeze(false, String(why || 'carry_clear'));
    if (had) logLine('DBG', 'CARRY clear', { why: String(why || ''), unfreeze: unfreeze ? 1 : 0 });
  }

  function resolveSessionSig(payload) {
    var sig = '';
    try { sig = String(extractStartSig(payload) || ''); } catch (_) { sig = ''; }
    if (!sig) {
      try { sig = String(STATE.tick && STATE.tick.srcSig ? STATE.tick.srcSig : ''); } catch (_) { sig = ''; }
    }
    if (!sig) {
      try { sig = String(srcSig(getCurrentSrc(STATE.video || getVideo())) || ''); } catch (_) { sig = ''; }
    }
    return String(sig || '');
  }

  function resetTransientForSessionSwitch(newSig, why) {
    var reason = String(why || 'session_switch');
    newSig = String(newSig || '');

    clearResumeUnfreezeTimer();
    STATE.guard.falseEndCriticalUntilTs = 0;
    STATE.guard.preventStartUntilTs = 0;
    STATE.guard.preventEndedUntilTs = 0;
    STATE.guard.blockNextUntilTs = 0;
    STATE.guard.allowStartUntilTs = 0;
    STATE.guard.allowStartSig = '';

    STATE.intent.userSeekUntilTs = 0;
    STATE.intent.guardSeekUntilTs = 0;
    STATE.intent.userNavUntilTs = 0;

    if (STATE.rec.active) recoveryCancel('session_switch');
    else STATE.rec.token = toInt(STATE.rec.token, 0) + 1;
    STATE.rec.active = false;
    STATE.rec.step = '';
    STATE.rec.reason = '';

    var carry = STATE.resume && STATE.resume.carry ? STATE.resume.carry : null;
    if (carry) {
      var carrySig = String(carry.srcSig || '');
      if (!carrySig || !newSig || carrySig !== newSig) clearCarry('session_switch', true);
    }

    var ticket = STATE.resume ? STATE.resume.ticket : null;
    if (ticket) {
      var ticketSig = String(ticket.srcSig || '');
      if (!ticketSig || !newSig || ticketSig !== newSig) {
        STATE.resume.ticket = null;
        syncResumeTicket({
          id: '',
          recToken: toInt(STATE.rec.token, 0),
          sec: null,
          srcSig: newSig,
          createdTs: nowMs(),
          reason: 'session_switch',
          kind: 'discard',
          source: 'session',
          applied: 0,
          applyTs: 0,
          lastApplyErr: 'session_switch',
          verifyOk: 0,
          verifyDelta: NaN
        });
      }
    }

    truthFreeze(false, 'session_switch');
    logLine('INF', 'SESSION reset transient', { sig: newSig, why: reason });
  }

  function onSessionStart(payload, why) {
    var sig = resolveSessionSig(payload);
    var prev = String(STATE.session && STATE.session.srcSig ? STATE.session.srcSig : '');
    var ts = nowMs();

    if (!prev && sig) {
      STATE.session.id = toInt(STATE.session.id, 0) + 1;
      STATE.session.srcSig = sig;
      STATE.session.startedTs = ts;
      logLine('INF', 'SESSION init', { id: toInt(STATE.session.id, 0), sig: sig, why: String(why || '') });
      return sig;
    }

    if (sig && prev && sig !== prev) {
      STATE.session.id = toInt(STATE.session.id, 0) + 1;
      STATE.session.srcSig = sig;
      STATE.session.startedTs = ts;
      resetTransientForSessionSwitch(sig, String(why || 'player_start'));
      logLine('WRN', 'SESSION new', { id: toInt(STATE.session.id, 0), sig: sig, prevSig: prev, why: String(why || '') });
      return sig;
    }

    if (sig && !prev) {
      STATE.session.id = toInt(STATE.session.id, 0) + 1;
      STATE.session.srcSig = sig;
      STATE.session.startedTs = ts;
      logLine('INF', 'SESSION seed', { id: toInt(STATE.session.id, 0), sig: sig, why: String(why || '') });
      return sig;
    }

    if (toInt(STATE.session.id, 0) <= 0) {
      STATE.session.id = 1;
      STATE.session.startedTs = ts;
    } else {
      STATE.session.startedTs = ts;
    }
    return sig || prev || '';
  }

  function isValidTruthFrame(video, ct, dur) {
    if (!isFinite(ct) || ct < 2) return false;
    if (!isFinite(dur) || dur < 10) return false;
    if (ct >= dur - 0.75) return false;
    if (STATE.rec.active || STATE.truth.frozen) return false;
    try {
      if (video && video.paused) return false;
    } catch (_) { }
    return true;
  }

  function truthCommit(reason) {
    if (!CFG.storeTruth) return;
    if (STATE.truth.frozen || STATE.rec.active) return;
    if (STATE.media && STATE.media.paused) return;

    var tk = STATE.tick || {};
    if (tk && tk.hasVideo && tk.paused) return;
    if (tk && tk.hasVideo) {
      var tct = toNum(tk.ct, NaN);
      var tdur = toNum(tk.dur, NaN);
      if (!isFinite(tct) || tct < 2) return;
      if (!isFinite(tdur) || tdur < 10) return;
      if (tct >= tdur - 0.75) return;
    }

    var t = STATE.truth;
    if (!isFinite(toNum(t.lastGoodSec, NaN)) || toNum(t.lastGoodSec, 0) < 2) return;
    if (!t.lastGoodTs) return;

    try {
      sSet(K.truthSec, String(toNum(t.lastGoodSec, 0)));
      sSet(K.truthTs, String(toInt(t.lastGoodTs, 0)));
      sSet(K.truthSrcSig, String(t.srcSig || ''));
      try {
        var mapRaw = sGet(K.truthMap, '');
        var map = {};
        if (mapRaw && typeof mapRaw === 'string') {
          try { map = JSON.parse(mapRaw) || {}; } catch (_) { map = {}; }
        }
        if (!map || typeof map !== 'object') map = {};
        if (t.srcSig) map[String(t.srcSig)] = { sec: toNum(t.lastGoodSec, 0), ts: toInt(t.lastGoodTs, 0) };
        var keys = Object.keys(map);
        if (keys.length > 80) {
          keys.sort(function (a, b) {
            var ta = toInt(map[a] && map[a].ts, 0);
            var tb = toInt(map[b] && map[b].ts, 0);
            return ta - tb;
          });
          for (var i = 0; i < (keys.length - 80); i++) delete map[keys[i]];
        }
        sSet(K.truthMap, JSON.stringify(map));
      } catch (_) { }
      STATE.truth.lastCommitTs = now();
      logLine('DBG', 'truth_commit', { sec: toNum(t.lastGoodSec, 0).toFixed(2), reason: String(reason || '') });
    } catch (_) { }
  }

  function truthSeedFromStorage(video) {
    if (!CFG.storeTruth) return;
    if (isFinite(toNum(STATE.truth.lastGoodSec, NaN)) && STATE.truth.lastGoodTs) return;

    var saved = truthReadFromStorage(video);
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

  function stablePosUpdate(video, reason) {
    if (!video) return;
    if (STATE.rec.active || STATE.truth.frozen) return;
    if (STATE.media && STATE.media.paused) return;

    var t = STATE.tick || {};
    if (!t.hasVideo || t.paused) return;

    var sig = '';
    try { sig = String(t.srcSig || ''); } catch (_) { sig = ''; }
    if (!sig) {
      try { sig = srcSig(getCurrentSrc(video)); } catch (_) { sig = ''; }
    }
    if (!sig) return;

    var ct = toNum(video.currentTime, NaN);
    var dur = toNum(video.duration, NaN);
    if (!isFinite(ct) || ct < 2) return;
    if (!isFinite(dur) || dur <= 30) return;
    if (ct >= dur - 1) return;

    var prev = toNum(STATE.pos.lastStableSec, NaN);
    if (!isFinite(prev)) {
      STATE.pos.lastStableSec = ct;
      STATE.pos.lastStableTs = nowMs();
      STATE.pos.lastStableSrcSig = sig;
      STATE.pos.lastStableReason = String(reason || 'ct_move');
      return;
    }

    var d = ct - prev;
    if (d < 0.08) return;

    STATE.pos.lastStableSec = ct;
    STATE.pos.lastStableTs = nowMs();
    STATE.pos.lastStableSrcSig = sig;
    STATE.pos.lastStableReason = String(reason || 'ct_move');
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

    on('timeupdate', function (e) {
      bumpEvent('timeupdate');
      try {
        if (tryTailJumpClamp(video, e, 'timeupdate')) return;
      } catch (_) { }
      try { truthUpdate(video, 'timeupdate'); } catch (_) { }
    });
    on('progress', function () { bumpEvent('progress'); });
    on('waiting', function () { bumpEvent('waiting'); });
    on('stalled', function () { bumpEvent('stalled'); });
    on('error', function () { bumpEvent('error'); });
    on('seeking', function (e) {
      bumpEvent('seeking');
      try {
        if (nowMs() > toInt(STATE.intent.guardSeekUntilTs, 0)) {
          markUserSeekIntent(toInt(CFG.userSeekWindowMs, 1800), 'video_seeking');
        }
      } catch (_) { }
      try { tryTailJumpClamp(video, e, 'seeking'); } catch (_) { }
    });
    on('seeked', function () {
      bumpEvent('seeked');
      try {
        if (nowMs() > toInt(STATE.intent.guardSeekUntilTs, 0)) {
          markUserSeekIntent(toInt(CFG.userSeekWindowMs, 1800), 'video_seeked');
        }
      } catch (_) { }
    });
    on('play', function () {
      bumpEvent('play');
      dgOnPlaySignal('play');
    });
    on('playing', function () {
      bumpEvent('playing');
      dgOnPlaySignal('playing');
    });
    on('pause', function () {
      bumpEvent('pause');
      dgOnPauseSignal('video_onpause');
    });
    on('canplay', function () { bumpEvent('canplay'); });
    on('loadeddata', function () { bumpEvent('loadeddata'); });
    on('ended', function (e) {
      bumpEvent('ended');
      if (isModeDelta()) {
        try {
          collectTick(video);
          var dgEnd = dgShouldTreatEndAsFalse();
          if (dgEnd && dgEnd.block) {
            try { if (e && e.stopImmediatePropagation) e.stopImmediatePropagation(); } catch (_) { }
            try { if (e && e.preventDefault) e.preventDefault(); } catch (_) { }
            dgLog('WRN', 'DG_BLOCK ended', {
              reason: String(dgEnd.reason || ''),
              ct: isFinite(toNum(STATE.tick && STATE.tick.ct, NaN)) ? toNum(STATE.tick && STATE.tick.ct, 0).toFixed(2) : '',
              dur: isFinite(toNum(STATE.tick && STATE.tick.dur, NaN)) ? toNum(STATE.tick && STATE.tick.dur, 0).toFixed(2) : '',
              blockLeftMs: dgCurrentBlockLeftMs()
            });
            dgKickRecovery('ended:' + String(dgEnd.reason || 'guard'), { delayMs: 220, tick: STATE.tick });
          }
        } catch (_) { }
        return;
      }
      try {
        if (CFG.enabled && CFG.protectNext) {
          var until = Math.max(toInt(STATE.guard.preventEndedUntilTs, 0), toInt(STATE.guard.falseEndCriticalUntilTs, 0));
          if (until && now() < until) {
            try { if (e && e.stopImmediatePropagation) e.stopImmediatePropagation(); } catch (_) { }
            try { if (e && e.preventDefault) e.preventDefault(); } catch (_) { }
            var left = Math.max(0, until - now());
            logLine('WRN', 'BLOCK ended (critical window)', {
              leftMs: left,
              ct: isFinite(toNum(STATE.tick && STATE.tick.ct, NaN)) ? toNum(STATE.tick && STATE.tick.ct, 0).toFixed(2) : '',
              dur: isFinite(toNum(STATE.tick && STATE.tick.dur, NaN)) ? toNum(STATE.tick && STATE.tick.dur, 0).toFixed(2) : ''
            });

            try {
              var v = STATE.video || getVideo();
              var sec = NaN;
              if (STATE.pos && isFinite(toNum(STATE.pos.lastStableSec, NaN)) && toNum(STATE.pos.lastStableSec, NaN) >= 2) sec = toNum(STATE.pos.lastStableSec, NaN);
              else if (isFinite(toNum(STATE.truth.lastGoodSec, NaN)) && toNum(STATE.truth.lastGoodSec, NaN) >= 2) sec = toNum(STATE.truth.lastGoodSec, NaN);
              if (v && isFinite(sec)) {
                markGuardSeekIntent(toInt(CFG.userSeekWindowMs, 1800), 'ended_block_seek');
                v.currentTime = sec;
                armFrameGrace(CFG.frameGraceMs, 'ended_block_seek');
              }
            } catch (_) { }

            armFalseEndCritical(30000, 'ended_blocked');
            if (!STATE.rec.active) startRecovery('ended_blocked');
            return;
          }
        }
      } catch (_) { }
      try { maybeHandleFalseEnd('ended_evt'); } catch (_) { }
    });

    truthSeedFromStorage(video);
    resetSignalAges('video_listeners_bound');
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

  function collectTick(video, hint) {
    var ts = nowMs();
    hint = (hint && typeof hint === 'object') ? hint : null;
    var rawCur = hint ? toNum(hint.rawCur, NaN) : NaN;
    var rawDur = hint ? toNum(hint.rawDur, NaN) : NaN;
    var rawPaused = hint ? hint.rawPaused : undefined;
    var rawReady = hint ? toInt(hint.rawReadyState, 0) : 0;
    var rawNetwork = hint ? toInt(hint.rawNetworkState, 0) : 0;
    var hasPayloadTime = isFinite(rawCur) || isFinite(rawDur);

    var s = {
      ts: ts,
      hasVideo: !!video || hasPayloadTime,
      ct: NaN,
      dur: NaN,
      rawCurrent: rawCur,
      rawDuration: rawDur,
      vidCurrent: NaN,
      vidDuration: NaN,
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
      s.vidCurrent = toNum(video.currentTime, NaN);
      s.vidDuration = toNum(video.duration, NaN);
      s.ct = s.vidCurrent;
      s.dur = s.vidDuration;
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
    }

    if (!isFinite(s.ct) && isFinite(rawCur)) s.ct = rawCur;
    if (!isFinite(s.dur) && isFinite(rawDur)) s.dur = rawDur;
    if (!video) {
      if (rawPaused === true || rawPaused === false) s.paused = !!rawPaused;
      else s.paused = !!(STATE.media && STATE.media.paused);
      s.readyState = rawReady;
      s.networkState = rawNetwork;
      if (hint) {
        s.rangesCount = Math.max(0, toInt(hint.rangesCount, toInt(s.rangesCount, 0)));
        if (hint.rangesText) s.rangesText = String(hint.rangesText || '');
        if (hint.rangesSig) s.rangesSig = String(hint.rangesSig || '');
        if (isFinite(toNum(hint.rangeStartAtCt, NaN))) s.rangeStartAtCt = toNum(hint.rangeStartAtCt, NaN);
        if (isFinite(toNum(hint.rangeEndAtCt, NaN))) s.rangeEndAtCt = toNum(hint.rangeEndAtCt, NaN);
        if (isFinite(toNum(hint.bufferedEndAtCt, NaN))) s.bufferedEndAtCt = toNum(hint.bufferedEndAtCt, NaN);
        if (isFinite(toNum(hint.firstRangeStart, NaN))) s.firstRangeStart = toNum(hint.firstRangeStart, NaN);
        if (isFinite(toNum(hint.firstRangeEnd, NaN))) s.firstRangeEnd = toNum(hint.firstRangeEnd, NaN);
        if (isFinite(toNum(hint.totalBufferedSec, NaN))) s.totalBufferedSec = toNum(hint.totalBufferedSec, 0);
        if (isFinite(toNum(hint.aheadSec, NaN))) s.aheadSec = Math.max(0, toNum(hint.aheadSec, 0));
      }
      if (!isFinite(toNum(s.aheadSec, NaN))) {
        if (isFinite(toNum(s.bufferedEndAtCt, NaN)) && isFinite(toNum(s.ct, NaN))) {
          s.aheadSec = Math.max(0, toNum(s.bufferedEndAtCt, 0) - toNum(s.ct, 0));
        } else s.aheadSec = 0;
      }
      try { s.srcSig = String(STATE.tick && STATE.tick.srcSig ? STATE.tick.srcSig : STATE.session.srcSig || ''); } catch (_) { s.srcSig = ''; }
    }

    if (!s.srcSig) {
      try { s.srcSig = String(STATE.session && STATE.session.srcSig ? STATE.session.srcSig : ''); } catch (_) { s.srcSig = ''; }
    }

    if (isFinite(s.ct)) {
      if (!isFinite(STATE.monitor.lastCt)) {
        STATE.monitor.lastCt = s.ct;
        STATE.monitor.lastCtChangeTs = ts;
      } else if (Math.abs(s.ct - STATE.monitor.lastCt) >= DET.ctEpsSec) {
        STATE.monitor.lastCt = s.ct;
        STATE.monitor.lastCtChangeTs = ts;
      }

      if (STATE.ct.lastSec === null || !isFinite(toNum(STATE.ct.lastSec, NaN))) {
        STATE.ct.lastSec = s.ct;
        STATE.ct.lastChangeTs = ts;
        STATE.ct.lastSampleTs = ts;
        STATE.ct.stuckMs = 0;
      } else if (Math.abs(s.ct - toNum(STATE.ct.lastSec, 0)) >= 0.15) {
        STATE.ct.lastSec = s.ct;
        STATE.ct.lastChangeTs = ts;
        STATE.ct.lastSampleTs = ts;
        STATE.ct.stuckMs = 0;
      } else {
        STATE.ct.lastSampleTs = ts;
        STATE.ct.stuckMs = Math.max(0, ts - toInt(STATE.ct.lastChangeTs, ts));
      }
    } else {
      STATE.ct.lastSampleTs = ts;
      STATE.ct.stuckMs = Math.max(0, ts - toInt(STATE.ct.lastChangeTs, ts));
    }

    if (isFinite(toNum(s.aheadSec, NaN))) {
      if (!isFinite(STATE.monitor.lastAheadSec)) {
        STATE.monitor.lastAheadSec = s.aheadSec;
        STATE.monitor.lastAheadChangeTs = ts;
      } else if (Math.abs(s.aheadSec - STATE.monitor.lastAheadSec) >= DET.aheadEpsSec) {
        STATE.monitor.lastAheadSec = s.aheadSec;
        STATE.monitor.lastAheadChangeTs = ts;
      }

      if (STATE.buf.lastAhead === null || !isFinite(toNum(STATE.buf.lastAhead, NaN))) {
        STATE.buf.lastAhead = s.aheadSec;
        STATE.buf.lastAheadMoveTs = ts;
      } else if (Math.abs(toNum(s.aheadSec, 0) - toNum(STATE.buf.lastAhead, 0)) >= 0.25) {
        STATE.buf.lastAhead = s.aheadSec;
        STATE.buf.lastAheadMoveTs = ts;
        STATE.det.hadBufferMove = 1;
      }
    }

    if (s.rangesSig) {
      if (!STATE.buf.lastRangesSig) {
        STATE.buf.lastRangesSig = s.rangesSig;
        STATE.buf.lastRangesTs = ts;
      } else if (s.rangesSig !== STATE.buf.lastRangesSig) {
        STATE.buf.lastRangesSig = s.rangesSig;
        STATE.buf.lastRangesTs = ts;
        STATE.det.hadBufferMove = 1;
      }
    }

    if (isFinite(toNum(s.bufferedEndAtCt, NaN))) {
      if (STATE.buf.lastBufferedEnd === null || !isFinite(toNum(STATE.buf.lastBufferedEnd, NaN))) {
        STATE.buf.lastBufferedEnd = s.bufferedEndAtCt;
        STATE.buf.lastBufferedEndMoveTs = ts;
      } else if (Math.abs(toNum(s.bufferedEndAtCt, 0) - toNum(STATE.buf.lastBufferedEnd, 0)) >= 0.25) {
        STATE.buf.lastBufferedEnd = s.bufferedEndAtCt;
        STATE.buf.lastBufferedEndMoveTs = ts;
        STATE.det.hadBufferMove = 1;
      }
    }

    if (video) {
      if (CFG.storeTruth) truthUpdate(video, 'tick');
      stablePosUpdate(video, 'tick');
    } else if (CFG.storeTruth && !STATE.rec.active && !STATE.truth.frozen && !s.paused) {
      var ctRaw = toNum(s.ct, NaN);
      var durRaw = toNum(s.dur, NaN);
      if (isFinite(ctRaw) && ctRaw >= 2 && isFinite(durRaw) && durRaw >= 10 && ctRaw < durRaw - 0.75) {
        STATE.truth.lastGoodSec = ctRaw;
        STATE.truth.lastGoodTs = ts;
        if (s.srcSig) STATE.truth.srcSig = String(s.srcSig || '');
        if (!STATE.truth.lastCommitTs || (ts - toInt(STATE.truth.lastCommitTs, 0)) >= toInt(CFG.truthCommitMs, 100)) {
          truthCommit('tick_raw');
        }
      }
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
        + 'width:90vw;height:80vh;max-width:90vw;max-height:80vh;overflow:hidden;border-radius:10px;background:rgba(0,0,0,0.92);color:#eaeaea;display:flex;flex-direction:column;'
        + 'z-index:2147483647;min-width:360px;box-shadow:0 10px 28px rgba(0,0,0,0.6);border:1px solid #b7bec7;pointer-events:auto;}'
        + '.ov-hidden{display:none;}'
        + '.ov-header{flex:0 0 auto;display:flex;align-items:flex-start;justify-content:space-between;background:rgba(0,0,0,0.85);border-bottom:1px solid rgba(255,255,255,0.15);padding:8px 10px;}'
        + '.ov-head{display:flex;flex-direction:column;gap:2px;min-width:0;}'
        + '.ov-headline,.ov-subline{margin:0;font:' + POPUP_FONT + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#eaeaea;}'
        + '.ov-headline{font-weight:700;}'
        + '.st{font-weight:700;}'
        + '.st-playing{color:#67c27a;}'
        + '.st-warn{color:#ffb74d;}'
        + '.st-err{color:#ff8a80;}'
        + '.st-muted{color:#8eb4ff;}'
        + '.st-inf{color:#a0d2ff;}'
        + '.st-ok{color:#96ffa9;}'
        + '.ov-close{all:unset;cursor:pointer;font:700 18px/1 system-ui,-apple-system,\"Segoe UI\",Roboto,Arial,sans-serif;color:#cfd8dc;padding:2px 6px;border-radius:6px;}'
        + '.ov-close:hover{background:rgba(255,255,255,0.12);color:#ffffff;}'
        + '.ov-body{flex:1;overflow:auto;padding:8px 10px;margin:0;font:' + POPUP_FONT + ';color:#eaeaea;}'
        + '.section{margin-bottom:8px;}'
        + '.section-title{color:#66d9ef;margin-bottom:3px;font-weight:700;}'
        + '.section-body{white-space:pre-wrap;word-break:break-word;}'
        + '.section-line{margin:0 0 2px 0;}'
        + '.logs .section-line{color:#d7dee3;}'
        + '.logs .section-line.lv-dbg{color:rgba(255,255,255,0.60);}'
        + '.logs .section-line.lv-inf{color:rgba(160,210,255,0.95);}'
        + '.logs .section-line.lv-wrn{color:rgba(255,210,120,0.98);}'
        + '.logs .section-line.lv-err{color:rgba(255,120,120,0.98);}'
        + '.logs .section-line.lv-ok{color:rgba(150,255,170,0.95);}'
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

      var head = document.createElement('div');
      head.className = 'ov-head';

      var title = document.createElement('div');
      title.className = 'ov-headline';
      title.textContent = 'phase=IDLE paused=0 recover=0 blockNext=0';

      var subTitle = document.createElement('div');
      subTitle.className = 'ov-subline';
      subTitle.textContent = 'ct=- / dur=-  stable=-  ticket=-';

      var close = document.createElement('button');
      close.className = 'ov-close';
      close.type = 'button';
      close.textContent = '×';
      close.onclick = function () { try { uiHide('btn_close'); } catch (_) { } };

      var body = document.createElement('div');
      body.className = 'ov-body';

      var footer = document.createElement('div');
      footer.className = 'ov-footer';
      footer.textContent = 'Back/Esc or × to close';

      head.appendChild(title);
      head.appendChild(subTitle);
      header.appendChild(head);
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
      STATE.ui.subTitleEl = subTitle;
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
    STATE.ui.subTitleEl = null;
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
      + ' mode=' + String(CFG.mode || 'legacy')
      + ' step=' + String(STATE.rec.step || '')
      + ' pauseIntent=' + (isUserPauseIntent() ? '1' : '0')
      + ' mediaPaused=' + (t.paused ? '1' : '0')
      + ' pauseByUser=' + String(toInt(STATE.dg.pauseByUser, 0))
      + ' internalPause=' + String(toInt(STATE.dg.internalPause, 0)));

    var det = detectorsAllowedInfo();
    lines.push('life: active=' + String(toInt(STATE.life.active, 0))
      + ' isActivePlayer=' + (detectPlayerActive() ? '1' : '0')
      + ' exitIntent=' + String(toInt(STATE.life.exitIntent, 0))
      + ' suspend=' + String(toInt(STATE.life.suspendDetectors, 0))
      + ' openedAgeMs=' + String(ageMs(STATE.life.openedTs))
      + ' closedAgeMs=' + String(ageMs(STATE.life.closedTs)));
    lines.push('detectorsAllowed=' + (det.ok ? '1' : '0')
      + ' reason=' + String(det.reason || '')
      + ' pauseIntent(user)=' + (isUserPauseIntent() ? '1' : '0')
      + ' mediaPaused=' + (t.paused ? '1' : '0'));
    lines.push('warmupLeftMs=' + String(warmupLeftMs())
      + ' hadTU=' + String(toInt(STATE.det.hadTimeupdate, 0))
      + ' hadProg=' + String(toInt(STATE.det.hadProgress, 0))
      + ' hadBuf=' + String(toInt(STATE.det.hadBufferMove, 0))
      + ' backoffLeftMs=' + String(recoverBackoffLeftMs())
      + ' loopCount=' + String(toInt(STATE.det.recoverLoopCount, 0))
      + ' lastResetSignals=' + String(STATE.det.lastResetSignalsReason || ''));
    lines.push('pauseHoldLeftMs=' + String(Math.max(0, toInt(STATE.user.pauseHoldUntilTs, 0) - nowMs()))
      + ' pauseHoldWhy=' + String(STATE.user.pauseHoldWhy || '')
      + ' pendingCmd=' + String(STATE.pendingUserCommand || '')
      + ' pendingCmdAgeMs=' + String(STATE.pendingUserCommand ? ageMs(toInt(STATE.pendingUserCommandTs, 0)) : 0));
    lines.push('lastCmdRaw=' + String(STATE.user.lastCmdRaw || '')
      + ' lastCmdNorm=' + String(STATE.user.lastCmdNorm || '')
      + ' lastCmd=' + String(STATE.user.lastCmd || '')
      + ' lastCmdAgeMs=' + String(ageMs(STATE.user.lastCmdTs))
      + ' lastAutoPlaySuppressed=' + String(STATE.life.lastAutoPlaySuppressed || '')
      + ' lastAutoPlaySuppressedAgeMs=' + String(ageMs(STATE.life.lastAutoPlaySuppressedTs)));

    lines.push('recovery: soft ' + String(toInt(STATE.rec.softTry, 0)) + '/' + String(toInt(STATE.rec.softMax, 0))
      + ' | inplayer ' + String(toInt(STATE.rec.inpTry, 0)) + '/' + String(toInt(STATE.rec.inpMax, 0))
      + ' | reopen ' + String(toInt(STATE.rec.reopenTry, 0)) + '/1'
      + ' | lastAction=' + String(STATE.rec.lastAction || '')
      + ' | lastErr=' + String(STATE.rec.lastErr || ''));
    lines.push('delta: state=' + String(STATE.dg.state || '')
      + ' reason=' + String(STATE.dg.reason || '')
      + ' target=' + (isFinite(toNum(STATE.dg.targetSec, NaN)) ? toNum(STATE.dg.targetSec, 0).toFixed(2) : '-')
      + ' lastGood=' + (isFinite(toNum(STATE.dg.lastGoodSample && STATE.dg.lastGoodSample.ct, NaN)) ? toNum(STATE.dg.lastGoodSample.ct, 0).toFixed(2) : '-')
      + ' lastStable=' + (isFinite(toNum(STATE.dg.lastStableSample && STATE.dg.lastStableSample.ct, NaN)) ? toNum(STATE.dg.lastStableSample.ct, 0).toFixed(2) : '-')
      + ' retries=' + String(toInt(STATE.dg.recoverRetry, 0)) + '/' + String(toInt(CFG.dgRecoverRetryMax, 2))
      + ' corrections=' + String(toInt(STATE.dg.corrections, 0))
      + ' failsafeLeftMs=' + String(Math.max(0, toInt(STATE.dg.failsafeUntilTs, 0) - nowMs())));
    lines.push('delta.pause: paused=' + (t.paused ? '1' : '0')
      + ' pauseByUser=' + String(toInt(STATE.dg.pauseByUser, 0))
      + ' userPauseLeftMs=' + String(dgUserPauseLeftMs(t))
      + ' internalPause=' + String(toInt(STATE.dg.internalPause, 0))
      + ' wakeupPlay=' + String(STATE.dg.wakeupResult || '-')
      + ' wakeupReason=' + String(STATE.dg.wakeupReason || '')
      + ' pauseProbeLeftMs=' + String(Math.max(0, toInt(STATE.dg.pauseProbeUntilTs, 0) - nowMs()))
      + ' allowedReason=' + String(det && det.reason ? det.reason : ''));
    lines.push('delta.guard: blockNextLeftMs=' + String(dgCurrentBlockLeftMs())
      + ' falseEndDetected=' + String(toInt(STATE.dg.endGuard && STATE.dg.endGuard.falseEndDetected, 0))
      + ' fakeFullDetected=' + String(toInt(STATE.dg.bufferGuard && STATE.dg.bufferGuard.fakeFullDetected, 0))
      + ' underrunDetected=' + String(toInt(STATE.dg.bufferGuard && STATE.dg.bufferGuard.underrunDetected, 0))
      + ' ctJumpDelta=' + toNum(STATE.dg.endGuard && STATE.dg.endGuard.ctJumpDelta, 0).toFixed(2)
      + ' nearEnd=' + String(toInt(STATE.dg.endGuard && STATE.dg.endGuard.nearEnd, 0))
      + ' bufferSig=' + String(STATE.dg.bufferGuard && STATE.dg.bufferGuard.bufferSig ? STATE.dg.bufferGuard.bufferSig : '')
      + ' ranges=' + String(STATE.dg.bufferGuard && STATE.dg.bufferGuard.ranges ? STATE.dg.bufferGuard.ranges : '')
      + ' reason=' + String((STATE.dg.endGuard && STATE.dg.endGuard.falseEndReason) || (STATE.dg.bufferGuard && STATE.dg.bufferGuard.reason) || ''));
    lines.push('delta.raw: rawCur=' + (isFinite(toNum(t.rawCurrent, NaN)) ? toNum(t.rawCurrent, 0).toFixed(2) : '-')
      + ' rawDur=' + (isFinite(toNum(t.rawDuration, NaN)) ? toNum(t.rawDuration, 0).toFixed(2) : '-')
      + ' vidCur=' + (isFinite(toNum(t.vidCurrent, NaN)) ? toNum(t.vidCurrent, 0).toFixed(2) : '-')
      + ' vidDur=' + (isFinite(toNum(t.vidDuration, NaN)) ? toNum(t.vidDuration, 0).toFixed(2) : '-')
      + ' verify=' + (toInt(STATE.dg.lastVerifyOk, 0) ? 'ok' : 'fail')
      + ':' + String(STATE.dg.lastVerifyStage || '')
      + ':' + String(STATE.dg.lastVerifyReason || ''));

    lines.push('media: t=' + fmtTime(t.ct)
      + ' dur=' + fmtTime(t.dur)
      + ' paused=' + (t.paused ? 1 : 0)
      + ' rs=' + String(toInt(t.readyState, 0))
      + ' ns=' + String(toInt(t.networkState, 0)));

    lines.push('buffered: ranges=' + String(toInt(t.rangesCount, 0))
      + ' ahead=' + toNum(t.aheadSec, 0).toFixed(1)
      + ' minAhead=' + toNum(CFG.minAheadSec, 0.1).toFixed(1)
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
      if (isPlayingLike(t) && toNum(t.aheadSec, 0) <= toNum(CFG.minAheadSec, 0.1) && ba.progAge >= toInt(CFG.underrunNoProgMs, 4000) && ba.aheadMoveAge >= toInt(CFG.underrunNoAheadMoveMs, 4000)) underrunFlag = 1;
    } catch (_) { underrunFlag = 0; }
    lines.push('BUFFER: rangesCount=' + String(toInt(t.rangesCount, 0))
      + ' sigAgeMs=' + String(toInt(ba.sigAge, 0))
      + ' curRange=' + (isFinite(toNum(t.rangeStartAtCt, NaN)) ? toNum(t.rangeStartAtCt, 0).toFixed(2) : '') + '-' + (isFinite(toNum(t.rangeEndAtCt, NaN)) ? toNum(t.rangeEndAtCt, 0).toFixed(2) : '')
      + ' bufEndAtCt=' + (isFinite(toNum(t.bufferedEndAtCt, NaN)) ? toNum(t.bufferedEndAtCt, 0).toFixed(2) : '')
      + ' aheadSec=' + toNum(t.aheadSec, 0).toFixed(2)
      + ' minAheadSec=' + toNum(CFG.minAheadSec, 0.1).toFixed(2));
    lines.push('BUFFER ages: progAge=' + String(toInt(ba.progAge, 0))
      + ' aheadMoveAge=' + String(toInt(ba.aheadMoveAge, 0))
      + ' bufEndMoveAge=' + String(toInt(ba.bufEndMoveAge, 0)));
    lines.push('BUFFER flags: fakeFull=' + String(fakeFullFlag)
      + ' fakeFullAge=' + String(ageMs(STATE.buf.fakeFullTs))
      + ' fakeFullCount=' + String(toInt(STATE.buf.fakeFullCount, 0))
      + ' underrun=' + String(underrunFlag)
      + ' underrunAge=' + String(ageMs(STATE.buf.underrunTs))
      + ' underrunCount=' + String(toInt(STATE.buf.underrunCount, 0)));
    lines.push('faultFlags: playingStuck=' + String(toInt(STATE.flags.playingStuck.on, 0))
      + ' age=' + String(ageMs(toInt(STATE.flags.playingStuck.ts, 0)))
      + ' fakeFull=' + String(toInt(STATE.flags.fakeFull.on, 0))
      + ' age=' + String(ageMs(toInt(STATE.flags.fakeFull.ts, 0)))
      + ' underrun=' + String(toInt(STATE.flags.underrun.on, 0))
      + ' age=' + String(ageMs(toInt(STATE.flags.underrun.ts, 0))));

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
    var live = playbackLiveness(t, ra);
    lines.push('resumeAgeMs=' + String(toInt(ra.resumeAge, 0))
      + ' resumeGuardMs=' + String(toInt(CFG.resumeGuardMs, 0))
      + ' staleAllow=' + (CFG.falseEndStaleAllow ? '1' : '0')
      + ' falseEnd(strict)=' + (strictFalseEnd ? '1' : '0')
      + ' falseEnd(loose)=' + (looseFalseEnd ? '1' : '0'));
    lines.push('alive=' + (live.alive ? '1' : '0')
      + ' reason=' + String(live.reason || '')
      + ' userSeekLeftMs=' + String(Math.max(0, toInt(STATE.intent.userSeekUntilTs, 0) - nowMs()))
      + ' userNavLeftMs=' + String(Math.max(0, toInt(STATE.intent.userNavUntilTs, 0) - nowMs())));

    var blockUntil = toInt(STATE.guard.blockNextUntilTs, 0);
    var blockLeft = Math.max(0, blockUntil - now());
    lines.push('protect_next=' + (CFG.protectNext ? 'ON' : 'OFF')
      + ' blockNextUntilTs=' + String(blockUntil)
      + ' blockLeftMs=' + String(toInt(blockLeft, 0))
      + ' falseEndCount=' + String(toInt(STATE.guard.falseEndCount, 0))
      + ' lastFalseEndTs=' + String(toInt(STATE.guard.lastFalseEndTs, 0)));

    var ticket = STATE.resume.ticket || STATE.resume.lastTicket || null;
    lines.push('stablePos: sec=' + (isFinite(toNum(STATE.pos.lastStableSec, NaN)) ? toNum(STATE.pos.lastStableSec, 0).toFixed(2) : '')
      + ' ageMs=' + String(ageMs(STATE.pos.lastStableTs))
      + ' srcSig=' + String(STATE.pos.lastStableSrcSig || '')
      + ' why=' + String(STATE.pos.lastStableReason || ''));
    lines.push('resumeTicket: id=' + String(ticket && ticket.id ? ticket.id : '')
      + ' recToken=' + String(ticket ? toInt(ticket.recToken, 0) : 0)
      + ' sec=' + (ticket && isFinite(toNum(ticket.sec, NaN)) ? toNum(ticket.sec, 0).toFixed(2) : '')
      + ' source=' + String(ticket && ticket.source ? ticket.source : 'none')
      + ' srcSig=' + String(ticket && ticket.srcSig ? ticket.srcSig : '')
      + ' age=' + String(resumeTicketAgeMs())
      + ' applied=' + String(ticket ? toInt(ticket.applied, 0) : 0)
      + ' verifyOk=' + String(ticket ? toInt(ticket.verifyOk, 0) : 0)
      + ' verifyDelta=' + (ticket && isFinite(toNum(ticket.verifyDelta, NaN)) ? toNum(ticket.verifyDelta, 0).toFixed(2) : '')
      + ' frozen=' + (STATE.truth.frozen ? '1' : '0'));
    var carry = STATE.resume && STATE.resume.carry ? STATE.resume.carry : null;
    lines.push('carry: sec=' + (carry && isFinite(toNum(carry.sec, NaN)) ? toNum(carry.sec, 0).toFixed(2) : '')
      + ' ageMs=' + String(carry ? ageMs(carry.ts) : 0)
      + ' srcSig=' + String(carry && carry.srcSig ? carry.srcSig : '')
      + ' why=' + String(carry && carry.why ? carry.why : '')
      + ' ticketId=' + String(carry && carry.ticketId ? carry.ticketId : ''));
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

  function escHtml(s) {
    s = String(s == null ? '' : s);
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function fmtDbgSec(v) {
    var n = toNum(v, NaN);
    return isFinite(n) ? n.toFixed(2) : '-';
  }

  function fmtDbgRange(a, b) {
    return fmtDbgSec(a) + '-' + fmtDbgSec(b);
  }

  function buildSectionHtml(title, lines, extraCls) {
    var cls = 'section';
    if (extraCls) cls += ' ' + String(extraCls || '');
    var out = '<div class="' + cls + '">';
    out += '<div class="section-title">' + escHtml(title) + '</div>';
    out += '<div class="section-body">';
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var txt = '';
      var lineCls = 'section-line';
      if (line && typeof line === 'object') {
        txt = String(line.text == null ? '' : line.text);
        if (line.className) {
          var safeCls = String(line.className || '').replace(/[^a-zA-Z0-9_\- ]/g, '').trim();
          if (safeCls) lineCls += ' ' + safeCls;
        }
      } else {
        txt = String(line == null ? '' : line);
      }
      out += '<div class="' + lineCls + '">' + escHtml(txt) + '</div>';
    }
    out += '</div></div>';
    return out;
  }

  function phaseStatusClass(phase) {
    phase = String(phase || '');
    if (phase === ST.PLAYING) return 'st-playing';
    if (phase === ST.BUFFERING || phase === ST.STALLED) return 'st-warn';
    if (phase === ST.RECOVERING_SOFT || phase === ST.RECOVERING_INPLAYER || phase === ST.RECOVERING_REOPEN) return 'st-warn';
    if (phase === ST.HUNG || phase === ST.FAILED) return 'st-err';
    if (phase === ST.PAUSED_BY_USER || phase === ST.PAUSED_MEDIA) return 'st-muted';
    return 'st-muted';
  }

  function logLevelClass(line) {
    var s = String(line || '').toUpperCase();
    if (s.indexOf('[ERR]') >= 0 || s.indexOf('[ERROR]') >= 0) return 'lv-err';
    if (s.indexOf('[WRN]') >= 0 || s.indexOf('[WARN]') >= 0) return 'lv-wrn';
    if (s.indexOf('[OK]') >= 0 || s.indexOf('[EVT]') >= 0 || s.indexOf('[EVENT]') >= 0) return 'lv-ok';
    if (s.indexOf('[DBG]') >= 0 || s.indexOf('[DEBUG]') >= 0) return 'lv-dbg';
    if (s.indexOf('[INF]') >= 0 || s.indexOf('[INFO]') >= 0) return 'lv-inf';
    return '';
  }

  function buildDebugHeaderLines() {
    var t = STATE.tick || {};
    var ticket = STATE.resume.ticket || STATE.resume.lastTicket || null;
    var blockOn = isBlockNextActive() ? 1 : 0;
    var phase = String(STATE.phase || '');
    var paused = t.paused ? '1' : '0';
    var recover = STATE.rec.active ? '1' : '0';
    var block = String(blockOn);
    var phaseCls = phaseStatusClass(phase);
    var pausedCls = t.paused ? 'st-muted' : 'st-inf';
    var recCls = STATE.rec.active ? 'st-warn' : 'st-muted';
    var blockCls = blockOn ? 'st-warn' : 'st-muted';
    return {
      line1: 'mode=<span class="st st-inf">' + escHtml(String(CFG.mode || 'legacy')) + '</span>'
        + ' phase=<span class="st ' + phaseCls + '">' + escHtml(phase) + '</span>'
        + ' paused=<span class="st ' + pausedCls + '">' + escHtml(paused) + '</span>'
        + ' recover=<span class="st ' + recCls + '">' + escHtml(recover) + '</span>'
        + ' blockNext=<span class="st ' + blockCls + '">' + escHtml(block) + '</span>',
      line2: 'ct=<span class="st st-inf">' + escHtml(fmtDbgSec(t.ct)) + '</span>'
        + ' / dur=<span class="st st-inf">' + escHtml(fmtDbgSec(t.dur)) + '</span>'
        + '  stable=<span class="st st-inf">' + escHtml(fmtDbgSec(STATE.pos.lastStableSec)) + '</span>'
        + '  ticket=<span class="st st-inf">' + escHtml(ticket && isFinite(toNum(ticket.sec, NaN)) ? toNum(ticket.sec, 0).toFixed(2) : '-') + '</span>'
        + '  dg=<span class="st st-inf">' + escHtml(String(STATE.dg.state || 'IDLE')) + '</span>'
    };
  }

  function buildDebugBodyHtml() {
    var t = STATE.tick || {};
    var ba = bufferAges();
    var ra = runtimeAges();
    var strictFalseEnd = isFalseEnd(toNum(t.ct, NaN), toNum(t.dur, NaN));
    var looseFalseEnd = isFalseEndLooser(toNum(t.ct, NaN), toNum(t.dur, NaN), ra);
    var live = playbackLiveness(t, ra);
    var ticket = STATE.resume.ticket || STATE.resume.lastTicket || null;
    var nowTs = now();
    var criticalUntil = criticalUntilTs();
    var criticalLeft = Math.max(0, criticalUntil - nowTs);
    var preventStart = nowTs < toInt(STATE.guard.preventStartUntilTs, 0) ? 1 : 0;
    var preventEnded = nowTs < toInt(STATE.guard.preventEndedUntilTs, 0) ? 1 : 0;

    var bufferLines = [
      'ranges=' + String(toInt(t.rangesCount, 0))
        + ' first=' + fmtDbgRange(t.firstRangeStart, t.firstRangeEnd)
        + ' current=' + fmtDbgRange(t.rangeStartAtCt, t.rangeEndAtCt),
      'ahead=' + fmtDbgSec(t.aheadSec)
        + ' total=' + fmtDbgSec(t.totalBufferedSec)
        + ' bufferedEndAtCt=' + fmtDbgSec(t.bufferedEndAtCt),
      'bufMoveAge=' + String(toInt(ba.bufEndMoveAge, 0))
        + ' progressAge=' + String(toInt(ba.progAge, 0))
        + ' aheadMoveAge=' + String(toInt(ba.aheadMoveAge, 0))
    ];

    var detectorLines = [
      'fakeFull=' + String(toInt(STATE.flags.fakeFull.on, 0))
        + ' underrun=' + String(toInt(STATE.flags.underrun.on, 0))
        + ' playingStuck=' + String(toInt(STATE.flags.playingStuck.on, 0)),
      'falseEndStrict=' + (strictFalseEnd ? '1' : '0')
        + ' falseEndLoose=' + (looseFalseEnd ? '1' : '0'),
      'alive=' + (live.alive ? '1' : '0')
        + ' aliveReason=' + String(live.reason || ''),
      'tailJumpClamp=' + (ageMs(toInt(STATE.guard.lastTailClampTs, 0)) < 5000 ? '1' : '0')
        + ' lastClampAgeMs=' + String(ageMs(toInt(STATE.guard.lastTailClampTs, 0)))
        + ' count=' + String(toInt(STATE.guard.tailJumpClampCount, 0))
        + ' kind=' + String(STATE.guard.lastTailClampKind || ''),
      'ctStuckMs=' + String(toInt(STATE.ct.stuckMs, 0))
        + ' timeupdateAge=' + String(toInt(ra.timeupdateAge, 0))
        + ' progressAge=' + String(toInt(ra.progAge, 0))
    ];

    var recoveryLines = [
      'active=' + (STATE.rec.active ? '1' : '0')
        + ' step=' + String(STATE.rec.step || '')
        + ' soft=' + String(toInt(STATE.rec.softTry, 0)) + '/' + String(toInt(STATE.rec.softMax, 0))
        + ' inplayer=' + String(toInt(STATE.rec.inpTry, 0)) + '/' + String(toInt(STATE.rec.inpMax, 0))
        + ' reopen=' + String(toInt(STATE.rec.reopenTry, 0)) + '/1',
      'criticalLeftMs=' + String(toInt(criticalLeft, 0))
        + ' preventStart=' + String(preventStart)
        + ' preventEnded=' + String(preventEnded),
      'pendingSeek=' + (ticket && isFinite(toNum(ticket.sec, NaN)) ? toNum(ticket.sec, 0).toFixed(2) : '-')
        + ' lastSeek=' + fmtDbgSec(STATE.resume.lastSeekSec)
        + ' lastSeekOk=' + String(toInt(STATE.resume.lastSeekOk, 0)),
      'lastAction=' + String(STATE.rec.lastAction || ''),
      'lastErr=' + String(STATE.rec.lastErr || '')
    ];

    var truthLines = [
      'lastGoodSec=' + fmtDbgSec(STATE.truth.lastGoodSec)
        + ' frozen=' + (STATE.truth.frozen ? '1' : '0')
        + ' lastCommitAge=' + String(ageMs(STATE.truth.lastCommitTs)),
      'stableSec=' + fmtDbgSec(STATE.pos.lastStableSec)
        + ' stableAge=' + String(ageMs(STATE.pos.lastStableTs))
        + ' srcSig=' + String(STATE.truth.srcSig || t.srcSig || '')
    ];

    var frameLines = [
      'framesSupported=' + String(toInt(STATE.frames.supported, 0))
        + ' fc=' + String(toNum(STATE.frames.lastFrames, -1)),
      'frameStuckMs=' + String(toInt(STATE.frames.frameStuckMs, 0))
        + ' ctDeltaSinceFrame=' + toNum(STATE.frames.ctDeltaSinceFrame, 0).toFixed(2),
      'frameGraceLeftMs=' + String(frameGraceLeftMs())
        + ' graceWhy=' + String(STATE.frames.lastWhy || ''),
      'renderFreezeDetections=' + String(toInt(STATE.frames.detectCount, 0))
        + ' lastDetectAgeMs=' + String(ageMs(toInt(STATE.frames.lastDetectTs, 0)))
    ];

    var dgLines = [
      'state=' + String(STATE.dg.state || '')
        + ' reason=' + String(STATE.dg.reason || '')
        + ' trigger=' + String(STATE.dg.lastTrigger || ''),
      'contentKey=' + String(STATE.dg.contentKey ? hash32(STATE.dg.contentKey) : '')
        + ' target=' + fmtDbgSec(STATE.dg.targetSec)
        + ' targetKey=' + String(STATE.dg.targetKey ? hash32(STATE.dg.targetKey) : ''),
      'lastGood=' + fmtDbgSec(STATE.dg.lastGoodSample && STATE.dg.lastGoodSample.ct)
        + ' lastStable=' + fmtDbgSec(STATE.dg.lastStableSample && STATE.dg.lastStableSample.ct)
        + ' ahead=' + fmtDbgSec(t.aheadSec),
      'recoverAttempts=' + String(toInt(STATE.dg.recoverAttempts, 0))
        + ' verifyAttempts=' + String(toInt(STATE.dg.verifyAttempts, 0))
        + ' corrections=' + String(toInt(STATE.dg.corrections, 0))
        + ' recoverRetry=' + String(toInt(STATE.dg.recoverRetry, 0)) + '/' + String(toInt(CFG.dgRecoverRetryMax, 2)),
      'failsafeLeftMs=' + String(Math.max(0, toInt(STATE.dg.failsafeUntilTs, 0) - nowMs()))
        + ' suspendLeftMs=' + String(Math.max(0, toInt(STATE.dg.suspendUntilTs, 0) - nowMs()))
        + ' lastErr=' + String(STATE.dg.lastErr || ''),
      'paused=' + (t.paused ? '1' : '0')
        + ' pauseByUser=' + String(toInt(STATE.dg.pauseByUser, 0))
        + ' userPauseLeftMs=' + String(dgUserPauseLeftMs(t))
        + ' internalPause=' + String(toInt(STATE.dg.internalPause, 0))
        + ' wakeupPlay=' + String(STATE.dg.wakeupResult || '-')
        + ' pauseProbeLeftMs=' + String(Math.max(0, toInt(STATE.dg.pauseProbeUntilTs, 0) - nowMs()))
        + ' pendingCmd=' + String(STATE.pendingUserCommand || '')
        + ' pendingCmdAgeMs=' + String(STATE.pendingUserCommand ? ageMs(toInt(STATE.pendingUserCommandTs, 0)) : 0),
      'blockNextLeftMs=' + String(dgCurrentBlockLeftMs())
        + ' falseEndDetected=' + String(toInt(STATE.dg.endGuard && STATE.dg.endGuard.falseEndDetected, 0))
        + ' fakeFullDetected=' + String(toInt(STATE.dg.bufferGuard && STATE.dg.bufferGuard.fakeFullDetected, 0))
        + ' underrunDetected=' + String(toInt(STATE.dg.bufferGuard && STATE.dg.bufferGuard.underrunDetected, 0)),
      'ctJumpDelta=' + toNum(STATE.dg.endGuard && STATE.dg.endGuard.ctJumpDelta, 0).toFixed(2)
        + ' nearEnd=' + String(toInt(STATE.dg.endGuard && STATE.dg.endGuard.nearEnd, 0))
        + ' bufferSig=' + String(STATE.dg.bufferGuard && STATE.dg.bufferGuard.bufferSig ? STATE.dg.bufferGuard.bufferSig : ''),
      'rawCur=' + fmtDbgSec(t.rawCurrent)
        + ' rawDur=' + fmtDbgSec(t.rawDuration)
        + ' vidCur=' + fmtDbgSec(t.vidCurrent)
        + ' vidDur=' + fmtDbgSec(t.vidDuration),
      'verify=' + (toInt(STATE.dg.lastVerifyOk, 0) ? 'ok' : 'fail')
        + ' stage=' + String(STATE.dg.lastVerifyStage || '')
        + ' reason=' + String(STATE.dg.lastVerifyReason || '')
        + ' ageMs=' + String(ageMs(toInt(STATE.dg.lastVerifyTs, 0))),
      'wakeupReason=' + String(STATE.dg.wakeupReason || ''),
      'ranges=[' + String(STATE.dg.bufferGuard && STATE.dg.bufferGuard.ranges ? STATE.dg.bufferGuard.ranges : '') + ']'
        + ' reason=' + String((STATE.dg.endGuard && STATE.dg.endGuard.falseEndReason) || (STATE.dg.bufferGuard && STATE.dg.bufferGuard.reason) || '')
    ];

    var logs = [];
    try {
      var tail = logRowsTail(DET.logLimit);
      for (var i = 0; i < tail.length; i++) {
        var row = tail[i] || {};
        var msg = String(row.msg || '');
        var n = toInt(row.n, 1);
        var txt = n > 1 ? ('×' + String(n) + ' ' + msg) : msg;
        logs.push({ text: txt, className: logLevelClass(msg) });
      }
    } catch (_) { }

    var html = '';
    html += buildSectionHtml('BUFFER', bufferLines);
    html += buildSectionHtml('DETECTORS', detectorLines);
    html += buildSectionHtml('RECOVERY', recoveryLines);
    html += buildSectionHtml('TRUTH', truthLines);
    html += buildSectionHtml('FRAMES', frameLines);
    html += buildSectionHtml('DELTAGUARD', dgLines);
    html += buildSectionHtml('LOGS', logs.length ? logs : ['(empty)'], 'logs');
    return html;
  }

  function uiRender(reason) {
    var root = ensureUiRoot();
    if (!root) return;

    try {
      root.classList.remove('ov-hidden');
      root.style.opacity = String(popupOpacity());
      root.style.font = POPUP_FONT;

      var h = buildDebugHeaderLines();
      if (STATE.ui.titleEl) {
        STATE.ui.titleEl.innerHTML = String(h.line1 || '');
      }
      if (STATE.ui.subTitleEl) {
        STATE.ui.subTitleEl.innerHTML = String(h.line2 || '');
      }

      root.classList.remove('state-playing');
      root.classList.remove('state-buffering');
      root.classList.remove('state-hung');
      root.classList.remove('state-recovering');
      root.classList.remove('state-failed');
      var stClass = uiStateClass(STATE.phase);
      if (stClass) root.classList.add(stClass);

      root.style.border = '1px solid ' + phaseColor(STATE.phase);
      if (STATE.ui.bodyEl) STATE.ui.bodyEl.innerHTML = buildDebugBodyHtml();

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

  function stopTickTimer(reason) {
    if (!STATE.timer) return;
    try { clearInterval(STATE.timer); } catch (_) { }
    STATE.timer = null;
    logLine('DBG', 'tick_timer_stop', { reason: String(reason || '') });
  }

  function ensureTickTimer(reason) {
    if (STATE.timer) return;
    STATE.timer = setInterval(tick, DET.tickMs);
    logLine('DBG', 'tick_timer_start', { reason: String(reason || ''), tickMs: DET.tickMs });
  }

  function shutdownOverlay(reason, hardStopVideo) {
    reason = String(reason || 'shutdown');
    hardStopVideo = !!hardStopVideo;

    try { recoveryCancel('shutdown:' + reason); } catch (_) { }
    try { truthFreeze(false, 'shutdown'); } catch (_) { }
    try { clearResumeUnfreezeTimer(); } catch (_) { }
    try { endCritical('overlay_recover'); } catch (_) { }
    try { endCritical('bufguard'); } catch (_) { }
    try { dgStopRuntime('shutdown:' + reason); } catch (_) { }

    STATE.guard.blockNextUntilTs = 0;
    STATE.guard.preventStartUntilTs = 0;
    STATE.guard.preventEndedUntilTs = 0;
    STATE.guard.falseEndCriticalUntilTs = 0;
    STATE.guard.allowStartUntilTs = 0;
    STATE.guard.allowStartSig = '';
    STATE.life.suspendDetectors = 1;
    markLifeClosed('shutdown:' + reason);

    var v = STATE.video || getVideo();
    if (v) {
      try { if (typeof v.pause === 'function') v.pause(); } catch (_) { }
      if (hardStopVideo && (toInt(STATE.life.exitIntent, 0) === 1)) {
        try { if (typeof v.removeAttribute === 'function') v.removeAttribute('src'); } catch (_) { }
        try { v.src = ''; } catch (_) { }
        try { if (typeof v.load === 'function') v.load(); } catch (_) { }
      }
    }

    detachVideoListeners();
    if (STATE.ui.open || STATE.ui.root) uiDestroy('shutdown:' + reason);
    stopTickTimer('shutdown:' + reason);
    setPhase(ST.IDLE, 'shutdown:' + reason);
    logLine('WRN', 'SHUTDOWN overlay', { reason: reason, hard: hardStopVideo ? 1 : 0 });
  }

  function softShutdownOnExit(reason) {
    reason = String(reason || 'user_exit');

    STATE.life.exitIntent = 1;
    STATE.life.suspendDetectors = 1;

    try { recoveryCancel('exit:' + reason); } catch (_) { }
    try { truthFreeze(false, 'exit'); } catch (_) { }
    try { clearResumeUnfreezeTimer(); } catch (_) { }
    try { endCritical('overlay_recover'); } catch (_) { }
    try { endCritical('bufguard'); } catch (_) { }
    try { dgStopRuntime('exit:' + reason); } catch (_) { }

    STATE.guard.blockNextUntilTs = 0;
    STATE.guard.preventStartUntilTs = 0;
    STATE.guard.preventEndedUntilTs = 0;
    STATE.guard.falseEndCriticalUntilTs = 0;
    STATE.guard.allowStartUntilTs = 0;
    STATE.guard.allowStartSig = '';
    markLifeClosed('soft_exit:' + reason);

    // Exit must remain soft: do not pause/play/reset src/load here.
    detachVideoListeners();
    if (STATE.ui.open || STATE.ui.root) uiDestroy('exit:' + reason);
    stopTickTimer('exit:' + reason);

    logLine('WRN', 'SOFT_EXIT overlay', { reason: reason });
  }

  function softShutdownKeepResume(reason) {
    reason = String(reason || 'destroy');

    try { clearResumeUnfreezeTimer(); } catch (_) { }
    try { endCritical('overlay_recover'); } catch (_) { }
    try { endCritical('bufguard'); } catch (_) { }
    try { dgStopRuntime('soft_keep:' + reason); } catch (_) { }

    STATE.life.suspendDetectors = 1;
    markLifeClosed('soft_keep:' + reason);

    // Keep resume ticket/carry/truth freeze and critical windows intact; just detach runtime bindings.
    detachVideoListeners();
    if (STATE.ui.open || STATE.ui.root) uiDestroy('soft_keep:' + reason);
    stopTickTimer('soft_keep:' + reason);
    setPhase(ST.IDLE, 'soft_keep:' + reason);
    logLine('WRN', 'SOFT_SHUTDOWN keep_resume', {
      reason: reason,
      carry: STATE.resume && STATE.resume.carry ? 1 : 0,
      ticket: STATE.resume && STATE.resume.ticket ? 1 : 0
    });
  }

  function normalizeCommand(cmd) {
    cmd = String(cmd || '').toLowerCase().trim();
    if (!cmd) return '';

    // Exit-like: strict matches only. No broad "contains back" rules.
    if (cmd === 'exit' || cmd === 'back' || cmd === 'close' || cmd === 'return' || cmd === 'cancel' || cmd === 'controller.back') return 'exit';
    // TV remotes often send STOP for pause/stop, not for app exit.
    if (cmd === 'stop') return 'pause';

    if (cmd === 'toggle' || cmd.indexOf('toggle') >= 0) return 'toggle';
    if (cmd.indexOf('pause') >= 0) return 'pause';
    if ((cmd.indexOf('play') >= 0 || cmd.indexOf('resume') >= 0) && cmd !== 'playlist') return 'play';
    if (cmd === 'next' || cmd === 'select' || cmd === 'open' || cmd === 'open_episode' || cmd === 'episode_select') return 'nav';
    if (cmd.indexOf('seek') >= 0 || cmd === 'rewind' || cmd === 'forward' || cmd === 'backward' || cmd === 'to' || cmd === 'totime' || cmd === 'to_time') return 'seek';

    return '';
  }

  function isLikelyUserCmdType(type) {
    var t = String(type || '').toLowerCase();
    if (!t) return false;
    if (t === 'pause' || t === 'play' || t === 'toggle' || t === 'toggle_pause' || t === 'toggle_play') return true;
    if (t === 'seek' || t === 'forward' || t === 'backward' || t === 'rewind' || t === 'to' || t === 'totime' || t === 'to_time') return true;
    if (t === 'exit' || t === 'back' || t === 'return' || t === 'close' || t === 'stop' || t === 'cancel' || t === 'resume' || t === 'controller.back') return true;
    return false;
  }

  function getPg() {
    try { if (window.BL && BL.PlayerGuard) return BL.PlayerGuard; } catch (_) { }
    return null;
  }

  function criticalTtlMs(ttlMs) {
    var adaptive = Math.max(8000, Math.floor(toInt(CFG.hangBufMs, 18000) * 0.6));
    var req = toInt(ttlMs, 0);
    if (req > 0) adaptive = Math.max(adaptive, req);
    return clampInt(adaptive, 8000, 20000);
  }

  function beginCritical(tag, ttlMs) {
    var pg = getPg();
    var ttl = criticalTtlMs(ttlMs);
    try { if (pg && typeof pg.beginOverlayCritical === 'function') pg.beginOverlayCritical(String(tag || 'overlay_recover'), ttl); } catch (_) { }
  }

  function endCritical(tag) {
    var pg = getPg();
    try { if (pg && typeof pg.endOverlayCritical === 'function') pg.endOverlayCritical(String(tag || 'overlay_recover')); } catch (_) { }
  }

  function isBlockNextActive() {
    return now() < toInt(STATE.guard.blockNextUntilTs, 0);
  }

  function armBlockNext(ms, why) {
    ms = clampInt(ms, 1000, 60000);
    STATE.guard.blockNextUntilTs = Math.max(toInt(STATE.guard.blockNextUntilTs, 0), now() + ms);
    logLine('WRN', 'block_next_window', { ms: ms, why: String(why || '') });
  }

  function criticalUntilTs() {
    return Math.max(
      toInt(STATE.guard.falseEndCriticalUntilTs, 0),
      toInt(STATE.guard.preventStartUntilTs, 0),
      toInt(STATE.guard.preventEndedUntilTs, 0)
    );
  }

  function isCriticalWindowActive() {
    return now() < criticalUntilTs();
  }

  function armFalseEndCritical(ms, why) {
    ms = clampInt(ms, 2000, 60000);
    var until = now() + ms;
    STATE.guard.falseEndCriticalUntilTs = Math.max(toInt(STATE.guard.falseEndCriticalUntilTs, 0), until);
    STATE.guard.preventStartUntilTs = Math.max(toInt(STATE.guard.preventStartUntilTs, 0), until);
    STATE.guard.preventEndedUntilTs = Math.max(toInt(STATE.guard.preventEndedUntilTs, 0), until);
    armBlockNext(ms, 'falseEndCritical:' + String(why || ''));
    logLine('WRN', 'false_end_critical_window', { ms: ms, why: String(why || '') });
  }

  function criticalMsForReason(reason) {
    reason = String(reason || '');
    if (!reason) return 0;
    if (reason === 'fake_full_buffer' || reason === 'false_end' || reason === 'forced_next' || reason === 'ended_blocked') return 30000;
    if (reason === 'buffer_underrun' || reason === 'playing_stuck' || reason === 'render_freeze' || reason === 'tail_jump' || reason === 'tail_jump_seek') return 20000;
    if (reason.indexOf('stalled') >= 0 || reason.indexOf('waiting') >= 0) return 20000;
    return 0;
  }

  function armFrameGrace(ms, why) {
    ms = clampInt(isFinite(toNum(ms, NaN)) ? toNum(ms, 0) : toInt(CFG.frameGraceMs, 6000), 500, 30000);
    STATE.frames.graceUntilTs = Math.max(toInt(STATE.frames.graceUntilTs, 0), nowMs() + ms);
    STATE.frames.lastWhy = String(why || '');
  }

  function frameGraceLeftMs() {
    return Math.max(0, toInt(STATE.frames.graceUntilTs, 0) - nowMs());
  }

  function readFrameCount(v) {
    try {
      if (!v) return null;
      if (typeof v.getVideoPlaybackQuality === 'function') {
        var q = v.getVideoPlaybackQuality();
        if (q && isFinite(toNum(q.totalVideoFrames, NaN))) return toNum(q.totalVideoFrames, NaN);
      }
      if (isFinite(toNum(v.webkitDecodedFrameCount, NaN))) return toNum(v.webkitDecodedFrameCount, NaN);
      if (isFinite(toNum(v.webkitPresentedFrameCount, NaN))) return toNum(v.webkitPresentedFrameCount, NaN);
      return null;
    } catch (_) {
      return null;
    }
  }

  function frameUpdate(v, t) {
    t = t || STATE.tick || {};
    var ts = nowMs();
    var fc = readFrameCount(v);
    if (fc === null) return;

    STATE.frames.supported = 1;

    if (toNum(STATE.frames.lastFrames, -1) < 0) {
      STATE.frames.lastFrames = fc;
      STATE.frames.lastFrameTs = ts;
      STATE.frames.lastFrameCt = isFinite(toNum(t.ct, NaN)) ? toNum(t.ct, NaN) : NaN;
      STATE.frames.frameStuckMs = 0;
      STATE.frames.ctDeltaSinceFrame = 0;
      return;
    }

    if (fc !== toNum(STATE.frames.lastFrames, -1)) {
      STATE.frames.lastFrames = fc;
      STATE.frames.lastFrameTs = ts;
      STATE.frames.lastFrameCt = isFinite(toNum(t.ct, NaN)) ? toNum(t.ct, NaN) : NaN;
      STATE.frames.frameStuckMs = 0;
      STATE.frames.ctDeltaSinceFrame = 0;
      return;
    }

    STATE.frames.frameStuckMs = Math.max(0, ts - toInt(STATE.frames.lastFrameTs, ts));
    if (isFinite(toNum(t.ct, NaN)) && isFinite(toNum(STATE.frames.lastFrameCt, NaN))) {
      STATE.frames.ctDeltaSinceFrame = Math.max(0, toNum(t.ct, 0) - toNum(STATE.frames.lastFrameCt, 0));
    } else {
      STATE.frames.ctDeltaSinceFrame = 0;
    }
  }

  function isTail(ct, dur) {
    return isFinite(toNum(ct, NaN)) && isFinite(toNum(dur, NaN)) && toNum(dur, 0) > 30 && toNum(ct, 0) >= (toNum(dur, 0) - 0.35);
  }

  function isStableFarFromTail(stableSec, dur) {
    return isFinite(toNum(stableSec, NaN)) && isFinite(toNum(dur, NaN)) && toNum(stableSec, 0) >= 2 && toNum(stableSec, 0) <= (toNum(dur, 0) - 10);
  }

  function shouldClampTailJump(t, stableSec) {
    if (!t || !t.hasVideo) return false;
    if (!CFG.enabled || !CFG.protectNext) return false;
    if (!canRunDetectors().ok) return false;
    if (isUserSeekWindowActive()) return false;
    if (nowMs() < toInt(STATE.intent.guardSeekUntilTs, 0)) return false;
    if (!isTail(t.ct, t.dur)) return false;
    if (!isStableFarFromTail(stableSec, t.dur)) return false;

    if (STATE.user && String(STATE.user.lastCmdNorm || '') === 'seek' && ageMs(toInt(STATE.user.lastCmdTs, 0)) < 3000) return false;

    var ba = bufferAges();
    var progAge = toInt(ba.progAge, 0);
    var bufAge = toInt(ba.bufEndMoveAge, 0);
    var stalledAge = ageMs(STATE.ev.lastStalledTs || STATE.events.last.stalled);
    var waitingAge = ageMs(STATE.ev.lastWaitingTs || STATE.events.last.waiting);
    if (progAge > 1500 || bufAge > 1500) return true;
    if (stalledAge < 5000 || waitingAge < 5000) return true;

    if (STATE.flags && STATE.flags.fakeFull && toInt(STATE.flags.fakeFull.on, 0)) return true;
    if (STATE.flags && STATE.flags.underrun && toInt(STATE.flags.underrun.on, 0)) return true;
    if (STATE.flags && STATE.flags.playingStuck && toInt(STATE.flags.playingStuck.on, 0)) return true;

    return false;
  }

  function tryTailJumpClamp(video, e, source) {
    if (!isModeLegacy()) return false;
    if (!video) return false;
    var ct = toNum(video.currentTime, NaN);
    var dur = toNum(video.duration, NaN);
    var stable = NaN;
    if (STATE.pos && isFinite(toNum(STATE.pos.lastStableSec, NaN))) stable = toNum(STATE.pos.lastStableSec, NaN);
    else if (isFinite(toNum(STATE.truth.lastGoodSec, NaN))) stable = toNum(STATE.truth.lastGoodSec, NaN);

    var t = { hasVideo: true, ct: ct, dur: dur };
    if (!shouldClampTailJump(t, stable)) return false;

    var ts = nowMs();
    if ((ts - toInt(STATE.guard.lastTailClampTs, 0)) < 600) return false;

    armFalseEndCritical(30000, source === 'seeking' ? 'tail_jump_seek' : 'tail_jump');
    try { if (e && e.stopImmediatePropagation) e.stopImmediatePropagation(); } catch (_) { }
    try { if (e && e.preventDefault) e.preventDefault(); } catch (_) { }
    try {
      markGuardSeekIntent(toInt(CFG.userSeekWindowMs, 1800), source === 'seeking' ? 'tail_jump_seek' : 'tail_jump');
      video.currentTime = stable;
      armFrameGrace(CFG.frameGraceMs, source === 'seeking' ? 'tail_jump_seek' : 'tail_jump');
    } catch (_) { }

    STATE.guard.lastTailClampTs = ts;
    STATE.guard.lastTailClampKind = String(source || 'timeupdate');
    STATE.guard.tailJumpClampCount = toInt(STATE.guard.tailJumpClampCount, 0) + 1;

    var msg = source === 'seeking' ? 'CLAMP tail_jump (seeking)' : 'CLAMP tail_jump';
    logLine('WRN', msg, {
      ct: isFinite(ct) ? ct.toFixed(2) : '',
      dur: isFinite(dur) ? dur.toFixed(2) : '',
      stable: isFinite(stable) ? stable.toFixed(2) : '',
      n: toInt(STATE.guard.tailJumpClampCount, 0)
    });

    if (!STATE.rec.active) startRecovery(source === 'seeking' ? 'tail_jump_seek' : 'tail_jump');
    else armFalseEndCritical(30000, 'tail_jump_busy');
    return true;
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

  function parsePayloadRanges(rawBuffered, cur) {
    var out = {
      rangesCount: 0,
      rangesText: '',
      rangesSig: '',
      rangeStartAtCt: NaN,
      rangeEndAtCt: NaN,
      bufferedEndAtCt: NaN,
      firstRangeStart: NaN,
      firstRangeEnd: NaN,
      totalBufferedSec: 0,
      aheadSec: 0
    };

    if (!rawBuffered) return out;
    try {
      var parts = [];
      var sig = [];
      var cnt = 0;
      var total = 0;
      var maxEnd = NaN;
      var activeStart = NaN;
      var activeEnd = NaN;
      var nearestFutureStart = NaN;
      var nearestFutureEnd = NaN;
      var firstStart = NaN;
      var firstEnd = NaN;
      var b = rawBuffered;
      var len = 0;
      if (typeof b.length === 'number') len = toInt(b.length, 0);
      else if (Array.isArray(b)) len = b.length;
      for (var i = 0; i < len; i++) {
        var s = NaN;
        var e = NaN;
        try {
          if (b && typeof b.start === 'function' && typeof b.end === 'function') {
            s = toNum(b.start(i), NaN);
            e = toNum(b.end(i), NaN);
          } else {
            var it = b[i];
            if (Array.isArray(it) && it.length >= 2) {
              s = toNum(it[0], NaN);
              e = toNum(it[1], NaN);
            } else if (it && typeof it === 'object') {
              s = toNum(it.start, NaN);
              e = toNum(it.end, NaN);
            }
          }
        } catch (_) { s = NaN; e = NaN; }
        if (!isFinite(s) || !isFinite(e) || e < s) continue;
        cnt++;
        if (!isFinite(firstStart)) {
          firstStart = s;
          firstEnd = e;
        }
        total += Math.max(0, e - s);
        if (!isFinite(maxEnd) || e > maxEnd) maxEnd = e;
        parts.push('[' + s.toFixed(1) + '-' + e.toFixed(1) + ']');
        sig.push(String(Math.round(s * 10) / 10) + '-' + String(Math.round(e * 10) / 10));
        if (isFinite(cur) && cur >= s && cur <= e) {
          activeStart = s;
          activeEnd = e;
        } else if (isFinite(cur) && s > cur && (!isFinite(nearestFutureStart) || s < nearestFutureStart)) {
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
      } else if (isFinite(maxEnd)) bufferedEnd = maxEnd;

      out.rangesCount = cnt;
      out.rangesText = parts.join(' ');
      out.rangesSig = String(cnt) + '|' + sig.join('|');
      out.rangeStartAtCt = rangeStart;
      out.rangeEndAtCt = rangeEnd;
      out.bufferedEndAtCt = bufferedEnd;
      out.firstRangeStart = firstStart;
      out.firstRangeEnd = firstEnd;
      out.totalBufferedSec = total;
      out.aheadSec = isFinite(bufferedEnd) && isFinite(cur) ? Math.max(0, bufferedEnd - cur) : 0;
      return out;
    } catch (_) {
      return out;
    }
  }

  function tickHintFromPayload(payload) {
    var hint = {
      rawCur: NaN,
      rawDur: NaN,
      rawPaused: undefined,
      rawReadyState: 0,
      rawNetworkState: 0,
      rangesCount: 0,
      rangesText: '',
      rangesSig: '',
      rangeStartAtCt: NaN,
      rangeEndAtCt: NaN,
      bufferedEndAtCt: NaN,
      firstRangeStart: NaN,
      firstRangeEnd: NaN,
      totalBufferedSec: 0,
      aheadSec: 0
    };
    if (!payload || typeof payload !== 'object') return hint;

    hint.rawCur = toNum(payload.current, NaN);
    if (!isFinite(hint.rawCur)) hint.rawCur = toNum(payload.time, NaN);
    if (!isFinite(hint.rawCur)) hint.rawCur = toNum(payload.ct, NaN);
    if (!isFinite(hint.rawCur)) hint.rawCur = toNum(payload.position, NaN);
    hint.rawDur = toNum(payload.duration, NaN);
    if (!isFinite(hint.rawDur)) hint.rawDur = toNum(payload.dur, NaN);
    if (!isFinite(hint.rawDur)) hint.rawDur = toNum(payload.total, NaN);
    if (payload.paused === true || payload.paused === false) hint.rawPaused = !!payload.paused;
    hint.rawReadyState = toInt(payload.readyState, 0);
    hint.rawNetworkState = toInt(payload.networkState, 0);

    var r = parsePayloadRanges(payload.buffered, hint.rawCur);
    hint.rangesCount = toInt(r.rangesCount, 0);
    hint.rangesText = String(r.rangesText || '');
    hint.rangesSig = String(r.rangesSig || '');
    hint.rangeStartAtCt = toNum(r.rangeStartAtCt, NaN);
    hint.rangeEndAtCt = toNum(r.rangeEndAtCt, NaN);
    hint.bufferedEndAtCt = toNum(r.bufferedEndAtCt, NaN);
    hint.firstRangeStart = toNum(r.firstRangeStart, NaN);
    hint.firstRangeEnd = toNum(r.firstRangeEnd, NaN);
    hint.totalBufferedSec = toNum(r.totalBufferedSec, 0);
    hint.aheadSec = toNum(r.aheadSec, 0);
    return hint;
  }

  function dgIsBadTailTimeupdate(rawCur, rawDur, lastGoodCt) {
    if (!isModeDelta()) return false;
    if (!CFG.dgFalseEndEnabled) return false;
    rawCur = toNum(rawCur, NaN);
    rawDur = toNum(rawDur, NaN);
    lastGoodCt = toNum(lastGoodCt, NaN);
    if (!isFinite(rawCur) || !isFinite(rawDur) || rawDur <= 20) return false;
    if (rawCur < (rawDur - dgTailSec())) return false;
    if (!isFinite(lastGoodCt)) return false;
    return ((rawDur - dgTailSec()) - lastGoodCt) >= dgFalseEndJumpSec();
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

  function syncResumeTicket(ticket) {
    if (!ticket || typeof ticket !== 'object') return;
    STATE.resume.lastTicket = {
      id: String(ticket.id || ''),
      recToken: toInt(ticket.recToken, 0),
      sec: isFinite(toNum(ticket.sec, NaN)) ? toNum(ticket.sec, 0) : null,
      srcSig: String(ticket.srcSig || ''),
      createdTs: toInt(ticket.createdTs, 0),
      reason: String(ticket.reason || ''),
      kind: String(ticket.kind || ''),
      source: String(ticket.source || ''),
      applied: toInt(ticket.applied, 0),
      applyTs: toInt(ticket.applyTs, 0),
      lastApplyErr: String(ticket.lastApplyErr || ''),
      verifyOk: toInt(ticket.verifyOk, 0),
      verifyDelta: isFinite(toNum(ticket.verifyDelta, NaN)) ? toNum(ticket.verifyDelta, 0) : NaN
    };
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
    if (!sig) {
      try { sig = String(STATE.session && STATE.session.srcSig ? STATE.session.srcSig : ''); } catch (_) { sig = ''; }
    }

    var curTicket = STATE.resume.ticket || null;
    if (
      STATE.rec.active
      && curTicket
      && toInt(curTicket.recToken, 0) === toInt(STATE.rec.token, 0)
      && isFinite(toNum(curTicket.sec, NaN))
      && (String(curTicket.srcSig || '') === String(sig || '') || !sig || !curTicket.srcSig)
    ) {
      logLine('DBG', 'TICKET keep', {
        id: String(curTicket.id || ''),
        recToken: toInt(curTicket.recToken, 0),
        sec: toNum(curTicket.sec, 0).toFixed(2),
        srcSig: String(curTicket.srcSig || ''),
        reason: reason
      });
      return curTicket;
    }

    var ct = toNum(STATE.tick && STATE.tick.ct, NaN);
    var dur = toNum(v ? v.duration : (STATE.tick && STATE.tick.dur), NaN);
    var tr = toNum(STATE.truth && STATE.truth.lastGoodSec, NaN);
    var stableSec = toNum(STATE.pos && STATE.pos.lastStableSec, NaN);
    var stableSig = '';
    try { stableSig = String(STATE.pos && STATE.pos.lastStableSrcSig ? STATE.pos.lastStableSrcSig : ''); } catch (_) { stableSig = ''; }
    var stableAge = ageMs(STATE.pos && STATE.pos.lastStableTs);
    var sec = NaN;
    var source = '';
    var stableSigOk = (!sig || !stableSig || sig === stableSig);

    if (isFinite(stableSec) && stableSec >= 2 && stableSigOk && stableAge < 12 * 60 * 60 * 1000) {
      sec = stableSec;
      source = 'stable';
    } else if (isFinite(tr) && tr >= 2) {
      sec = tr;
      source = 'truth';
    } else if (isFinite(ct) && ct > 2 && isFinite(dur) && dur > 10) {
      sec = Math.max(0, ct - Math.max(toNum(CFG.resumeBackoffSec, 0.3), toNum(CFG.resumeMinStepSec, 0.1)));
      source = 'ct_backoff';
    } else if (isFinite(ct) && ct >= 2) {
      sec = ct;
      source = 'ct';
    }

    if (isFinite(sec) && isFinite(dur) && dur > 0) sec = Math.min(Math.max(0, sec), Math.max(0, dur - 0.75));
    if (isFinite(sec) && sec < 2) sec = NaN;

    var ticket = {
      id: String(nowMs()) + '_' + Math.random().toString(16).slice(2),
      recToken: toInt(STATE.rec.token, 0),
      sec: isFinite(sec) ? sec : null,
      srcSig: String(sig || ''),
      createdTs: nowMs(),
      reason: reason,
      kind: kind,
      source: source || (isFinite(sec) ? 'unknown' : 'none'),
      applied: 0,
      applyTs: 0,
      lastApplyErr: '',
      verifyOk: 0,
      verifyDelta: NaN
    };

    STATE.resume.ticket = ticket;
    syncResumeTicket(ticket);

    logLine('INF', 'TICKET create', {
      id: ticket.id,
      recToken: ticket.recToken,
      sec: ticket.sec === null ? 'null' : toNum(ticket.sec, 0).toFixed(2),
      srcSig: ticket.srcSig,
      reason: reason,
      kind: kind,
      src: ticket.source
    });
    if (ticket.sec === null) logLine('WRN', 'TICKET sec_null fallback', { id: ticket.id, ct: isFinite(ct) ? ct.toFixed(2) : '', dur: isFinite(dur) ? dur.toFixed(2) : '', truth: isFinite(tr) ? tr.toFixed(2) : '', stable: isFinite(stableSec) ? stableSec.toFixed(2) : '', stableAge: toInt(stableAge, 0) });

    return ticket;
  }

  function applyResumeTicket(video, stage, cb) {
    var ticket = STATE.resume.ticket || STATE.resume.lastTicket || null;
    stage = String(stage || 'unknown');

    if (!video) {
      if (cb) cb(false, 'no_video');
      return false;
    }
    if (isUserSeekWindowActive()) {
      if (cb) cb(false, 'user_seek');
      return false;
    }
    if (isUserNavWindowActive()) {
      if (cb) cb(false, 'user_nav');
      return false;
    }
    if (!ticket) {
      logLine('WRN', 'TICKET apply', { stage: stage, ok: 0, err: 'ticket_missing' });
      if (cb) cb(false, 'ticket_missing');
      return false;
    }
    if (!isFinite(toNum(ticket.sec, NaN)) || toNum(ticket.sec, NaN) < 0) {
      ticket.lastApplyErr = 'ticket_sec_null';
      ticket.verifyOk = 0;
      syncResumeTicket(ticket);
      logLine('WRN', 'TICKET apply', { stage: stage, id: String(ticket.id || ''), ok: 0, err: 'ticket_sec_null' });
      if (cb) cb(false, 'ticket_sec_null');
      return false;
    }

    var sec = Math.max(0, toNum(ticket.sec, 0));
    var ctBefore = toNum(video.currentTime, NaN);
    STATE.resume.lastApplyStage = stage;
    STATE.resume.lastApplyTs = nowMs();

    logLine('INF', 'TICKET apply', {
      stage: stage,
      id: String(ticket.id || ''),
      sec: sec.toFixed(2),
      ctBefore: isFinite(ctBefore) ? ctBefore.toFixed(2) : ''
    });

    function verify(retry) {
      setTimeout(function () {
        var ctAfter = toNum(video.currentTime, NaN);
        var maxDelta = Math.max(0.05, toNum(CFG.seekDeltaSec, 0.1));
        var retryDelta = maxDelta + 0.05;
        var delta = isFinite(ctAfter) ? Math.abs(ctAfter - sec) : 999999;
        var ok = isFinite(ctAfter) && delta <= maxDelta;
        var nearOk = isFinite(ctAfter) && delta <= retryDelta;

        ticket.verifyOk = ok ? 1 : 0;
        ticket.verifyDelta = isFinite(delta) ? delta : NaN;
        STATE.resume.lastVerifyOk = ticket.verifyOk;
        STATE.resume.lastVerifyDelta = ticket.verifyDelta;
        syncResumeTicket(ticket);

        logLine(ok ? 'INF' : 'WRN', 'TICKET verify', {
          stage: stage,
          id: String(ticket.id || ''),
          ok: ok ? 1 : 0,
          delta: isFinite(delta) ? delta.toFixed(2) : '',
          ctAfter: isFinite(ctAfter) ? ctAfter.toFixed(2) : '',
          maxDelta: maxDelta.toFixed(2),
          retryDelta: retryDelta.toFixed(2)
        });

        if (ok) {
          ticket.applied = 1;
          ticket.applyTs = nowMs();
          ticket.lastApplyErr = '';
          ticket.sec = sec;
          syncResumeTicket(ticket);
          STATE.guard.blockNextUntilTs = Math.max(toInt(STATE.guard.blockNextUntilTs, 0), now() + 1200);
          if (cb) cb(true, 'ok');
          return;
        }

        if (nearOk) {
          ticket.applied = 1;
          ticket.applyTs = nowMs();
          ticket.lastApplyErr = '';
          ticket.verifyOk = 1;
          syncResumeTicket(ticket);
          if (cb) cb(true, 'ok_near');
          return;
        }

        if (retry < 1 && delta >= retryDelta) {
          seekAfterReady(video, sec, 'ticket_retry:' + stage, function (ok2, err2) {
            if (!ok2) {
              ticket.lastApplyErr = String(err2 || 'retry_seek_failed');
              syncResumeTicket(ticket);
              if (cb) cb(false, ticket.lastApplyErr);
              return;
            }
            verify(1);
          });
          return;
        }

        ticket.lastApplyErr = 'verify_delta';
        syncResumeTicket(ticket);
        armBlockNext(4000, 'ticket_verify_fail');
        if (cb) cb(false, ticket.lastApplyErr);
      }, clampInt(toInt(CFG.seekVerifyDelayMs, 900), 250, 5000));
    }

    seekAfterReady(video, sec, 'ticket:' + stage, function (ok, err) {
      if (!ok) {
        ticket.lastApplyErr = String(err || 'seek_failed');
        ticket.verifyOk = 0;
        syncResumeTicket(ticket);
        if (cb) cb(false, ticket.lastApplyErr);
        return;
      }
      verify(0);
    });

    return true;
  }

  function seekAfterReady(video, sec, why, cb) {
    if (!video) {
      if (cb) cb(false, 'no_video');
      return;
    }
    if (!toInt(STATE.life.active, 0) || toInt(STATE.life.exitIntent, 0) || String(STATE.phase || '') === ST.IDLE) {
      if (cb) cb(false, 'inactive');
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

      if (!toInt(STATE.life.active, 0) || toInt(STATE.life.exitIntent, 0) || String(STATE.phase || '') === ST.IDLE) {
        STATE.resume.lastSeekSec = NaN;
        STATE.resume.lastSeekTs = nowMs();
        STATE.resume.lastSeekOk = 0;
        STATE.resume.lastSeekErr = 'inactive';
        logLine('DBG', 'SEEK skip', { why: String(why || ''), trig: String(trigger || ''), err: 'inactive' });
        if (cb) cb(false, 'inactive');
        return;
      }
      if (isUserSeekWindowActive() || isUserNavWindowActive()) {
        STATE.resume.lastSeekSec = NaN;
        STATE.resume.lastSeekTs = nowMs();
        STATE.resume.lastSeekOk = 0;
        STATE.resume.lastSeekErr = 'user_intent';
        logLine('DBG', 'SEEK skip', { why: String(why || ''), trig: String(trigger || ''), err: 'user_intent' });
        if (cb) cb(false, 'user_intent');
        return;
      }

      var ok = true;
      var err = '';
      var target = sec;
      try {
        var dur = toNum(video.duration, NaN);
        if (isFinite(dur) && dur > 0) target = Math.min(Math.max(0, sec), Math.max(0, dur - 0.5));
        armFrameGrace(CFG.frameGraceMs, 'seek_after_ready:' + String(why || ''));
        markGuardSeekIntent(toInt(CFG.userSeekWindowMs, 1800), 'seek_after_ready:' + String(why || ''));
        video.currentTime = target;
      } catch (e) {
        ok = false;
        err = e && e.message ? String(e.message) : 'seek_error';
      }

      if (ok && shouldAutoPlay('seek_after_ready:' + String(why || ''))) {
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
    try {
      armFrameGrace(CFG.frameGraceMs, String(tag || 'seek_truth'));
      markGuardSeekIntent(toInt(CFG.userSeekWindowMs, 1800), String(tag || 'seek_truth'));
      v.currentTime = target;
    } catch (_) { }

    if (shouldAutoPlay(String(tag || 'seek_truth'))) {
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
    var started = nowMs();
    var startCt = toNum(STATE.tick.ct, NaN);
    var ticket = STATE.resume.ticket || STATE.resume.lastTicket || null;
    var resumeSec = NaN;
    if (ticket && isFinite(toNum(ticket.sec, NaN)) && toNum(ticket.sec, NaN) >= 2) resumeSec = Math.max(0, toNum(ticket.sec, 0));
    var lastRealignTs = 0;

    function resumeAligned(ct) {
      if (!isFinite(resumeSec)) return true;
      if (!isFinite(ct)) return false;
      var maxDelta = Math.max(0.05, toNum(CFG.seekDeltaSec, 0.1)) + 0.08;
      if (Math.abs(ct - resumeSec) <= maxDelta) return true;
      if (ct >= (resumeSec - 1.2)) return true;
      return false;
    }

    function maybeRealign(v, why) {
      if (!v || !isFinite(resumeSec)) return;
      var ts = nowMs();
      if ((ts - toInt(lastRealignTs, 0)) < 900) return;
      if ((ts - toInt(STATE.resume.lastApplyTs, 0)) < 900) return;
      lastRealignTs = ts;
      logLine('WRN', 'TICKET realign', {
        why: String(why || ''),
        sec: toNum(resumeSec, 0).toFixed(2)
      });
      applyResumeTicket(v, 'wait:' + String(why || 'progress'), function (ok, err) {
        if (!ok && err) STATE.rec.lastErr = String(err || '');
      });
    }

    function loop() {
      if (token !== toInt(STATE.rec.token, 0)) return cb(false, 'canceled');
      if (!toInt(STATE.life.active, 0) || toInt(STATE.life.exitIntent, 0)) return cb(false, 'inactive');

      var v = STATE.video || getVideo();
      if (v) {
        var ct = toNum(v.currentTime, NaN);
        var ctMoved = isFinite(startCt) && isFinite(ct) && (ct - startCt) > 0.35;
        if (ctMoved && resumeAligned(ct)) return cb(true, 'ct_moved');
        if (ctMoved && !resumeAligned(ct)) maybeRealign(v, 'ct_moved_mismatch');
      }

      var ctAge = ageMs(STATE.monitor.lastCtChangeTs);
      var progAge = ageMs(STATE.monitor.lastProgressSignalTs);
      if (ctAge < 1400 && progAge < 1400) {
        if (!isFinite(resumeSec)) return cb(true, 'signal_ok');
        var v2 = STATE.video || getVideo();
        var cur = toNum(v2 ? v2.currentTime : NaN, NaN);
        if (resumeAligned(cur)) return cb(true, 'signal_ok');
        maybeRealign(v2, 'signal_mismatch');
      }

      if ((nowMs() - started) >= timeoutMs) return cb(false, 'timeout');
      setTimeout(loop, DET.waitLoopMs);
    }

    loop();
  }

  function actionSoftAttempt(idx) {
    if (!toInt(STATE.life.active, 0) || toInt(STATE.life.exitIntent, 0)) {
      STATE.rec.lastErr = 'inactive';
      return false;
    }
    if (STATE.tick && STATE.tick.hasVideo && STATE.tick.paused) {
      STATE.rec.lastErr = 'media_paused';
      return false;
    }

    var v = STATE.video || getVideo();
    if (!v) return false;

    var target = resumeSecFromTicketOrTruth();
    if (idx <= 1) {
      try {
        armFrameGrace(CFG.frameGraceMs, 'soft_attempt_1');
        markGuardSeekIntent(toInt(CFG.userSeekWindowMs, 1800), 'soft_attempt_1');
        v.currentTime = Math.max(0, target);
      } catch (_) { }
      if (shouldAutoPlay('soft_attempt_1')) {
        try {
          var p1 = v.play ? v.play() : null;
          if (p1 && typeof p1.catch === 'function') p1.catch(function () { });
        } catch (_) { }
      }
      STATE.rec.lastAction = 'soft_seek_play';
      STATE.rec.lastSoftTs = nowMs();
      return true;
    }

    try { if (typeof v.pause === 'function') v.pause(); } catch (_) { }
    try { if (typeof v.load === 'function') v.load(); } catch (_) { }
    setTimeout(function () {
      if (!STATE.rec.active || !toInt(STATE.life.active, 0) || toInt(STATE.life.exitIntent, 0)) return;
      try {
        armFrameGrace(CFG.frameGraceMs, 'soft_attempt_2');
        markGuardSeekIntent(toInt(CFG.userSeekWindowMs, 1800), 'soft_attempt_2');
        v.currentTime = Math.max(0, target);
      } catch (_) { }
      if (shouldAutoPlay('soft_attempt_2')) {
        try {
          var p2 = v.play ? v.play() : null;
          if (p2 && typeof p2.catch === 'function') p2.catch(function () { });
        } catch (_) { }
      }
    }, 120);

    STATE.rec.lastAction = 'soft_pause_load_seek_play';
    STATE.rec.lastSoftTs = nowMs();
    return true;
  }

  function actionInplayerRebuild(mode) {
    if (!toInt(STATE.life.active, 0) || toInt(STATE.life.exitIntent, 0)) {
      STATE.rec.lastErr = 'inactive';
      return false;
    }
    if (STATE.tick && STATE.tick.hasVideo && STATE.tick.paused) {
      STATE.rec.lastErr = 'media_paused';
      return false;
    }

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
      resetSignalAges('inplayer_rebuild');
      armWarmup(8000, 'inplayer_rebuild');
      armFrameGrace(CFG.frameGraceMs, 'inplayer_rebuild:' + String(mode || ''));
      var ticketSec = resumeSecFromTicketOrTruth();
      logLine('INF', 'INPLAYER set src ok', { mode: mode, seek: isFinite(ticketSec) ? toNum(ticketSec, 0).toFixed(2) : '' });
      var applyDone = false;
      function tryApply(tag) {
        if (!STATE.rec.active || !toInt(STATE.life.active, 0) || toInt(STATE.life.exitIntent, 0)) return;
        var curVideo = STATE.video || getVideo() || v;
        if (!curVideo) return;
        applyResumeTicket(curVideo, 'inplayer:' + String(tag || 'direct'), function (seekOk, seekErr) {
          if (seekOk) applyDone = true;
          if (!seekOk && seekErr) STATE.rec.lastErr = String(seekErr || '');
        });
      }
      tryApply('direct');
      setTimeout(function () { if (!applyDone) tryApply('rebind_1'); }, 260);
      setTimeout(function () { if (!applyDone) tryApply('rebind_2'); }, 720);
    }

    setTimeout(function () {
      try { endCritical(criticalTag); } catch (_) { }
    }, 1200);

    return ok;
  }

  function actionReopenViaPg() {
    if (!toInt(STATE.life.active, 0) || toInt(STATE.life.exitIntent, 0)) {
      STATE.rec.lastErr = 'inactive';
      return false;
    }

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
    var ticket = STATE.resume.ticket || makeResumeTicket('reopen', 'recovery');
    var sec = NaN;
    if (ticket && isFinite(toNum(ticket.sec, NaN)) && toNum(ticket.sec, NaN) >= 0) sec = Math.max(0, toNum(ticket.sec, 0));
    if (!isFinite(sec)) {
      STATE.rec.lastErr = 'no_ticket_sec';
      logLine('WRN', 'REOPEN skipped', { sec: 'null', why: 'no_ticket_sec' });
      return false;
    }

    STATE.resume.reopenRequestedSec = sec;
    STATE.resume.reopenRequestedTs = nowMs();
    STATE.resume.reopenAppliedSec = NaN;
    STATE.resume.reopenAppliedTs = 0;
    STATE.resume.reopenDeltaSec = NaN;
    STATE.resume.reopenSeekTs = 0;
    logLine('INF', 'REOPEN requested', {
      sec: sec.toFixed(2),
      age: resumeTicketAgeMs(),
      source: String(ticket && ticket.source ? ticket.source : ''),
      ticketId: String(ticket && ticket.id ? ticket.id : '')
    });
    resetSignalAges('reopen_request');
    armWarmup(8000, 'reopen_request');

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

  function armCarryFromDestroy(reason) {
    reason = String(reason || 'player_destroy');
    var ticket = STATE.resume.ticket || makeResumeTicket('destroy_carry', 'destroy');
    var sec = NaN;
    if (ticket && isFinite(toNum(ticket.sec, NaN)) && toNum(ticket.sec, NaN) >= 2) sec = toNum(ticket.sec, NaN);
    if (!isFinite(sec) || sec < 2) {
      try {
        if (STATE.pos && isFinite(toNum(STATE.pos.lastStableSec, NaN)) && toNum(STATE.pos.lastStableSec, NaN) >= 2) sec = toNum(STATE.pos.lastStableSec, NaN);
      } catch (_) { sec = NaN; }
    }

    if (!isFinite(sec) || sec < 2) {
      logLine('WRN', 'CARRY skip (no_sec)', {
        reason: reason,
        ticket: ticket ? 1 : 0,
        stable: isFinite(toNum(STATE.pos && STATE.pos.lastStableSec, NaN)) ? toNum(STATE.pos.lastStableSec, 0).toFixed(2) : ''
      });
      return false;
    }

    var sig = '';
    try { sig = String(STATE.tick && STATE.tick.srcSig ? STATE.tick.srcSig : ''); } catch (_) { sig = ''; }
    if (!sig && ticket) {
      try { sig = String(ticket.srcSig || ''); } catch (_) { sig = ''; }
    }
    if (!sig) {
      try { sig = String(STATE.session && STATE.session.srcSig ? STATE.session.srcSig : ''); } catch (_) { sig = ''; }
    }

    STATE.resume.carry = {
      sec: sec,
      ts: nowMs(),
      srcSig: String(sig || ''),
      why: reason,
      ticketId: String(ticket && ticket.id ? ticket.id : '')
    };
    STATE.guard.allowStartUntilTs = nowMs() + 7000;
    STATE.guard.allowStartSig = String(STATE.resume.carry && STATE.resume.carry.srcSig ? STATE.resume.carry.srcSig : '');

    truthFreeze(true, 'carry_destroy');
    logLine('WRN', 'CARRY arm (destroy)', {
      sec: sec.toFixed(2),
      srcSig: String(sig || ''),
      ticketId: String(ticket && ticket.id ? ticket.id : ''),
      reason: reason
    });
    logLine('INF', 'allowStart armed', {
      ms: 7000,
      sig: String(STATE.guard.allowStartSig || '')
    });
    return true;
  }

  function maybeApplyCarryOnPlayerStart(reason) {
    reason = String(reason || 'player_start');
    var carry = STATE.resume && STATE.resume.carry ? STATE.resume.carry : null;
    if (!carry) return false;
    if (isUserSeekWindowActive() || isUserNavWindowActive()) {
      logLine('WRN', 'CARRY skipped by user intent', {
        seek: isUserSeekWindowActive() ? 1 : 0,
        nav: isUserNavWindowActive() ? 1 : 0,
        reason: reason
      });
      clearCarry('carry_user_intent', true);
      return false;
    }

    var sec = toNum(carry.sec, NaN);
    var age = ageMs(carry.ts);
    if (!isFinite(sec) || sec < 2) {
      logLine('WRN', 'CARRY skip (invalid)', { sec: isFinite(sec) ? sec.toFixed(2) : '', age: age, reason: reason });
      clearCarry('carry_invalid', true);
      return false;
    }
    if (age > 20000) {
      logLine('WRN', 'CARRY expired', { sec: sec.toFixed(2), age: age, reason: reason });
      clearCarry('carry_expired', true);
      return false;
    }

    var vCur = STATE.video || getVideo();
    var newSig = '';
    try { newSig = String(srcSig(getCurrentSrc(vCur)) || ''); } catch (_) { newSig = ''; }
    if (!newSig) {
      try { newSig = String(STATE.tick && STATE.tick.srcSig ? STATE.tick.srcSig : ''); } catch (_) { newSig = ''; }
    }
    var carrySig = '';
    try { carrySig = String(carry.srcSig || ''); } catch (_) { carrySig = ''; }
    if (!carrySig || !newSig) {
      logLine('WRN', 'CARRY sig missing - NOT applying', {
        carry: carrySig,
        newSig: newSig,
        why: reason
      });
      armFalseEndCritical(20000, 'carry_sig_missing');
      clearCarry('carry_discard_missing_sig', true);
      return false;
    }
    if (carrySig !== newSig) {
      logLine('WRN', 'CARRY sig mismatch - NOT applying', {
        carry: carrySig,
        newSig: newSig,
        why: reason
      });
      armFalseEndCritical(30000, 'carry_sig_mismatch');
      clearCarry('carry_discard_mismatch', true);
      return false;
    }

    if (CFG.protectNext) armFalseEndCritical(20000, 'carry_start');

    var sig = '';
    try { sig = String(carry.srcSig || ''); } catch (_) { sig = ''; }
    if (!sig) {
      try { sig = String(STATE.tick && STATE.tick.srcSig ? STATE.tick.srcSig : ''); } catch (_) { sig = ''; }
    }
    var ticket = {
      id: String(carry.ticketId || ('carry_' + String(nowMs()))),
      recToken: toInt(STATE.rec.token, 0),
      sec: sec,
      srcSig: String(sig || ''),
      createdTs: nowMs(),
      reason: 'carry_start',
      kind: 'carry',
      source: 'carry',
      applied: 0,
      applyTs: 0,
      lastApplyErr: '',
      verifyOk: 0,
      verifyDelta: NaN
    };
    STATE.resume.ticket = ticket;
    syncResumeTicket(ticket);

    logLine('INF', 'CARRY apply_start', {
      sec: sec.toFixed(2),
      age: age,
      srcSig: String(sig || ''),
      reason: reason,
      ticketId: String(ticket.id || '')
    });

    var tries = 0;
    function attemptApply() {
      if (toInt(STATE.life.exitIntent, 0) === 1) return;
      var v = STATE.video || getVideo();
      if (!v) {
        tries++;
        if (tries > 20) {
          logLine('WRN', 'CARRY not applied', { sec: sec.toFixed(2), err: 'no_video', tries: tries });
          return;
        }
        setTimeout(attemptApply, 300);
        return;
      }

      applyResumeTicket(v, 'carry_start', function (ok, err) {
        if (ok) {
          var cur = toNum(v.currentTime, NaN);
          logLine('INF', 'CARRY applied', {
            sec: sec.toFixed(2),
            cur: isFinite(cur) ? cur.toFixed(2) : '',
            delta: isFinite(cur) ? Math.abs(cur - sec).toFixed(2) : ''
          });
          clearCarry('carry_applied', true);
          return;
        }

        logLine('WRN', 'CARRY not applied', { sec: sec.toFixed(2), err: String(err || '') });
        var escalated = false;
        var pg = getPg();
        try {
          if (pg && typeof pg.reopenAt === 'function') {
            var r = pg.reopenAt(sec, 'overlay_carry_reopen', { srcSig: String(sig || ''), ticketTs: toInt(carry.ts, 0) });
            escalated = !!(r && r.started);
            logLine('WRN', 'CARRY escalate', {
              via: 'pg.reopenAt',
              started: escalated ? 1 : 0,
              why: r && r.why ? String(r.why || '') : ''
            });
          }
        } catch (_) { escalated = false; }

        if (!escalated) {
          try { startRecovery('carry_not_applied'); } catch (_) { }
        }
      });
    }

    setTimeout(attemptApply, 60);
    return true;
  }

  function recoveryFinish(ok, why) {
    STATE.rec.active = false;
    STATE.rec.step = '';
    STATE.rec.reason = '';
    armFrameGrace(CFG.frameGraceMs, 'recover_finish:' + String(ok ? 'ok' : 'fail'));
    if (ok) armWarmup(toInt(CFG.warmupAfterRecoverMs, 12000), 'recovery_done');
    else armWarmup(Math.max(4000, Math.floor(toInt(CFG.warmupAfterRecoverMs, 12000) * 0.66)), 'recovery_fail');
    resetSignalAges('recovery_finish:' + String(ok ? 'ok' : 'fail'));
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

    if (!toInt(STATE.life.active, 0) || toInt(STATE.life.exitIntent, 0) || !STATE.tick.hasVideo) setPhase(ST.IDLE, String(reason || 'cancel'));
    else if (STATE.tick.hasVideo) {
      if (isUserPauseIntent()) setPhase(ST.PAUSED_BY_USER, String(reason || 'cancel'));
      else setPhase(ST.PLAYING, String(reason || 'cancel'));
    } else setPhase(ST.IDLE, String(reason || 'cancel'));

    if (was) logLine('WRN', 'recover_cancel', { reason: String(reason || '') });
    resumeFinalizeDelayed(800, 'cancel');
    return was;
  }

  function isAutoRecoveryReason(reason) {
    reason = String(reason || '');
    return reason === 'playing_stuck'
      || reason === 'render_freeze'
      || reason === 'fake_full_buffer'
      || reason === 'buffer_underrun'
      || reason === 'false_end'
      || reason === 'forced_next'
      || reason === 'ended_blocked'
      || reason === 'tail_jump'
      || reason === 'tail_jump_seek';
  }

  function isSoftAttemptAllowed(reason) {
    if (toInt(CFG.softAttempts, 0) <= 0) return false;
    if (!toInt(STATE.det.hadProgress, 0)) return false;
    if (isUserPauseIntent()) return false;
    if (toInt(STATE.tick && STATE.tick.readyState, 0) < 2) return false;
    if ((nowMs() - toInt(STATE.rec.lastSoftTs, 0)) < 20000) return false;
    if (reason === 'fake_full_buffer' || reason === 'buffer_underrun') return false;
    return true;
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
    if (!isSoftAttemptAllowed(String(STATE.rec.reason || ''))) {
      logLine('DBG', 'soft_skip', {
        reason: String(STATE.rec.reason || ''),
        hadProgress: toInt(STATE.det.hadProgress, 0),
        readyState: toInt(STATE.tick && STATE.tick.readyState, 0),
        warmupLeftMs: warmupLeftMs(),
        sinceLastSoftMs: nowMs() - toInt(STATE.rec.lastSoftTs, 0)
      });
      STATE.rec.softTry = STATE.rec.softMax;
      return runInplayerStep(token);
    }

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
    if (isModeOff()) {
      STATE.rec.lastErr = 'mode_off';
      return false;
    }
    if (isModeDelta()) {
      return startDeltaRecovery(reason);
    }
    var autoReason = isAutoRecoveryReason(reason);

    if (!CFG.enabled) {
      STATE.rec.lastErr = 'disabled';
      logLine('DBG', 'REC skip', { reason: reason, why: 'disabled' });
      return false;
    }
    if (!toInt(STATE.life.active, 0) || toInt(STATE.life.exitIntent, 0)) {
      STATE.rec.lastErr = 'inactive';
      logLine('DBG', 'REC skip', { reason: reason, why: 'inactive' });
      return false;
    }
    if (STATE.tick && STATE.tick.hasVideo && STATE.tick.paused) {
      STATE.rec.lastErr = 'media_paused';
      logLine('WRN', 'REC skip: media_paused', { reason: String(reason || '') });
      return false;
    }
    if (toInt(STATE.user.pauseHoldUntilTs, 0) > nowMs()) {
      STATE.rec.lastErr = 'pause_hold';
      logLine('DBG', 'REC skip', { reason: reason, why: 'pause_hold' });
      return false;
    }
    if (isUserSeekWindowActive()) {
      STATE.rec.lastErr = 'user_seek';
      logLine('DBG', 'REC skip', { reason: reason, why: 'user_seek' });
      return false;
    }
    if (isUserNavWindowActive()) {
      STATE.rec.lastErr = 'user_nav';
      logLine('DBG', 'REC skip', { reason: reason, why: 'user_nav' });
      return false;
    }
    if (isUserPauseIntent() || toInt(STATE.life.suspendDetectors, 0)) {
      STATE.rec.lastErr = 'user_paused';
      logLine('DBG', 'REC skip', { reason: reason, why: 'user_paused' });
      return false;
    }
    if (STATE.rec.active) {
      STATE.rec.lastErr = 'busy';
      logLine('DBG', 'REC skip', { reason: reason, why: 'busy', step: String(STATE.rec.step || '') });
      return false;
    }
    if (autoReason) {
      var can = canRunDetectors();
      if (!can.ok) {
        STATE.rec.lastErr = String(can.reason || 'gated');
        logLine('DBG', 'REC skip', { reason: reason, why: String(can.reason || 'gated') });
        return false;
      }
      var live = playbackLiveness(STATE.tick, runtimeAges());
      var allowWhileAlive = (reason === 'render_freeze' || reason === 'false_end' || reason === 'forced_next' || reason === 'ended_blocked' || reason === 'tail_jump' || reason === 'tail_jump_seek');
      if (live.alive && !allowWhileAlive) {
        STATE.rec.lastErr = 'alive:' + String(live.reason || '');
        logLine('DBG', 'REC skip', { reason: reason, why: String(STATE.rec.lastErr || '') });
        return false;
      }
    }

    var nowTs = nowMs();
    if ((nowTs - toInt(STATE.det.lastRecoverTs, 0)) < 15000) {
      STATE.det.recoverLoopCount = toInt(STATE.det.recoverLoopCount, 0) + 1;
    } else {
      STATE.det.recoverLoopCount = 0;
    }
    STATE.det.lastRecoverTs = nowTs;
    var backoffSeq = [0, 5000, 10000, 20000, 40000, 60000];
    var bi = Math.min(toInt(STATE.det.recoverLoopCount, 0), backoffSeq.length - 1);
    var backoff = backoffSeq[bi];
    STATE.det.recoverBackoffUntilTs = nowTs + backoff;
    logLine('WRN', 'RECOVERY backoff', {
      loop: toInt(STATE.det.recoverLoopCount, 0),
      backoffMs: backoff,
      reason: reason
    });

    STATE.rec.active = true;
    STATE.rec.token = toInt(STATE.rec.token, 0) + 1;
    STATE.rec.reason = reason;
    STATE.rec.step = '';
    STATE.rec.softTry = 0;
    STATE.rec.inpTry = 0;
    STATE.rec.reopenTry = 0;
    STATE.rec.softMax = clampInt(CFG.softAttempts, 0, 5);
    if (STATE.rec.softMax > 0 && !isSoftAttemptAllowed(reason)) STATE.rec.softMax = 0;
    STATE.rec.inpMax = clampInt(CFG.inplayerAttempts, 0, 6);
    STATE.rec.lastAction = '';
    STATE.rec.lastErr = '';
    STATE.rec.startedTs = now();
    clearResumeUnfreezeTimer();
    var ticket = makeResumeTicket(reason, 'recovery');
    truthFreeze(true, 'recover:' + reason);
    armWarmup(8000, 'recovery_begin');
    resetSignalAges('recovery_begin');
    armFrameGrace(CFG.frameGraceMs, 'recover_start:' + reason);
    if (CFG.protectNext) {
      var criticalMs = criticalMsForReason(reason);
      if (criticalMs > 0) armFalseEndCritical(criticalMs, 'recover:' + reason);
      else armBlockNext(10000, 'recover:' + reason);
    }
    var ra = runtimeAges();
    var ba = bufferAges();
    var tv = STATE.tick || {};

    logLine('WRN', 'recover_begin', {
      reason: reason,
      soft: STATE.rec.softMax,
      inplayer: STATE.rec.inpMax,
      mode: CFG.inplayerMode,
      reopen: CFG.escalateToReopen ? 1 : 0,
      ctAge: toInt(ra.ctAge, 0),
      timeupdateAge: toInt(ra.timeupdateAge, 0),
      progAge: toInt(ra.progAge, 0),
      bufMoveAge: toInt(ba.bufEndMoveAge, 0),
      rs: toInt(tv.readyState, 0),
      ns: toInt(tv.networkState, 0),
      seekDeltaSec: toNum(CFG.seekDeltaSec, 0.1),
      hangTimeMs: toInt(CFG.hangTimeMs, 0),
      hangBufMs: toInt(CFG.hangBufMs, 0),
      ticketId: String(ticket && ticket.id ? ticket.id : ''),
      resume: (ticket && isFinite(toNum(ticket.sec, NaN))) ? toNum(ticket.sec, 0).toFixed(2) : 'null'
    });

    var token = toInt(STATE.rec.token, 0);
    runSoftStep(token);
    return true;
  }

  function handleUserCommand(cmd, payload) {
    var raw = String(cmd || '');
    var norm = normalizeCommand(raw);
    if (!norm) return;

    if (norm === 'toggle') {
      var tv = STATE.video || getVideo();
      var isPaused = false;
      try { isPaused = !!(tv && tv.paused); } catch (_) { isPaused = false; }
      norm = isPaused ? 'play' : 'pause';
    }

    var cmdTs = nowMs();
    STATE.pendingUserCommand = norm;
    STATE.pendingUserCommandTs = cmdTs;
    if (STATE.pendingUserCommandTimer) {
      try { clearTimeout(STATE.pendingUserCommandTimer); } catch (_) { }
      STATE.pendingUserCommandTimer = null;
    }
    STATE.pendingUserCommandTimer = setTimeout(function () {
      try {
        if (String(STATE.pendingUserCommand || '') === String(norm || '') && ageMs(toInt(STATE.pendingUserCommandTs, 0)) >= 800) {
          STATE.pendingUserCommand = '';
          STATE.pendingUserCommandTs = 0;
        }
      } catch (_) { }
      STATE.pendingUserCommandTimer = null;
    }, 1000);
    STATE.user.lastCmd = String(norm || '');
    STATE.user.lastCmdRaw = String(raw || '');
    STATE.user.lastCmdNorm = String(norm || '');
    STATE.user.lastCmdTs = cmdTs;

    logLine('DBG', 'CMD', { raw: String(raw || ''), norm: String(norm || '') });

    if (norm === 'pause') {
      setUserPauseIntent(true, 'cmd_pause');
      if (isModeDelta()) {
        STATE.dg.pauseProbeUntilTs = Math.max(toInt(STATE.dg.pauseProbeUntilTs, 0), nowMs() + 350);
      }
      STATE.pause.lastPauseTs = now();
      STATE.user.pauseHoldUntilTs = nowMs() + 15000;
      STATE.user.pauseHoldWhy = 'cmd_pause';
      STATE.life.suspendDetectors = 1;
      setPhase(ST.PAUSED_BY_USER, 'cmd_pause');
      if (isModeDelta()) dgSetState(DG_ST.SUSPENDED, 'cmd_pause');
    }
    else if (norm === 'play') {
      setUserPauseIntent(false, 'cmd_play');
      STATE.dg.pauseProbeUntilTs = 0;
      STATE.pause.lastResumeTs = now();
      STATE.user.pauseHoldUntilTs = 0;
      STATE.user.pauseHoldWhy = '';
      if (!toInt(STATE.life.exitIntent, 0)) {
        STATE.life.suspendDetectors = 0;
        markLifeOpen('cmd_play');
      }
      setPhase(ST.PLAYING, 'cmd_play');
      if (isModeDelta()) {
        armWarmup(Math.max(800, toInt(CFG.dgWarmupGraceMs, 1200)), 'dg_cmd_play');
        dgSetState(DG_ST.TRACKING, 'cmd_play');
      }
    }
    else if (norm === 'seek') {
      markUserSeekIntent(toInt(CFG.userSeekWindowMs, 1800), 'cmd_seek');
      if (STATE.rec.active) recoveryCancel('user:seek');
    }
    else if (norm === 'nav') {
      markUserNavIntent(toInt(CFG.userNavWindowMs, 2500), 'cmd_nav');
      if (STATE.rec.active) recoveryCancel('user:nav');
    }
    else if (norm === 'exit') {
      softShutdownOnExit('user_exit');
      try { logLine('DBG', 'user_command', { cmd: norm, src: payload && payload.type ? String(payload.type) : '' }); } catch (_) { }
      return;
    }

    if (STATE.rec.active) recoveryCancel('user:' + norm);

    try {
      logLine('DBG', 'user_command', { cmd: norm, src: payload && payload.type ? String(payload.type) : '' });
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

  var DG_ST = {
    IDLE: 'IDLE',
    TRACKING: 'TRACKING',
    STALL_CANDIDATE: 'STALL_CANDIDATE',
    RECOVERING: 'RECOVERING',
    VERIFYING: 'VERIFYING',
    SUSPENDED: 'SUSPENDED'
  };

  function dgLog(level, name, fields) {
    var mode = normalizeDgDebugLevel(CFG.dgDebugLevel || 'normal');
    if (mode === 'silent' && level !== 'ERR' && level !== 'WRN') return;
    if (mode !== 'trace' && level === 'DBG') return;
    logLine(level, name, fields);
  }

  function dgSetState(state, reason) {
    state = String(state || DG_ST.IDLE);
    reason = String(reason || '');
    if (STATE.dg.state === state && STATE.dg.reason === reason) return;
    STATE.dg.state = state;
    STATE.dg.reason = reason;
    STATE.dg.stateTs = nowMs();
    dgLog('INF', 'DG_STATE', { state: state, reason: reason });
    if (state === DG_ST.TRACKING) dgLog('INF', 'DG_ENTER_TRACKING', { reason: reason });
    else if (state === DG_ST.STALL_CANDIDATE) dgLog('WRN', 'DG_STALL_CANDIDATE', { reason: reason });
  }

  function dgStopVerifyTimer() {
    if (!STATE.dg.verifyTimer) return;
    try { clearInterval(STATE.dg.verifyTimer); } catch (_) { }
    STATE.dg.verifyTimer = null;
  }

  function dgStopRuntime(reason) {
    dgStopVerifyTimer();
    STATE.dg.recoverActive = false;
    STATE.dg.recoverToken = toInt(STATE.dg.recoverToken, 0) + 1;
    STATE.dg.internalPause = 0;
    STATE.dg.pauseByUser = 0;
    STATE.dg.pauseProbeUntilTs = 0;
    STATE.dg.wakeupVerifyUntilTs = 0;
    STATE.dg.wakeupStartCt = NaN;
    STATE.dg.endGuard.blockNextUntilTs = 0;
    STATE.dg.endGuard.blockContentKey = '';
    if (reason) dgLog('DBG', 'DG_STOP', { reason: String(reason || '') });
  }

  function dgContentKey() {
    var sig = '';
    try { sig = String(STATE.session && STATE.session.srcSig ? STATE.session.srcSig : ''); } catch (_) { sig = ''; }
    if (!sig) {
      try { sig = String(STATE.tick && STATE.tick.srcSig ? STATE.tick.srcSig : ''); } catch (_) { sig = ''; }
    }
    if (!sig) {
      try { sig = String(srcSig(getCurrentSrc(STATE.video || getVideo())) || ''); } catch (_) { sig = ''; }
    }

    var season = '';
    var episode = '';
    var pid = '';
    try {
      if (window.Lampa && Lampa.Player && typeof Lampa.Player.playdata === 'function') {
        var pd = Lampa.Player.playdata() || null;
        if (pd) {
          season = String(pd.season !== undefined ? pd.season : '');
          episode = String(pd.episode !== undefined ? pd.episode : '');
          pid = String(pd.id || pd.kp || pd.imdb || '');
        }
      }
    } catch (_) { }
    var durBucket = '';
    try {
      var d = toNum(STATE.tick && STATE.tick.dur, NaN);
      if (isFinite(d) && d > 0) durBucket = String(Math.round(d));
    } catch (_) { }
    return [sig, pid, season, episode, durBucket].join('|');
  }

  function dgTailSec() {
    return Math.max(0.5, Math.min(12, toNum(CFG.dgTailSec, 3.0)));
  }

  function dgFalseEndJumpSec() {
    return Math.max(1, Math.min(120, toNum(CFG.dgFalseEndJumpSec, 10.0)));
  }

  function dgBlockNextMs() {
    return clampInt(toInt(CFG.dgBlockNextMs, 6000), 1000, 30000);
  }

  function dgIsNearEnd(ct, dur) {
    return isFinite(toNum(ct, NaN)) && isFinite(toNum(dur, NaN)) && toNum(dur, 0) > 1 && toNum(ct, 0) >= (toNum(dur, 0) - dgTailSec());
  }

  function dgUserSeekIntentActive() {
    var until = Math.max(toInt(STATE.dg.userSeekUntilTs, 0), toInt(STATE.intent.userSeekUntilTs, 0));
    return nowMs() < until;
  }

  function dgCurrentBlockLeftMs() {
    var eg = STATE.dg && STATE.dg.endGuard ? STATE.dg.endGuard : null;
    if (!eg) return 0;
    var key = String(STATE.dg.contentKey || '');
    var blockKey = String(eg.blockContentKey || '');
    if (blockKey && key && blockKey !== key) return 0;
    return Math.max(0, toInt(eg.blockNextUntilTs, 0) - nowMs());
  }

  function dgBlockNextActive() {
    return dgCurrentBlockLeftMs() > 0;
  }

  function dgStateBlocksNext() {
    var st = String(STATE.dg.state || '');
    return st === DG_ST.STALL_CANDIDATE || st === DG_ST.RECOVERING || st === DG_ST.VERIFYING;
  }

  function dgWakeupPlayCooldownMs() {
    return clampInt(toInt(DET.dgWakeupPlayCooldownMs, 1600), 800, 4000);
  }

  function dgWakeupVerifyMs() {
    return clampInt(toInt(DET.dgWakeupVerifyMs, 700), 400, 1500);
  }

  function dgWakeupMoveSec() {
    return Math.max(0.08, Math.min(0.4, toNum(DET.dgWakeupMoveSec, 0.12)));
  }

  function dgTryWakeupPlay(reason) {
    reason = String(reason || 'internal_paused');
    if (!isModeDelta()) return false;
    if (!toInt(STATE.life.active, 0) || toInt(STATE.life.exitIntent, 0) === 1) return false;
    if (isUserPauseIntent()) return false;
    if (dgPauseByUser(STATE.tick || {})) return false;

    var ts = nowMs();
    if ((ts - toInt(STATE.dg.wakeupPlayTs, 0)) < dgWakeupPlayCooldownMs()) return false;
    var v = STATE.video || getVideo();
    if (!v || typeof v.play !== 'function') return false;

    var startCt = toNum(STATE.tick && STATE.tick.ct, NaN);
    if (!isFinite(startCt)) {
      try { startCt = toNum(v.currentTime, NaN); } catch (_) { startCt = NaN; }
    }
    STATE.dg.wakeupPlayTs = ts;
    STATE.dg.wakeupVerifyUntilTs = ts + dgWakeupVerifyMs();
    STATE.dg.wakeupStartCt = startCt;
    STATE.dg.wakeupResult = 'attempted';
    STATE.dg.wakeupReason = reason;
    STATE.dg.lastAction = 'wakeup_play';

    try {
      var p = v.play();
      if (p && typeof p.then === 'function' && typeof p.catch === 'function') {
        p.then(function () {
          if (String(STATE.dg.wakeupResult || '') === 'attempted') {
            STATE.dg.wakeupReason = reason + ':promise_ok';
          }
        }).catch(function () {
          if (String(STATE.dg.wakeupResult || '') === 'attempted') {
            STATE.dg.wakeupResult = 'fail';
            STATE.dg.wakeupReason = reason + ':play_rejected';
            STATE.dg.wakeupVerifyUntilTs = 0;
          }
        });
      }
    } catch (_) {
      STATE.dg.wakeupResult = 'fail';
      STATE.dg.wakeupReason = reason + ':play_throw';
      STATE.dg.wakeupVerifyUntilTs = 0;
      return false;
    }

    dgLog('WRN', 'DG_WAKEUP_PLAY', { reason: reason, verifyMs: dgWakeupVerifyMs() });
    return true;
  }

  function dgVerifyWakeupResult(t) {
    t = t || STATE.tick || {};
    var until = toInt(STATE.dg.wakeupVerifyUntilTs, 0);
    if (!until) return false;
    if (nowMs() < until) return true;

    var ctNow = toNum(t.ct, NaN);
    if (!isFinite(ctNow)) {
      var v = STATE.video || getVideo();
      ctNow = toNum(v && v.currentTime, NaN);
    }
    var ctStart = toNum(STATE.dg.wakeupStartCt, NaN);
    var moved = isFinite(ctNow) && isFinite(ctStart) && (ctNow - ctStart) >= dgWakeupMoveSec();
    var tuFresh = ageMs(STATE.ev.lastTimeupdateTs || STATE.events.last.timeupdate) <= (dgWakeupVerifyMs() + 320);
    var pausedNow = !!t.paused;
    var ok = moved || (!pausedNow && tuFresh);

    STATE.dg.wakeupVerifyUntilTs = 0;
    STATE.dg.wakeupStartCt = NaN;
    if (ok) {
      STATE.dg.wakeupResult = 'ok';
      STATE.dg.wakeupReason = 'wakeup_ok';
      STATE.dg.internalPause = 0;
      dgLog('OK', 'DG_WAKEUP_OK', { moved: moved ? 1 : 0, tuFresh: tuFresh ? 1 : 0 });
      return true;
    }

    STATE.dg.wakeupResult = 'fail';
    STATE.dg.wakeupReason = 'wakeup_fail';
    dgLog('WRN', 'DG_WAKEUP_FAIL', {
      paused: pausedNow ? 1 : 0,
      ctStart: isFinite(ctStart) ? ctStart.toFixed(2) : '',
      ctNow: isFinite(ctNow) ? ctNow.toFixed(2) : '',
      tuAge: ageMs(STATE.ev.lastTimeupdateTs || STATE.events.last.timeupdate)
    });
    if (!STATE.dg.recoverActive && !STATE.rec.active) {
      startDeltaRecovery('internal_paused_wakeup_fail');
    }
    return true;
  }

  function dgSetBlockNext(ms, why) {
    ms = clampInt(ms, 1000, 30000);
    var until = nowMs() + ms;
    STATE.dg.endGuard.blockNextUntilTs = Math.max(toInt(STATE.dg.endGuard.blockNextUntilTs, 0), until);
    STATE.dg.endGuard.blockContentKey = String(STATE.dg.contentKey || '');
    armBlockNext(ms, 'dg:' + String(why || ''));
  }

  function dgBufferSig(t) {
    t = t || STATE.tick || {};
    var sig = String(t.rangesSig || '');
    var firstS = isFinite(toNum(t.firstRangeStart, NaN)) ? toNum(t.firstRangeStart, 0).toFixed(2) : '-';
    var firstE = isFinite(toNum(t.firstRangeEnd, NaN)) ? toNum(t.firstRangeEnd, 0).toFixed(2) : '-';
    return sig + '|first=' + firstS + '-' + firstE;
  }

  function dgNaturalGrowth(minPairs, maxLookback) {
    var rows = STATE.dg.samples || [];
    minPairs = clampInt(minPairs, 1, 10);
    maxLookback = clampInt(maxLookback || 12, minPairs + 1, 30);
    if (rows.length < 2) return false;

    var good = 0;
    var checked = 0;
    for (var i = rows.length - 1; i > 0 && checked < maxLookback; i--) {
      var cur = rows[i] || null;
      var prev = rows[i - 1] || null;
      checked++;
      if (!cur || !prev) continue;
      var ctA = toNum(prev.ct, NaN);
      var ctB = toNum(cur.ct, NaN);
      if (!isFinite(ctA) || !isFinite(ctB)) continue;
      var dtMs = Math.max(1, toInt(cur.tWall, 0) - toInt(prev.tWall, 0));
      var ctDelta = ctB - ctA;
      var maxNatural = Math.max(2.5, (dtMs / 1000) * 2.8);
      if (ctDelta >= 0.01 && ctDelta <= maxNatural) good++;
      else if (ctDelta < -0.1) return false;
      if (good >= minPairs) return true;
    }
    return false;
  }

  function dgMarkBufferGuard(kind, reason, t) {
    t = t || STATE.tick || {};
    var bg = STATE.dg.bufferGuard || {};
    var ts = nowMs();
    kind = String(kind || '');
    reason = String(reason || '');

    if (kind === 'fake_full') bg.fakeFullDetected = 1;
    if (kind === 'underrun') bg.underrunDetected = 1;
    bg.reason = kind + ':' + reason;
    bg.reasonTs = ts;
    bg.bufferSig = dgBufferSig(t);
    bg.ranges = String(t.rangesText || '');
    STATE.dg.bufferGuard = bg;
    dgSetBlockNext(dgBlockNextMs(), 'buffer_guard:' + kind);
  }

  function dgMarkFalseEnd(reason, opts) {
    opts = opts || {};
    var eg = STATE.dg.endGuard || {};
    var ts = nowMs();
    var why = String(reason || '');
    eg.falseEndDetected = 1;
    eg.falseEndReason = why;
    eg.falseEndTs = ts;
    eg.ctJumpDelta = toNum(opts.ctJumpDelta, 0);
    eg.nearEnd = toInt(opts.nearEnd, 0) ? 1 : 0;
    STATE.dg.endGuard = eg;
    dgSetBlockNext(dgBlockNextMs(), 'false_end:' + why);
  }

  function dgApplyTargetSeek(target, why) {
    var v = STATE.video || getVideo();
    if (!v || !isFinite(toNum(target, NaN))) return false;
    try {
      markGuardSeekIntent(toInt(CFG.userSeekWindowMs, 1800), String(why || 'dg_seek'));
      armFrameGrace(CFG.frameGraceMs, String(why || 'dg_seek'));
      v.currentTime = Math.max(0, toNum(target, 0));
      return true;
    } catch (_) {
      return false;
    }
  }

  function dgKickRecovery(reason, opts) {
    opts = opts || {};
    reason = String(reason || 'false_end');
    if (!isModeDelta()) return false;
    if (!CFG.enabled || String(CFG.mode || '') === 'off') return false;

    var t = opts.tick || STATE.tick || {};
    var ct = toNum(t.ct, NaN);
    var dur = toNum(t.dur, NaN);
    var nearEnd = dgIsNearEnd(ct, dur);
    var target = dgPickTargetSec();
    if (!isFinite(target)) {
      target = recoveryTargetSec(toNum(STATE.truth.lastGoodSec, 0), dur, 'dg_' + reason);
    }
    if (!isFinite(target)) target = Math.max(0, toNum(STATE.truth.lastGoodSec, 0));

    dgMarkFalseEnd(reason, {
      ctJumpDelta: toNum(opts.ctJumpDelta, 0),
      nearEnd: nearEnd ? 1 : 0
    });
    STATE.dg.lastTrigger = 'false_end:' + reason;
    STATE.dg.lastAction = 'guard:' + reason;
    if (nearEnd && isFinite(target)) {
      STATE.dg.targetSec = Math.max(0, toNum(target, 0));
      STATE.dg.targetKey = String(STATE.dg.contentKey || '');
      if (dgApplyTargetSeek(target, 'dg_false_end_seek')) {
        dgSetState(DG_ST.VERIFYING, 'false_end_seek');
      } else {
        dgSetState(DG_ST.RECOVERING, 'false_end_no_seek');
      }
    } else {
      dgSetState(DG_ST.RECOVERING, 'false_end');
    }
    setPhase(ST.HUNG, 'dg_false_end');

    var delayMs = clampInt(toInt(opts.delayMs, 260), 120, 900);
    var scheduledKey = String(STATE.dg.contentKey || '');
    setTimeout(function () {
      if (!isModeDelta()) return;
      if (scheduledKey && scheduledKey !== String(STATE.dg.contentKey || '')) return;
      if (dgUserSeekIntentActive() || isUserNavWindowActive() || isUserPauseIntent()) return;
      if (STATE.dg.recoverActive || STATE.rec.active) return;
      startDeltaRecovery('false_end:' + reason);
    }, delayMs);
    return true;
  }

  function dgShouldTreatEndAsFalse() {
    if (!CFG.dgFalseEndEnabled) return { block: false, reason: '' };
    if (dgUserSeekIntentActive() || isUserNavWindowActive()) return { block: false, reason: 'user_intent' };
    if (dgStateBlocksNext() || dgBlockNextActive()) return { block: true, reason: 'state_or_block' };

    var t = STATE.tick || {};
    var nearEnd = dgIsNearEnd(toNum(t.ct, NaN), toNum(t.dur, NaN));

    var bg = STATE.dg.bufferGuard || {};
    if ((toInt(bg.fakeFullDetected, 0) || toInt(bg.underrunDetected, 0)) && ageMs(toInt(bg.reasonTs, 0)) < 15000) {
      return { block: true, reason: String(bg.reason || 'buffer_guard') };
    }

    if (nearEnd && !dgNaturalGrowth(3, 10)) return { block: true, reason: 'no_natural_growth' };
    return { block: false, reason: '' };
  }

  function dgHandleNextTrigger(where, type) {
    if (!isModeDelta()) return false;
    if (!CFG.dgFalseEndEnabled) return false;
    if (dgUserSeekIntentActive() || isUserNavWindowActive()) return false;
    if (STATE.user && String(STATE.user.lastCmdNorm || '') === 'nav' && ageMs(toInt(STATE.user.lastCmdTs, 0)) < Math.max(1200, toInt(CFG.userNavWindowMs, 2500) + 400)) return false;
    var dec = dgShouldTreatEndAsFalse();
    if (!dec || !dec.block) return false;
    var why = 'next_trigger:' + String(where || '') + ':' + String(type || '') + ':' + String(dec.reason || 'guard');
    return dgKickRecovery(why, { delayMs: 220 });
  }

  function dgMaybeDetectNearEndJump() {
    if (!isModeDelta()) return false;
    if (!CFG.dgFalseEndEnabled) return false;
    if (dgUserSeekIntentActive() || isUserNavWindowActive()) return false;
    if (nowMs() < toInt(STATE.intent.guardSeekUntilTs, 0)) return false;

    var t = STATE.tick || {};
    var ct = toNum(t.ct, NaN);
    var dur = toNum(t.dur, NaN);
    if (!dgIsNearEnd(ct, dur)) return false;

    var g = STATE.dg.lastGoodSample;
    if (!g) return false;
    var lastGoodCt = toNum(g.ct, NaN);
    if (!isFinite(lastGoodCt)) return false;

    var jumpDelta = (toNum(dur, 0) - dgTailSec()) - lastGoodCt;
    if (!isFinite(jumpDelta) || jumpDelta < dgFalseEndJumpSec()) return false;
    if (ageMs(toInt(STATE.dg.endGuard.falseEndTs, 0)) < 900) return false;

    return dgKickRecovery('jump_to_end', { ctJumpDelta: jumpDelta, delayMs: 260, tick: t });
  }

  function dgMaybeDetectBufferGuards(ages) {
    if (!isModeDelta()) return false;
    if (STATE.dg.recoverActive || STATE.rec.active) return false;
    if (dgUserSeekIntentActive() || isUserNavWindowActive()) return false;

    var t = STATE.tick || {};
    if (!t.hasVideo) return false;

    var ctStuck = toInt(STATE.ct.stuckMs, 0);
    var stallSoft = Math.max(500, toInt(CFG.dgStallSoftMs, 1200));
    if (ctStuck < stallSoft) return false;

    ages = ages || runtimeAges();
    var ba = bufferAges();
    var ageThr = Math.max(stallSoft, 900);
    var timeupdateOld = toInt(ages.timeupdateAge, 0) >= ageThr;
    var progressOld = toInt(ba.progAge, 0) >= ageThr;
    var noFlow = timeupdateOld && progressOld;

    var dur = toNum(t.dur, NaN);
    var tail = dgTailSec();
    var bufferedEnd = toNum(t.bufferedEndAtCt, NaN);
    if (!isFinite(bufferedEnd)) bufferedEnd = toNum(t.firstRangeEnd, NaN);
    var fullRange = isFinite(dur) && dur > 20 && toNum(t.firstRangeStart, NaN) <= 0.5 && isFinite(bufferedEnd) && bufferedEnd >= (dur - tail);
    var aheadHuge = toNum(t.aheadSec, 0) >= Math.max(20, (isFinite(dur) ? dur * 0.35 : 20));
    var aheadStale = toInt(ba.aheadMoveAge, 0) >= ageThr;
    var fakeFlow = fullRange && ctStuck >= stallSoft && (noFlow || (aheadHuge && aheadStale));

    if (CFG.dgFakeFullEnabled && fakeFlow) {
      dgMarkBufferGuard('fake_full', 'full_range_no_flow', t);
      STATE.dg.lastTrigger = 'fake_full';
      dgSetState(DG_ST.RECOVERING, 'fake_full');
      setPhase(ST.HUNG, 'dg_fake_full');
      return startDeltaRecovery('fake_full_buffer_dg');
    }

    var minAhead = Math.max(0.01, toNum(CFG.minAheadSec, 0.1));
    var underrun = toNum(t.aheadSec, 0) <= minAhead && ctStuck >= stallSoft && noFlow;
    if (underrun) {
      dgMarkBufferGuard('underrun', 'low_ahead_stall', t);
      STATE.dg.lastTrigger = 'underrun';
      dgSetState(DG_ST.RECOVERING, 'underrun');
      setPhase(ST.HUNG, 'dg_underrun');
      return startDeltaRecovery('buffer_underrun_dg');
    }
    return false;
  }

  function dgResetForContent(newKey, why) {
    newKey = String(newKey || '');
    var prev = String(STATE.dg.contentKey || '');
    if (prev && newKey && prev !== newKey) {
      clearCarry('dg_content_change', true);
      if (STATE.resume && STATE.resume.ticket) {
        STATE.resume.ticket = null;
        syncResumeTicket({
          id: '',
          recToken: toInt(STATE.rec.token, 0),
          sec: null,
          srcSig: String(STATE.session && STATE.session.srcSig ? STATE.session.srcSig : ''),
          createdTs: nowMs(),
          reason: 'dg_content_change',
          kind: 'discard',
          source: 'dg',
          applied: 0,
          applyTs: 0,
          lastApplyErr: 'dg_content_change',
          verifyOk: 0,
          verifyDelta: NaN
        });
      }
    }
    STATE.dg.lastContentKey = prev;
    STATE.dg.contentKey = newKey;
    STATE.dg.samples = [];
    STATE.dg.lastSampleTs = 0;
    STATE.dg.lastGoodSample = null;
    STATE.dg.lastStableSample = null;
    STATE.dg.stallCandidateTs = 0;
    STATE.dg.targetSec = NaN;
    STATE.dg.targetKey = '';
    STATE.dg.recoverAttempts = 0;
    STATE.dg.recoverRetry = 0;
    STATE.dg.verifyAttempts = 0;
    STATE.dg.corrections = 0;
    STATE.dg.lastTrigger = '';
    STATE.dg.lastAction = '';
    STATE.dg.lastErr = '';
    STATE.dg.failsafeUntilTs = 0;
    STATE.dg.suspendUntilTs = 0;
    STATE.dg.userPauseUntilTs = 0;
    STATE.dg.userSeekUntilTs = 0;
    STATE.dg.pauseByUser = 0;
    STATE.dg.internalPause = 0;
    STATE.dg.wakeupPlayTs = 0;
    STATE.dg.wakeupVerifyUntilTs = 0;
    STATE.dg.wakeupStartCt = NaN;
    STATE.dg.wakeupResult = '';
    STATE.dg.wakeupReason = '';
    STATE.dg.pauseProbeUntilTs = 0;
    STATE.dg.lastPauseSignalTs = 0;
    STATE.dg.endGuard.blockNextUntilTs = 0;
    STATE.dg.endGuard.blockContentKey = '';
    STATE.dg.endGuard.falseEndDetected = 0;
    STATE.dg.endGuard.falseEndReason = '';
    STATE.dg.endGuard.falseEndTs = 0;
    STATE.dg.endGuard.ctJumpDelta = 0;
    STATE.dg.endGuard.nearEnd = 0;
    STATE.dg.bufferGuard.fakeFullDetected = 0;
    STATE.dg.bufferGuard.underrunDetected = 0;
    STATE.dg.bufferGuard.reason = '';
    STATE.dg.bufferGuard.reasonTs = 0;
    STATE.dg.bufferGuard.bufferSig = '';
    STATE.dg.bufferGuard.ranges = '';
    STATE.guard.blockNextUntilTs = 0;
    STATE.guard.preventStartUntilTs = 0;
    STATE.guard.preventEndedUntilTs = 0;
    STATE.guard.falseEndCriticalUntilTs = 0;
    dgStopVerifyTimer();
    dgSetState(newKey ? DG_ST.TRACKING : DG_ST.IDLE, String(why || 'content_reset'));
    dgLog('INF', 'DG_CONTENT_RESET', { prev: prev ? hash32(prev) : '', next: newKey ? hash32(newKey) : '', why: String(why || '') });
  }

  function dgCollectSample() {
    if (!isModeDelta()) return;
    var t = STATE.tick || {};
    if (!t.hasVideo) return;
    var ts = nowMs();
    if ((ts - toInt(STATE.dg.lastSampleTs, 0)) < clampInt(toInt(CFG.truthCommitMs, 100), 100, 2000)) return;

    var sample = {
      tWall: ts,
      ct: toNum(t.ct, NaN),
      paused: !!t.paused,
      readyState: toInt(t.readyState, 0),
      networkState: toInt(t.networkState, 0),
      ahead: toNum(t.aheadSec, 0),
      rangeStart: toNum(t.rangeStartAtCt, NaN),
      rangeEnd: toNum(t.rangeEndAtCt, NaN),
      rangesSig: String(t.rangesSig || ''),
      ranges: String(t.rangesText || ''),
      bufferSig: dgBufferSig(t),
      playing: isPlayingLike(t) ? 1 : 0,
      playbackRate: safe(function () { return toNum((STATE.video || getVideo()).playbackRate, 1); }, 1)
    };
    if (!isFinite(sample.ct)) return;

    var rows = STATE.dg.samples;
    var prev = rows.length ? rows[rows.length - 1] : null;
    var ctDelta = prev ? (sample.ct - toNum(prev.ct, sample.ct)) : 0;
    var dtMs = prev ? Math.max(1, toInt(sample.tWall, 0) - toInt(prev.tWall, 0)) : 0;
    var maxNatural = prev ? Math.max(2.5, (dtMs / 1000) * 2.8) : 0;
    var naturalGrowth = !prev || (ctDelta >= 0.01 && ctDelta <= maxNatural);
    if (naturalGrowth) {
      STATE.dg.lastGoodSample = sample;
      if (sample.ahead >= Math.max(0.05, toNum(CFG.minAheadSec, 0.1))) {
        STATE.dg.lastStableSample = sample;
      }
    }

    rows.push(sample);
    var cap = clampInt(toInt(STATE.dg.sampleCap, 120), 40, 300);
    if (rows.length > cap) rows.splice(0, rows.length - cap);
    STATE.dg.lastSampleTs = ts;
  }

  function dgPickTargetSec() {
    var g = STATE.dg.lastGoodSample;
    var s = STATE.dg.lastStableSample;
    var target = NaN;
    if (g && isFinite(toNum(g.ct, NaN))) target = toNum(g.ct, NaN);
    if (s && isFinite(toNum(s.ct, NaN))) {
      if (!isFinite(target)) target = toNum(s.ct, NaN);
      else target = Math.max(target, toNum(s.ct, NaN));
    }
    if (!isFinite(target)) return NaN;
    var dur = toNum(STATE.tick && STATE.tick.dur, NaN);
    if (isFinite(dur) && dur > 1) target = Math.min(target, Math.max(0, dur - 0.4));
    return Math.max(0, target);
  }

  function dgEnterFailsafe(why) {
    STATE.dg.failsafeUntilTs = nowMs() + clampInt(toInt(CFG.dgFailsafeCooldownMs, 8000), 1000, 120000);
    STATE.dg.lastErr = String(why || 'failsafe');
    STATE.dg.recoverActive = false;
    STATE.rec.active = false;
    STATE.rec.step = '';
    endCritical('delta_recover');
    STATE.dg.lastVerifyOk = 0;
    STATE.dg.lastVerifyStage = String(STATE.dg.lastAction || '');
    STATE.dg.lastVerifyReason = String(why || 'failsafe');
    STATE.dg.lastVerifyTs = nowMs();
    dgSetState(DG_ST.SUSPENDED, 'failsafe');
    dgLog('ERR', 'DG_FAILSAFE', { why: String(why || ''), cooldownMs: clampInt(toInt(CFG.dgFailsafeCooldownMs, 8000), 1000, 120000) });
  }

  function dgSetVerifyResult(ok, stage, reason) {
    STATE.dg.lastVerifyOk = ok ? 1 : 0;
    STATE.dg.lastVerifyStage = String(stage || '');
    STATE.dg.lastVerifyReason = String(reason || '');
    STATE.dg.lastVerifyTs = nowMs();
    dgLog(ok ? 'OK' : 'WRN', ok ? 'DG_VERIFY_OK' : 'DG_VERIFY_FAIL', {
      stage: String(stage || ''),
      reason: String(reason || ''),
      target: isFinite(toNum(STATE.dg.targetSec, NaN)) ? toNum(STATE.dg.targetSec, 0).toFixed(2) : '',
      ct: isFinite(toNum(STATE.tick && STATE.tick.ct, NaN)) ? toNum(STATE.tick.ct, 0).toFixed(2) : ''
    });
  }

  function dgBuildRecoveryTargets(reason) {
    var dur = toNum(STATE.tick && STATE.tick.dur, NaN);
    var base = dgPickTargetSec();
    if (!isFinite(base)) base = toNum(STATE.truth.lastGoodSec, NaN);
    if (!isFinite(base)) base = toNum(STATE.tick && STATE.tick.ct, NaN);
    if (!isFinite(base)) return null;

    if (isFinite(dur) && dur > 1) base = Math.min(base, Math.max(0, dur - 0.35));
    base = Math.max(0, base);
    var backoff = Math.max(0, Math.min(0.2, toNum(CFG.resumeBackoffSec, 0.3)));
    var minStep = Math.max(0.05, Math.min(1.0, toNum(CFG.resumeMinStepSec, 0.1)));
    var shift = Math.max(minStep, backoff);
    var apply = Math.max(0, base - shift);
    if (isFinite(dur) && dur > 1) apply = Math.min(apply, Math.max(0, dur - 0.35));
    dgLog('DBG', 'DG_TARGET', {
      reason: String(reason || ''),
      base: base.toFixed(3),
      apply: apply.toFixed(3),
      shift: shift.toFixed(3)
    });
    return { target: base, apply: apply, shift: shift, dur: dur };
  }

  function dgRecoveryStopReason(token) {
    if (!isModeDelta()) return 'mode_changed';
    if (token !== toInt(STATE.dg.recoverToken, 0)) return 'token_changed';
    if (STATE.dg.targetKey && dgContentKey() !== String(STATE.dg.targetKey || '')) return 'content_changed';
    if (!toInt(STATE.life.active, 0) || toInt(STATE.life.exitIntent, 0) === 1) return 'inactive';
    if (isUserPauseIntent() || (STATE.tick && STATE.tick.paused && dgPauseByUser(STATE.tick)) || dgUserSeekIntentActive() || isUserNavWindowActive()) return 'user_intent';
    return '';
  }

  function dgWaitVideoForStep(token, maxWaitMs, cb) {
    maxWaitMs = clampInt(maxWaitMs, 1000, 15000);
    var started = nowMs();
    (function waitLoop() {
      var stopWhy = dgRecoveryStopReason(token);
      if (stopWhy) return cb(null, stopWhy);
      var v = STATE.video || getVideo();
      if (v) return cb(v, '');
      if ((nowMs() - started) > maxWaitMs) return cb(null, 'no_video');
      setTimeout(waitLoop, 120);
    })();
  }

  function dgSeekForRecovery(token, stage, sec, cb) {
    var stopWhy = dgRecoveryStopReason(token);
    if (stopWhy) return cb(false, stopWhy);
    var v = STATE.video || getVideo();
    if (!v) return cb(false, 'no_video');

    STATE.dg.lastAction = String(stage || 'seek');
    markGuardSeekIntent(toInt(CFG.userSeekWindowMs, 1800), String(stage || 'dg_seek'));
    armFrameGrace(CFG.frameGraceMs, String(stage || 'dg_seek'));
    seekAfterReady(v, Math.max(0, toNum(sec, 0)), String(stage || 'dg_seek'), function (ok, err) {
      if (!ok) return cb(false, String(err || 'seek_failed'));
      return cb(true, 'ok');
    });
  }

  function dgVerifyRecoveryStep(token, stage, target, cb) {
    stage = String(stage || 'verify');
    target = toNum(target, NaN);
    if (!isFinite(target)) return cb(false, 'target_nan');

    var stopWhy = dgRecoveryStopReason(token);
    if (stopWhy) return cb(false, stopWhy);

    var verifyTimeout = clampInt(Math.max(2200, toInt(CFG.dgStallHardMs, 2500) + 900), 1800, 9000);
    var tol = Math.max(0.05, toNum(CFG.dgResumeToleranceSec, 0.12));
    var moveNeed = Math.max(0.12, Math.min(0.2, tol + 0.05));
    var nearTol = Math.max(tol, 0.2);
    var startTs = nowMs();
    var startCt = toNum(STATE.tick && STATE.tick.ct, NaN);
    var lastCt = startCt;
    var moveSeenTs = 0;

    dgSetState(DG_ST.VERIFYING, stage);
    STATE.dg.verifyAttempts = toInt(STATE.dg.verifyAttempts, 0) + 1;
    STATE.dg.lastAction = String(stage || '');
    dgStopVerifyTimer();

    STATE.dg.verifyTimer = setInterval(function () {
      var stop = dgRecoveryStopReason(token);
      if (stop) {
        dgStopVerifyTimer();
        dgSetVerifyResult(false, stage, stop);
        return cb(false, stop);
      }

      var v = STATE.video || getVideo();
      try { collectTick(v); } catch (_) { }
      var ct = toNum(v && v.currentTime, NaN);
      if (!isFinite(ct)) ct = toNum(STATE.tick && STATE.tick.ct, NaN);
      if (!isFinite(ct)) {
        if ((nowMs() - startTs) > verifyTimeout) {
          dgStopVerifyTimer();
          dgSetVerifyResult(false, stage, 'ct_nan_timeout');
          return cb(false, 'ct_nan_timeout');
        }
        return;
      }

      if (isFinite(lastCt) && (ct - lastCt) >= moveNeed) moveSeenTs = nowMs();
      if (!moveSeenTs && isFinite(startCt) && (ct - startCt) >= Math.max(moveNeed, 0.15)) moveSeenTs = nowMs();
      lastCt = ct;

      var nearTarget = Math.abs(ct - target) <= nearTol;
      if (moveSeenTs && nearTarget) {
        dgStopVerifyTimer();
        dgSetVerifyResult(true, stage, 'ct_moving_near_target');
        return cb(true, 'ok');
      }
      if (moveSeenTs && ct >= (target - nearTol) && (nowMs() - moveSeenTs) >= 280) {
        dgStopVerifyTimer();
        dgSetVerifyResult(true, stage, 'ct_moving');
        return cb(true, 'ok');
      }
      if ((nowMs() - startTs) > verifyTimeout) {
        dgStopVerifyTimer();
        dgSetVerifyResult(false, stage, 'verify_timeout');
        return cb(false, 'verify_timeout');
      }
    }, 120);
  }

  function dgFinishRecovery(ok, why) {
    STATE.dg.recoverActive = false;
    STATE.rec.active = false;
    STATE.rec.step = '';
    endCritical('delta_recover');
    dgStopVerifyTimer();
    if (ok) {
      STATE.dg.recoverRetry = 0;
      STATE.dg.lastErr = '';
      dgSetState(DG_ST.TRACKING, String(why || 'verify_ok'));
      armWarmup(Math.max(800, toInt(CFG.dgWarmupGraceMs, 1200)), 'dg_verify_ok');
      dgLog('OK', 'DG_VERIFY_OK', {
        target: isFinite(toNum(STATE.dg.targetSec, NaN)) ? toNum(STATE.dg.targetSec, 0).toFixed(2) : '',
        corrections: toInt(STATE.dg.corrections, 0)
      });
      return true;
    }

    STATE.dg.lastErr = String(why || 'recover_fail');
    var stopRetry = false;
    if (STATE.dg.lastErr === 'user_intent' || STATE.dg.lastErr === 'mode_changed' || STATE.dg.lastErr === 'token_changed' || STATE.dg.lastErr === 'inactive' || STATE.dg.lastErr === 'exit_intent' || STATE.dg.lastErr === 'disabled' || STATE.dg.lastErr === 'content_changed') {
      stopRetry = true;
    }
    if (!stopRetry && (STATE.dg.lastErr.indexOf('user_') === 0 || STATE.dg.lastErr.indexOf('cmd_') === 0)) stopRetry = true;
    if (stopRetry) {
      if (STATE.dg.lastErr === 'user_intent') {
        STATE.dg.suspendUntilTs = Math.max(toInt(STATE.dg.suspendUntilTs, 0), nowMs() + toInt(CFG.userSeekWindowMs, 1800));
      }
      dgSetState(DG_ST.SUSPENDED, STATE.dg.lastErr || 'recover_stopped');
      dgLog('INF', 'DG_VERIFY_SKIP', { why: STATE.dg.lastErr });
      return false;
    }

    if (toInt(STATE.dg.recoverRetry, 0) < toInt(CFG.dgRecoverRetryMax, 2)) {
      STATE.dg.recoverRetry = toInt(STATE.dg.recoverRetry, 0) + 1;
      dgLog('WRN', 'DG_VERIFY_FAIL', { why: String(why || ''), retry: String(STATE.dg.recoverRetry) + '/' + String(toInt(CFG.dgRecoverRetryMax, 2)) });
      setTimeout(function () {
        if (!isModeDelta()) return;
        startDeltaRecovery('verify_retry');
      }, 350);
      return false;
    }

    dgEnterFailsafe(String(why || 'verify_fail'));
    return false;
  }

  function startDeltaRecovery(reason) {
    reason = String(reason || 'delta_stall');
    if (!isModeDelta()) return false;
    if (!CFG.enabled || String(CFG.mode || '') === 'off') return false;
    if (STATE.dg.recoverActive || STATE.rec.active) return false;
    if (nowMs() < toInt(STATE.dg.failsafeUntilTs, 0)) return false;
    if (toInt(STATE.life.exitIntent, 0) === 1 || !toInt(STATE.life.active, 0)) return false;
    if (isUserPauseIntent() || isUserSeekWindowActive() || isUserNavWindowActive()) return false;

    var key = dgContentKey();
    if (key && key !== String(STATE.dg.contentKey || '')) dgResetForContent(key, 'recovery_content_update');

    var targets = dgBuildRecoveryTargets(reason);
    if (!targets || !isFinite(toNum(targets.target, NaN))) {
      dgLog('WRN', 'DG_RECOVER_SKIP', { why: 'target_nan', reason: reason });
      return false;
    }

    STATE.dg.recoverToken = toInt(STATE.dg.recoverToken, 0) + 1;
    var token = toInt(STATE.dg.recoverToken, 0);
    STATE.dg.recoverActive = true;
    STATE.dg.targetSec = toNum(targets.target, 0);
    STATE.dg.targetKey = String(STATE.dg.contentKey || '');
    STATE.dg.lastTrigger = reason;
    STATE.dg.recoverAttempts = toInt(STATE.dg.recoverAttempts, 0) + 1;
    STATE.dg.verifyAttempts = 0;
    STATE.dg.corrections = 0;

    STATE.rec.active = true;
    STATE.rec.step = 'delta_recover';
    STATE.rec.reason = reason;
    STATE.rec.startedTs = nowMs();
    STATE.dg.lastAction = 'recover_start:' + reason;
    STATE.dg.lastVerifyOk = 0;
    STATE.dg.lastVerifyStage = 'recover_start';
    STATE.dg.lastVerifyReason = '';
    STATE.dg.lastVerifyTs = 0;
    beginCritical('delta_recover', criticalTtlMs(0));
    dgSetBlockNext(Math.max(dgBlockNextMs(), Math.floor(toInt(CFG.dgStallHardMs, 2500) * 2)), 'recover:' + reason);
    armBlockNext(Math.max(5000, Math.floor(toInt(CFG.dgStallHardMs, 2500) * 3)), 'dg_recover');
    armFalseEndCritical(Math.max(8000, Math.floor(toInt(CFG.dgStallHardMs, 2500) * 3)), 'dg_recover');
    dgSetState(DG_ST.RECOVERING, reason);
    dgLog('WRN', 'DG_RECOVER_START', {
      reason: reason,
      target: toNum(targets.target, 0).toFixed(3),
      apply: toNum(targets.apply, 0).toFixed(3),
      content: hash32(String(STATE.dg.contentKey || ''))
    });

    var inplayerTry = 0;
    var reopenTry = 0;
    var maxInplayer = clampInt(toInt(CFG.inplayerAttempts, 2), 0, 6);

    function failRecovery(why) {
      dgFinishRecovery(false, String(why || 'recover_fail'));
    }

    function verifyStep(stage, onFail) {
      dgVerifyRecoveryStep(token, stage, toNum(targets.target, 0), function (ok, why) {
        if (ok) return dgFinishRecovery(true, 'verify_ok');
        if (onFail) return onFail(String(why || 'verify_fail'));
        failRecovery(String(why || 'verify_fail'));
      });
    }

    function runStep2(whyFromPrev) {
      var stop = dgRecoveryStopReason(token);
      if (stop) return failRecovery(stop);
      if (reopenTry >= 1) return failRecovery('reopen_exhausted:' + String(whyFromPrev || ''));
      reopenTry++;
      STATE.dg.lastAction = 'step2_reopen';
      dgSetState(DG_ST.RECOVERING, 'step2_reopen');
      if (!actionReopenViaPg()) return failRecovery('reopen_rejected');

      dgWaitVideoForStep(token, Math.max(4500, toInt(CFG.dgStallHardMs, 2500) * 3), function (v, waitWhy) {
        if (!v) return failRecovery(String(waitWhy || 'reopen_no_video'));
        dgSeekForRecovery(token, 'step2_reopen_seek', toNum(targets.apply, 0), function (okSeek, seekWhy) {
          if (!okSeek) return failRecovery('reopen_seek:' + String(seekWhy || 'seek_fail'));
          verifyStep('step2_reopen_verify', function (vWhy) {
            failRecovery('reopen_verify:' + String(vWhy || 'verify_fail'));
          });
        });
      });
    }

    function runStep1(whyFromPrev) {
      var stop = dgRecoveryStopReason(token);
      if (stop) return failRecovery(stop);
      if (inplayerTry >= maxInplayer) return runStep2(String(whyFromPrev || 'inplayer_exhausted'));

      inplayerTry++;
      STATE.dg.lastAction = 'step1_inplayer_' + String(inplayerTry);
      dgSetState(DG_ST.RECOVERING, 'step1_inplayer');
      if (!actionInplayerRebuild(CFG.inplayerMode)) {
        if (inplayerTry < maxInplayer) {
          setTimeout(function () { runStep1('inplayer_action_fail'); }, 220);
          return;
        }
        return runStep2('inplayer_action_fail');
      }

      dgWaitVideoForStep(token, Math.max(3200, toInt(CFG.dgStallHardMs, 2500) * 2), function (v, waitWhy) {
        if (!v) {
          if (inplayerTry < maxInplayer) return runStep1(String(waitWhy || 'inplayer_no_video'));
          return runStep2(String(waitWhy || 'inplayer_no_video'));
        }
        dgSeekForRecovery(token, 'step1_inplayer_seek_' + String(inplayerTry), toNum(targets.apply, 0), function (okSeek, seekWhy) {
          if (!okSeek) {
            if (inplayerTry < maxInplayer) return runStep1('inplayer_seek:' + String(seekWhy || 'seek_fail'));
            return runStep2('inplayer_seek:' + String(seekWhy || 'seek_fail'));
          }
          verifyStep('step1_inplayer_verify_' + String(inplayerTry), function (vWhy) {
            if (inplayerTry < maxInplayer) return runStep1('inplayer_verify:' + String(vWhy || 'verify_fail'));
            return runStep2('inplayer_verify:' + String(vWhy || 'verify_fail'));
          });
        });
      });
    }

    function runStep0() {
      var stop = dgRecoveryStopReason(token);
      if (stop) return failRecovery(stop);
      var v = STATE.video || getVideo();
      if (!v) return runStep1('step0_no_video');

      STATE.dg.lastAction = 'step0_micro_seek';
      dgSetState(DG_ST.RECOVERING, 'step0_micro_seek');
      dgSeekForRecovery(token, 'step0_micro_seek', toNum(targets.apply, 0), function (okSeek, seekWhy) {
        if (!okSeek) return runStep1('step0_seek:' + String(seekWhy || 'seek_fail'));
        verifyStep('step0_verify', function (vWhy) {
          runStep1('step0_verify:' + String(vWhy || 'verify_fail'));
        });
      });
    }

    setTimeout(runStep0, 40);
    return true;
  }

  function dgTick() {
    if (!isModeDelta()) return false;
    var key = dgContentKey();
    if (key !== String(STATE.dg.contentKey || '')) dgResetForContent(key, 'tick_content');
    dgCollectSample();

    var t = STATE.tick || {};
    if (!t.hasVideo || !toInt(STATE.life.active, 0) || toInt(STATE.life.exitIntent, 0) === 1) {
      dgSetState(DG_ST.IDLE, 'inactive');
      return false;
    }

    if (nowMs() < toInt(STATE.dg.failsafeUntilTs, 0)) {
      dgSetState(DG_ST.SUSPENDED, 'failsafe');
      return false;
    }

    var pauseByUser = dgPauseByUser(t);
    STATE.dg.pauseByUser = pauseByUser ? 1 : 0;
    STATE.dg.internalPause = (t.paused && !pauseByUser) ? 1 : 0;
    if (!t.paused && toInt(STATE.dg.wakeupVerifyUntilTs, 0) > 0) {
      dgVerifyWakeupResult(t);
    }

    var suspendLeft = Math.max(
      Math.max(0, toInt(STATE.dg.suspendUntilTs, 0) - nowMs()),
      Math.max(0, toInt(STATE.dg.userSeekUntilTs, 0) - nowMs()),
      Math.max(0, toInt(STATE.intent.userSeekUntilTs, 0) - nowMs()),
      Math.max(0, toInt(STATE.intent.userNavUntilTs, 0) - nowMs()),
      dgUserPauseLeftMs(t)
    );
    var probeLeft = Math.max(0, toInt(STATE.dg.pauseProbeUntilTs, 0) - nowMs());
    if (t.paused && probeLeft > 0) {
      dgSetState(DG_ST.STALL_CANDIDATE, 'pause_probe');
      return true;
    }

    var warmupBlocked = inWarmup() && !STATE.dg.internalPause && !dgStateBlocksNext() && !STATE.dg.recoverActive && !STATE.rec.active && !STATE.dg.verifyTimer;
    if ((t.paused && pauseByUser) || isUserPauseIntent() || suspendLeft > 0 || warmupBlocked) {
      dgSetState(DG_ST.SUSPENDED, (t.paused && pauseByUser) ? 'paused(user)' : (suspendLeft > 0 ? 'intent_window' : 'warmup'));
      return false;
    }

    if (STATE.dg.internalPause) {
      if (dgIsNearEnd(toNum(t.ct, NaN), toNum(t.dur, NaN)) && dgNaturalGrowth(3, 10) && !dgBlockNextActive() && !dgStateBlocksNext()) {
        return false;
      }
      dgSetState(DG_ST.STALL_CANDIDATE, 'paused_internal');
      if (dgVerifyWakeupResult(t)) return true;
      if (String(STATE.dg.wakeupResult || '') === 'fail' && !STATE.dg.recoverActive && !STATE.rec.active) {
        if (startDeltaRecovery('internal_paused_wakeup_fail_fast')) return true;
      }
      if (dgTryWakeupPlay('internal_paused')) return true;
      if (toInt(STATE.ct.stuckMs, 0) >= Math.max(900, toInt(CFG.dgStallSoftMs, 1200))) {
        return startDeltaRecovery('internal_paused_stall');
      }
      return true;
    }

    if (STATE.dg.recoverActive || STATE.rec.active || STATE.dg.verifyTimer) return false;
    dgSetState(DG_ST.TRACKING, 'live');
    if (dgMaybeDetectNearEndJump()) return true;

    var ctStuck = toInt(STATE.ct.stuckMs, 0);
    var stallSoft = toInt(CFG.dgStallSoftMs, 1200);
    var stallHard = Math.max(stallSoft + 200, toInt(CFG.dgStallHardMs, 2500));
    if (ctStuck < stallSoft) {
      STATE.dg.stallCandidateTs = 0;
      return false;
    }

    if (!STATE.dg.stallCandidateTs) STATE.dg.stallCandidateTs = nowMs();
    dgSetState(DG_ST.STALL_CANDIDATE, 'ct_stall');

    var ages = runtimeAges();
    if (dgMaybeDetectBufferGuards(ages)) return true;

    var decoderShouldRun = toInt(t.readyState, 0) >= 3 && toInt(t.networkState, 0) !== 2;
    if (ctStuck >= stallHard && decoderShouldRun) {
      var staleSignal = toInt(ages.timeupdateAge, 0) >= Math.max(500, Math.floor(stallSoft * 0.8))
        || toInt(ages.progAge, 0) >= Math.max(600, Math.floor(stallSoft * 0.8));
      if (staleSignal) return startDeltaRecovery('stall_hard_decoder');
    }

    var bufferingLike = toInt(t.readyState, 0) < 2 && toNum(t.aheadSec, 0) <= Math.max(0.05, toNum(CFG.minAheadSec, 0.1));
    if (bufferingLike && (toInt(ages.waitingAge, 0) < stallHard || toInt(ages.stalledAge, 0) < stallHard)) {
      return false;
    }
    if (ctStuck < stallHard) return false;

    return startDeltaRecovery('stall_hard');
  }

  function playbackLiveness(t, ages) {
    t = t || STATE.tick || {};
    ages = ages || runtimeAges();
    if (!t.hasVideo) return { alive: false, reason: 'no_video' };
    if (isUserPauseIntent()) return { alive: true, reason: 'user_paused' };
    if (t.paused) {
      if (isModeDelta()) {
        if (dgPauseByUser(t)) return { alive: true, reason: 'paused(user)' };
        return { alive: false, reason: 'paused(internal)' };
      }
      return { alive: true, reason: 'paused' };
    }

    var hangTimeMs = Math.max(1200, toInt(CFG.hangTimeMs, 12000));
    var hangBufMs = Math.max(1200, toInt(CFG.hangBufMs, 18000));
    var ctAlive = toInt(ages.ctAge, 0) <= Math.max(800, Math.floor(hangTimeMs * 0.40));
    var tuAlive = toInt(ages.timeupdateAge, 0) <= Math.max(900, Math.floor(hangTimeMs * 0.55));
    var progAlive = toInt(ages.progAge, 0) <= Math.max(1200, Math.floor(hangBufMs * 0.45));
    var playingAge = ageMs(STATE.ev.lastPlayingTs || STATE.events.last.playing || STATE.events.last.play);
    var playingAlive = playingAge <= 1800;
    var readyAlive = toInt(t.readyState, 0) >= 2 && ctAlive;

    var frameAlive = false;
    if (toInt(STATE.frames.supported, 0)) {
      var frameStuck = toInt(STATE.frames.frameStuckMs, 0);
      var frameHang = Math.max(1200, toInt(CFG.frameHangMs, 3500));
      frameAlive = frameStuck <= Math.max(900, Math.floor(frameHang * 0.5));
    }

    if (ctAlive) return { alive: true, reason: 'ct_moving' };
    if (tuAlive) return { alive: true, reason: 'timeupdate' };
    if (playingAlive) return { alive: true, reason: 'playing_evt' };
    if (readyAlive) return { alive: true, reason: 'ready_ct' };
    if (frameAlive) return { alive: true, reason: 'frames' };
    if (progAlive && toNum(t.aheadSec, 0) > Math.max(0.8, toNum(CFG.minAheadSec, 0.1))) return { alive: true, reason: 'progress_ahead' };

    return { alive: false, reason: 'signals_stale' };
  }

  function recoveryTargetSec(baseSec, dur, tag) {
    var sec = toNum(baseSec, NaN);
    if (!isFinite(sec)) return NaN;
    var shift = Math.max(toNum(CFG.resumeBackoffSec, 0.3), toNum(CFG.resumeMinStepSec, 0.1));
    sec = Math.max(0, sec - shift);
    if (isFinite(toNum(dur, NaN)) && toNum(dur, 0) > 1) sec = Math.min(sec, Math.max(0, toNum(dur, 0) - 0.75));
    if (isFinite(sec) && sec < 0.1) sec = 0;
    if (tag) logLine('DBG', 'resume_target', { tag: String(tag || ''), sec: sec.toFixed(2), shift: toNum(shift, 0).toFixed(2) });
    return sec;
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
    if (!isModeLegacy()) return false;
    if (!CFG.enabled || !CFG.protectNext) return false;
    if (STATE.rec.active) return false;
    if (isUserSeekWindowActive()) return false;
    var canDet = canRunDetectors();
    if (!canDet.ok) return false;

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

    armFalseEndCritical(30000, 'false_end');

    var v = STATE.video || getVideo();
    var target = recoveryTargetSec(toNum(STATE.truth.lastGoodSec, 0), toNum(STATE.tick && STATE.tick.dur, NaN), 'false_end');
    try {
      if (v) {
        armFrameGrace(CFG.frameGraceMs, 'false_end_prevented');
        markGuardSeekIntent(toInt(CFG.userSeekWindowMs, 1800), 'false_end_prevented');
        v.currentTime = target;
      }
    } catch (_) { }
    if (shouldAutoPlay('false_end_prevented')) {
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
      armFalseEndCritical(30000, 'false_end_busy');
    }

    return true;
  }

  function maybeHandleForcedNext(reason, payload) {
    if (!isModeLegacy()) return false;
    if (!CFG.enabled || !CFG.protectNext) return false;
    if (STATE.rec.active) return false;
    if (isUserSeekWindowActive()) return false;
    var canDet = canRunDetectors();
    if (!canDet.ok) return false;

    var t = STATE.tick;
    var ct = toNum(t && t.ct, NaN);
    var dur = toNum(t && t.dur, NaN);
    var ages = runtimeAges();
    var strict = isFalseEnd(ct, dur);
    var loose = isFalseEndLooser(ct, dur, ages);

    if (!(strict || loose)) return false;

    var ts = now();
    if ((ts - toInt(STATE.guard.lastFalseEndTs, 0)) < 700) {
      armFalseEndCritical(30000, 'forced_next_debounce');
      return true;
    }

    STATE.guard.lastFalseEndTs = ts;
    STATE.guard.falseEndCount = toInt(STATE.guard.falseEndCount, 0) + 1;
    armFalseEndCritical(30000, 'forced_next');

    var v = STATE.video || getVideo();
    var target = recoveryTargetSec(toNum(STATE.truth.lastGoodSec, 0), toNum(STATE.tick && STATE.tick.dur, NaN), 'forced_next');
    try {
      if (v) {
        armFrameGrace(CFG.frameGraceMs, 'forced_next_prevented');
        markGuardSeekIntent(toInt(CFG.userSeekWindowMs, 1800), 'forced_next_prevented');
        v.currentTime = target;
      }
    } catch (_) { }
    if (shouldAutoPlay('forced_next_prevented')) {
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
      armFalseEndCritical(30000, 'forced_next_busy');
      logLine('DBG', 'forced_next_recover_busy', { rec: 1, hold: toInt(STATE.guard.blockNextUntilTs, 0) });
    }

    return true;
  }

  function handlePlayerSend(type, payload) {
    var t = String(type || '');
    var tl = t.toLowerCase();

    if (tl === 'start') {
      ensureTickTimer('player_start');
      var sessionSig = onSessionStart(payload, 'player_start');
      STATE.det.lastStartTs = nowMs();
      resetSignalAges('player_start');
      armWarmup(8000, 'player_start');
      markLifeOpen('player_start');
      STATE.life.suspendDetectors = 0;
      STATE.life.exitIntent = 0;
      if (!isUserPauseIntent()) setUserPauseIntent(false, 'player_start');
      if (STATE.resume && STATE.resume.carry && CFG.protectNext) armFalseEndCritical(20000, 'carry_start');
      setPhase(ST.PLAYING, 'player_start');
      logLine('INF', 'player_start', { hasPayload: payload ? 1 : 0, sig: String(sessionSig || '') });
      if (isModeDelta()) {
        var dgKey = dgContentKey();
        if (dgKey !== String(STATE.dg.contentKey || '')) dgResetForContent(dgKey, 'player_start');
        else dgSetState(DG_ST.TRACKING, 'player_start');
      }
      if (CFG.enabled && CFG.debugOnOpen) uiShow('player_start');
      maybeApplyCarryOnPlayerStart('player_start');
      return;
    }

    if (tl === 'destroy') {
      if (toInt(STATE.life.exitIntent, 0) === 1) {
        shutdownOverlay('player_destroy_exit', false);
        setPhase(ST.IDLE, 'player_destroy_exit');
        return;
      }
      if (STATE.rec.active) {
        markLifeClosed('player_destroy_recovery');
        return;
      }
      armCarryFromDestroy('player_destroy');
      softShutdownKeepResume('player_destroy');
      setPhase(ST.IDLE, 'player_destroy_carry');
      if (isModeDelta()) dgSetState(DG_ST.IDLE, 'player_destroy');
      return;
    }

    if (isLikelyUserCmdType(tl) || (isNavType(tl) && isLikelyManualNavPayload(payload))) {
      handleUserCommand(tl, { type: t, payload: payload });
    }
  }

  function patchPlayerVideoSend() {
    if (STATE.patched.video) return true;
    if (!window.Lampa || !Lampa.PlayerVideo || !Lampa.PlayerVideo.listener || typeof Lampa.PlayerVideo.listener.send !== 'function') return false;

    var send = Lampa.PlayerVideo.listener.send;
    if (send.__blPlayerOverlayWrappedV2) {
      STATE.patched.video = true;
      return true;
    }

    var orig = send;
    Lampa.PlayerVideo.listener.send = function () {
      var type = (arguments && arguments.length) ? arguments[0] : '';
      var data = (arguments && arguments.length > 1) ? arguments[1] : undefined;
      var lowerType = String(type || '').toLowerCase();
      var args = [];
      for (var ai = 0; ai < arguments.length; ai++) args.push(arguments[ai]);

      var hint = null;
      var video = null;
      try { video = STATE.video || getVideo(); } catch (_) { video = null; }
      try { hint = tickHintFromPayload(data); } catch (_) { hint = null; }

      if (lowerType === 'timeupdate') {
        try { bumpEvent('timeupdate'); } catch (_) { }
        if (isModeDelta() && CFG.enabled) {
          try {
            var rawCur = toNum(hint && hint.rawCur, NaN);
            var rawDur = toNum(hint && hint.rawDur, NaN);
            if (!isFinite(rawCur)) rawCur = toNum(video && video.currentTime, NaN);
            if (!isFinite(rawDur)) rawDur = toNum(video && video.duration, NaN);
            var lastGoodCt = toNum(STATE.dg.lastGoodSample && STATE.dg.lastGoodSample.ct, NaN);
            var guardSeekLeft = Math.max(0, toInt(STATE.intent.guardSeekUntilTs, 0) - nowMs());
            if (!dgUserSeekIntentActive() && !isUserNavWindowActive() && guardSeekLeft <= 0) {
              if (dgIsBadTailTimeupdate(rawCur, rawDur, lastGoodCt)) {
                var jumpDelta = (toNum(rawDur, 0) - dgTailSec()) - toNum(lastGoodCt, 0);
                dgKickRecovery('jump_to_end_timeupdate', { ctJumpDelta: jumpDelta, delayMs: 200, tick: STATE.tick });
                logLine('WRN', 'DG_BLOCK pv.timeupdate tail_jump', {
                  cur: isFinite(rawCur) ? rawCur.toFixed(2) : '',
                  dur: isFinite(rawDur) ? rawDur.toFixed(2) : '',
                  lastGood: isFinite(lastGoodCt) ? lastGoodCt.toFixed(2) : '',
                  jumpDelta: isFinite(jumpDelta) ? jumpDelta.toFixed(2) : ''
                });
                return;
              }
            }
          } catch (_) { }
        }

        try { collectTick(video, hint); } catch (_) { }
        if (isModeDelta() && CFG.enabled) {
          try {
            var srcCt = toNum(STATE.tick && STATE.tick.ct, NaN);
            var srcDur = toNum(STATE.tick && STATE.tick.dur, NaN);
            if ((dgStateBlocksNext() || dgBlockNextActive()) && dgIsNearEnd(srcCt, srcDur)) {
              logLine('WRN', 'DG_BLOCK pv.timeupdate near_end', {
                cur: isFinite(srcCt) ? srcCt.toFixed(2) : '',
                dur: isFinite(srcDur) ? srcDur.toFixed(2) : '',
                blockLeftMs: dgCurrentBlockLeftMs(),
                state: String(STATE.dg.state || '')
              });
              return;
            }
          } catch (_) { }
        }
      }
      else if (lowerType === 'progress') {
        try { bumpEvent('progress'); } catch (_) { }
        try { collectTick(video, hint); } catch (_) { }
      }
      else if (lowerType === 'waiting') {
        try { bumpEvent('waiting'); } catch (_) { }
        try { collectTick(video, hint); } catch (_) { }
      }
      else if (lowerType === 'stalled') {
        try { bumpEvent('stalled'); } catch (_) { }
        try { collectTick(video, hint); } catch (_) { }
      }
      else if (lowerType === 'pause') {
        try { bumpEvent('pause'); } catch (_) { }
        try { collectTick(video, hint); } catch (_) { }
        try { dgOnPauseSignal('pv_pause'); } catch (_) { }
      }
      else if (lowerType === 'play' || lowerType === 'playing') {
        try { bumpEvent(lowerType); } catch (_) { }
        try { collectTick(video, hint); } catch (_) { }
        try { dgOnPlaySignal('pv_' + lowerType); } catch (_) { }
      }
      else if (lowerType === 'seeking') {
        try { bumpEvent('seeking'); } catch (_) { }
        try {
          if (nowMs() > toInt(STATE.intent.guardSeekUntilTs, 0)) markUserSeekIntent(toInt(CFG.userSeekWindowMs, 1800), 'pv_seeking');
        } catch (_) { }
        try { collectTick(video, hint); } catch (_) { }
      }
      else if (lowerType === 'seeked') {
        try { bumpEvent('seeked'); } catch (_) { }
        try {
          if (nowMs() > toInt(STATE.intent.guardSeekUntilTs, 0)) markUserSeekIntent(toInt(CFG.userSeekWindowMs, 1800), 'pv_seeked');
        } catch (_) { }
        try { collectTick(video, hint); } catch (_) { }
      }
      else if (lowerType === 'ended') {
        try { bumpEvent('ended'); } catch (_) { }
        try { collectTick(video, hint); } catch (_) { }
        if (isModeDelta() && CFG.enabled) {
          try {
            if (STATE.dg.recoverActive || STATE.rec.active) {
              dgKickRecovery('ended_while_recovering', { delayMs: 200, tick: STATE.tick });
              logLine('WRN', 'DG_BLOCK pv.ended while recovering', { state: String(STATE.dg.state || ''), blockLeftMs: dgCurrentBlockLeftMs() });
              return;
            }
            var dgEnd = dgShouldTreatEndAsFalse();
            if (dgEnd && dgEnd.block) {
              dgKickRecovery('ended_pv:' + String(dgEnd.reason || 'guard'), { delayMs: 200, tick: STATE.tick });
              logLine('WRN', 'DG_BLOCK pv.ended', { reason: String(dgEnd.reason || ''), blockLeftMs: dgCurrentBlockLeftMs() });
              return;
            }
          } catch (_) { }
        }
      }

      return orig.apply(this, args);
    };

    Lampa.PlayerVideo.listener.send.__blPlayerOverlayWrappedV2 = true;
    STATE.patched.video = true;
    logLine('OK', 'patched', { what: 'PlayerVideo.listener.send' });
    return true;
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
      try {
        if (isNavType(lowerType) && isLikelyManualNavPayload(payload)) markUserNavIntent(toInt(CFG.userNavWindowMs, 2500), 'player.send:' + lowerType);
      } catch (_) { }
      var manualNav = isUserNavWindowActive() && isNavType(lowerType);

      try {
        if (isModeDelta() && lowerType === 'start' && !manualNav) {
          if (dgStateBlocksNext() || dgBlockNextActive()) {
            logLine('WRN', 'DG_BLOCK player.start', {
              leftMs: dgCurrentBlockLeftMs(),
              state: String(STATE.dg.state || ''),
              type: String(type || '')
            });
            return;
          }
        }
        if (CFG.enabled && CFG.protectNext && lowerType === 'start' && !manualNav) {
          var untilStart = Math.max(toInt(STATE.guard.preventStartUntilTs, 0), toInt(STATE.guard.falseEndCriticalUntilTs, 0));
          if (untilStart && now() < untilStart) {
            var allowUntil = toInt(STATE.guard.allowStartUntilTs, 0);
            var allowSig = String(STATE.guard.allowStartSig || '');
            var pSig = extractStartSig(payload);
            var carrySig = String(STATE.resume && STATE.resume.carry && STATE.resume.carry.srcSig || '');
            var allowed = false;

            if (allowUntil && now() < allowUntil) {
              if (allowSig && pSig && pSig === allowSig) allowed = true;
              else if (allowSig && !pSig) allowed = true;
            }

            if (!allowed && carrySig) {
              if (pSig && pSig === carrySig) allowed = true;
            }

            if (!allowed) {
              logLine('WRN', 'BLOCK player.start (critical window)', {
                leftMs: Math.max(0, untilStart - now()),
                rec: toInt(STATE.rec.active, 0),
                pSig: pSig || '',
                carrySig: carrySig || '',
                allowSig: allowSig || ''
              });
              return;
            }
          }
        }
      } catch (_) { }

      try { handlePlayerSend(type, payload); } catch (_) { }

      try {
        if (isModeDelta() && shouldBlockNextType(type) && !manualNav) {
          collectTick(STATE.video || getVideo());
          if (dgHandleNextTrigger('player.send', lowerType)) {
            logLine('WRN', 'DG_BLOCK next/select', { where: 'player.send', type: String(type || ''), state: String(STATE.dg.state || ''), blockLeftMs: dgCurrentBlockLeftMs() });
            return;
          }
        }
        if (!isModeDelta() && CFG.enabled && CFG.protectNext && shouldBlockNextType(type) && !manualNav) {
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
        if (CFG.enabled && CFG.protectNext && manualNav && isNavType(lowerType)) {
          logLine('INF', 'ALLOW manual nav', { where: 'player.send', type: String(type || '') });
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
        if (isNavType(lowerType) && isLikelyManualNavPayload(payload)) markUserNavIntent(toInt(CFG.userNavWindowMs, 2500), 'playlist.send:' + lowerType);
      } catch (_) { }
      var manualNav = isUserNavWindowActive() && isNavType(lowerType);

      try {
        if (isModeDelta() && lowerType === 'start' && !manualNav) {
          if (dgStateBlocksNext() || dgBlockNextActive()) {
            logLine('WRN', 'DG_BLOCK playlist.start', {
              leftMs: dgCurrentBlockLeftMs(),
              state: String(STATE.dg.state || ''),
              type: String(type || '')
            });
            return;
          }
        }
        if (CFG.enabled && CFG.protectNext && lowerType === 'start' && !manualNav) {
          var untilStart = Math.max(toInt(STATE.guard.preventStartUntilTs, 0), toInt(STATE.guard.falseEndCriticalUntilTs, 0));
          if (untilStart && now() < untilStart) {
            var allowUntil = toInt(STATE.guard.allowStartUntilTs, 0);
            var allowSig = String(STATE.guard.allowStartSig || '');
            var pSig = extractStartSig(payload);
            var carrySig = String(STATE.resume && STATE.resume.carry && STATE.resume.carry.srcSig || '');
            var allowed = false;

            if (allowUntil && now() < allowUntil) {
              if (allowSig && pSig && pSig === allowSig) allowed = true;
              else if (allowSig && !pSig) allowed = true;
            }

            if (!allowed && carrySig) {
              if (pSig && pSig === carrySig) allowed = true;
            }

            if (!allowed) {
              logLine('WRN', 'BLOCK playlist.start (critical window)', {
                leftMs: Math.max(0, untilStart - now()),
                rec: toInt(STATE.rec.active, 0),
                pSig: pSig || '',
                carrySig: carrySig || '',
                allowSig: allowSig || ''
              });
              return;
            }
          }
        }
        if (isModeDelta() && shouldBlockNextType(type) && !manualNav) {
          collectTick(STATE.video || getVideo());
          if (dgHandleNextTrigger('playlist.send', lowerType)) {
            logLine('WRN', 'DG_BLOCK next/select', { where: 'playlist.send', type: String(type || ''), state: String(STATE.dg.state || ''), blockLeftMs: dgCurrentBlockLeftMs() });
            return;
          }
        }
        if (!isModeDelta() && CFG.enabled && CFG.protectNext && shouldBlockNextType(type) && !manualNav) {
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
        if (CFG.enabled && CFG.protectNext && manualNav && isNavType(lowerType)) {
          logLine('INF', 'ALLOW manual nav', { where: 'playlist.send', type: String(type || '') });
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
      try { handleUserCommand('controller.back', { type: 'controller.back' }); } catch (_) { }
      return orig.apply(this, arguments);
    };

    Lampa.Controller.back.__blPlayerOverlayWrappedV2 = true;
    STATE.patched.controller = true;
    logLine('OK', 'patched', { what: 'Controller.back' });
    return true;
  }

  function patchAll() {
    patchPlayerVideoSend();
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
      setPhase(ST.PAUSED_MEDIA, 'media_paused');
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
    var det = detectAllowedInfo();
    if (!det.ok) {
      hangUpdate(false, String(det.reason || 'blocked'), { ctAge: 0, timeupdateAge: 0, progAge: 0, aheadAge: 0, waitingAge: 0, resumeAge: 0 });
      flagSet('playingStuck', false, '');
      return false;
    }
    var canDet = canRunDetectors();
    if (!canDet.ok) {
      hangUpdate(false, String(canDet.reason || 'gated'), runtimeAges());
      flagSet('playingStuck', false, '');
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
    if (!toInt(STATE.det.hadTimeupdate, 0) && !toInt(STATE.det.hadBufferMove, 0)) {
      hangUpdate(false, 'no_evidence', runtimeAges());
      flagSet('playingStuck', false, '');
      return false;
    }

    var ages = runtimeAges();
    var ctStuckMs = ages.ctAge;
    var timeupdateAge = ages.timeupdateAge;
    var progAge = ages.progAge;
    var aheadAge = ages.aheadAge;
    var resumeAge = ages.resumeAge;

    var hangTimeMs = toInt(CFG.hangTimeMs, 12000);
    var hangBufMs = toInt(CFG.hangBufMs, 18000);
    var rs = toInt(t.readyState, 0);
    var ns = toInt(t.networkState, 0);
    var waitingAge = toInt(ages.waitingAge, 0);
    var stalledAge = toInt(ages.stalledAge, 0);
    var resumeGuardWindow = Math.max(10000, Math.min(toInt(CFG.resumeGuardMs, 180000), 45000));
    if (resumeAge > 0 && resumeAge <= resumeGuardWindow) {
      hangTimeMs = Math.max(hangTimeMs, Math.floor(toInt(CFG.hangTimeMs, 12000) * 1.15));
      hangBufMs = Math.max(hangBufMs, Math.floor(toInt(CFG.hangBufMs, 18000) * 1.15));
    }

    var loadingLike = (ns === 2 || rs < 3);
    if (loadingLike && (waitingAge < hangBufMs || stalledAge < hangBufMs)) {
      hangUpdate(false, 'buffering_grace', ages);
      flagSet('playingStuck', false, '');
      return false;
    }

    var noTimeupdate = timeupdateAge >= hangTimeMs;
    var noProgress = progAge >= hangBufMs;
    var noAhead = aheadAge >= hangBufMs;
    var lowReady = rs <= 2 && ctStuckMs >= Math.max(hangTimeMs, 2000);
    var hang = ctStuckMs >= hangTimeMs && (noTimeupdate || noProgress || noAhead || lowReady);
    var live = playbackLiveness(t, ages);

    if (!hang) {
      var why = 'ct_moving_or_signals';
      if (ctStuckMs < hangTimeMs) why = 'ct_not_stuck';
      else if (!(noTimeupdate || noProgress || noAhead || lowReady)) why = 'signals_alive';
      if (live.alive) why = 'alive:' + String(live.reason || '');
      hangUpdate(false, why, ages);
      flagSet('playingStuck', false, '');
      return false;
    }

    if (live.alive) {
      hangUpdate(false, 'alive:' + String(live.reason || ''), ages);
      flagSet('playingStuck', false, '');
      return false;
    }

    hangUpdate(true, 'playing_stuck', ages);
    flagSet('playingStuck', true, 'ctStuckMs=' + String(ctStuckMs));
    setPhase(ST.HUNG, 'playing_stuck');
    if (CFG.protectNext) armFalseEndCritical(20000, 'stuck');
    logLine('WRN', 'DETECT playing_stuck', {
      ctStuckMs: ctStuckMs,
      timeupdateAge: timeupdateAge,
      progAge: progAge,
      aheadAge: aheadAge,
      resumeAge: resumeAge,
      hangTimeMs: hangTimeMs,
      hangBufMs: hangBufMs,
      rs: rs,
      ns: ns,
      waitingAge: waitingAge,
      stalledAge: stalledAge,
      ahead: toNum(t.aheadSec, 0).toFixed(1),
      minAhead: toNum(CFG.minAheadSec, 0.1).toFixed(2)
    });

    var rec = detectorsAllowedInfo();
    var started = false;
    if (rec.ok) started = startRecovery('playing_stuck');
    else logLine('DBG', 'DETECT blocked', { kind: 'playing_stuck', why: String(rec.reason || '') });
    if (!started) {
      hangUpdate(true, 'playing_stuck_no_recover', ages);
      armFalseEndCritical(20000, 'hang_no_recover');
      logLine('WRN', 'hang_recovery_not_started', { recActive: STATE.rec.active ? 1 : 0, lastErr: String(STATE.rec.lastErr || '') });
    }
    return started;
  }

  function maybeDetectRenderFreeze() {
    if (!CFG.enabled) return false;
    if (STATE.rec.active) return false;

    var det = canRunDetectors();
    if (!det.ok) return false;

    var t = STATE.tick || {};
    if (!t.hasVideo) return false;
    if (t.paused || isUserPauseIntent()) return false;
    if (String(STATE.phase || '') !== ST.PLAYING && !isPlayingLike(t)) return false;
    if (!toInt(STATE.frames.supported, 0)) return false;
    if (frameGraceLeftMs() > 0) return false;

    var frameStuckMs = toInt(STATE.frames.frameStuckMs, 0);
    var ctDelta = toNum(STATE.frames.ctDeltaSinceFrame, 0);
    if (frameStuckMs < toInt(CFG.frameHangMs, 3200)) return false;
    if (ctDelta < toNum(CFG.frameCtDeltaSec, 1.0)) return false;

    var ts = nowMs();
    if ((ts - toInt(STATE.frames.lastDetectTs, 0)) < 1200) return false;
    STATE.frames.lastDetectTs = ts;
    STATE.frames.detectCount = toInt(STATE.frames.detectCount, 0) + 1;

    setPhase(ST.HUNG, 'render_freeze');
    if (CFG.protectNext) armFalseEndCritical(20000, 'render_freeze');
    logLine('WRN', 'DETECT render_freeze', {
      frameStuckMs: frameStuckMs,
      ctDeltaSinceFrame: ctDelta.toFixed(2),
      fc: toNum(STATE.frames.lastFrames, -1),
      ct: isFinite(toNum(t.ct, NaN)) ? toNum(t.ct, 0).toFixed(2) : '',
      dur: isFinite(toNum(t.dur, NaN)) ? toNum(t.dur, 0).toFixed(2) : '',
      graceLeftMs: frameGraceLeftMs(),
      cnt: toInt(STATE.frames.detectCount, 0)
    });

    var rec = detectorsAllowedInfo();
    var started = false;
    if (rec.ok) started = startRecovery('render_freeze');
    else logLine('DBG', 'DETECT blocked', { kind: 'render_freeze', why: String(rec.reason || '') });
    if (!started && CFG.protectNext) armFalseEndCritical(20000, 'render_freeze_busy');
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
    if (!canRunDetectors().ok) return false;
    if (!toInt(STATE.det.hadProgress, 0)) return false;

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
    if (!(noMove && noProg && (stuck || ba.timeupdateAge >= toInt(CFG.hangTimeMs, 10000)))) {
      flagSet('fakeFull', false, '');
      return false;
    }
    var live = playbackLiveness(t, ra);
    if (live.alive) {
      flagSet('fakeFull', false, '');
      return false;
    }

    var ts = nowMs();
    if ((ts - toInt(STATE.buf.fakeFullTs, 0)) < 1200) return false;
    STATE.buf.fakeFullTs = ts;
    STATE.buf.fakeFullCount = toInt(STATE.buf.fakeFullCount, 0) + 1;
    flagSet('fakeFull', true, 'dur=' + dur.toFixed(2) + ' range=' + fs.toFixed(2) + '-' + fe.toFixed(2));

    setPhase(ST.HUNG, 'fake_full');
    if (CFG.protectNext) armFalseEndCritical(30000, 'fake_full');
    logLine('WRN', 'DETECT fake_full', {
      dur: dur.toFixed(2),
      range: fs.toFixed(2) + '-' + fe.toFixed(2),
      progAge: toInt(ba.progAge, 0),
      bufMoveAge: toInt(ba.bufEndMoveAge, 0),
      ctStuckMs: toInt(STATE.ct.stuckMs, 0),
      cnt: toInt(STATE.buf.fakeFullCount, 0)
    });

    var rec = detectorsAllowedInfo();
    var started = false;
    if (rec.ok) started = startRecovery('fake_full_buffer');
    else logLine('DBG', 'DETECT blocked', { kind: 'fake_full', why: String(rec.reason || '') });
    if (!started && CFG.protectNext) armFalseEndCritical(30000, 'fake_full_busy');
    return started;
  }

  function maybeDetectBufferUnderrun() {
    if (!CFG.enabled) return false;
    if (STATE.rec.active) return false;
    if (!canRunDetectors().ok) return false;
    if (!toInt(STATE.det.hadProgress, 0)) return false;
    if (!isPlayingLike(STATE.tick)) return false;

    var t = STATE.tick || {};
    if (!t.hasVideo) return false;
    var ahead = toNum(t.aheadSec, 0);
    if (ahead > toNum(CFG.minAheadSec, 0.1)) return false;

    var ba = bufferAges();
    var ra = runtimeAges();
    var noProg = ba.progAge >= toInt(CFG.underrunNoProgMs, 4000);
    var noAheadMove = ba.aheadMoveAge >= toInt(CFG.underrunNoAheadMoveMs, 4000);
    if (!(noProg && noAheadMove)) {
      flagSet('underrun', false, '');
      return false;
    }
    var live = playbackLiveness(t, ra);
    if (live.alive) {
      flagSet('underrun', false, '');
      return false;
    }

    var ts = nowMs();
    if ((ts - toInt(STATE.buf.underrunTs, 0)) < 1200) return false;
    STATE.buf.underrunTs = ts;
    STATE.buf.underrunCount = toInt(STATE.buf.underrunCount, 0) + 1;
    flagSet('underrun', true, 'ahead=' + ahead.toFixed(2) + ' progAge=' + String(toInt(ba.progAge, 0)));

    setPhase(ST.HUNG, 'underrun');
    if (CFG.protectNext) armFalseEndCritical(20000, 'underrun');
    logLine('WRN', 'DETECT underrun', {
      ahead: ahead.toFixed(2),
      minAhead: toNum(CFG.minAheadSec, 0.1).toFixed(2),
      progAge: toInt(ba.progAge, 0),
      aheadMoveAge: toInt(ba.aheadMoveAge, 0),
      cnt: toInt(STATE.buf.underrunCount, 0)
    });

    var rec = detectorsAllowedInfo();
    var started = false;
    if (rec.ok) started = startRecovery('buffer_underrun');
    else logLine('DBG', 'DETECT blocked', { kind: 'underrun', why: String(rec.reason || '') });
    if (!started && CFG.protectNext) armFalseEndCritical(20000, 'underrun_busy');
    return started;
  }

  function maybeStartRecoveryFromFlags() {
    if (STATE.rec.active) return false;
    var rec = canRunDetectors();
    if (!rec.ok) return false;
    var live = playbackLiveness(STATE.tick, runtimeAges());
    if (live.alive) return false;

    var ts = nowMs();
    var order = [
      { key: 'playingStuck', reason: 'playing_stuck' },
      { key: 'fakeFull', reason: 'fake_full_buffer' },
      { key: 'underrun', reason: 'buffer_underrun' }
    ];

    for (var i = 0; i < order.length; i++) {
      var it = order[i];
      var f = STATE.flags && STATE.flags[it.key] ? STATE.flags[it.key] : null;
      if (!f || !toInt(f.on, 0)) continue;
      if (ageMs(toInt(f.ts, 0)) > 15000) continue;
      if ((ts - toInt(f.lastStartTs, 0)) < 2000) continue;
      f.lastStartTs = ts;
      logLine('WRN', 'FLAG recovery_start', { flag: it.key, reason: it.reason, age: ageMs(toInt(f.ts, 0)) });
      if (startRecovery(it.reason)) return true;
    }
    return false;
  }

  function trackReopenApply() {
    if (isModeDelta()) return;
    var req = toNum(STATE.resume.reopenRequestedSec, NaN);
    if (!isFinite(req) || req < 0) return;
    if (isUserSeekWindowActive() || isUserNavWindowActive()) return;
    if (STATE.resume.reopenAppliedTs) {
      if (ageMs(STATE.resume.reopenAppliedTs) > 12000) {
        STATE.resume.reopenRequestedSec = NaN;
        STATE.resume.reopenRequestedTs = 0;
        STATE.resume.reopenSeekTs = 0;
      }
      return;
    }

    var ts = nowMs();
    if ((ts - toInt(STATE.resume.reopenRequestedTs, 0)) < 1400) return;
    if ((ts - toInt(STATE.resume.reopenSeekTs, 0)) < 2800) return;

    var v = STATE.video || getVideo();
    if (!v) return;

    STATE.resume.reopenSeekTs = ts;
    applyResumeTicket(v, 'reopen', function (ok, err) {
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
      frameUpdate(STATE.video || getVideo(), STATE.tick);

      if (!CFG.enabled || isModeOff()) {
        shutdownOverlay('disabled', false);
        return;
      }

      updatePhaseByTick();
      maybeTraceDetectors();

      var wasActive = toInt(STATE.life.active, 0) === 1;
      var active = detectPlayerActive();
      if (active !== wasActive) {
        if (active) markLifeOpen('tick_detect');
        else markLifeClosed('tick_detect');
      }

      if (!active && (wasActive || toInt(STATE.life.exitIntent, 0))) {
        shutdownOverlay('inactive', false);
        return;
      }

      var detDetect = detectAllowedInfo();
      if (!detDetect.ok) {
        hangUpdate(false, String(detDetect.reason || 'blocked'), runtimeAges());
        if (STATE.ui.open) uiRender('tick');
        return;
      }

      if (isModeDelta()) {
        dgTick();
        trackReopenApply();
        if (STATE.ui.open) uiRender('tick');
        return;
      }

      maybeDetectHang();
      maybeDetectRenderFreeze();
      maybeDetectFakeFullBuffer();
      maybeDetectBufferUnderrun();
      maybeStartRecoveryFromFlags();
      if (canRunDetectors().ok) maybeHandleFalseEnd('tick_check');
      trackReopenApply();

      if (STATE.ui.open) uiRender('tick');
    } catch (e) {
      logLine('ERR', 'tick_error', { msg: e && e.message ? e.message : String(e) });
    }
  }

  API.state = function () {
    var ticket = STATE.resume.ticket || STATE.resume.lastTicket || null;
    return {
      cfg: {
        enabled: !!CFG.enabled,
        mode: String(CFG.mode || 'legacy'),
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
        reopenCooldownMs: toInt(CFG.reopenCooldownMs, 0),
        resumeBackoffSec: toNum(CFG.resumeBackoffSec, 0),
        resumeMinStepSec: toNum(CFG.resumeMinStepSec, 0),
        seekVerifyDelayMs: toInt(CFG.seekVerifyDelayMs, 0),
        seekDeltaSec: toNum(CFG.seekDeltaSec, 0),
        warmupAfterRecoverMs: toInt(CFG.warmupAfterRecoverMs, 0),
        userSeekWindowMs: toInt(CFG.userSeekWindowMs, 0),
        userNavWindowMs: toInt(CFG.userNavWindowMs, 0),
        dgStallSoftMs: toInt(CFG.dgStallSoftMs, 0),
        dgStallHardMs: toInt(CFG.dgStallHardMs, 0),
        dgWarmupGraceMs: toInt(CFG.dgWarmupGraceMs, 0),
        dgResumeToleranceSec: toNum(CFG.dgResumeToleranceSec, 0),
        dgResumeSeekRetryMax: toInt(CFG.dgResumeSeekRetryMax, 0),
        dgRecoverRetryMax: toInt(CFG.dgRecoverRetryMax, 0),
        dgFailsafeCooldownMs: toInt(CFG.dgFailsafeCooldownMs, 0),
        dgDebugLevel: String(CFG.dgDebugLevel || 'normal'),
        dgBlockNextMs: toInt(CFG.dgBlockNextMs, 0),
        dgTailSec: toNum(CFG.dgTailSec, 0),
        dgFalseEndJumpSec: toNum(CFG.dgFalseEndJumpSec, 0),
        dgFakeFullEnabled: !!CFG.dgFakeFullEnabled,
        dgFalseEndEnabled: !!CFG.dgFalseEndEnabled,
        frameHangMs: toInt(CFG.frameHangMs, 0),
        frameCtDeltaSec: toNum(CFG.frameCtDeltaSec, 0),
        frameGraceMs: toInt(CFG.frameGraceMs, 0)
      },
      phase: String(STATE.phase || ''),
      phaseReason: String(STATE.phaseReason || ''),
      recoverLock: !!STATE.rec.active,
      userPausedIntent: isUserPauseIntent(),
      life: {
        active: toInt(STATE.life.active, 0),
        exitIntent: toInt(STATE.life.exitIntent, 0),
        suspendDetectors: toInt(STATE.life.suspendDetectors, 0),
        detectorsAllowed: toInt(STATE.life.detectorsAllowed, 0),
        detectorsReason: String(STATE.life.detectorsReason || ''),
        openedTs: toInt(STATE.life.openedTs, 0),
        closedTs: toInt(STATE.life.closedTs, 0),
        lastCmd: String(STATE.user.lastCmd || ''),
        lastCmdRaw: String(STATE.user.lastCmdRaw || ''),
        lastCmdNorm: String(STATE.user.lastCmdNorm || ''),
        lastCmdTs: toInt(STATE.user.lastCmdTs, 0),
        pendingUserCommand: String(STATE.pendingUserCommand || ''),
        pendingUserCommandTs: toInt(STATE.pendingUserCommandTs, 0),
        pendingUserCommandAgeMs: ageMs(toInt(STATE.pendingUserCommandTs, 0)),
        pauseHoldUntilTs: toInt(STATE.user.pauseHoldUntilTs, 0),
        pauseHoldWhy: String(STATE.user.pauseHoldWhy || ''),
        mediaPaused: !!(STATE.tick && STATE.tick.paused),
        lastAutoPlaySuppressed: String(STATE.life.lastAutoPlaySuppressed || ''),
        lastAutoPlaySuppressedTs: toInt(STATE.life.lastAutoPlaySuppressedTs, 0)
      },
      session: {
        id: toInt(STATE.session.id, 0),
        srcSig: String(STATE.session.srcSig || ''),
        startedTs: toInt(STATE.session.startedTs, 0),
        startedAge: ageMs(STATE.session.startedTs)
      },
      intent: {
        userSeekLeftMs: Math.max(0, toInt(STATE.intent.userSeekUntilTs, 0) - nowMs()),
        guardSeekLeftMs: Math.max(0, toInt(STATE.intent.guardSeekUntilTs, 0) - nowMs()),
        userNavLeftMs: Math.max(0, toInt(STATE.intent.userNavUntilTs, 0) - nowMs()),
        userPausedIntent: toInt(STATE.intent.userPausedIntent, 0),
        guardPlayLockLeftMs: Math.max(0, toInt(STATE.intent.guardPlayLockUntilTs, 0) - nowMs()),
        userLastSeekTs: toInt(STATE.intent.userLastSeekTs, 0)
      },
      det: {
        warmupLeftMs: warmupLeftMs(),
        lastStartTs: toInt(STATE.det.lastStartTs, 0),
        lastReadyTs: toInt(STATE.det.lastReadyTs, 0),
        hadTimeupdate: toInt(STATE.det.hadTimeupdate, 0),
        hadProgress: toInt(STATE.det.hadProgress, 0),
        hadBufferMove: toInt(STATE.det.hadBufferMove, 0),
        recoverLoopCount: toInt(STATE.det.recoverLoopCount, 0),
        recoverBackoffLeftMs: recoverBackoffLeftMs(),
        lastResetSignalsReason: String(STATE.det.lastResetSignalsReason || '')
      },
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
      dg: {
        state: String(STATE.dg.state || ''),
        reason: String(STATE.dg.reason || ''),
        contentKey: String(STATE.dg.contentKey || ''),
        targetSec: toNum(STATE.dg.targetSec, NaN),
        targetKey: String(STATE.dg.targetKey || ''),
        lastGoodCt: toNum(STATE.dg.lastGoodSample && STATE.dg.lastGoodSample.ct, NaN),
        lastStableCt: toNum(STATE.dg.lastStableSample && STATE.dg.lastStableSample.ct, NaN),
        recoverAttempts: toInt(STATE.dg.recoverAttempts, 0),
        recoverRetry: toInt(STATE.dg.recoverRetry, 0),
        verifyAttempts: toInt(STATE.dg.verifyAttempts, 0),
        corrections: toInt(STATE.dg.corrections, 0),
        failsafeLeftMs: Math.max(0, toInt(STATE.dg.failsafeUntilTs, 0) - nowMs()),
        suspendLeftMs: Math.max(0, toInt(STATE.dg.suspendUntilTs, 0) - nowMs()),
        userPauseLeftMs: dgUserPauseLeftMs(STATE.tick || {}),
        pauseProbeLeftMs: Math.max(0, toInt(STATE.dg.pauseProbeUntilTs, 0) - nowMs()),
        lastPauseSignalAgeMs: ageMs(toInt(STATE.dg.lastPauseSignalTs, 0)),
        userSeekLeftMs: Math.max(0, Math.max(toInt(STATE.dg.userSeekUntilTs, 0), toInt(STATE.intent.userSeekUntilTs, 0)) - nowMs()),
        blockNextLeftMs: dgCurrentBlockLeftMs(),
        lastTrigger: String(STATE.dg.lastTrigger || ''),
        lastAction: String(STATE.dg.lastAction || ''),
        lastErr: String(STATE.dg.lastErr || ''),
        pauseByUser: toInt(STATE.dg.pauseByUser, 0),
        internalPause: toInt(STATE.dg.internalPause, 0),
        wakeupPlay: String(STATE.dg.wakeupResult || ''),
        wakeupReason: String(STATE.dg.wakeupReason || ''),
        falseEndDetected: toInt(STATE.dg.endGuard && STATE.dg.endGuard.falseEndDetected, 0),
        falseEndReason: String(STATE.dg.endGuard && STATE.dg.endGuard.falseEndReason ? STATE.dg.endGuard.falseEndReason : ''),
        ctJumpDelta: toNum(STATE.dg.endGuard && STATE.dg.endGuard.ctJumpDelta, 0),
        nearEnd: toInt(STATE.dg.endGuard && STATE.dg.endGuard.nearEnd, 0),
        fakeFullDetected: toInt(STATE.dg.bufferGuard && STATE.dg.bufferGuard.fakeFullDetected, 0),
        underrunDetected: toInt(STATE.dg.bufferGuard && STATE.dg.bufferGuard.underrunDetected, 0),
        bufferSig: String(STATE.dg.bufferGuard && STATE.dg.bufferGuard.bufferSig ? STATE.dg.bufferGuard.bufferSig : ''),
        bufferRanges: String(STATE.dg.bufferGuard && STATE.dg.bufferGuard.ranges ? STATE.dg.bufferGuard.ranges : ''),
        guardReason: String((STATE.dg.endGuard && STATE.dg.endGuard.falseEndReason) || (STATE.dg.bufferGuard && STATE.dg.bufferGuard.reason) || '')
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
        carrySec: toNum(STATE.resume && STATE.resume.carry ? STATE.resume.carry.sec : NaN, NaN),
        carryTs: toInt(STATE.resume && STATE.resume.carry ? STATE.resume.carry.ts : 0, 0),
        carryAge: ageMs(STATE.resume && STATE.resume.carry ? STATE.resume.carry.ts : 0),
        carrySrcSig: String(STATE.resume && STATE.resume.carry && STATE.resume.carry.srcSig ? STATE.resume.carry.srcSig : ''),
        carryWhy: String(STATE.resume && STATE.resume.carry && STATE.resume.carry.why ? STATE.resume.carry.why : ''),
        carryTicketId: String(STATE.resume && STATE.resume.carry && STATE.resume.carry.ticketId ? STATE.resume.carry.ticketId : ''),
        ticketId: String(ticket && ticket.id ? ticket.id : ''),
        ticketRecToken: toInt(ticket && ticket.recToken, 0),
        ticketSec: toNum(ticket && ticket.sec, NaN),
        ticketSource: String(ticket && ticket.source ? ticket.source : ''),
        ticketSrcSig: String(ticket && ticket.srcSig ? ticket.srcSig : ''),
        ticketAge: resumeTicketAgeMs(),
        ticketApplied: toInt(ticket && ticket.applied, 0),
        ticketVerifyOk: toInt(ticket && ticket.verifyOk, 0),
        ticketVerifyDelta: toNum(ticket && ticket.verifyDelta, NaN),
        frozen: !!STATE.truth.frozen,
        lastApplyStage: String(STATE.resume.lastApplyStage || ''),
        lastApplyTs: toInt(STATE.resume.lastApplyTs, 0),
        lastVerifyOk: toInt(STATE.resume.lastVerifyOk, 0),
        lastVerifyDelta: toNum(STATE.resume.lastVerifyDelta, NaN),
        lastSeekSec: toNum(STATE.resume.lastSeekSec, NaN),
        lastSeekTs: toInt(STATE.resume.lastSeekTs, 0),
        lastSeekOk: toInt(STATE.resume.lastSeekOk, 0),
        lastSeekErr: String(STATE.resume.lastSeekErr || ''),
        reopenRequestedSec: toNum(STATE.resume.reopenRequestedSec, NaN),
        reopenAppliedSec: toNum(STATE.resume.reopenAppliedSec, NaN),
        reopenDeltaSec: toNum(STATE.resume.reopenDeltaSec, NaN)
      },
      flags: {
        playingStuck: {
          on: toInt(STATE.flags.playingStuck.on, 0),
          ts: toInt(STATE.flags.playingStuck.ts, 0),
          count: toInt(STATE.flags.playingStuck.count, 0),
          details: String(STATE.flags.playingStuck.details || '')
        },
        fakeFull: {
          on: toInt(STATE.flags.fakeFull.on, 0),
          ts: toInt(STATE.flags.fakeFull.ts, 0),
          count: toInt(STATE.flags.fakeFull.count, 0),
          details: String(STATE.flags.fakeFull.details || '')
        },
        underrun: {
          on: toInt(STATE.flags.underrun.on, 0),
          ts: toInt(STATE.flags.underrun.ts, 0),
          count: toInt(STATE.flags.underrun.count, 0),
          details: String(STATE.flags.underrun.details || '')
        }
      },
      protect: {
        blockNextUntilTs: toInt(STATE.guard.blockNextUntilTs, 0),
        preventStartUntilTs: toInt(STATE.guard.preventStartUntilTs, 0),
        preventEndedUntilTs: toInt(STATE.guard.preventEndedUntilTs, 0),
        falseEndCriticalUntilTs: toInt(STATE.guard.falseEndCriticalUntilTs, 0),
        criticalActive: isCriticalWindowActive() ? 1 : 0,
        lastTailClampTs: toInt(STATE.guard.lastTailClampTs, 0),
        tailJumpClampCount: toInt(STATE.guard.tailJumpClampCount, 0),
        lastTailClampKind: String(STATE.guard.lastTailClampKind || ''),
        falseEndCount: toInt(STATE.guard.falseEndCount, 0)
      },
      truth: {
        sec: toNum(STATE.truth.lastGoodSec, 0),
        ts: toInt(STATE.truth.lastGoodTs, 0),
        srcSig: String(STATE.truth.srcSig || '')
      },
      pos: {
        stableSec: toNum(STATE.pos.lastStableSec, NaN),
        stableTs: toInt(STATE.pos.lastStableTs, 0),
        stableAge: ageMs(STATE.pos.lastStableTs),
        stableSrcSig: String(STATE.pos.lastStableSrcSig || ''),
        stableReason: String(STATE.pos.lastStableReason || '')
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
      frames: {
        supported: toInt(STATE.frames.supported, 0),
        lastFrames: toNum(STATE.frames.lastFrames, -1),
        lastFrameTs: toInt(STATE.frames.lastFrameTs, 0),
        frameStuckMs: toInt(STATE.frames.frameStuckMs, 0),
        ctDeltaSinceFrame: toNum(STATE.frames.ctDeltaSinceFrame, 0),
        graceLeftMs: frameGraceLeftMs(),
        graceWhy: String(STATE.frames.lastWhy || ''),
        detectCount: toInt(STATE.frames.detectCount, 0),
        lastDetectTs: toInt(STATE.frames.lastDetectTs, 0)
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

  API.defaults = function () {
    return overlayDefaultsCopy();
  };

  API.storageDefaults = function () {
    var src = overlayStorageDefaultsList();
    var out = [];
    var i = 0;
    for (i = 0; i < src.length; i++) {
      var it = src[i] || {};
      out.push({ key: String(it.key || ''), def: it.def });
    }
    return out;
  };

  API.applyDefaults = function () {
    var items = overlayStorageDefaultsList();
    var i = 0;
    for (i = 0; i < items.length; i++) {
      var it = items[i] || {};
      if (!it.key) continue;
      sSet(String(it.key), it.def);
    }
    readSettingsFromStorage();
    STATE.life.exitIntent = 0;
    if (CFG.enabled) {
      var v = STATE.video || getVideo();
      if (v) {
        markLifeOpen('apply_defaults');
        ensureTickTimer('apply_defaults');
      }
    }
    if (STATE.ui.open) uiRender('apply_defaults');
    logLine('OK', 'defaults_applied', { count: items.length });
    return API.state();
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
    var raw = String(cmd || '');
    cmd = normalizeCommand(raw);
    if (!cmd) return false;

    handleUserCommand(raw, payload || null);

    var v = STATE.video || getVideo();
    if (cmd === 'toggle') {
      var paused = false;
      try { paused = !!(v && v.paused); } catch (_) { paused = false; }
      cmd = paused ? 'play' : 'pause';
    }
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
      try {
        if (v && isFinite(sec) && sec >= 0) {
          armFrameGrace(CFG.frameGraceMs, 'api_seek');
          markGuardSeekIntent(toInt(CFG.userSeekWindowMs, 1800), 'api_seek');
          v.currentTime = sec;
        }
      } catch (_) { }
      return true;
    }

    if (cmd === 'nav') {
      markUserNavIntent(toInt(CFG.userNavWindowMs, 2500), 'api_nav');
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
    if (!CFG.enabled || isModeOff()) {
      shutdownOverlay('refresh_disabled', false);
    } else {
      STATE.life.exitIntent = 0;
      var v = STATE.video || getVideo();
      if (v) {
        markLifeOpen('refresh_enabled');
        ensureTickTimer('refresh_enabled');
      }
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
            if (n === K.enabled || n === K.mode || n === K.debugOnOpen || n === K.popupOpacity || n === K.protectNext || n === K.storeTruth || n === K.truthCommitMs || n === K.hangTimeMs || n === K.hangBufMs || n === K.resumeGuardMs || n === K.falseEndStaleAllow || n === K.fakeFullEnabled || n === K.fakeFullNoProgMs || n === K.fakeFullNoMoveMs || n === K.minAheadSec || n === K.underrunNoProgMs || n === K.underrunNoAheadMoveMs || n === K.softAttempts || n === K.inplayerAttempts || n === K.inplayerMode || n === K.escalateToReopen || n === K.reopenCooldownMs || n === K.resumeBackoffSec || n === K.resumeMinStepSec || n === K.seekVerifyDelayMs || n === K.seekDeltaSec || n === K.warmupAfterRecoverMs || n === K.userSeekWindowMs || n === K.userNavWindowMs || n === K.dgStallSoftMs || n === K.dgStallHardMs || n === K.dgWarmupGraceMs || n === K.dgResumeToleranceSec || n === K.dgResumeSeekRetryMax || n === K.dgRecoverRetryMax || n === K.dgFailsafeCooldownMs || n === K.dgDebugLevel || n === K.dgBlockNextMs || n === K.dgTailSec || n === K.dgFalseEndJumpSec || n === K.dgFakeFullEnabled || n === K.dgFalseEndEnabled || n === K.oldEnabled || n === K.oldDebugOnOpen || n === K.oldHangTimeMs || n === K.oldHangBufMs) API.refresh();
          } catch (_) { }
        });
      }
    } catch (_) { }

    ensureTickTimer('install');

    logLine('OK', 'installed', { tickMs: DET.tickMs });
    return true;
  };

  API.install();
})();
