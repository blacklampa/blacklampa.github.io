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
  var KEY_REOPEN = LS_PREFIX + 'player_guard_reopen_on_fault';
  var KEY_ALLOW_SOFT = LS_PREFIX + 'player_guard_allow_soft';
  var KEY_ALLOW_HARD = LS_PREFIX + 'player_guard_allow_hard';
  var KEY_AUTO_REOPEN_FROM_POSITION = LS_PREFIX + 'player_guard_auto_reopen_from_position';
  var KEY_POPUP_AUTOCLOSE_SEC = LS_PREFIX + 'player_guard_popup_autoclose_sec';

  var DET = {
    epsilonEndSec: 2.0,
    jumpThresholdSec: 20,
    faultWindowMs: 10000,
    keepFaultMs: 60000,
    minWatchTimeSec: 5,
    seekGuardMs: 2500,
    reset0EpsSec: 0.5,
    reset0MinTruthSec: 30,
    reset0HardTruthSec: 60,
    loopWindowMs: 30000,
    loopBucketSec: 5,
    loopMinTruthSec: 10,
    loopMinCount: 3,
    saveThrottleMs: 1000,
    saveMaxAgeMs: 72 * 3600 * 1000,
    guardLockMs: 25000,
    stableOkSec: 6.0,
    repeatFaultHardMs: 20000,
    attemptEvalMs: 1200,
    manualNextAllowMs: 1500,
    budgetResetOkMs: 25000,
    reopenBackoffSec: 0.5,
    autoReopenCooldownMs: 25000,
    autoBufferDelayMs: 1800,
    popupIdleMs: 3000
  };

  var CFG = {
    enabled: false,
    reopenOnFault: true,
    allowSoft: true,
    allowHard: false,
    softAttempts: 2,
    hardAttempts: 1,
    attemptDelaySec: 2,
    popupMinSec: 2,
    blockNext: true,
    debugPopup: true,
    storePos: true,
    autoReopenFromPosition: true,
    popupAutoCloseSec: 10
  };

  var MODE_NORMAL = 'NORMAL';
  var MODE_SOFT = 'RECOVERING_SOFT';
  var MODE_HARD = 'RECOVERING_HARD';
  var MODE_FAIL = 'FAILED';

  var STATE = {
    installed: false,
    patched: { video: false, playlist: false, panel: false, player: false, controller: false },
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

    loop: {
      events: [],
      reopenRequiredTs: 0,
      reopenBucket: null,
      reopenCount: 0
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
      allowNextTs: 0,
      suppressUntilTs: 0,
      suppressWhy: '',
      lastAction: '',
      lastActionTs: 0
    },

    rec: {
      mode: MODE_NORMAL,
      seq: 0,
      reason: '',
      resumeTimeSec: 0,
      resumePinnedSec: NaN,
      hardIntent: '',
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
      autoTimer: null,
      reopenCooldownUntilTs: 0,
      activeReopenTransition: false,
      reopenTransitionStartTs: 0,
      reopenTransitionResumeSec: NaN,
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
      autoCloseTimer: null,
      autoCloseIdleTimer: null,
      autoCloseLastActTs: 0,
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
        + '#__bl_player_guard_popup_v2 .bl-pg-spinner{width:18px;height:18px;flex:0 0 18px;margin-top:3px;margin-right:3px;border-radius:50%;'
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
    var prev = String(STATE.ui.mode || 'hidden');
    STATE.ui.mode = String(mode || 'hidden');
    safe(function () {
      root.classList.remove('bl-pg-hidden');
      root.classList.remove('bl-pg-fail');
      if (STATE.ui.mode === 'hidden') root.classList.add('bl-pg-hidden');
      else if (STATE.ui.mode === 'fail') root.classList.add('bl-pg-fail');
    });

    try {
      if (prev !== STATE.ui.mode) {
        var s = 'RECOVERING';
        if (STATE.ui.mode === 'hidden') s = 'HIDDEN';
        else if (STATE.ui.mode === 'fail') s = 'FAILED';
        logEvt('DBG', 'popup_update', { state: s }, 'popup:update:' + s, 900);
      }
    } catch (_) { }

    try {
      if (STATE.ui.mode === 'hidden') uiAutoCloseClear('hidden');
      else if (prev === 'hidden') uiAutoCloseArm('show');
      else if (!STATE.ui.autoCloseTimer && !STATE.ui.autoCloseIdleTimer) uiAutoCloseArm('mode');
    } catch (_) { }

    try {
      if (prev === 'fail' && STATE.ui.mode !== 'fail') uiAutoCloseClear('leave_fail');
    } catch (_) { }
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

  function uiAutoCloseClear(why) {
    try {
      if (STATE.ui.autoCloseTimer) clearTimeout(STATE.ui.autoCloseTimer);
    } catch (_) { }
    try {
      if (STATE.ui.autoCloseIdleTimer) clearTimeout(STATE.ui.autoCloseIdleTimer);
    } catch (_) { }
    STATE.ui.autoCloseTimer = null;
    STATE.ui.autoCloseIdleTimer = null;
  }

  function uiAutoCloseArm(why) {
    try {
      if (!CFG.enabled) return;
      var sec = clampInt(CFG.popupAutoCloseSec, 0, 60);
      if (!sec) return;
      if (!STATE.ui || !STATE.ui.mode || STATE.ui.mode === 'hidden') return;
      if (STATE.ui.mode !== 'fail') return;
      if (STATE.ui.autoCloseTimer) return;

      STATE.ui.autoCloseTimer = setTimeout(function () {
        try {
          STATE.ui.autoCloseTimer = null;
          logLine('INF', 'popup_autoclose fired', null, 'popup:ac:fired', 1500);

          // In FAILED state we must fully stop guard/recovery, otherwise user loses controls while guardLock stays.
          if (STATE.rec && STATE.rec.mode === MODE_FAIL) {
            try { manualSuppress(15000, 'popup_autoclose'); } catch (_) { }
            try { recoveryStop('popup_autoclose'); } catch (_) { }
            try { unlockGuard('popup_autoclose'); } catch (_) { }
            return;
          }

          uiHide('autoclose');
        } catch (_) { }
      }, Math.max(0, sec * 1000));

      logLine('DBG', 'popup_autoclose armed in=' + String(sec) + 's', null, 'popup:ac:arm', 1200);
    } catch (_) { }
  }

  function uiAutoClosePause(reason) {
    try {
      if (!CFG.enabled) return;
      if (!clampInt(CFG.popupAutoCloseSec, 0, 60)) return;
      if (!STATE.ui || !STATE.ui.mode || STATE.ui.mode === 'hidden') return;

      try {
        if (STATE.ui.autoCloseTimer) clearTimeout(STATE.ui.autoCloseTimer);
      } catch (_) { }
      STATE.ui.autoCloseTimer = null;

      logLine('DBG', 'popup_autoclose paused by user activity', String(reason || ''), 'popup:ac:pause', 1200);

      try {
        if (STATE.ui.autoCloseIdleTimer) clearTimeout(STATE.ui.autoCloseIdleTimer);
      } catch (_) { }
      STATE.ui.autoCloseIdleTimer = null;

      var idleMs = toInt(DET.popupIdleMs, 3000);
      if (!isFinite(idleMs) || idleMs < 500) idleMs = 3000;

      STATE.ui.autoCloseIdleTimer = setTimeout(function () {
        try {
          STATE.ui.autoCloseIdleTimer = null;
          if (!STATE.ui || !STATE.ui.mode || STATE.ui.mode === 'hidden') return;
          uiAutoCloseArm('idle');
        } catch (_) { }
      }, idleMs);
    } catch (_) { }
  }

  function uiAutoCloseUserActivity(reason) {
    try {
      STATE.ui.autoCloseLastActTs = now();
      uiAutoClosePause('user:' + String(reason || 'activity'));
    } catch (_) { }
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
      try { uiActionRetry(); } catch (_) { }
    } else if (act === 'exit') {
      try { uiActionExitPlayer(); } catch (_) { }
    } else if (act === 'restart') {
      try { uiActionRestart(); } catch (_) { }
    } else if (act === 'close') {
      uiClose('btn_close');
    }
  }

  function uiInstallFailKeyHandler() {
    if (STATE.ui.keyHandler) return;
    STATE.ui.keyHandler = function (e) {
      try {
        if (STATE.ui.mode === 'hidden') return;
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
        var isBack = (k === 'Backspace' || k === 'Escape' || kc === 8 || kc === 27 || kc === 461 || kc === 10009 || kc === 4);

        if (isBack) {
          try { e.preventDefault(); } catch (_) { }
          try { e.stopPropagation(); } catch (_) { }
          var r = (k === 'Escape' || kc === 27) ? 'esc' : 'back';
          uiClose(r);
          return;
        }

        if (STATE.ui.mode !== 'fail') return;
        if (!(isLeft || isRight || isUp || isDown || isEnter)) return;

        try { e.preventDefault(); } catch (_) { }
        try { e.stopPropagation(); } catch (_) { }

        if (isLeft || isUp) { try { uiAutoCloseUserActivity('nav'); } catch (_) { } uiSelectBtn(STATE.ui.selected - 1); }
        else if (isRight || isDown) { try { uiAutoCloseUserActivity('nav'); } catch (_) { } uiSelectBtn(STATE.ui.selected + 1); }
        else if (isEnter) { try { uiAutoCloseUserActivity('activate'); } catch (_) { } uiActivateSelected(); }
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
      { act: 'exit', text: 'Выйти из плеера' },
      { act: 'close', text: 'Закрыть' }
    ];

    safe(function () {
      for (var i = 0; i < actions.length; i++) {
        (function (a, idx) {
          var b = document.createElement('div');
          b.className = 'bl-pg-btn';
          b.setAttribute('data-act', String(a.act));
          b.textContent = String(a.text);
          b.onclick = function () { try { uiAutoCloseUserActivity('click'); } catch (_) { } try { STATE.ui.selected = idx; uiSelectBtn(idx); uiActivateSelected(); } catch (_) { } };
          STATE.ui.actionsEl.appendChild(b);
          STATE.ui.btns.push(b);
        })(actions[i], i);
      }
    });

    uiInstallFailKeyHandler();
    uiSelectBtn(0);
  }

  function uiHide(reason) {
    uiRemoveFailKeyHandler();
    uiAutoCloseClear('hide');
    uiClearActions();
    uiUpdate('', '', '', '');
    uiSetMode('hidden');
    logEvt('DBG', 'popup_close', { reason: String(reason || '') }, 'popup:close:' + String(reason || ''), 1200);
  }

  function stopGuardAndRecovery(why, suppressMs) {
    try { manualSuppress(toInt(suppressMs, 0), String(why || '')); } catch (_) { }
    try { recoveryStop(String(why || 'stop')); } catch (_) { }
    try { if (STATE.ui && STATE.ui.mode && STATE.ui.mode !== 'hidden') uiHide(String(why || 'stop')); } catch (_) { }
    try { unlockGuard(String(why || 'stop')); } catch (_) { }
    logEvt('INF', 'manual_exit', { why: String(why || '') }, 'manual:exit:' + String(why || ''), 1200);
  }

  function uiClose(reason) {
    logEvt('INF', 'ui_close', { reason: String(reason || '') }, 'ui:close:' + String(reason || ''), 1200);
    stopGuardAndRecovery('ui_close', 15000);
  }

  function uiActionExitPlayer() {
    exitPlayer('btn_exit');
  }

  function uiActionRestart() {
    reopenFromPosition('btn_restart', null, { manual: true });
  }

  function uiActionRetry() {
    if (CFG.reopenOnFault) reopenFromPosition('btn_retry', null, { manual: true });
    else manualSoftOnce('btn_retry');
  }

  function manualSoftOnce(why) {
    if (!CFG.enabled) return;
    if (!CFG.allowSoft) return recoveryFail('soft_disabled');
    if (isManualSuppressed()) clearManualSuppress();

    clearTimers();
    STATE.rec.mode = MODE_SOFT;
    STATE.rec.reason = String(why || 'manual_soft');
    STATE.rec.hardIntent = '';
    STATE.rec.stableSec = 0;
    STATE.rec.stableLastCur = NaN;
    STATE.rec.stableLastTs = 0;

    var video = null;
    try { video = STATE.video || (window.Lampa && Lampa.PlayerVideo && Lampa.PlayerVideo.video ? Lampa.PlayerVideo.video() : null); } catch (_) { video = STATE.video; }
    updateStreamContext(video, null);

    var resume = pickResumeTime(video);
    STATE.rec.resumeTimeSec = resume;
    STATE.rec.pendingSeekSec = resume;

    lockGuard('manual_soft', { capture: true });

    var stage = 'SOFT manual: seek_play';
    var info = 'truth=' + fmtTime(getTruthTime()) + ' | resume=' + fmtTime(resume) + ' | video=' + fmtTime(video ? video.currentTime : 0) + ' | dur=' + fmtTime(video ? video.duration : 0);
    var details = CFG.debugPopup ? ('why=' + String(why || '') + '\n' + mediaState(video)) : '';
    uiShowRecover(stage, info, details);

    try { actionSeekPlay(video, resume); } catch (_) { }

    STATE.rec.evalTimer = setTimeout(function () {
      try {
        if (!CFG.enabled) return;
        if (STATE.rec.mode !== MODE_SOFT) return;
        // if not recovered yet => show FAILED, do not loop
        recoveryFail('manual_soft_failed');
      } catch (_) { }
    }, Math.max(2500, clampInt(CFG.attemptDelaySec, 1, 5) * 1000));
  }

  function reopenFromPosition(why, resumeOverride, meta) {
    meta = meta || {};
    var isAuto = !!meta.auto;

    if (!CFG.enabled) return false;
    if (isAuto) {
      var ts0 = now();
      if (inReopenCooldown(ts0)) return false;
      bumpReopenCooldown(ts0, 'auto:' + String(why || ''));
    } else if (isManualSuppressed()) {
      clearManualSuppress();
    }

    clearTimers();
    STATE.rec.mode = MODE_HARD;
    STATE.rec.reason = String(why || (isAuto ? 'auto_reopen_from_position' : 'manual_reopen_from_position'));
    STATE.rec.hardIntent = 'reopen';
    STATE.rec.stableSec = 0;
    STATE.rec.stableLastCur = NaN;
    STATE.rec.stableLastTs = 0;

    var video = null;
    try { video = STATE.video || (window.Lampa && Lampa.PlayerVideo && Lampa.PlayerVideo.video ? Lampa.PlayerVideo.video() : null); } catch (_) { video = STATE.video; }
    updateStreamContext(video, null);

    var truthT = 0;
    try {
      // Auto path must not unexpectedly "resume at start" from LS: prefer current-session truth.
      if (isAuto) {
        if (STATE.truth && STATE.truth.fromSession) truthT = toNum(STATE.truth.t, 0);
        else truthT = toNum(STATE.session.maxTimeSec, 0);
      } else {
        truthT = getTruthTime();
      }
    } catch (_) {
      truthT = getTruthTime();
    }
    var liveT = NaN;
    var dur = NaN;
    try { liveT = video ? toNum(video.currentTime, NaN) : NaN; } catch (_) { liveT = NaN; }
    try { dur = video ? toNum(video.duration, NaN) : NaN; } catch (_) { dur = NaN; }

    var resume = NaN;
    try { resume = (typeof resumeOverride === 'number' && isFinite(resumeOverride)) ? toNum(resumeOverride, NaN) : NaN; } catch (_) { resume = NaN; }
    if (!isFinite(resume) || resume < 0) {
      var backoff = toNum(DET.reopenBackoffSec, 0.5);
      if (!isFinite(backoff) || backoff < 0) backoff = 1.5;
      var liveCand = isFinite(liveT) ? Math.max(0, liveT - backoff) : NaN;

      var useLive = isFinite(liveCand);
      if (useLive && isFinite(dur) && dur > 0) {
        if (isFinite(liveT) && liveT >= dur - DET.epsilonEndSec) useLive = false;
        if (liveCand >= dur - DET.epsilonEndSec) useLive = false;
      }

      resume = useLive ? Math.max(truthT, liveCand) : Math.max(0, truthT);
    }

    if (isFinite(dur) && dur > 0) resume = Math.min(resume, Math.max(0, dur - DET.epsilonEndSec));
    resume = Math.max(0, toNum(resume, 0));

    STATE.rec.resumeTimeSec = resume;
    STATE.rec.resumePinnedSec = resume;
    STATE.rec.pendingSeekSec = resume;

    // Transition window: avoid truth/LS corruption by t=0/dur=0 while reopening.
    STATE.rec.activeReopenTransition = true;
    STATE.rec.reopenTransitionStartTs = now();
    STATE.rec.reopenTransitionResumeSec = resume;

    lockGuard(isAuto ? 'auto_reopen_from_position' : 'manual_reopen_from_position', { capture: true });

    try {
      if (CFG.storePos) writeTruthLS(resume, isFinite(dur) && dur > 0 ? dur : 0, String(STATE.srcSig || ''), isAuto ? 'auto_reopen_from_position' : 'manual_reopen_from_position');
    } catch (_) { }

    logEvt('INF', 'reopenFromPosition', {
      reason: String(why || ''),
      resume: resume.toFixed(2),
      truth: toNum(truthT, 0).toFixed(2),
      live: isFinite(liveT) ? liveT.toFixed(2) : '',
      dur: isFinite(dur) ? dur.toFixed(2) : '',
      srcSig: String(STATE.srcSig || ''),
      auto: isAuto ? 1 : 0
    }, 'reopenFromPos:start', 1200);

    var stage = 'REOPEN ' + (isAuto ? 'auto' : 'manual');
    var info = 'truth=' + fmtTime(truthT) + ' | live=' + fmtTime(isFinite(liveT) ? liveT : 0) + ' | resume=' + fmtTime(resume) + (isFinite(dur) && dur > 0 ? (' | dur=' + fmtTime(dur)) : '');
    var details = CFG.debugPopup ? ('why=' + String(why || '') + '\n' + mediaState(video)) : '';
    uiShowRecover(stage, info, details);

    var ok = false;
    try { ok = actionHardReopenPlayer(resume); } catch (_) { ok = false; }
    if (!ok) return recoveryFail('reopen_failed');

    STATE.rec.evalTimer = setTimeout(function () {
      try {
        if (!CFG.enabled) return;
        if (STATE.rec.mode !== MODE_HARD) return;
        recoveryFail(isAuto ? 'auto_reopen_failed' : 'manual_reopen_failed');
      } catch (_) { }
    }, Math.max(4500, clampInt(CFG.attemptDelaySec, 1, 5) * 1000 + 1500));

    return true;
  }

  function manualReopenOnce(why) {
    return reopenFromPosition(String(why || ''), null, { manual: true });
  }

  function uiShowRecover(stage, info, details) {
    uiInstallFailKeyHandler();
    try { if (STATE.ui && STATE.ui.mode === 'fail') uiClearActions(); } catch (_) { }
    uiSetMode('recover');
    uiUpdate('Поток оборвался / восстановление…', stage, info, details);
    STATE.rec.stepShownTs = now();
  }

  function uiShowOk(text) {
    uiInstallFailKeyHandler();
    try { if (STATE.ui && STATE.ui.mode === 'fail') uiClearActions(); } catch (_) { }
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
    safe(function () { if (STATE.rec.autoTimer) clearTimeout(STATE.rec.autoTimer); });
    STATE.rec.nextTimer = null;
    STATE.rec.evalTimer = null;
    STATE.rec.okTimer = null;
    STATE.rec.autoTimer = null;
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
    if (isManualSuppressed()) return false;
    var t = now();
    if (STATE.guard.lock && (t < STATE.guard.untilTs)) return true;
    if (STATE.guard.lock && (isRecovering() || STATE.rec.mode === MODE_FAIL)) return true;
    if (STATE.guard.lock && (t - STATE.fault.lastLongTs) < DET.keepFaultMs) return true;
    return false;
  }

  function lockGuard(reason, meta) {
    meta = meta || {};
    if (!CFG.enabled) return;
    if (isManualSuppressed()) return;
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

  function manualSuppress(ms, why) {
    ms = toInt(ms, 0);
    if (ms < 0) ms = 0;
    STATE.manual.suppressUntilTs = Math.max(toInt(STATE.manual.suppressUntilTs, 0), now() + ms);
    STATE.manual.suppressWhy = String(why || '');
    STATE.manual.lastAction = String(why || '');
    STATE.manual.lastActionTs = now();
  }

  function isManualSuppressed() {
    var t = now();
    return STATE.manual.suppressUntilTs && t < STATE.manual.suppressUntilTs;
  }

  function clearManualSuppress() {
    STATE.manual.suppressUntilTs = 0;
    STATE.manual.suppressWhy = '';
  }

  function isSeekRecent(ts) {
    ts = toInt(ts, 0);
    if (!STATE.seek.lastSeekTs) return false;
    return (ts - STATE.seek.lastSeekTs) >= 0 && (ts - STATE.seek.lastSeekTs) <= DET.seekGuardMs;
  }

  function markSeek() {
    var ts = now();
    try {
      // During reopen transition: do not touch truth (avoid t=0 overwrite), but keep seek-guard.
      if (STATE.rec && STATE.rec.activeReopenTransition) {
        STATE.seek.lastSeekTs = ts;
        return;
      }
    } catch (_) { }
    try {
      var v = null;
      try { v = STATE.video || (window.Lampa && Lampa.PlayerVideo && typeof Lampa.PlayerVideo.video === 'function' ? Lampa.PlayerVideo.video() : null); } catch (_) { v = STATE.video; }
      if (v && typeof v.currentTime !== 'undefined') {
        var ct = toNum(v.currentTime, NaN);
        try {
          // Do not treat session reset-to-0 as a user seek (preserve truth).
          var truthT = getTruthTime();
          if (isFinite(ct) && ct <= DET.reset0EpsSec && truthT >= DET.reset0HardTruthSec) {
            if (STATE.session.buffering || isGuardLocked() || isFaultWindowOpen(ts) || isRecovering()) return;
          }
        } catch (_) { }

        if (isFinite(ct) && ct >= 0) {
          STATE.seek.lastSeekTs = ts;
          STATE.truth.t = ct;
          STATE.truth.ts = ts;
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

  function forceTruthSnapshot(video, why) {
    try {
      if (!CFG.enabled) return;
      if (!video) return;
      if (STATE.rec && STATE.rec.activeReopenTransition) return;
      if (isRecovering()) return;

      var ts = now();
      var rs = 0;
      try { rs = video && typeof video.readyState === 'number' ? video.readyState : 0; } catch (_) { rs = 0; }
      if (rs < 2) return;

      var dur = toNum(video.duration, NaN);
      var cur = toNum(video.currentTime, NaN);
      if (!isFinite(dur) || dur <= 0) return;
      if (!isFinite(cur) || cur < 0) return;
      if (cur >= dur - DET.epsilonEndSec) return;

      // Do not snap backwards (avoid jitter on seeks).
      var prev = toNum(STATE.truth.t, 0);
      if (cur + 0.01 < prev) return;

      STATE.truth.t = cur;
      STATE.truth.ts = ts;
      STATE.truth.dur = dur;
      STATE.truth.srcSig = String(STATE.srcSig || '');
      STATE.truth.fromSession = true;

      logEvt('DBG', 'truth_snapshot', { why: String(why || ''), t: cur.toFixed(2) }, 'truth:snap:' + String(why || ''), 1200);
    } catch (_) { }
  }

  function markBuffering(on, type, details) {
    if (isManualSuppressed()) return;
    STATE.session.buffering = !!on;
    if (on) {
      STATE.fault.lastTs = now();
      STATE.fault.lastType = String(type || 'buffering');
      STATE.fault.lastDetails = String(details || '');
      STATE.fault.lastLongTs = STATE.fault.lastTs;
      STATE.fault.seq++;
      if (CFG.debugPopup) logEvt('DBG', 'fault_detected', { type: STATE.fault.lastType }, 'fault:' + STATE.fault.lastType, 1200);
      try { scheduleAutoReopenFromBuffering(String(type || 'buffering')); } catch (_) { }
    }
  }

  function inReopenCooldown(ts) {
    ts = toInt(ts, now());
    var until = toInt(STATE.rec.reopenCooldownUntilTs, 0);
    return until && ts < until;
  }

  function bumpReopenCooldown(ts, why) {
    ts = toInt(ts, now());
    var ms = toInt(DET.autoReopenCooldownMs, 25000);
    if (!isFinite(ms) || ms < 5000) ms = 25000;
    var until = ts + ms;
    STATE.rec.reopenCooldownUntilTs = Math.max(toInt(STATE.rec.reopenCooldownUntilTs, 0), until);
    logEvt('DBG', 'reopen_cooldown', { why: String(why || ''), ms: String(ms) }, 'reopen:cooldown', 2000);
  }

  function canAutoReopenNow(ts) {
    if (!CFG.enabled) return false;
    if (!CFG.autoReopenFromPosition) return false;
    if (isManualSuppressed()) return false;
    if (isRecovering() || STATE.rec.mode === MODE_FAIL) return false;
    if (inReopenCooldown(ts)) return false;
    try {
      var sessionT = toNum(STATE.session.maxTimeSec, 0);
      if (!sessionT || sessionT < DET.minWatchTimeSec) return false;
    } catch (_) { return false; }
    return true;
  }

  function scheduleAutoReopenFromBuffering(type) {
    try {
      if (!CFG.enabled || !CFG.autoReopenFromPosition) return;
      if (isManualSuppressed()) return;
      if (isRecovering() || STATE.rec.mode === MODE_FAIL) return;
      if (STATE.rec.autoTimer) return;
      var ts = now();
      if (inReopenCooldown(ts)) return;
      var sessionT = toNum(STATE.session.maxTimeSec, 0);
      if (!sessionT || sessionT < DET.minWatchTimeSec) return;

      var delay = toInt(DET.autoBufferDelayMs, 1800);
      if (!isFinite(delay) || delay < 250) delay = 1800;

      STATE.rec.autoTimer = setTimeout(function () {
        STATE.rec.autoTimer = null;
        try {
          var ts2 = now();
          if (!canAutoReopenNow(ts2)) return;
          if (!STATE.session.buffering) return;
          reopenFromPosition('auto_buffering:' + String(type || ''), null, { auto: true, faultType: String(type || ''), reason: 'buffering' });
        } catch (_) { }
      }, delay);
    } catch (_) { }
  }

  function maybeAutoReopenFromFault(type, meta) {
    try {
      var ts = now();
      if (!canAutoReopenNow(ts)) return false;
      reopenFromPosition('auto_fault:' + String(type || ''), null, { auto: true, faultType: String(type || ''), meta: meta || {} });
      return true;
    } catch (_) {
      return false;
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
    if (STATE.rec && STATE.rec.activeReopenTransition) return;

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
    if (!STATE.truth.lastSaveTs || (ts - STATE.truth.lastSaveTs) >= DET.saveThrottleMs) {
      STATE.truth.lastSaveTs = ts;
      writeTruthLS(cur, dur, STATE.truth.srcSig, 'tick');
    }

    maybeResetBudgetsOnStable(ts);
  }

  function softLeft() {
    var m = clampInt(STATE.rec.softMax, 0, 20);
    var u = clampInt(STATE.rec.softAttempt, 0, 1000);
    return Math.max(0, m - u);
  }

  function hardLeft() {
    var m = clampInt(STATE.rec.hardMax, 0, 20);
    var u = clampInt(STATE.rec.hardAttempt, 0, 1000);
    return Math.max(0, m - u);
  }

  function maybeResetBudgetsOnStable(ts) {
    try {
      ts = toInt(ts, now());
      if (!STATE.rec.lastOkTs) return;
      if ((ts - STATE.rec.lastOkTs) < DET.budgetResetOkMs) return;
      if (STATE.fault.lastLongTs && STATE.fault.lastLongTs > STATE.rec.lastOkTs) return;
      if (!STATE.truth.fromSession) return;

      STATE.rec.softAttempt = 0;
      STATE.rec.hardAttempt = 0;
      try { if (STATE.loop && STATE.loop.events) STATE.loop.events = []; } catch (_) { }
      try { if (STATE.loop) { STATE.loop.reopenRequiredTs = 0; STATE.loop.reopenBucket = null; STATE.loop.reopenCount = 0; } } catch (_) { }
      STATE.rec.lastOkTs = 0;

      logEvt('DBG', 'attempts_budget', { softLeft: softLeft(), hardLeft: hardLeft(), why: 'stable_reset' }, 'budget:reset', 3000);
    } catch (_) { }
  }

  function isLoopReopenRequired(ts) {
    try {
      ts = toInt(ts, now());
      if (!STATE.loop || !STATE.loop.reopenRequiredTs) return false;
      var dt = ts - toInt(STATE.loop.reopenRequiredTs, 0);
      if (dt < 0 || dt > DET.loopWindowMs) return false;
      if (STATE.loop.reopenBucket === null || STATE.loop.reopenBucket === undefined) return true;
      return truthBucket(getTruthTime()) === STATE.loop.reopenBucket;
    } catch (_) {
      return false;
    }
  }

  function computeHardIntent(meta) {
    meta = meta || {};
    try { if (meta && meta.hardIntent) return String(meta.hardIntent); } catch (_) { }
    try { if (meta && meta.needReopen) return 'reopen'; } catch (_) { }
    if (CFG.reopenOnFault) return 'reopen';
    if (CFG.allowHard) return 'hard_reset';
    return '';
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

    try {
      if (STATE.rec.activeReopenTransition) {
        var tr = toNum(STATE.rec.reopenTransitionResumeSec, resume);
        if (STATE.rec.stableSec >= 2.0 && cur >= tr + 1.5) {
          STATE.rec.activeReopenTransition = false;
          STATE.rec.reopenTransitionStartTs = 0;
          STATE.rec.reopenTransitionResumeSec = NaN;
          logEvt('DBG', 'reopen_transition_done', { stable: STATE.rec.stableSec.toFixed(2), cur: cur.toFixed(2) }, 'reopen:transition:done', 2500);
        }
      }
    } catch (_) { }

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
        safePlay(video, 'force_seek:' + String(why || ''));
        if (String(STATE.rec.hardIntent || '') === 'reopen') {
          logEvt('INF', 'reopen_ready', { why: String(why || ''), seek: t.toFixed(2) }, 'reopen:ready', 1200);
        }
        logEvt('INF', 'force_seek', { why: String(why || ''), to: t.toFixed(2) }, 'rec:seek:' + String(why || ''), 900);
      }
    } catch (_) { }
  }

  function truthBucket(tSec) {
    tSec = toNum(tSec, 0);
    var b = DET.loopBucketSec;
    if (!b || b <= 0) b = 5;
    return Math.round(tSec / b) * b;
  }

  function loopGuardRecordFault(ts, type) {
    try {
      if (!STATE.loop) STATE.loop = { events: [] };
      if (!STATE.loop.events) STATE.loop.events = [];

      ts = toInt(ts, now());
      var truthT = getTruthTime();
      if (!truthT || truthT < DET.loopMinTruthSec) return null;

      var b = truthBucket(truthT);
      var arr = STATE.loop.events;
      var out = [];
      for (var i = 0; i < arr.length; i++) {
        var e = arr[i];
        if (!e || typeof e.ts !== 'number') continue;
        var dt = ts - e.ts;
        if (dt >= 0 && dt <= DET.loopWindowMs) out.push(e);
      }
      out.push({ ts: ts, bucket: b, type: String(type || '') });
      STATE.loop.events = out;

      var cnt = 0;
      for (var j = 0; j < out.length; j++) {
        try { if (out[j].bucket === b) cnt++; } catch (_) { }
      }
      if (cnt >= DET.loopMinCount) {
        STATE.loop.reopenRequiredTs = ts;
        STATE.loop.reopenBucket = b;
        STATE.loop.reopenCount = cnt;
        logEvt('WRN', 'fault_loop_detected', { count: cnt, bucket: b, type: String(type || ''), action: 'reopen_required' }, 'loop:' + String(b), 2000);
        return { bucket: b, count: cnt };
      }

      return { bucket: b, count: cnt };
    } catch (_) {
      return null;
    }
  }

  function faultDetected(type, meta) {
    meta = meta || {};
    if (isManualSuppressed()) return;
    var ts = now();
    STATE.fault.lastTs = ts;
    STATE.fault.lastType = String(type || '');
    STATE.fault.lastDetails = kv(meta) || '';
    STATE.fault.lastLongTs = ts;
    STATE.fault.seq++;

    loopGuardRecordFault(ts, type);

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
    uiHide(String(why || 'recovery_stop'));
    STATE.rec.mode = MODE_NORMAL;
    STATE.rec.reason = '';
    STATE.rec.resumeTimeSec = 0;
    STATE.rec.resumePinnedSec = NaN;
    STATE.rec.hardIntent = '';
    STATE.rec.pendingSeekSec = NaN;
    STATE.rec.pendingParams = null;
    STATE.rec.activeReopenTransition = false;
    STATE.rec.reopenTransitionStartTs = 0;
    STATE.rec.reopenTransitionResumeSec = NaN;
    STATE.rec.stableSec = 0;
    STATE.rec.stableLastCur = NaN;
    STATE.rec.stableLastTs = 0;
    if (why) logEvt('INF', 'recovery_stop', { why: String(why || '') }, 'rec:stop', 1500);
  }

  function recoveryFail(why) {
    clearTimers();
    STATE.rec.mode = MODE_FAIL;
    STATE.rec.resumePinnedSec = NaN;
    STATE.rec.activeReopenTransition = false;
    STATE.rec.reopenTransitionStartTs = 0;
    STATE.rec.reopenTransitionResumeSec = NaN;
    var video = null;
    try { video = STATE.video || (window.Lampa && Lampa.PlayerVideo && Lampa.PlayerVideo.video ? Lampa.PlayerVideo.video() : null); } catch (_) { video = STATE.video; }

    var stage = 'FAILED';
    try {
      if (String(why || '') === 'reopen_required' || String(why || '') === 'reopen_disabled') stage = 'Требуется перезапуск плеера';
      if (String(why || '') === 'no_supported_source') stage = 'Нет поддерживаемого источника (нужен перезапуск)';
      if (String(why || '') === 'play_interrupted') stage = 'play() interrupted (нужен перезапуск)';
      if (String(why || '') === 'hard_disabled') stage = 'HARD reset отключён';
      if (isLoopReopenRequired(now())) stage = 'Обрыв повторяется циклом. Требуется перезапуск плеера.';
    } catch (_) { }

    var info = 'truth=' + fmtTime(getTruthTime()) + ' | resume=' + fmtTime(STATE.rec.resumeTimeSec) + ' | softLeft=' + String(softLeft()) + ' | hardLeft=' + String(hardLeft());
    var details = CFG.debugPopup ? (String(why || '') + '\n' + mediaState(video)) : '';
    uiShowFail(stage, info, details);
    lockGuard('failed', { capture: false });
    logEvt('ERR', 'fail', { why: String(why || ''), stage: String(stage || ''), truth: fmtTime(getTruthTime()), resume: fmtTime(STATE.rec.resumeTimeSec) }, 'rec:fail', 2000);
  }

  function recoverySuccess(why, meta) {
    if (!isRecovering()) return;
    clearTimers();
    var prevMode = STATE.rec.mode;
    var prevIntent = '';
    try { prevIntent = String(STATE.rec.hardIntent || ''); } catch (_) { prevIntent = ''; }
    STATE.rec.lastRecoveryMode = prevMode;
    STATE.rec.lastOkTs = now();
    STATE.rec.mode = MODE_NORMAL;
    STATE.rec.reason = '';
    STATE.rec.pendingSeekSec = NaN;
    STATE.rec.pendingParams = null;
    STATE.rec.resumePinnedSec = NaN;
    STATE.rec.activeReopenTransition = false;
    STATE.rec.reopenTransitionStartTs = 0;
    STATE.rec.reopenTransitionResumeSec = NaN;
    STATE.session.health = 'OK';

    logEvt('OK', 'success', {
      why: String(why || ''),
      mode: String(prevMode || ''),
      intent: prevMode === MODE_HARD ? prevIntent : '',
      stable: STATE.rec.stableSec.toFixed(2),
      truth: fmtTime(getTruthTime()),
      srcSig: String(STATE.srcSig || '')
    }, 'rec:ok', 1200);

    if (prevMode === MODE_HARD && prevIntent !== 'hard_reset') {
      logEvt('OK', 'recovered_by_reopen', { stable: STATE.rec.stableSec.toFixed(2), truth: fmtTime(getTruthTime()) }, 'reopen:ok', 1500);
    }

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
    if (isManualSuppressed()) return;
    if (STATE.rec.mode === MODE_FAIL && !meta.manual) return;

    var ts = now();
    var hardRequested = (String(mode || '') === MODE_HARD) || !!meta.forceHard;
    var needReopen = !!meta.needReopen || isLoopReopenRequired(ts);

    var desiredMode = MODE_SOFT;
    var hardIntent = '';

    // Need reopen => no SOFT loops
    if (needReopen) {
      if (CFG.reopenOnFault && hardLeft() > 0) {
        desiredMode = MODE_HARD;
        hardIntent = 'reopen';
      } else {
        recoveryFail('reopen_required');
        return;
      }
    } else if (hardRequested) {
      // Hard reset is allowed only when soft is exhausted/disabled, or on explicit manual request
      var softPossible = CFG.allowSoft && softLeft() > 0;
      if (softPossible && !meta.fromSoftExhausted && !meta.manualHardNow) desiredMode = MODE_SOFT;
      else {
        desiredMode = MODE_HARD;
        hardIntent = computeHardIntent(meta);
        if (hardIntent === 'hard_reset' && !CFG.allowHard) { recoveryFail('hard_disabled'); return; }
        if (hardIntent === 'reopen' && !CFG.reopenOnFault && !meta.manual) { recoveryFail('reopen_disabled'); return; }
        if (hardLeft() <= 0) { recoveryFail('hard_exhausted'); return; }
      }
    } else {
      // Soft by default
      if (CFG.allowSoft && softLeft() > 0) desiredMode = MODE_SOFT;
      else if (CFG.reopenOnFault && hardLeft() > 0) { desiredMode = MODE_HARD; hardIntent = 'reopen'; }
      else if (CFG.allowHard && hardLeft() > 0 && (!CFG.allowSoft || softLeft() <= 0)) { desiredMode = MODE_HARD; hardIntent = 'hard_reset'; }
      else { recoveryFail('budget_exhausted'); return; }
    }

    // if already recovering: avoid resetting counters (budget is session-based)
    if (isRecovering()) {
      if (STATE.rec.mode === MODE_HARD && desiredMode === MODE_SOFT) return;
      if (STATE.rec.mode === desiredMode) {
        STATE.rec.reason = String(reason || STATE.rec.reason || '');
        if (desiredMode === MODE_HARD && hardIntent) STATE.rec.hardIntent = hardIntent;
        lockGuard('fault', { capture: false });
        return;
      }

      // escalate soft -> hard
      logEvt('WRN', 'escalate', { from: STATE.rec.mode, to: desiredMode, why: String(reason || '') }, 'rec:escalate', 1200);
    }

    var video = null;
    try { video = STATE.video || (window.Lampa && Lampa.PlayerVideo && Lampa.PlayerVideo.video ? Lampa.PlayerVideo.video() : null); } catch (_) { video = STATE.video; }
    updateStreamContext(video, null);

    STATE.rec.seq++;
    STATE.rec.mode = desiredMode;
    STATE.rec.reason = String(reason || '');
    STATE.rec.hardIntent = hardIntent || STATE.rec.hardIntent || '';
    STATE.rec.stableSec = 0;
    STATE.rec.stableLastCur = NaN;
    STATE.rec.stableLastTs = 0;

    var resume = pickResumeTime(video);
    STATE.rec.resumeTimeSec = resume;
    STATE.rec.pendingSeekSec = resume;

    if (CFG.storePos) writeTruthLS(resume, safe(function () { return video ? video.duration : 0; }, 0), String(STATE.srcSig || ''), 'recovery_enter');

    lockGuard(String(reason || ''), { capture: true });

    var modeLabel = (desiredMode === MODE_HARD ? (STATE.rec.hardIntent === 'reopen' ? 'REOPEN' : 'HARD') : 'SOFT');
    var stage = modeLabel + ' start';
    var info = 'softLeft=' + String(softLeft()) + ' | hardLeft=' + String(hardLeft()) + ' | truth=' + fmtTime(getTruthTime()) + ' | video=' + fmtTime(video ? video.currentTime : 0) + ' | dur=' + fmtTime(video ? video.duration : 0);
    var details = CFG.debugPopup ? ('reason=' + String(reason || '') + '\n' + mediaState(video)) : '';
    uiShowRecover(stage, info, details);

    logEvt('WRN', 'enter_recovery', {
      mode: desiredMode === MODE_HARD ? 'hard' : 'soft',
      intent: desiredMode === MODE_HARD ? String(STATE.rec.hardIntent || '') : '',
      reason: String(reason || ''),
      resume: resume.toFixed(2),
      truth: getTruthTime().toFixed(2),
      softLeft: softLeft(),
      hardLeft: hardLeft(),
      srcSig: String(STATE.srcSig || '')
    }, 'rec:enter:' + String(reason || ''), 1200);

    logEvt('DBG', 'attempts_budget', { softLeft: softLeft(), hardLeft: hardLeft() }, 'budget:enter', 1500);

    scheduleNextAttempt(0);
  }

  function softActionName(n) {
    if (n === 1) return 'seek_play';
    if (n === 2) return 'pause_load_seek_play';
    if (n === 3) return 'reload_url_seek_play';
    return 'seek_play';
  }

  function hardActionName(n) {
    if (String(STATE.rec.hardIntent || '') === 'hard_reset') return 'hard_reset_video';
    return 'reopen_player';
  }

  function actionSeekPlay(video, t) {
    try { if (!video) return; } catch (_) { return; }
    try { video.currentTime = Math.max(0, t); } catch (_) { }
    safePlay(video, 'seek_play');
  }

  function actionPauseLoadSeek(video, t) {
    try { if (!video) return; } catch (_) { return; }
    safe(function () { if (typeof video.pause === 'function') video.pause(); });
    safe(function () { if (typeof video.load === 'function') video.load(); });
    setTimeout(function () { actionSeekPlay(video, t); }, 250);
  }

  function safePlay(video, why) {
    try {
      if (!video || typeof video.play !== 'function') return;
      var p = null;
      try { p = video.play(); } catch (_) { p = null; }
      if (!p || typeof p.catch !== 'function') return;
      p.catch(function (err) {
        try {
          if (!CFG.enabled) return;
          if (isManualSuppressed()) return;
          var msg = '';
          try { msg = err && err.message ? String(err.message) : String(err); } catch (_) { msg = ''; }
          var low = '';
          try { low = msg.toLowerCase(); } catch (_) { low = ''; }
          if (!low) return;

          if (low.indexOf('no supported source') >= 0) {
            faultDetected('no_supported_source', { reason: msg, where: String(why || '') });
            lockGuard('no_supported_source', { capture: true });
            if (maybeAutoReopenFromFault('no_supported_source', { reason: msg, where: String(why || '') })) return;
            enterRecovery(MODE_HARD, 'no_supported_source', { forceHard: true, needReopen: true });
            return;
          }

          if (low.indexOf('interrupted') >= 0 && low.indexOf('pause') >= 0) {
            faultDetected('play_interrupted', { reason: msg, where: String(why || '') });
            lockGuard('play_interrupted', { capture: true });
            if (maybeAutoReopenFromFault('play_interrupted', { reason: msg, where: String(why || '') })) return;
            enterRecovery(MODE_HARD, 'play_interrupted', { forceHard: true, needReopen: true });
            return;
          }

          faultDetected('play_error', { reason: msg, where: String(why || '') });
        } catch (_) { }
      });
    } catch (_) { }
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

      // forced snapshot right before close (resumePinned)
      var video = null;
      try { video = STATE.video || (window.Lampa && Lampa.PlayerVideo && Lampa.PlayerVideo.video ? Lampa.PlayerVideo.video() : null); } catch (_) { video = STATE.video; }

      var truthT = 0;
      var liveT = NaN;
      var dur = NaN;
      try { truthT = getTruthTime(); } catch (_) { truthT = 0; }
      try { liveT = video ? toNum(video.currentTime, NaN) : NaN; } catch (_) { liveT = NaN; }
      try { dur = video ? toNum(video.duration, NaN) : NaN; } catch (_) { dur = NaN; }

      var backoff = toNum(DET.reopenBackoffSec, 0.5);
      if (!isFinite(backoff) || backoff < 0) backoff = 1.5;

      var resumePinned = Math.max(0, toNum(t, 0));
      try {
        resumePinned = Math.max(resumePinned, Math.max(0, truthT));

        if (isFinite(liveT) && liveT >= 0) {
          var liveCand = Math.max(0, liveT - backoff);
          var tail = false;
          if (isFinite(dur) && dur > 0) {
            if (liveT >= dur - DET.epsilonEndSec) tail = true;
            if (liveCand >= dur - DET.epsilonEndSec) tail = true;
          }
          // If time jumped to the tail (false-ended), don't pin to the end.
          if (!tail) resumePinned = Math.max(resumePinned, liveCand);
        }

        if (isFinite(dur) && dur > 0) resumePinned = Math.min(resumePinned, Math.max(0, dur - DET.epsilonEndSec));
        resumePinned = Math.max(0, toNum(resumePinned, 0));
      } catch (_) { }

      STATE.rec.resumeTimeSec = resumePinned;
      STATE.rec.resumePinnedSec = resumePinned;
      STATE.rec.pendingSeekSec = resumePinned;
      t = resumePinned;

      try { if (CFG.storePos) writeTruthLS(resumePinned, isFinite(dur) && dur > 0 ? dur : 0, String(STATE.srcSig || ''), 'snapshotNow'); } catch (_) { }
      logEvt('INF', 'snapshotNow', { truth: toNum(truthT, 0).toFixed(2), live: isFinite(liveT) ? liveT.toFixed(2) : '', resumePinned: resumePinned.toFixed(2) }, 'snap:now', 1200);

      try {
        STATE.rec.activeReopenTransition = true;
        STATE.rec.reopenTransitionStartTs = now();
        STATE.rec.reopenTransitionResumeSec = toNum(resumePinned, 0);
      } catch (_) { }

      var pd = STATE.guard.lockedWork || getPlayData();
      if (!pd || typeof pd !== 'object') return false;
      if (!pd.url || typeof pd.url !== 'string') return false;

      logEvt('INF', 'reopen_start', { resume: toNum(t, 0).toFixed(2), truth: getTruthTime().toFixed(2), url: shortUrl(pd.url), reason: String(STATE.rec.reason || '') }, 'reopen:start', 1200);

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
    if (isManualSuppressed()) return;

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
      // When reopen strategy is enabled: give only one SOFT chance, then reopen.
      try {
        if (CFG.reopenOnFault && STATE.rec.softAttempt >= 1 && STATE.rec.hardMax > 0 && hardLeft() > 0) {
          return enterRecovery(MODE_HARD, 'soft_to_reopen', { forceHard: true, fromSoftExhausted: true });
        }
      } catch (_) { }

      if (STATE.rec.softAttempt >= STATE.rec.softMax) {
        if (STATE.rec.hardMax > 0) return enterRecovery(MODE_HARD, 'soft_exhausted', { forceHard: true, fromSoftExhausted: true });
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

      if (String(STATE.rec.hardIntent || '') === 'hard_reset') {
        if (!CFG.allowHard) return recoveryFail('hard_disabled');
        ok = actionHardReloadVideo(url2, resume);
      } else {
        ok = actionHardReopenPlayer(resume);
      }
    }

    STATE.rec.attemptStartedTs = now();
    lockGuard('attempt', { capture: false });

    var total = (mode === MODE_HARD) ? STATE.rec.hardMax : STATE.rec.softMax;
    var n = (mode === MODE_HARD) ? STATE.rec.hardAttempt : STATE.rec.softAttempt;
    var modeLabel = (mode === MODE_HARD ? (String(STATE.rec.hardIntent || '') === 'hard_reset' ? 'HARD' : 'REOPEN') : 'SOFT');
    var stage = modeLabel + ' attempt ' + String(n) + '/' + String(total) + ': ' + action;
    var info = 'softLeft=' + String(softLeft()) + ' | hardLeft=' + String(hardLeft()) + ' | truth=' + fmtTime(getTruthTime()) + ' | video=' + fmtTime(video ? video.currentTime : 0) + ' | resume=' + fmtTime(resume) + ' | dur=' + fmtTime(video ? video.duration : 0);
    var details = CFG.debugPopup ? ('reason=' + String(STATE.rec.reason || '') + '\n' + mediaState(video)) : '';
    uiShowRecover(stage, info, details);

    logEvt('INF', 'attempt', {
      mode: mode === MODE_HARD ? 'hard' : 'soft',
      intent: mode === MODE_HARD ? String(STATE.rec.hardIntent || '') : '',
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
    logEvt('INF', 'ui_close', { reason: String(why || 'exit') }, 'ui:exit', 1200);
    stopGuardAndRecovery('exit_player', 30000);
    var closed = false;
    safe(function () { if (window.Lampa && Lampa.Player && typeof Lampa.Player.close === 'function') { closed = true; return Lampa.Player.close(); } });
    if (!closed) safe(function () { if (window.Lampa && Lampa.Controller && typeof Lampa.Controller.back === 'function') return Lampa.Controller.back(); });
  }

  function handlePlayerVideoSend(origSend, args) {
    var ts = now();
    var type = (args && args.length) ? args[0] : '';
    var data = (args && args.length > 1) ? args[1] : undefined;
    var t = String(type || '');

    var video = null;
    try { video = STATE.video || (window.Lampa && Lampa.PlayerVideo && Lampa.PlayerVideo.video ? Lampa.PlayerVideo.video() : null); } catch (_) { video = STATE.video; }
    updateStreamContext(video, null);
    if (isManualSuppressed()) return origSend.apply(this, args || []);

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
        if (maybeAutoReopenFromFault('reset0', { cur: toNum(cur, 0), dur: toNum(dur, 0) })) return; // auto "start from position"
        enterRecovery(MODE_HARD, 'reset0', { forceHard: true, needReopen: true });
        return; // suppress bad timeupdate (avoid UI reset to 0)
      }

      if (shouldFalseEndByJump(ts, cur, dur)) {
        STATE.session.health = 'SUSPECT';
        lockGuard('false_jump', { capture: true });
        faultDetected('falseended_jump', { reason: 'jump_to_end', cur: toNum(cur, 0).toFixed(2), dur: toNum(dur, 0).toFixed(2) });
        if (maybeAutoReopenFromFault('falseended_jump', { cur: toNum(cur, 0), dur: toNum(dur, 0) })) return; // auto "start from position"
        enterRecovery(MODE_SOFT, 'jump', {});
        return; // suppress bad timeupdate (avoid seekbar 100%)
      }

      if (shouldSessionSrcChange(ts, cur, dur, video)) {
        STATE.session.health = 'SUSPECT';
        lockGuard('srcchange', { capture: true });
        faultDetected('srcchange', { reason: 'srcSig changed', from: String(STATE.truth.srcSig || ''), to: String(STATE.srcSig || '') });
        if (maybeAutoReopenFromFault('srcchange', { from: String(STATE.truth.srcSig || ''), to: String(STATE.srcSig || '') })) return; // auto "start from position"
        enterRecovery(MODE_HARD, 'srcchange', { forceHard: true, needReopen: true });
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
        if (maybeAutoReopenFromFault('falseended', { reason: 'ended_after_fault' })) return; // auto "start from position"
        enterRecovery(MODE_SOFT, 'ended', {});
        return; // suppress ended => no autoplay next
      }

      // If we are recovering or in guardLock: treat ended as suspicious (do not clear truth)
      if (isRecovering() || isGuardLocked()) {
        lockGuard('ended_during_guard', { capture: true });
        faultDetected('ended_guard', { reason: 'ended while guard/recover' });
        enterRecovery(MODE_HARD, 'ended_guard', { forceHard: true, needReopen: true });
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
    on('error', function () {
      try {
        if (!CFG.enabled) return;
        if (STATE.video !== video) return;

        var code = 0;
        var msg = '';
        try { code = video && video.error && typeof video.error.code === 'number' ? video.error.code : 0; } catch (_) { code = 0; }
        try { msg = video && video.error && video.error.message ? String(video.error.message) : ''; } catch (_) { msg = ''; }
        var low = '';
        try { low = msg.toLowerCase(); } catch (_) { low = ''; }

        markBuffering(true, 'error', msg || String(code || ''));

        // MEDIA_ERR_SRC_NOT_SUPPORTED
        if (code === 4 || (low && low.indexOf('no supported source') >= 0)) {
          faultDetected('no_supported_source', { reason: msg || 'MEDIA_ERR_SRC_NOT_SUPPORTED', code: String(code || '') });
          lockGuard('no_supported_source', { capture: true });
          if (maybeAutoReopenFromFault('no_supported_source', { reason: msg || 'MEDIA_ERR_SRC_NOT_SUPPORTED', code: String(code || '') })) return;
          enterRecovery(MODE_HARD, 'no_supported_source', { forceHard: true, needReopen: true });
        }
      } catch (_) { }
    });
    on('abort', function () { try { if (!CFG.enabled) return; if (STATE.video === video) markBuffering(true, 'abort', ''); } catch (_) { } });
    on('emptied', function () { try { if (!CFG.enabled) return; if (STATE.video === video) markBuffering(true, 'emptied', ''); } catch (_) { } });
    on('playing', function () { try { if (!CFG.enabled) return; if (STATE.video === video) { STATE.session.buffering = false; forceTruthSnapshot(video, 'playing'); } } catch (_) { } });
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
	          if (isManualSuppressed()) return origSend.apply(this, arguments);
	          var type = (arguments && arguments.length) ? arguments[0] : '';
	          if (String(type || '') === 'select' && CFG.blockNext && isGuardLocked() && !isManualAllowed()) {
	            logEvt('WRN', 'prevent_next', { where: 'playlist.select', reason: String(STATE.guard.reason || '') }, 'prevent:pl', 1200);
	            // escalate if needed
	            if (!isRecovering()) enterRecovery(MODE_HARD, 'prevent_next', { forceHard: true, needReopen: true });
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
	          if (isManualSuppressed()) return origSend.apply(this, arguments);
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
	                  if (!isRecovering()) enterRecovery(MODE_HARD, 'prevent_next', { forceHard: true, needReopen: true });
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
	                  enterRecovery(MODE_HARD, 'next_started', { forceHard: true, needReopen: true });
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

	                // reset attempt budgets for new content/session
	                STATE.rec.softAttempt = 0;
	                STATE.rec.hardAttempt = 0;
	                STATE.rec.lastOkTs = 0;
	                try { if (STATE.loop && STATE.loop.events) STATE.loop.events = []; } catch (_) { }
	                try { if (STATE.loop) { STATE.loop.reopenRequiredTs = 0; STATE.loop.reopenBucket = null; STATE.loop.reopenCount = 0; } } catch (_) { }
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

  function patchController() {
    if (STATE.patched.controller) return true;
    if (!window.Lampa || !Lampa.Controller) return false;
    var c = Lampa.Controller;
    if (!c || typeof c !== 'object') return false;

    try {
      if (typeof c.back === 'function' && !c.back.__blPlayerGuardWrappedV2) {
        var origBack = c.back;
        c.back = function () {
          try {
            if (CFG.enabled && STATE.ui && STATE.ui.mode && STATE.ui.mode !== 'hidden') {
              uiClose('back');
              return;
            }
          } catch (_) { }
          return origBack.apply(this, arguments);
        };
        c.back.__blPlayerGuardWrappedV2 = true;
      }
    } catch (_) { }

    STATE.patched.controller = true;
    logEvt('OK', 'installed', { what: 'Controller' }, 'pg:installed:controller', 5000);
    return true;
  }

  function patchAll() {
    var ok = true;
    if (!patchPlayerVideo()) ok = false;
    if (!patchPlaylist()) ok = false;
    if (!patchPanel()) ok = false;
    if (!patchPlayer()) ok = false;
    if (!patchController()) ok = false;
    return ok;
  }

  function readSettingsFromStorage() {
    try {
      CFG.enabled = parseBool(sGet(KEY_ENABLED, '0'), false);
      CFG.storePos = parseBool(sGet(KEY_STORE_POS, '1'), true);
      CFG.blockNext = parseBool(sGet(KEY_BLOCK_NEXT, '1'), true);
      CFG.debugPopup = parseBool(sGet(KEY_DEBUG_POPUP, '1'), true);
      CFG.reopenOnFault = parseBool(sGet(KEY_REOPEN, '1'), true);
      CFG.autoReopenFromPosition = parseBool(sGet(KEY_AUTO_REOPEN_FROM_POSITION, '1'), true);
      CFG.allowSoft = parseBool(sGet(KEY_ALLOW_SOFT, '1'), true);
      CFG.allowHard = parseBool(sGet(KEY_ALLOW_HARD, '0'), false);

      var soft = sGet(KEY_SOFT_ATTEMPTS, null);
      if (soft === null || soft === undefined || soft === '') soft = sGet(KEY_ATTEMPTS_LEGACY, '4');
      CFG.softAttempts = clampInt(soft, 0, 5);

      CFG.hardAttempts = clampInt(sGet(KEY_HARD_ATTEMPTS, '1'), 0, 2);
      CFG.attemptDelaySec = clampInt(sGet(KEY_DELAY_SEC, '2'), 1, 5);
      CFG.popupMinSec = clampInt(sGet(KEY_POPUP_MIN_SEC, '2'), 1, 5);
      CFG.popupAutoCloseSec = clampInt(sGet(KEY_POPUP_AUTOCLOSE_SEC, '10'), 0, 60);
    } catch (_) { }

    STATE.rec.softMax = CFG.allowSoft ? clampInt(CFG.softAttempts, 0, 5) : 0;
    STATE.rec.hardMax = clampInt(CFG.hardAttempts, 0, 2);
    return CFG;
  }

  API.getConfig = function () { return CFG; };

  API.reopenFromPosition = function (why, resumeOverride, meta) {
    try { return reopenFromPosition(why, resumeOverride, meta); } catch (_) { return false; }
  };

  API.refresh = function () {
    var was = !!CFG.enabled;
    readSettingsFromStorage();

    try {
      // apply popup autoclose setting without restart
      if (STATE.ui && STATE.ui.mode === 'fail') {
        if (!clampInt(CFG.popupAutoCloseSec, 0, 60)) uiAutoCloseClear('cfg');
        else if (!STATE.ui.autoCloseTimer && !STATE.ui.autoCloseIdleTimer) uiAutoCloseArm('refresh');
      } else {
        uiAutoCloseClear('refresh');
      }
    } catch (_) { }

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
      logEvt('INF', 'enabled', { soft: CFG.softAttempts, hard: CFG.hardAttempts, delay: CFG.attemptDelaySec, reopen: CFG.reopenOnFault ? 1 : 0, allowSoft: CFG.allowSoft ? 1 : 0, allowHard: CFG.allowHard ? 1 : 0, blockNext: CFG.blockNext ? 1 : 0 }, 'pg:enabled', 1500);
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
            if (n === KEY_ENABLED || n === KEY_STORE_POS || n === KEY_BLOCK_NEXT || n === KEY_DEBUG_POPUP || n === KEY_REOPEN || n === KEY_AUTO_REOPEN_FROM_POSITION || n === KEY_ALLOW_SOFT || n === KEY_ALLOW_HARD || n === KEY_SOFT_ATTEMPTS || n === KEY_ATTEMPTS_LEGACY || n === KEY_HARD_ATTEMPTS || n === KEY_DELAY_SEC || n === KEY_POPUP_MIN_SEC || n === KEY_POPUP_AUTOCLOSE_SEC) API.refresh();
          } catch (_) { }
        });
      }
    });

    return true;
  };

  API.install();
})();
