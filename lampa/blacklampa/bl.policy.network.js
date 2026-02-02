(function () {
	  'use strict';

	  var BL = window.BL = window.BL || {};
	  BL.Net = BL.Net || {};
	  BL.PolicyNetwork = BL.PolicyNetwork || {};
	  try { if (BL.migrateKeysOnce) BL.migrateKeysOnce(); } catch (_) { }

	  var __netStatus = {
	    interceptors: {
	      fetch: false,
	      xhr: false,
	      ws: false,
	      eventsource: false,
	      beacon: false,
	      iframe_src: false,
	      img_src: false,
	      script_src: false,
	      link_href: false,
	      open: false,
	      location: false
	    },
	    lastBlocked: null
	  };

	  function setInterceptorActive(id, on) {
	    try { __netStatus.interceptors[String(id || '')] = !!on; } catch (_) { }
	  }

	  function snapshotInterceptors() {
	    var out = {};
	    try {
	      var keys = Object.keys(__netStatus.interceptors || {});
	      for (var i = 0; i < keys.length; i++) {
	        var k = keys[i];
	        out[k] = !!__netStatus.interceptors[k];
	      }
	    } catch (_) { }
	    return out;
	  }

	  function snapshotLastBlocked() {
	    try {
	      if (!__netStatus.lastBlocked) return null;
	      var lb = __netStatus.lastBlocked;
	      return {
	        url: String(lb.url || ''),
	        channel: String(lb.channel || ''),
	        ruleId: String(lb.ruleId || ''),
	        ruleLabel: String(lb.ruleLabel || ''),
	        ts: Number(lb.ts || 0)
	      };
	    } catch (_) {
	      return null;
	    }
	  }

	  BL.PolicyNetwork.getStatus = BL.PolicyNetwork.getStatus || function () {
	    return { interceptors: snapshotInterceptors(), lastBlocked: snapshotLastBlocked() };
	  };

	  function logCall(log, method, source, message, extra) {
	    try {
	      if (!log) return;
	      var fn = log[method];
      if (typeof fn === 'function') fn.call(log, source, message, extra);
    } catch (_) { }
  }

  var BLOCK_YANDEX_RE =
    /(^|\.)((yandex\.(ru|com|net|by|kz|ua|uz|tm|tj))|(ya\.ru)|(yastatic\.net)|(yandex\.(net|com)\.tr))$/i;

  var BLOCK_GOOGLE_RE =
    /(^|\.)((google\.com)|(google\.[a-z.]+)|(gstatic\.com)|(googlesyndication\.com)|(googleadservices\.com)|(doubleclick\.net)|(googletagmanager\.com)|(google-analytics\.com)|(analytics\.google\.com)|(api\.google\.com)|(accounts\.google\.com)|(recaptcha\.net))$/i;

  var BLOCK_YOUTUBE_RE =
    /(^|\.)((youtube\.com)|(ytimg\.com)|(googlevideo\.com)|(youtu\.be)|(youtube-nocookie\.com))$/i;

  var BLOCK_STATS_RE =
    /(^|\.)((scorecardresearch\.com)|(quantserve\.com)|(cdn\.quantserve\.com)|(hotjar\.com)|(static\.hotjar\.com)|(mixpanel\.com)|(api\.mixpanel\.com)|(sentry\.io)|(o\\d+\\.ingest\\.sentry\\.io)|(datadoghq\\.com)|(segment\\.com)|(api\\.segment\\.io)|(amplitude\\.com)|(api\\.amplitude\\.com)|(branch\\.io)|(app-measurement\\.com))$/i;

  var K = (window.BL && BL.Keys) ? BL.Keys : (BL.LocalStorageKeys || {});
  var PFX = String((K && K.prefix) ? K.prefix : 'blacklampa_');
  function kk(s) { return String((K && K[s]) ? K[s] : (PFX + String(s || ''))); }

  var LS_BUILTIN_YANDEX = kk('net_block_yandex_v1');
  var LS_BUILTIN_GOOGLE_LEGACY = kk('net_block_google_v1'); // legacy: Google/YouTube combined
  var LS_BUILTIN_GOOGLE = kk('net_block_google_v2'); // new: Google (incl analytics/ads)
  var LS_BUILTIN_YOUTUBE = kk('net_block_youtube_v1'); // new: YouTube domains
  var LS_BUILTIN_STATS = kk('net_block_stats_v1');
  var LS_BUILTIN_BWA_CORS = kk('net_block_bwa_cors_v1');
  var LS_USER_RULES = kk('net_user_rules_v1');
  var LS_USER_RULES_OLD = 'bl_net_user_rules_v1';

	  function lsGet(key) {
	    try {
	      if (window.Lampa && Lampa.Storage && typeof Lampa.Storage.get === 'function') {
	        var v = Lampa.Storage.get(String(key));
	        if (v !== undefined && v !== null) return String(v);
	      }
	    } catch (_) { }
	    try { return localStorage.getItem(String(key)); } catch (_) { return null; }
	  }
	  function lsSet(key, val) {
	    try { localStorage.setItem(String(key), String(val)); } catch (_) { }
	    try { if (window.Lampa && Lampa.Storage && typeof Lampa.Storage.set === 'function') Lampa.Storage.set(String(key), String(val)); } catch (_) { }
	  }

  function lsGetBool(key, def) {
    try {
      var v = lsGet(key);
      if (v == null || v === '') return !!def;
      var s = String(v).toLowerCase();
      if (s === '0' || s === 'false' || s === 'off' || s === 'no') return false;
      return true;
    } catch (_) {
      return !!def;
    }
  }

		  function lsSetBool(key, on) { lsSet(key, on ? '1' : '0'); }

		  function migrateBuiltinGoogleYoutubeOnce() {
		    try {
		      var old = lsGet(LS_BUILTIN_GOOGLE_LEGACY);
		      if (old === null || old === undefined || old === '') return;
		      var oldOn = lsGetBool(LS_BUILTIN_GOOGLE_LEGACY, true);

		      var g = lsGet(LS_BUILTIN_GOOGLE);
		      if (g === null || g === undefined || g === '') lsSetBool(LS_BUILTIN_GOOGLE, oldOn);

		      var y = lsGet(LS_BUILTIN_YOUTUBE);
		      if (y === null || y === undefined || y === '') lsSetBool(LS_BUILTIN_YOUTUBE, oldOn);
		    } catch (_) { }
		  }
		  try { migrateBuiltinGoogleYoutubeOnce(); } catch (_) { }

		  var LS_NET_POLICY_ENABLED = kk('net_policy_enabled');
		  var __netPolicyEnabledCache = null;
		  var __netPolicyDefaultEnsured = false;

		  function ensureNetPolicyDefaultOnce() {
		    if (__netPolicyDefaultEnsured) return;
		    __netPolicyDefaultEnsured = true;
		    try {
		      var v = lsGet(LS_NET_POLICY_ENABLED);
		      if (v === null || v === undefined || v === '') {
		        lsSetBool(LS_NET_POLICY_ENABLED, true);
		        __netPolicyEnabledCache = true;
		      }
		    } catch (_) { }
		  }

		  try { ensureNetPolicyDefaultOnce(); } catch (_) { }

		  function isPolicyEnabledFast() {
		    try {
		      if (__netPolicyEnabledCache === null) __netPolicyEnabledCache = lsGetBool(LS_NET_POLICY_ENABLED, true);
		      return !!__netPolicyEnabledCache;
		    } catch (_) {
		      return true;
		    }
		  }

	  function setPolicyEnabled(on) {
	    __netPolicyEnabledCache = !!on;
	    try { lsSetBool(LS_NET_POLICY_ENABLED, __netPolicyEnabledCache); } catch (_) { }
	    return __netPolicyEnabledCache;
	  }

	  BL.NetPolicy = BL.NetPolicy || {};
	  if (typeof BL.NetPolicy.key !== 'string') BL.NetPolicy.key = LS_NET_POLICY_ENABLED;
	  if (typeof BL.NetPolicy.isEnabled !== 'function') {
	    BL.NetPolicy.isEnabled = function () { return isPolicyEnabledFast(); };
	  }
	  if (typeof BL.NetPolicy.setEnabled !== 'function') {
	    BL.NetPolicy.setEnabled = function (on) { return setPolicyEnabled(!!on); };
	  }

  var LS_JSQP_ENABLED = kk('jsqp_enabled');
  var LS_JSQP_FORCE = kk('jsqp_force');
  var LS_JSQP_ORIGIN_MODE = kk('jsqp_origin_mode');
  var LS_JSQP_ORIGIN_VALUE = kk('jsqp_origin_value');
  var LS_JSQP_LOGGED_MODE = kk('jsqp_logged_mode');
  var LS_JSQP_LOGGED_VALUE = kk('jsqp_logged_value');
  var LS_JSQP_RESET_MODE = kk('jsqp_reset_mode');
  var LS_JSQP_RESET_VALUE = kk('jsqp_reset_value');
  var LS_JSQP_MATCH = kk('jsqp_match');
  var LS_JSQP_PARAMS = kk('jsqp_params');

  var __jsqpDefaultsEnsured = false;
  var __jsqpCache = { matchRaw: null, matchRe: null, paramsRaw: null, paramsSet: null };

  function jsqpStorageGet(key) {
    try { if (window.Lampa && Lampa.Storage && Lampa.Storage.get) return Lampa.Storage.get(String(key)); } catch (_) { }
    return lsGet(key);
  }

  function jsqpStorageSet(key, val) {
    try { if (window.Lampa && Lampa.Storage && Lampa.Storage.set) return Lampa.Storage.set(String(key), String(val)); } catch (_) { }
    lsSet(key, val);
  }

  function jsqpSetIfMissing(key, def) {
    try {
      var v = jsqpStorageGet(key);
      if (v === undefined || v === null) jsqpStorageSet(key, def);
    } catch (_) { }
  }

  function jsqpEnsureDefaultsOnce() {
    if (__jsqpDefaultsEnsured) return;
    __jsqpDefaultsEnsured = true;
    jsqpSetIfMissing(LS_JSQP_ENABLED, '1');
    jsqpSetIfMissing(LS_JSQP_FORCE, '0');
    jsqpSetIfMissing(LS_JSQP_ORIGIN_MODE, 'remove');
    jsqpSetIfMissing(LS_JSQP_ORIGIN_VALUE, '');
    jsqpSetIfMissing(LS_JSQP_LOGGED_MODE, 'remove');
    jsqpSetIfMissing(LS_JSQP_LOGGED_VALUE, 'false');
    jsqpSetIfMissing(LS_JSQP_RESET_MODE, 'remove');
    jsqpSetIfMissing(LS_JSQP_RESET_VALUE, '0');
    jsqpSetIfMissing(LS_JSQP_MATCH, '\\\\.js(\\\\?|$)');
    jsqpSetIfMissing(LS_JSQP_PARAMS, 'origin,logged,reset');
  }

  function jsqpGetBool(key, def) {
    try {
      var v = jsqpStorageGet(key);
      if (v == null || v === '') return !!def;
      var s = String(v).toLowerCase();
      if (s === '0' || s === 'false' || s === 'off' || s === 'no') return false;
      return true;
    } catch (_) {
      return !!def;
    }
  }

  function jsqpGetStr(key, def) {
    try {
      var v = jsqpStorageGet(key);
      if (v === undefined || v === null) return String(def || '');
      return String(v);
    } catch (_) {
      return String(def || '');
    }
  }

  function jsqpCompileMatchRe(raw) {
    raw = String(raw || '');
    if (__jsqpCache.matchRaw === raw && __jsqpCache.matchRe) return __jsqpCache.matchRe;
    __jsqpCache.matchRaw = raw;
    __jsqpCache.matchRe = null;
    if (!raw) return null;

    try {
      if (raw[0] === '/' && raw.length > 2) {
        var lastSlash = raw.lastIndexOf('/');
        if (lastSlash > 0) {
          var pat = raw.slice(1, lastSlash);
          var flags = raw.slice(lastSlash + 1);
          if (pat) {
            __jsqpCache.matchRe = new RegExp(pat, flags);
            return __jsqpCache.matchRe;
          }
        }
      }
    } catch (_) { __jsqpCache.matchRe = null; }

    try { __jsqpCache.matchRe = new RegExp(raw); } catch (_) { __jsqpCache.matchRe = null; }
    return __jsqpCache.matchRe;
  }

  function jsqpParseParams(raw) {
    raw = String(raw || '');
    if (__jsqpCache.paramsRaw === raw && __jsqpCache.paramsSet) return __jsqpCache.paramsSet;
    __jsqpCache.paramsRaw = raw;
    __jsqpCache.paramsSet = { origin: false, logged: false, reset: false };

    try {
      var parts = raw.split(',');
      for (var i = 0; i < parts.length; i++) {
        var n = String(parts[i] || '').trim().toLowerCase();
        if (!n) continue;
        if (n === 'origin' || n === 'logged' || n === 'reset') __jsqpCache.paramsSet[n] = true;
      }
    } catch (_) { }

    return __jsqpCache.paramsSet;
  }

  function b64utf8(s) {
    try {
      if (typeof btoa !== 'function') return String(s || '');
      try { return btoa(unescape(encodeURIComponent(String(s || '')))); } catch (e) { return btoa(String(s || '')); }
    } catch (_) {
      return String(s || '');
    }
  }

  BL.Net.rewriteJsQuery = BL.Net.rewriteJsQuery || function (url) {
    var orig = String(url || '');
    try { jsqpEnsureDefaultsOnce(); } catch (_) { }

    if (!jsqpGetBool(LS_JSQP_ENABLED, true)) return orig;

    var u = null;
    try { u = new URL(orig, location.href); } catch (_) { return orig; }

    var isJs = false;
    try {
      var p = String(u.pathname || '');
      isJs = p.slice(-3).toLowerCase() === '.js';
    } catch (_) { isJs = false; }

    if (!isJs) {
      var re = null;
      try { re = jsqpCompileMatchRe(jsqpGetStr(LS_JSQP_MATCH, '\\\\.js(\\\\?|$)')); } catch (_) { re = null; }
      if (re) {
        try { re.lastIndex = 0; } catch (_) { }
        try {
          var s1 = String(u.pathname || '') + String(u.search || '');
          isJs = re.test(s1);
          if (!isJs) {
            try { re.lastIndex = 0; } catch (_) { }
            isJs = re.test(String(u.href || ''));
          }
        } catch (_) { isJs = false; }
      }
    }

    if (!isJs) return orig;

    var managed = jsqpParseParams(jsqpGetStr(LS_JSQP_PARAMS, 'origin,logged,reset'));
    var force = jsqpGetBool(LS_JSQP_FORCE, false);

    if (!force) {
      var hasAny = false;
      try { if (managed.origin && u.searchParams.has('origin')) hasAny = true; } catch (_) { }
      try { if (!hasAny && managed.logged && u.searchParams.has('logged')) hasAny = true; } catch (_) { }
      try { if (!hasAny && managed.reset && u.searchParams.has('reset')) hasAny = true; } catch (_) { }
      if (!hasAny) return orig;
    }

    var changed = false;
    var changedOrigin = false;
    var changedLogged = false;
    var changedReset = false;
    var beforeAbs = '';
    try { beforeAbs = u.toString(); } catch (_) { beforeAbs = ''; }

    if (managed.origin) {
      var om = jsqpGetStr(LS_JSQP_ORIGIN_MODE, 'remove');
      if (om === 'set') {
        var ov = jsqpGetStr(LS_JSQP_ORIGIN_VALUE, '');
        var curO = null;
        try { curO = u.searchParams.get('origin'); } catch (_) { curO = null; }
        try { u.searchParams.set('origin', String(ov)); } catch (_) { }
        if (String(curO) !== String(ov)) { changed = true; changedOrigin = true; }
      } else if (om === 'set_b64') {
        var ovb = jsqpGetStr(LS_JSQP_ORIGIN_VALUE, '');
        var enc = '';
        try { enc = b64utf8(ovb); } catch (_) { enc = String(ovb); }
        var curOb = null;
        try { curOb = u.searchParams.get('origin'); } catch (_) { curOb = null; }
        try { u.searchParams.set('origin', String(enc)); } catch (_) { }
        if (String(curOb) !== String(enc)) { changed = true; changedOrigin = true; }
      } else if (om === 'remove') {
        var hadO = false;
        try { hadO = u.searchParams.has('origin'); } catch (_) { hadO = false; }
        try { u.searchParams.delete('origin'); } catch (_) { }
        if (hadO) { changed = true; changedOrigin = true; }
      }
    }

    if (managed.logged) {
      var lm = jsqpGetStr(LS_JSQP_LOGGED_MODE, 'remove');
      if (lm === 'set') {
        var lv = jsqpGetStr(LS_JSQP_LOGGED_VALUE, 'false');
        var curL = null;
        try { curL = u.searchParams.get('logged'); } catch (_) { curL = null; }
        try { u.searchParams.set('logged', String(lv)); } catch (_) { }
        if (String(curL) !== String(lv)) { changed = true; changedLogged = true; }
      } else if (lm === 'remove') {
        var hadL = false;
        try { hadL = u.searchParams.has('logged'); } catch (_) { hadL = false; }
        try { u.searchParams.delete('logged'); } catch (_) { }
        if (hadL) { changed = true; changedLogged = true; }
      }
    }

    if (managed.reset) {
      var rm = jsqpGetStr(LS_JSQP_RESET_MODE, 'remove');
      if (rm === 'random') {
        var rnd = String(Math.random());
        try { u.searchParams.set('reset', rnd); } catch (_) { }
        changed = true;
        changedReset = true;
      } else if (rm === 'set') {
        var rv = jsqpGetStr(LS_JSQP_RESET_VALUE, '0');
        var curR = null;
        try { curR = u.searchParams.get('reset'); } catch (_) { curR = null; }
        try { u.searchParams.set('reset', String(rv)); } catch (_) { }
        if (String(curR) !== String(rv)) { changed = true; changedReset = true; }
      } else if (rm === 'remove') {
        var hadR = false;
        try { hadR = u.searchParams.has('reset'); } catch (_) { hadR = false; }
        try { u.searchParams.delete('reset'); } catch (_) { }
        if (hadR) { changed = true; changedReset = true; }
      }
    }

    if (!changed) return orig;

    var afterAbs = '';
    try { afterAbs = u.toString(); } catch (_) { afterAbs = beforeAbs; }

    try {
      if (afterAbs && afterAbs !== beforeAbs && BL.Log && typeof BL.Log.push === 'function') {
        var rule = '';
        if (changedOrigin) rule = rule ? (rule + ',origin') : 'origin';
        if (changedLogged) rule = rule ? (rule + ',logged') : 'logged';
        if (changedReset) rule = rule ? (rule + ',reset') : 'reset';

        BL.Log.push({
          ts: Date.now(),
          type: 'jsqp',
          action: 'rewrite',
          channel: 'jsqp',
          from: beforeAbs || orig,
          to: afterAbs || orig,
          rule: rule || null,
          dedupMs: 5000
        });
      }
    } catch (_) { }

    try {
      if (BL.cfg && BL.cfg.PERF_DEBUG && afterAbs && afterAbs !== beforeAbs) {
        if (BL.Console && BL.Console.info) BL.Console.info('[JSQP] ' + orig + ' -> ' + afterAbs);
        else if (window.console && console.log) console.log('[JSQP] ' + orig + ' -> ' + afterAbs);
      }
    } catch (_) { }

    return afterAbs || orig;
  };

	  var BUILTIN_RULES = [
	    { id: 'yandex', title: 'Yandex', reason: 'Yandex', lsKey: LS_BUILTIN_YANDEX, description: 'Блокировка доменов Yandex/ya.ru/yastatic.' },
	    { id: 'google', title: 'Google', reason: 'Google', lsKey: LS_BUILTIN_GOOGLE, description: 'Google/Analytics/Ads.' },
	    { id: 'youtube', title: 'YouTube', reason: 'YouTube', lsKey: LS_BUILTIN_YOUTUBE, description: 'youtube.com/ytimg/googlevideo.' },
	    { id: 'stats', title: 'Statistics', reason: 'Statistics', lsKey: LS_BUILTIN_STATS, description: 'Блокировка трекеров/статистики.' },
	    { id: 'bwa_cors', title: 'BWA:CORS', reason: 'BWA:CORS', lsKey: LS_BUILTIN_BWA_CORS, description: 'Блокировка bwa.to /cors/check.' }
	  ];

  function getBuiltinRule(id) {
    try {
      var t = String(id || '');
      for (var i = 0; i < BUILTIN_RULES.length; i++) if (BUILTIN_RULES[i].id === t) return BUILTIN_RULES[i];
    } catch (_) { }
    return null;
  }

  function isBuiltinEnabled(id) {
    var r = getBuiltinRule(id);
    if (!r) return true;
    return lsGetBool(r.lsKey, true);
  }

  function setBuiltinEnabled(id, enabled) {
    var r = getBuiltinRule(id);
    if (!r) return false;
    lsSetBool(r.lsKey, !!enabled);
    return true;
  }

  function getBuiltinRulesForUi() {
    var out = [];
    try {
      for (var i = 0; i < BUILTIN_RULES.length; i++) {
        var r = BUILTIN_RULES[i];
        out.push({
          id: r.id,
          title: r.title,
          description: r.description || '',
          enabled: isBuiltinEnabled(r.id)
        });
      }
    } catch (_) { }
    return out;
  }

	  var __userRulesCache = null;
	  var __userRulesCacheRaw = null;
	  var __userRulesParseError = '';
	  var __ruleIdLast = 0;
	  var __userRulesLastDiag = null;

  function isPlainObject(x) {
    try { return !!x && typeof x === 'object' && !Array.isArray(x); } catch (_) { return false; }
  }

		  function toNumId(v) { v = Math.floor(+v); return (v > 0 && isFinite(v)) ? v : 0; }
		  function nextRuleId(used) {
		    var id = (Date.now ? Date.now() : +new Date());
		    if (id <= __ruleIdLast) id = __ruleIdLast + 1;
		    while (used[id]) id++;
		    __ruleIdLast = id;
		    used[id] = 1;
		    return id;
		  }

		  function safeStringify(v) {
		    try {
		      var s = JSON.stringify(v);
		      if (typeof s === 'string') return s;
		    } catch (_) { }
		    return '<unstringifiable>';
		  }

	  function oneLine(s) {
	    try { s = (s === undefined || s === null) ? '' : String(s); } catch (_) { s = ''; }
	    if (!s) return '';
	    if (s.indexOf('\n') !== -1) s = s.split('\n').join(' ');
	    if (s.indexOf('\r') !== -1) s = s.split('\r').join(' ');
	    return s;
	  }

		  function previewRaw(raw, max) {
		    max = (typeof max === 'number' && max > 0) ? max : 160;
		    try {
		      if (raw === undefined || raw === null) return '';
		      if (typeof raw === 'string') {
		        var s = oneLine(raw);
		        return (s.length <= max) ? s : (s.slice(0, max - 1) + '…');
		      }
		      var j = '';
		      try { j = JSON.stringify(raw); } catch (_) { return '<unstringifiable>'; }
		      j = oneLine(j);
		      return (j.length <= max) ? j : (j.slice(0, max - 1) + '…');
		    } catch (_) { return '<unstringifiable>'; }
		  }

		  function lenRaw(raw) {
		    try {
		      if (raw === undefined || raw === null) return 0;
		      if (typeof raw === 'string') return raw.length;
		      var j = '';
		      try { j = JSON.stringify(raw); } catch (_) { j = ''; }
		      return j ? j.length : 0;
		    } catch (_) { return 0; }
		  }

	  function rawTypeOf(raw) {
	    try {
	      if (raw === null) return 'null';
	      if (raw === undefined) return 'undefined';
	      if (Array.isArray(raw)) return 'array';
	      return typeof raw;
	    } catch (_) { return 'unknown'; }
	  }

	  function rawFromKey(key) {
	    var ls = null;
	    var st = null;
	    var raw = null;
	    try { ls = localStorage.getItem(String(key)); } catch (_) { ls = null; }
	    try { if (window.Lampa && Lampa.Storage && typeof Lampa.Storage.get === 'function') st = Lampa.Storage.get(String(key)); } catch (_) { st = null; }
	    if (typeof ls === 'string') raw = ls;
	    else if (typeof st === 'string') raw = st;
	    else if (st !== undefined && st !== null) raw = st;
	    else raw = ls;
	    return { key: String(key), raw: raw, ls: ls, st: st };
	  }

	  function setKeyString(key, raw) {
	    raw = (raw === undefined || raw === null) ? '' : String(raw);
	    try { localStorage.setItem(String(key), raw); } catch (_) { }
	    try { if (window.Lampa && Lampa.Storage && typeof Lampa.Storage.set === 'function') Lampa.Storage.set(String(key), raw); } catch (_) { }
	  }

	  function delKey(key) {
	    try { localStorage.removeItem(String(key)); } catch (_) { }
	    try { if (window.Lampa && Lampa.Storage && typeof Lampa.Storage.set === 'function') Lampa.Storage.set(String(key), ''); } catch (_) { }
	  }

	  function parseUserRules(raw) {
	    var diag = {
	      rawType: rawTypeOf(raw),
	      rawLen: lenRaw(raw),
	      preview: previewRaw(raw, 160),
	      shape: '',
	      needRewrite: false,
	      dropped: 0,
	      total: 0
	    };

	    if (raw === undefined || raw === null || raw === '') {
	      diag.shape = 'empty';
	      diag.needRewrite = true;
	      return { ok: true, rules: [], err: '', diag: diag };
	    }

	    var arr = null;
	    var err = '';
	    var ex = null;
	    try {
	      if (typeof raw === 'string') {
	        var parsed = JSON.parse(raw);
	        if (Array.isArray(parsed)) { arr = parsed; diag.shape = 'json_array'; }
	        else if (parsed && typeof parsed === 'object' && Array.isArray(parsed.rules)) { arr = parsed.rules; diag.shape = 'json_object_rules'; diag.needRewrite = true; }
	        else err = 'unexpected json shape';
	      } else if (Array.isArray(raw)) {
	        arr = raw;
	        diag.shape = 'array';
	        diag.needRewrite = true;
	      } else if (raw && typeof raw === 'object') {
	        if (Array.isArray(raw.rules)) { arr = raw.rules; diag.shape = 'object_rules'; diag.needRewrite = true; }
	        else err = 'unexpected object shape';
	      } else {
	        err = 'unexpected raw type';
	      }
	    } catch (e) {
	      ex = e;
	      err = (e && e.message) ? String(e.message) : 'json parse error';
	    }

	    if (err) return { ok: false, rules: [], err: err, diag: diag, ex: ex };
	    if (!Array.isArray(arr)) return { ok: false, rules: [], err: 'not array', diag: diag };

	    diag.total = arr.length;

	    var out = [];
	    var dropped = 0;
	    for (var i = 0; i < arr.length; i++) {
	      var r = normalizeUserRule(arr[i]);
	      if (!r) { dropped++; continue; }
	      out.push(r);
	    }
	    diag.dropped = dropped;
	    if (dropped) diag.needRewrite = true;

	    return { ok: true, rules: out, err: '', diag: diag };
	  }

	  function logRulesParseError(key, res) {
	    try {
	      var d = res && res.diag ? res.diag : {};
	      var err = oneLine(res && res.err ? res.err : '');
	      var extra = 'key=' + String(key) + ' | rawType=' + String(d.rawType || '') + ' | rawLen=' + String(d.rawLen || 0)
	        + ' | preview=\"' + String(d.preview || '').replace(/\"/g, '\\\\\"') + '\" | err=\"' + String(err || '').replace(/\"/g, '\\\\\"') + '\"';
	      logCall(BL.Log, 'showWarn', 'Rules', 'parse error', extra);
	      try {
	        var ex = res && res.ex ? res.ex : null;
	        console.warn('[BlackLampa][Rules] parse error', {
	          key: String(key),
	          rawType: d.rawType,
	          rawLen: d.rawLen,
	          rawPreview: d.preview,
	          err: err,
	          stack: (ex && ex.stack) ? String(ex.stack) : ''
	        });
	      } catch (_) { }
	    } catch (_) { }
	  }

	  function loadUserRulesRaw() {
	    var r = rawFromKey(LS_USER_RULES);
	    __userRulesLastDiag = r;
	    return r.raw;
	  }

		  function escapeRe(s) {
		    try { return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
    catch (_) { try { return String(s || ''); } catch (__e) { return ''; } }
  }

  function matchPattern(urlStr, pattern) {
    try {
      var u = String(urlStr || '');
      var p = String(pattern || '').trim();
      if (!u || !p) return false;

      if (!matchPattern.__cache) matchPattern.__cache = Object.create(null);
      var cache = matchPattern.__cache;
      var c = cache[p];

      if (!c) {
        c = null;

        try {
          if (p.charAt(0) === '/' && p.lastIndexOf('/') > 1) {
            var last = p.lastIndexOf('/');
            var body = p.slice(1, last);
            var flags = p.slice(last + 1);
            if (!flags || /^[gimsuy]*$/.test(flags)) {
              if (!flags) flags = 'i';
              try { c = { kind: 're', re: new RegExp(body, flags) }; } catch (_) { c = null; }
            }
          }
        } catch (_) { c = null; }

        if (!c) {
          try {
            if (p.indexOf('*') !== -1) {
              var re = escapeRe(p).replace(/\\\*/g, '.*');
              try { c = { kind: 're', re: new RegExp(re, 'i') }; } catch (_) { c = null; }
            }
          } catch (_) { c = null; }
        }

        if (!c) {
          c = { kind: 'substr', lc: p.toLowerCase() };
        }

        cache[p] = c || 0;
      }

      if (c === 0) return false;
      if (!c) return false;
      if (c.kind === 'substr') return u.toLowerCase().indexOf(String(c.lc || '')) !== -1;
      if (c.kind === 're' && c.re) {
        try { c.re.lastIndex = 0; } catch (_) { }
        try { return c.re.test(u); } catch (_) { return false; }
      }
      return false;
    } catch (_) {
      return false;
    }
  }

  var ADV_CT_MAP = {
    'application/json': 'application/json; charset=utf-8',
    'application/javascript': 'application/javascript; charset=utf-8',
    'text/css': 'text/css; charset=utf-8',
    'text/html': 'text/html; charset=utf-8',
    'image/svg+xml': 'image/svg+xml; charset=utf-8',
    'image/png': 'image/png',
    'image/jpeg': 'image/jpeg',
    'image/gif': 'image/gif',
    'image/webp': 'image/webp',
    'image/x-icon': 'image/x-icon',
    'text/plain': 'text/plain; charset=utf-8'
  };

  function normalizeAdvancedContentType(ct) {
    try {
      var s = String(ct || '').trim();
      if (!s) return '';
      var base = s.split(';')[0].trim().toLowerCase();
      return ADV_CT_MAP[base] || s;
    } catch (_) {
      return '';
    }
  }

  function normalizeBodyMode(m) {
    try {
      var s = String(m || '').toLowerCase();
      if (s === 'minimal') return 'minimal';
      if (s === 'empty') return 'empty';
      return '';
    } catch (_) {
      return '';
    }
  }

		  function normalizeUserRule(rule) {
		    try {
		      if (!isPlainObject(rule)) return null;
	      var pat = '';
	      try { pat = String(rule.pattern || '').trim(); } catch (_) { pat = ''; }
	      if (!pat) return null;

	      var type = 'simple';
	      try { type = String(rule.type || 'simple'); } catch (_) { type = 'simple'; }
	      if (type !== 'advanced') type = 'simple';

      var enabled = true;
      try {
        if (typeof rule.enabled === 'boolean') enabled = rule.enabled;
        else if (typeof rule.enabled === 'number') enabled = rule.enabled !== 0;
        else if (typeof rule.enabled === 'string') enabled = !/^(0|false|off|no)$/i.test(String(rule.enabled || ''));
        else enabled = !!rule.enabled;
      } catch (_) { enabled = true; }

	      var out = { id: rule.id, enabled: enabled, pattern: pat, type: type };

      if (type === 'advanced') {
        var ct = '';
        var bm = '';
        try { if (rule.advanced && rule.advanced.contentType) ct = String(rule.advanced.contentType || ''); } catch (_) { ct = ''; }
        try { if (rule.advanced && rule.advanced.bodyMode) bm = String(rule.advanced.bodyMode || ''); } catch (_) { bm = ''; }
        ct = normalizeAdvancedContentType(ct);
        bm = normalizeBodyMode(bm) || 'empty';
        out.advanced = { contentType: ct, bodyMode: bm };
      }

      return out;
    } catch (_) {
      return null;
    }
  }

		  function loadUserRules() {
		    var raw = loadUserRulesRaw();
		    var missNew = (raw === undefined || raw === null || raw === '');
		    var rawOld = rawFromKey(LS_USER_RULES_OLD);
		    var hasOld = !(rawOld.raw === undefined || rawOld.raw === null || rawOld.raw === '');
		    var sig0 = '';
		    try { sig0 = missNew && hasOld ? ((typeof rawOld.raw === 'string') ? rawOld.raw : safeStringify(rawOld.raw)) : ((typeof raw === 'string') ? raw : safeStringify(raw)); } catch (_) { sig0 = ''; }
		    if (sig0 && sig0 === __userRulesCacheRaw && __userRulesCache) return __userRulesCache;

		    var res = parseUserRules(raw);

		    if (missNew && hasOld) {
		      var resOld = parseUserRules(rawOld.raw);
		      if (resOld.ok) {
		        raw = JSON.stringify(resOld.rules || []);
		        setKeyString(LS_USER_RULES, raw);
		        delKey(LS_USER_RULES_OLD);
		        logCall(BL.Log, 'showInfo', 'Keys', 'net rules migrated', LS_USER_RULES_OLD + ' -> ' + LS_USER_RULES);
		        res = parseUserRules(raw);
		      } else {
		        __userRulesParseError = 'parse';
		        logRulesParseError(LS_USER_RULES_OLD, resOld);
		        __userRulesCacheRaw = sig0;
		        return (__userRulesCache = []);
		      }
		    } else if (!res.ok) {
		      if (hasOld) {
		        var resOld2 = parseUserRules(rawOld.raw);
		        if (resOld2.ok) {
		          raw = JSON.stringify(resOld2.rules || []);
		          setKeyString(LS_USER_RULES, raw);
		          delKey(LS_USER_RULES_OLD);
		          logCall(BL.Log, 'showWarn', 'Keys', 'net rules recovered', 'invalid new, migrated ' + LS_USER_RULES_OLD);
		          res = parseUserRules(raw);
		        }
		      }
		    }

		    if (!res.ok) {
		      __userRulesParseError = 'parse';
		      logRulesParseError(LS_USER_RULES, res);
		      __userRulesCacheRaw = sig0;
		      return (__userRulesCache = []);
		    }

		    if (hasOld) delKey(LS_USER_RULES_OLD);

		    var rawSig = (typeof raw === 'string') ? raw : safeStringify(raw);
		    if (rawSig === __userRulesCacheRaw && __userRulesCache) return __userRulesCache;

		    __userRulesCacheRaw = rawSig;
		    __userRulesParseError = '';

		    var arr = res.rules || [];
		    var out = [];
		    var used = {};
		    var touched = false;

		    if (res.diag && res.diag.dropped) {
		      try { logCall(BL.Log, 'showInfo', 'Rules', 'dropped invalid rules', 'dropped=' + String(res.diag.dropped) + ' total=' + String(res.diag.total)); } catch (_) { }
		    }

		    for (var i = 0; i < arr.length; i++) {
		      var r = arr[i];
		      if (r) {
		        var id0 = r.id;
		        var id = toNumId(id0);
		        if (!id) {
		          id = nextRuleId(used);
		          touched = true;
		        } else {
		          while (used[id]) { id++; touched = true; }
		          used[id] = 1;
		          if (String(id0) !== String(id)) touched = true;
		        }
		        r.id = id;
		        out.push(r);
		      }
		    }

		    __userRulesCache = out;
		    if (touched || (res.diag && res.diag.needRewrite)) {
		      try { saveUserRules(out); } catch (_) { }
		    }
		    return out;
		  }

  function resetUserRules(reason) {
    try {
      var key = String(LS_USER_RULES || '');
      var cur = rawFromKey(key);
      var raw = cur.raw;
      if (raw === undefined || raw === null || raw === '') raw = rawFromKey(LS_USER_RULES_OLD).raw;

      var ts = Date.now ? Date.now() : +new Date();
      var backupKey = key + '_bad_' + String(ts);
      var b = '';
      if (raw !== undefined && raw !== null && raw !== '') {
        b = (typeof raw === 'string') ? raw : safeStringify(raw);
        try { localStorage.setItem(String(backupKey), b); } catch (_) { }
      }

      setKeyString(key, '[]');
      delKey(LS_USER_RULES_OLD);

      __userRulesCache = null;
      __userRulesCacheRaw = null;
      __userRulesParseError = '';

      logCall(BL.Log, 'showOk', 'Rules', 'reset', 'key=' + key + ' | backup=' + String(backupKey));
      try { console.info('[BlackLampa][Rules] reset', { key: key, backup: backupKey, reason: reason || '' }); } catch (_) { }
      return true;
    } catch (e) {
      logCall(BL.Log, 'showWarn', 'Rules', 'reset failed', e && e.message ? e.message : e);
      return false;
    }
  }

	  function saveUserRules(list) {
	    try {
	      var out = Array.isArray(list) ? list : [];
	      var raw = JSON.stringify(out);
	      __userRulesCache = out;
	      __userRulesCacheRaw = raw;
	      __userRulesParseError = '';
	      setKeyString(LS_USER_RULES, raw);
	    } catch (_) { }
	  }

  function getUserRulesForUi() {
    var list = [];
    try { list = loadUserRules(); } catch (_) { list = []; }
    var out = [];
    for (var i = 0; i < list.length; i++) {
      try {
        var r = list[i];
        out.push({
          id: String(r.id || ''),
          enabled: !!r.enabled,
          pattern: String(r.pattern || ''),
          type: String(r.type || 'simple'),
          advanced: r.advanced ? { contentType: String(r.advanced.contentType || ''), bodyMode: String(r.advanced.bodyMode || '') } : null
        });
      } catch (_) { }
    }
    return out;
  }

		  function addUserRule(rule) {
		    try {
		      var r = normalizeUserRule(rule);
		      if (!r) return null;
		      var list = loadUserRules();
		      if (__userRulesParseError) return null;

		      var used = {};
		      for (var i = 0; i < list.length; i++) used[list[i].id] = 1;
		      r.id = nextRuleId(used);

	      list.push(r);
	      saveUserRules(list);
	      return r.id;
	    } catch (_) {
      return null;
    }
  }

	  function setUserRuleEnabled(id, enabled) {
	    try {
	      var t = String(id || '');
	      if (!t) return false;
	      var list = loadUserRules();
	      if (__userRulesParseError) return false;
	      for (var i = 0; i < list.length; i++) {
	        if (String(list[i].id || '') === t) {
	          list[i].enabled = !!enabled;
	          saveUserRules(list);
          return true;
        }
      }
    } catch (_) { }
    return false;
  }

	  function removeUserRule(id) {
	    try {
	      var t = String(id || '');
	      if (!t) return false;
	      var list = loadUserRules();
	      if (__userRulesParseError) return false;
	      var out = [];
	      var removed = false;
	      for (var i = 0; i < list.length; i++) {
	        if (String(list[i].id || '') === t) removed = true;
        else out.push(list[i]);
      }
      if (removed) saveUserRules(out);
      return removed;
    } catch (_) {
      return false;
    }
  }

  function isBwaCorsCheck(url) {
    try {
      var host = String(url.hostname || '').toLowerCase();
      var path = String(url.pathname || '').toLowerCase();
      var isBwa = (host === 'bwa.to') || (host.length > 7 && host.slice(host.length - 7) === '.bwa.to');
      if (!isBwa) return false;
      return path.indexOf('/cors/check') === 0;
    } catch (_) {
      return false;
    }
  }

  function classifyBlocked(url) {
    try {
      if (!url) return null;
      if (isBwaCorsCheck(url) && isBuiltinEnabled('bwa_cors')) return { id: 'bwa_cors', label: 'BWA:CORS', reason: 'BWA:CORS' };

	      var h = String(url.hostname || '').toLowerCase();
	      if (!h) return null;

	      if (isBuiltinEnabled('yandex') && BLOCK_YANDEX_RE.test(h)) return { id: 'yandex', label: 'Yandex', reason: 'Yandex' };
	      if (isBuiltinEnabled('youtube') && BLOCK_YOUTUBE_RE.test(h)) return { id: 'youtube', label: 'YouTube', reason: 'YouTube' };
	      if (isBuiltinEnabled('google') && BLOCK_GOOGLE_RE.test(h)) return { id: 'google', label: 'Google', reason: 'Google' };
	      if (isBuiltinEnabled('stats') && BLOCK_STATS_RE.test(h)) return { id: 'stats', label: 'Statistics', reason: 'Statistics' };

	      return null;
	    } catch (_) {
	      return null;
	    }
	  }

  function parseUrlSafe(u) {
    try { return new URL(String(u), location.href); } catch (_) { }
    try {
      if (!document || !document.createElement) return null;
      var a = document.createElement('a');
      a.href = String(u || '');
      return {
        protocol: a.protocol,
        hostname: a.hostname,
        pathname: a.pathname,
        href: a.href
      };
    } catch (_) { }
    return null;
  }

	  function getBlockContext(u) {
	    try {
	      if (!u) return null;
	      if (!isPolicyEnabledFast()) return null;
	      var url = parseUrlSafe(u);
	      if (!url) return null;
	      var proto = String(url.protocol || '');
      if (proto !== 'http:' && proto !== 'https:' && proto !== 'ws:' && proto !== 'wss:') return null;

      var urlAbs = '';
      try { urlAbs = String(url.href || ''); } catch (_) { urlAbs = String(u || ''); }

      var ur = loadUserRules();
      for (var i = 0; i < ur.length; i++) {
        var r = ur[i];
        if (!r || !r.enabled) continue;
        if (!r.pattern) continue;
        if (!matchPattern(urlAbs, r.pattern)) continue;

        var ctx = {
          url: urlAbs,
          reason: 'User:' + String(r.id || i),
          ruleId: String(r.id || ''),
          ruleLabel: String(r.pattern || '')
        };

        if (r.type === 'advanced' && r.advanced) {
          var ct = '';
          var bm = '';
          try { if (r.advanced.contentType) ct = String(r.advanced.contentType || ''); } catch (_) { ct = ''; }
          try { if (r.advanced.bodyMode) bm = String(r.advanced.bodyMode || ''); } catch (_) { bm = ''; }
          ct = normalizeAdvancedContentType(ct);
          bm = normalizeBodyMode(bm);
          if (ct) ctx.overrideContentType = ct;
          if (bm) ctx.overrideBodyMode = bm;
        }

        return ctx;
      }

      var why = classifyBlocked(url);
      if (why && why.reason) return { url: urlAbs, reason: String(why.reason), ruleId: String(why.id || ''), ruleLabel: String(why.label || '') };
      return null;
    } catch (_) {
      return null;
    }
  }

  function isBlockedUrl(u) {
    try {
      var ctx = getBlockContext(u);
      return ctx && ctx.reason ? String(ctx.reason) : null;
    } catch (_) {
      return null;
	    }
	  }

	  function normalizeUrlString(u) { try { return String(u || ''); } catch (_) { return ''; } }

		  var __perfNetReq = 0;
		  var __perfNetBlocked = 0;
		  var __perfDebugLastTs = 0;
		  var __perfDebugLastReq = 0;

	  var NET_LOG_LIMIT_PER_SEC = 8;
	  var __netLogWinTs = 0;
	  var __netLogInWin = 0;
	  var __netLogSuppressed = 0;
	  var __netLogFlushTimer = null;

	  function getLogModeFast() {
	    try { if (BL.cfg && typeof BL.cfg.LOG_MODE === 'number') return BL.cfg.LOG_MODE || 0; } catch (_) { }
	    try {
	      var c = null;
	      try { c = (BL.Config && typeof BL.Config.get === 'function') ? BL.Config.get() : BL.Config; } catch (_) { c = BL.Config; }
	      if (c && typeof c.LOG_MODE === 'number') return c.LOG_MODE || 0;
	    } catch (_) { }
	    return 0;
	  }

		  function isLogEnabledFast() { return true; }

		  function flushNetLogSuppressed() {
		    try {
		      if (!__netLogSuppressed) return;
		      var n = __netLogSuppressed;
		      __netLogSuppressed = 0;
		      var line = '[BlackLampa][NET][BLOCK] +' + String(n) + ' logs suppressed (1s)';
		      if (BL.Log && typeof BL.Log.raw === 'function') return BL.Log.raw('WRN', line);
	      try { if (BL.Console && BL.Console.warn) return BL.Console.warn(line); } catch (_) { }
	      try { if (BL.Console && BL.Console.log) return BL.Console.log(line); } catch (_) { }
	    } catch (_) { }
	  }

	  function netLogAllow() {
	    try {
	      var now = Date.now();
	      if (!__netLogWinTs || (now - __netLogWinTs) >= 1000) {
	        __netLogWinTs = now;
	        __netLogInWin = 0;
	        flushNetLogSuppressed();
	      }

	      if (__netLogInWin < NET_LOG_LIMIT_PER_SEC) {
	        __netLogInWin++;
	        return true;
	      }

	      __netLogSuppressed++;
	      if (!__netLogFlushTimer) {
	        __netLogFlushTimer = setTimeout(function () {
	          __netLogFlushTimer = null;
	          flushNetLogSuppressed();
	        }, 1100);
	      }
	    } catch (_) { }
	    return false;
	  }

	  function guessFakePayload(context) {
	    context = context || {};
	    var urlStr = normalizeUrlString(context.url);
	    var reason = String(context.reason || '');
	    var overrideCt = '';
	    var overrideBody = '';
	    try { overrideCt = normalizeAdvancedContentType(context.overrideContentType || ''); } catch (_) { overrideCt = ''; }
	    try { overrideBody = normalizeBodyMode(context.overrideBodyMode || ''); } catch (_) { overrideBody = ''; }

	    var contentType = 'text/plain; charset=utf-8';
	    var bodyText = '';

	    try {
	      var url = new URL(urlStr, location.href);
	      var path = String(url.pathname || '').toLowerCase();

	      var isJson = (path.lastIndexOf('.json') === (path.length - 5));
	      var isJs = (path.lastIndexOf('.js') === (path.length - 3)) || (path.lastIndexOf('.mjs') === (path.length - 4));
	      var isCss = (path.lastIndexOf('.css') === (path.length - 4));
	      var isHtml = (path.lastIndexOf('.html') === (path.length - 5)) || (path.lastIndexOf('.htm') === (path.length - 4));

	      var ext = '';
	      try {
	        var dot = path.lastIndexOf('.');
	        if (dot >= 0) ext = path.slice(dot + 1);
	      } catch (_) { ext = ''; }

	      var isPng = ext === 'png';
	      var isJpg = ext === 'jpg' || ext === 'jpeg';
	      var isGif = ext === 'gif';
	      var isWebp = ext === 'webp';
	      var isSvg = ext === 'svg';
	      var isIco = ext === 'ico';

	      if (isJson || /blacklist/i.test(path) || String(reason).indexOf('CUB:blacklist') === 0) {
	        contentType = 'application/json; charset=utf-8';
	        bodyText = (/blacklist/i.test(path) || String(reason).indexOf('CUB:blacklist') === 0) ? '[]' : '{}';
	      } else if (isJs) {
	        contentType = 'application/javascript; charset=utf-8';
	        bodyText = '';
	      } else if (isCss) {
	        contentType = 'text/css; charset=utf-8';
	        bodyText = '';
	      } else if (isHtml) {
	        contentType = 'text/html; charset=utf-8';
	        bodyText = '';
	      } else if (isSvg) {
	        contentType = 'image/svg+xml; charset=utf-8';
	        bodyText = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';
	      } else if (isPng) {
	        contentType = 'image/png';
	        bodyText = '';
	      } else if (isJpg) {
	        contentType = 'image/jpeg';
	        bodyText = '';
	      } else if (isGif) {
	        contentType = 'image/gif';
	        bodyText = '';
	      } else if (isWebp) {
	        contentType = 'image/webp';
	        bodyText = '';
	      } else if (isIco) {
	        contentType = 'image/x-icon';
	        bodyText = '';
	      } else {
	        contentType = 'text/plain; charset=utf-8';
	        bodyText = '';
	      }
	    } catch (_) { }

	    try { if (overrideCt) contentType = overrideCt; } catch (_) { }
	    try {
	      if (overrideBody === 'empty') bodyText = '';
	      else if (overrideBody === 'minimal') {
	        var base = String(contentType || '').split(';')[0].trim().toLowerCase();
	        if (base === 'application/json') bodyText = '{}';
	        else if (base === 'image/svg+xml') bodyText = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';
	        else bodyText = '';
	      }
	    } catch (_) { }

	    return { contentType: contentType, bodyText: bodyText, url: urlStr };
	  }

	  function makeEventSafe(type) {
	    try { return new Event(type); } catch (_) { }
	    try {
	      var e = document.createEvent('Event');
	      e.initEvent(type, false, false);
	      return e;
	    } catch (_) { }
	    return null;
	  }

		  function noteBlocked(context) {
		    try {
		      context = context || {};
		      var url = normalizeUrlString(context.url);
		      var channel = String(context.type || context.channel || '');
		      var ruleId = '';
		      var ruleLabel = '';
		      try { ruleId = String(context.ruleId || ''); } catch (_) { ruleId = ''; }
		      try { ruleLabel = String(context.ruleLabel || ''); } catch (_) { ruleLabel = ''; }
		      if (!ruleId) {
		        var rr = String(context.reason || '');
		        if (rr.indexOf('User:') === 0) ruleId = rr.slice(5);
		      }
		      if (!ruleLabel) {
		        try { ruleLabel = String(context.reason || ''); } catch (_) { ruleLabel = ''; }
		      }
		      __netStatus.lastBlocked = { url: url, channel: channel, ruleId: ruleId, ruleLabel: ruleLabel, ts: Date.now() };
		    } catch (_) { }
		  }

		  BL.Net.noteBlocked = BL.Net.noteBlocked || noteBlocked;

			  BL.Net.logBlocked = BL.Net.logBlocked || function (context) {
			    try {
			      try { if (BL.cfg && BL.cfg.PERF_DEBUG) __perfNetBlocked++; } catch (_) { }
			      try { noteBlocked(context); } catch (_) { }
			      if (!netLogAllow()) return;

		      context = context || {};
		      var u = normalizeUrlString(context.url);
		      var t = String(context.type || '');
		      var r = String(context.reason || '');
		      var ruleId = '';
		      var ruleLabel = '';
		      try { ruleId = String(context.ruleId || ''); } catch (_) { ruleId = ''; }
		      try { ruleLabel = String(context.ruleLabel || ''); } catch (_) { ruleLabel = ''; }

		      try {
		        if (BL.Log && typeof BL.Log.push === 'function') {
		          var channel = 'other';
		          if (t === 'fetch') channel = 'fetch';
		          else if (t === 'xhr') channel = 'xhr';
		          else if (t === 'ws') channel = 'ws';
		          else if (t === 'script') channel = 'script';
		          else if (t === 'iframe') channel = 'iframe';

		          var type = 'block';
		          if (t === 'script') type = 'script';
		          else if (t === 'iframe') type = 'iframe';

		          var action = 'block';
		          if (t === 'script' || t === 'iframe' || t === 'img' || t === 'link') action = 'sanitize';

		          var rule = '';
		          if (ruleId && ruleLabel) rule = ruleId + ':' + ruleLabel;
		          else if (ruleId) rule = ruleId;
		          else if (ruleLabel) rule = ruleLabel;
		          else rule = r;
		          if (channel === 'other' && t) rule = String(t) + ':' + String(rule || '');

		          BL.Log.push({
		            ts: Date.now(),
		            type: type,
		            action: action,
		            channel: channel,
		            from: u,
		            to: (context && context.to !== undefined) ? context.to : null,
		            rule: rule || null,
		            dedupMs: 3000
		          });
		          return;
		        }
		      } catch (_) { }

		      var line = '[BlackLampa][NET][BLOCK][' + t + '] ' + r + ' ' + u;

		      try {
			        if (BL.Log && typeof BL.Log.raw === 'function') {
			          BL.Log.raw('WRN', line);
		          return;
	        }
	      } catch (_) { }

	      try { if (BL.Console && BL.Console.warn) return BL.Console.warn(line); } catch (_) { }
	      try { if (BL.Console && BL.Console.log) return BL.Console.log(line); } catch (_) { }
	    } catch (_) { }
		  };

	  function makeFetchResponse(payload) {
	    var bodyText = String(payload.bodyText || '');
	    var contentType = String(payload.contentType || 'text/plain; charset=utf-8');
	    var url = normalizeUrlString(payload.url);

	    try {
	      if (typeof Response === 'function') {
	        return new Response(bodyText, { status: 200, headers: { 'Content-Type': contentType } });
	      }
	    } catch (_) { }

	    return {
	      ok: true,
	      status: 200,
	      statusText: 'OK',
	      url: url,
	      headers: {
	        get: function (k) {
	          try {
	            if (!k) return null;
	            return (/content-type/i.test(String(k))) ? contentType : null;
	          } catch (_) { return null; }
	        }
	      },
	      text: function () { return Promise.resolve(bodyText); },
	      json: function () {
	        try { return Promise.resolve(JSON.parse(bodyText || '{}')); }
	        catch (_) { return Promise.resolve(null); }
	      },
	      clone: function () { return makeFetchResponse(payload); }
	    };
	  }

	  function applyFakeOkToXhr(xhr, payload) {
	    try {
	      var bodyText = String(payload.bodyText || '');
	      var contentType = String(payload.contentType || '');
	      var url = normalizeUrlString(payload.url);

	      try { Object.defineProperty(xhr, 'readyState', { value: 4, configurable: true }); } catch (_) { }
	      try { Object.defineProperty(xhr, 'status', { value: 200, configurable: true }); } catch (_) { }
	      try { Object.defineProperty(xhr, 'statusText', { value: 'OK', configurable: true }); } catch (_) { }
	      try { Object.defineProperty(xhr, 'responseURL', { value: url, configurable: true }); } catch (_) { }

	      var respVal = bodyText;
	      try {
	        if (xhr && xhr.responseType === 'json') respVal = JSON.parse(bodyText || 'null');
	      } catch (_) { respVal = null; }

	      try { Object.defineProperty(xhr, 'responseText', { value: bodyText, configurable: true }); } catch (_) { }
	      try { Object.defineProperty(xhr, 'response', { value: respVal, configurable: true }); } catch (_) { }

	      try {
	        if (typeof xhr.getResponseHeader !== 'function') {
	          xhr.getResponseHeader = function (k) {
	            try {
	              if (!k) return null;
	              return (/content-type/i.test(String(k))) ? contentType : null;
	            } catch (_) { return null; }
	          };
	        }
	      } catch (_) { }

	      try { if (xhr.onreadystatechange) xhr.onreadystatechange(); } catch (_) { }
	      try { if (xhr.onload) xhr.onload(); } catch (_) { }

	      try {
	        if (xhr.dispatchEvent) {
	          var e1 = makeEventSafe('readystatechange');
	          if (e1) xhr.dispatchEvent(e1);
	          var e2 = makeEventSafe('load');
	          if (e2) xhr.dispatchEvent(e2);
	        }
	      } catch (_) { }
	    } catch (_) { }
	  }

	  function makeFakeWebSocket(url, why) {
	    var ws = null;
	    try { ws = Object.create(window.WebSocket && window.WebSocket.prototype ? window.WebSocket.prototype : {}); }
	    catch (_) { ws = {}; }

	    try { ws.url = normalizeUrlString(url); } catch (_) { }
	    try { ws.readyState = 3; } catch (_) { } // CLOSED
	    try { ws.bufferedAmount = 0; } catch (_) { }
	    try { ws.extensions = ''; } catch (_) { }
	    try { ws.protocol = ''; } catch (_) { }
	    try { ws.binaryType = 'blob'; } catch (_) { }

	    ws.send = function () { };
	    ws.close = function () { };
	    ws.addEventListener = function () { };
	    ws.removeEventListener = function () { };
	    ws.dispatchEvent = function () { return false; };

	    ws.onopen = null;
	    ws.onmessage = null;
	    ws.onerror = null;
	    ws.onclose = null;

	    setTimeout(function () {
	      try {
	        if (typeof ws.onclose === 'function') {
	          ws.onclose({ type: 'close', code: 1000, reason: String(why || 'Blocked'), wasClean: true });
	        }
	      } catch (_) { }
	    }, 0);

	    return ws;
	  }

	  BL.Net.makeFakeOkResponse = BL.Net.makeFakeOkResponse || function (context) {
	    context = context || {};
	    var type = String(context.type || '');
	    var payload = guessFakePayload(context);

	    if (type === 'fetch') return makeFetchResponse(payload);
	    if (type === 'xhr') {
	      return {
	        ok: true,
	        status: 200,
	        statusText: 'OK',
	        url: payload.url,
	        contentType: payload.contentType,
	        bodyText: payload.bodyText,
	        applyToXhr: function (xhr) { applyFakeOkToXhr(xhr, payload); }
	      };
	    }
	    if (type === 'beacon') return true;
	    if (type === 'ws') return makeFakeWebSocket(payload.url, context.reason);

	    return { ok: true, status: 200, statusText: 'OK' };
	  };

	  function isCubBlacklistUrl(u) {
	    try {
	      if (!isPolicyEnabledFast()) return false;
	      if (!u) return false;
	      var url = new URL(String(u), location.href);
	      var host = String(url.hostname || '').toLowerCase();
	      var path = String(url.pathname || '').toLowerCase();
      return (host === 'cub.rip') && (path === '/api/plugins/blacklist');
    } catch (_) {
      return false;
    }
  }

		  function install(log) {
	    if (BL.PolicyNetwork.__installed) {
	      if (isLogEnabledFast()) logCall(log, 'showDbg', 'Policy', 'already installed', '');
	      return;
	    }
    BL.PolicyNetwork.__installed = true;

    try {
      setInterceptorActive('fetch', false);
      setInterceptorActive('xhr', false);
      setInterceptorActive('ws', false);
      setInterceptorActive('eventsource', false);
      setInterceptorActive('beacon', false);
      setInterceptorActive('iframe_src', false);
      setInterceptorActive('img_src', false);
      setInterceptorActive('script_src', false);
      setInterceptorActive('link_href', false);
      setInterceptorActive('open', false);
      setInterceptorActive('location', false);
    } catch (_) { }

    var cfg0 = null;
    try { cfg0 = (BL.Config && typeof BL.Config.get === 'function') ? BL.Config.get() : BL.Config; } catch (_) { cfg0 = BL.Config; }
    cfg0 = cfg0 || {};
    var PERF_DEBUG = false;
    try { PERF_DEBUG = !!cfg0.PERF_DEBUG; } catch (_) { PERF_DEBUG = false; }

    try { jsqpEnsureDefaultsOnce(); } catch (_) { }

    var UA_APPLY_FETCH = null;
    var UA_APPLY_XHR = null;
    try { UA_APPLY_FETCH = (window.BL && BL.UA && typeof BL.UA.applyHeadersToFetch === 'function') ? BL.UA.applyHeadersToFetch : null; } catch (_) { UA_APPLY_FETCH = null; }
    try { UA_APPLY_XHR = (window.BL && BL.UA && typeof BL.UA.applyHeadersToXhr === 'function') ? BL.UA.applyHeadersToXhr : null; } catch (_) { UA_APPLY_XHR = null; }

	    if (window.fetch) {
	      var origFetch = window.fetch.bind(window);
	      window.fetch = function (input, init) {
	        if (PERF_DEBUG) __perfNetReq++;
	        var u = (typeof input === 'string') ? input : (input && input.url) ? input.url : '';

          try {
            if (u && BL.Net && typeof BL.Net.rewriteJsQuery === 'function') {
              var nu = BL.Net.rewriteJsQuery(u);
              if (nu && nu !== u) {
                var applied = false;
                try {
                  if (typeof input === 'string') {
                    input = nu;
                    applied = true;
                  } else if (typeof URL !== 'undefined' && input instanceof URL) {
                    input = nu;
                    applied = true;
                  } else if (typeof Request !== 'undefined' && input instanceof Request) {
                    input = new Request(nu, input);
                    applied = true;
                  }
                } catch (_) { applied = false; }
                if (applied) u = nu;
              }
            }
          } catch (_) { }

          try {
            if (UA_APPLY_FETCH) {
              var uaR = UA_APPLY_FETCH(input, init);
              if (uaR && uaR.init) init = uaR.init;
              if (uaR && uaR.input !== undefined) input = uaR.input;
            }
          } catch (_) { }

				        if (isCubBlacklistUrl(u)) {
				          try {
				            if (log && typeof log.push === 'function') {
				              log.push({
			                ts: Date.now(),
			                type: 'network',
			                action: 'sanitize',
			                channel: 'fetch',
			                from: String(u),
			                to: '[]',
			                rule: 'CUB:blacklist',
			                dedupMs: 10000
			              });
			            } else if (isLogEnabledFast()) {
			              logCall(log, 'showOk', 'CUB', 'blacklist overridden', 'fetch | ' + String(u));
			            }
			          } catch (_) { }
			          return Promise.resolve(BL.Net.makeFakeOkResponse({ url: u, type: 'fetch', reason: 'CUB:blacklist' }));
			        }

	        var ctx = getBlockContext(u);
	        if (ctx && ctx.reason) {
	          var c = { url: ctx.url || u, type: 'fetch', reason: ctx.reason, ruleId: ctx.ruleId || '', ruleLabel: ctx.ruleLabel || '' };
	          try { if (ctx.overrideContentType) c.overrideContentType = ctx.overrideContentType; } catch (_) { }
	          try { if (ctx.overrideBodyMode) c.overrideBodyMode = ctx.overrideBodyMode; } catch (_) { }
	          BL.Net.logBlocked(c);
	          return Promise.resolve(BL.Net.makeFakeOkResponse(c));
	        }
	        return origFetch(input, init);
	      };
	      setInterceptorActive('fetch', true);
	    }

	    if (window.XMLHttpRequest) {
      var XHR = window.XMLHttpRequest;
      var origOpen = XHR.prototype.open;
      var origSend = XHR.prototype.send;

      XHR.prototype.open = function (method, url) {
        if (PERF_DEBUG) __perfNetReq++;
        var u = url;

        try { if (u && BL.Net && typeof BL.Net.rewriteJsQuery === 'function') u = BL.Net.rewriteJsQuery(u); } catch (_) { u = url; }

        this.__ap_url = u;
	        this.__ap_mock_cub_blacklist = isCubBlacklistUrl(u);
        this.__ap_block_ctx = getBlockContext(u);
        try { arguments[1] = u; } catch (_) { }
        return origOpen.apply(this, arguments);
      };

	      XHR.prototype.send = function () {
	        if (this.__ap_mock_cub_blacklist) {
	          var xhr0 = this;
	          var u0 = this.__ap_url;

			          setTimeout(function () {
			            try {
			              try {
			                if (log && typeof log.push === 'function') {
			                  log.push({
			                    ts: Date.now(),
			                    type: 'network',
			                    action: 'sanitize',
			                    channel: 'xhr',
			                    from: String(u0),
			                    to: '[]',
			                    rule: 'CUB:blacklist',
			                    dedupMs: 10000
			                  });
			                } else if (isLogEnabledFast()) {
			                  logCall(log, 'showOk', 'CUB', 'blacklist overridden', 'XHR | ' + String(u0));
			                }
			              } catch (_) { }
			              var fake = BL.Net.makeFakeOkResponse({ url: u0, type: 'xhr', reason: 'CUB:blacklist' });
			              if (fake && fake.applyToXhr) fake.applyToXhr(xhr0);
			            } catch (_) { }
			          }, 0);
		          return;
		        }

	        if (this.__ap_block_ctx && this.__ap_block_ctx.reason) {
	          var u = this.__ap_url;
	          var ctx = this.__ap_block_ctx;
	          var c = { url: ctx.url || u, type: 'xhr', reason: ctx.reason, ruleId: ctx.ruleId || '', ruleLabel: ctx.ruleLabel || '' };
	          try { if (ctx.overrideContentType) c.overrideContentType = ctx.overrideContentType; } catch (_) { }
	          try { if (ctx.overrideBodyMode) c.overrideBodyMode = ctx.overrideBodyMode; } catch (_) { }
	          BL.Net.logBlocked(c);

	          var xhr = this;
	          setTimeout(function () {
	            try {
	              var fake = BL.Net.makeFakeOkResponse(c);
	              if (fake && fake.applyToXhr) fake.applyToXhr(xhr);
	            } catch (_) { }
	          }, 0);
	          return;
	        }

          try { if (UA_APPLY_XHR) UA_APPLY_XHR(this); } catch (_) { }

	        return origSend.apply(this, arguments);
	      };
	      setInterceptorActive('xhr', true);
	    }

      try {
        if (window.HTMLScriptElement && HTMLScriptElement.prototype && !BL.PolicyNetwork.__jsqpScriptHooked) {
          BL.PolicyNetwork.__jsqpScriptHooked = true;
          setInterceptorActive('script_src', true);

          try {
            var _setAttr = HTMLScriptElement.prototype.setAttribute;
            if (typeof _setAttr === 'function') {
              HTMLScriptElement.prototype.setAttribute = function (name, value) {
                try {
                  if (String(name || '').toLowerCase() === 'src') {
                    try {
                      if (BL.Net && typeof BL.Net.rewriteJsQuery === 'function') value = BL.Net.rewriteJsQuery(value);
                    } catch (_) { }

                    var ctx = null;
                    try { ctx = getBlockContext(value); } catch (_) { ctx = null; }
                    if (ctx && ctx.reason) {
                      try { BL.Net.logBlocked({ url: ctx.url || value, type: 'script', reason: ctx.reason, ruleId: ctx.ruleId || '', ruleLabel: ctx.ruleLabel || '' }); } catch (_) { }
                      return;
                    }
                  }
                } catch (_) { }
                return _setAttr.call(this, name, value);
              };
            }
          } catch (_) { }

          try {
            var d = Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, 'src');
            if (d && d.set && d.configurable) {
              Object.defineProperty(HTMLScriptElement.prototype, 'src', {
                configurable: true,
                enumerable: d.enumerable,
                get: d.get,
                set: function (v) {
                  try { if (BL.Net && typeof BL.Net.rewriteJsQuery === 'function') v = BL.Net.rewriteJsQuery(v); } catch (_) { }

                  try {
                    var ctx = getBlockContext(v);
                    if (ctx && ctx.reason) {
                      try { BL.Net.logBlocked({ url: ctx.url || v, type: 'script', reason: ctx.reason, ruleId: ctx.ruleId || '', ruleLabel: ctx.ruleLabel || '' }); } catch (_) { }
                      return;
                    }
                  } catch (_) { }
                  return d.set.call(this, v);
                }
              });
            }
          } catch (_) { }
        }
      } catch (_) { }

      try {
        if (window.Element && Element.prototype && !BL.PolicyNetwork.__domSetAttrHooked) {
          var _elSetAttr = Element.prototype.setAttribute;
          if (typeof _elSetAttr === 'function') {
            BL.PolicyNetwork.__domSetAttrHooked = true;
            Element.prototype.setAttribute = function (name, value) {
              try {
                var n = String(name || '').toLowerCase();
                if (n === 'src' || n === 'href') {
                  var tag = '';
                  try { tag = this && this.tagName ? String(this.tagName).toLowerCase() : ''; } catch (_) { tag = ''; }
                  var channel = '';
                  if (tag === 'img') channel = 'img';
                  else if (tag === 'iframe') channel = 'iframe';
                  else if (tag === 'script') channel = 'script';
                  else if (tag === 'link') channel = 'link';

                  if (channel === 'script' && n === 'src') {
                    try { if (BL.Net && typeof BL.Net.rewriteJsQuery === 'function') value = BL.Net.rewriteJsQuery(value); } catch (_) { }
                  }

                  if (channel) {
                    var ctx = null;
                    try { ctx = getBlockContext(value); } catch (_) { ctx = null; }
                    if (ctx && ctx.reason) {
                      try { BL.Net.logBlocked({ url: ctx.url || value, type: channel, reason: ctx.reason, ruleId: ctx.ruleId || '', ruleLabel: ctx.ruleLabel || '' }); } catch (_) { }
                      return;
                    }
                  }
                }
              } catch (_) { }
              return _elSetAttr.call(this, name, value);
            };
          }
        }
      } catch (_) { }

      function patchUrlProp(proto, prop, channel, statusKey) {
        try {
          if (!proto || !Object.getOwnPropertyDescriptor || !Object.defineProperty) return false;
          var d0 = Object.getOwnPropertyDescriptor(proto, prop);
          if (!d0 || !d0.set || !d0.configurable) return false;
          if (d0.set && d0.set.__blNetWrapped) return true;

          var origSet = d0.set;
          var wrapped = function (v) {
            try {
              var ctx = getBlockContext(v);
              if (ctx && ctx.reason) {
                try { BL.Net.logBlocked({ url: ctx.url || v, type: channel, reason: ctx.reason, ruleId: ctx.ruleId || '', ruleLabel: ctx.ruleLabel || '' }); } catch (_) { }
                return;
              }
            } catch (_) { }
            return origSet.call(this, v);
          };
          try { wrapped.__blNetWrapped = true; } catch (_) { }

          Object.defineProperty(proto, prop, {
            configurable: true,
            enumerable: d0.enumerable,
            get: d0.get,
            set: wrapped
          });
          setInterceptorActive(statusKey, true);
          return true;
        } catch (_) {
          return false;
        }
      }

      try { if (window.HTMLIFrameElement && HTMLIFrameElement.prototype && !BL.PolicyNetwork.__iframeSrcHooked) { BL.PolicyNetwork.__iframeSrcHooked = true; patchUrlProp(HTMLIFrameElement.prototype, 'src', 'iframe', 'iframe_src'); } } catch (_) { }
      try { if (window.HTMLImageElement && HTMLImageElement.prototype && !BL.PolicyNetwork.__imgSrcHooked) { BL.PolicyNetwork.__imgSrcHooked = true; patchUrlProp(HTMLImageElement.prototype, 'src', 'img', 'img_src'); } } catch (_) { }
      try { if (window.HTMLLinkElement && HTMLLinkElement.prototype && !BL.PolicyNetwork.__linkHrefHooked) { BL.PolicyNetwork.__linkHrefHooked = true; patchUrlProp(HTMLLinkElement.prototype, 'href', 'link', 'link_href'); } } catch (_) { }

      try {
        function ensureDomObserver() {
          try {
            if (BL.PolicyNetwork.__domObserverInstalled) return true;
            if (!window.MutationObserver) return false;
            if (!document || !document.documentElement) return false;

            function sanitizeEl(el) {
              try {
                if (!el || el.nodeType !== 1) return;
                var tag = '';
                try { tag = el.tagName ? String(el.tagName).toLowerCase() : ''; } catch (_) { tag = ''; }

                var attr = '';
                var channel = '';
                if (tag === 'iframe') { attr = 'src'; channel = 'iframe'; }
                else if (tag === 'img') { attr = 'src'; channel = 'img'; }
                else if (tag === 'script') { attr = 'src'; channel = 'script'; }
                else if (tag === 'link') { attr = 'href'; channel = 'link'; }
                else return;

                var v = '';
                try { v = el.getAttribute(attr); } catch (_) { v = ''; }
                if (!v) return;

                var ctx = null;
                try { ctx = getBlockContext(v); } catch (_) { ctx = null; }
                if (!ctx || !ctx.reason) return;

                try { el.removeAttribute(attr); } catch (_) { }
	                if (tag === 'iframe') {
	                  try { el.setAttribute('src', 'about:blank'); } catch (_) { }
	                }

	                try { BL.Net.logBlocked({ url: ctx.url || v, type: channel, to: (tag === 'iframe') ? 'about:blank' : null, reason: ctx.reason, ruleId: ctx.ruleId || '', ruleLabel: ctx.ruleLabel || '' }); } catch (_) { }
	              } catch (_) { }
	            }

            function sanitizeNode(node) {
              try {
                if (!node) return;
                if (node.nodeType !== 1) return;
                sanitizeEl(node);
                if (node.querySelectorAll) {
                  var list = null;
                  try { list = node.querySelectorAll('iframe[src],img[src],script[src],link[href]'); } catch (_) { list = null; }
                  if (list && list.length) {
                    for (var i = 0; i < list.length; i++) sanitizeEl(list[i]);
                  }
                }
              } catch (_) { }
            }

            var mo = new MutationObserver(function (mutations) {
              try {
                for (var i = 0; i < mutations.length; i++) {
                  var m = mutations[i];
                  if (!m) continue;
                  if (m.type === 'attributes') {
                    sanitizeEl(m.target);
                  } else if (m.type === 'childList') {
                    var added = m.addedNodes || null;
                    if (!added || !added.length) continue;
                    for (var j = 0; j < added.length; j++) sanitizeNode(added[j]);
                  }
                }
              } catch (_) { }
            });

            mo.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['src', 'href'] });
            BL.PolicyNetwork.__domObserverInstalled = true;
            BL.PolicyNetwork.__domObserver = mo;
            return true;
          } catch (_) {
            return false;
          }
        }

        var needObserver = false;
        try { needObserver = !__netStatus.interceptors.iframe_src || !__netStatus.interceptors.img_src || !__netStatus.interceptors.link_href; } catch (_) { needObserver = true; }
        if (needObserver && ensureDomObserver()) {
          if (!__netStatus.interceptors.iframe_src) setInterceptorActive('iframe_src', true);
          if (!__netStatus.interceptors.img_src) setInterceptorActive('img_src', true);
          if (!__netStatus.interceptors.link_href) setInterceptorActive('link_href', true);
          if (!__netStatus.interceptors.script_src) setInterceptorActive('script_src', true);
        }
      } catch (_) { }

	    if (navigator.sendBeacon) {
	      var origBeacon = navigator.sendBeacon.bind(navigator);
	      navigator.sendBeacon = function (url, data) {
	        if (PERF_DEBUG) __perfNetReq++;
	        var ctx = getBlockContext(url);
	        if (ctx && ctx.reason) {
	          var c = { url: ctx.url || url, type: 'beacon', reason: ctx.reason, ruleId: ctx.ruleId || '', ruleLabel: ctx.ruleLabel || '' };
	          BL.Net.logBlocked(c);
	          return !!BL.Net.makeFakeOkResponse(c);
	        }
	        return origBeacon(url, data);
	      };
	      setInterceptorActive('beacon', true);
	    }

	    if (window.WebSocket) {
	      try {
	        if (!BL.PolicyNetwork.__wsHooked) {
	          BL.PolicyNetwork.__wsHooked = true;
	          var OrigWS = window.WebSocket;
	          window.WebSocket = function (url, protocols) {
	            if (PERF_DEBUG) __perfNetReq++;
	            var ctx = getBlockContext(url);
		            if (ctx && ctx.reason) {
		              var c = { url: ctx.url || url, type: 'ws', reason: ctx.reason, ruleId: ctx.ruleId || '', ruleLabel: ctx.ruleLabel || '' };
		              try {
		                if (BL.Net && typeof BL.Net.logBlocked === 'function') BL.Net.logBlocked(c);
		                else if (BL.Net && typeof BL.Net.noteBlocked === 'function') BL.Net.noteBlocked(c);
		              } catch (_) { }
		              return BL.Net.makeFakeOkResponse(c);
		            }
	            return (protocols !== undefined) ? new OrigWS(url, protocols) : new OrigWS(url);
	          };
	          window.WebSocket.prototype = OrigWS.prototype;
	          setInterceptorActive('ws', true);
	        }
	      } catch (_) { setInterceptorActive('ws', false); }
	    }

	    if (window.EventSource) {
	      try {
	        if (!BL.PolicyNetwork.__esHooked) {
	          BL.PolicyNetwork.__esHooked = true;
	          var OrigES = window.EventSource;

	          function makeFakeEventSource(url, why) {
	            var es = null;
	            try { es = Object.create(OrigES && OrigES.prototype ? OrigES.prototype : {}); } catch (_) { es = {}; }
	            try { es.url = normalizeUrlString(url); } catch (_) { }
	            try { es.readyState = 2; } catch (_) { } // CLOSED
	            es.onopen = null;
	            es.onmessage = null;
	            es.onerror = null;
	            es.close = function () { };
	            es.addEventListener = function () { };
	            es.removeEventListener = function () { };
	            setTimeout(function () {
	              try { if (typeof es.onerror === 'function') es.onerror({ type: 'error', message: String(why || 'Blocked') }); } catch (_) { }
	            }, 0);
	            return es;
	          }

	          window.EventSource = function (url, config) {
	            if (PERF_DEBUG) __perfNetReq++;
	            var ctx = getBlockContext(url);
	            if (ctx && ctx.reason) {
	              var c = { url: ctx.url || url, type: 'eventsource', reason: ctx.reason, ruleId: ctx.ruleId || '', ruleLabel: ctx.ruleLabel || '' };
	              try { BL.Net.logBlocked(c); } catch (_) { }
	              return makeFakeEventSource(c.url, c.reason);
	            }
	            return (config !== undefined) ? new OrigES(url, config) : new OrigES(url);
	          };
	          window.EventSource.prototype = OrigES.prototype;
	          setInterceptorActive('eventsource', true);
	        }
	      } catch (_) { setInterceptorActive('eventsource', false); }
	    }

	    try {
	      if (window.open && !BL.PolicyNetwork.__openHooked) {
	        BL.PolicyNetwork.__openHooked = true;
	        var _open = window.open;
	        window.open = function (url) {
	          try {
	            var ctx = getBlockContext(url);
	            if (ctx && ctx.reason) {
	              try { BL.Net.logBlocked({ url: ctx.url || url, type: 'open', reason: ctx.reason, ruleId: ctx.ruleId || '', ruleLabel: ctx.ruleLabel || '' }); } catch (_) { }
	              return null;
	            }
	          } catch (_) { }
	          return _open.apply(window, arguments);
	        };
	        setInterceptorActive('open', true);
	      }
	    } catch (_) { setInterceptorActive('open', false); }

	    try {
	      if (window.Location && Location.prototype && !BL.PolicyNetwork.__locHooked) {
	        BL.PolicyNetwork.__locHooked = true;
	        var _assign = Location.prototype.assign;
	        var _replace = Location.prototype.replace;
	        if (typeof _assign === 'function') {
	          Location.prototype.assign = function (url) {
	            try {
	              var ctx = getBlockContext(url);
	              if (ctx && ctx.reason) {
	                try { BL.Net.logBlocked({ url: ctx.url || url, type: 'location', reason: ctx.reason, ruleId: ctx.ruleId || '', ruleLabel: ctx.ruleLabel || '' }); } catch (_) { }
	                return;
	              }
	            } catch (_) { }
	            return _assign.apply(this, arguments);
	          };
	        }
	        if (typeof _replace === 'function') {
	          Location.prototype.replace = function (url) {
	            try {
	              var ctx = getBlockContext(url);
	              if (ctx && ctx.reason) {
	                try { BL.Net.logBlocked({ url: ctx.url || url, type: 'location', reason: ctx.reason, ruleId: ctx.ruleId || '', ruleLabel: ctx.ruleLabel || '' }); } catch (_) { }
	                return;
	              }
	            } catch (_) { }
	            return _replace.apply(this, arguments);
	          };
	        }
	        setInterceptorActive('location', true);
	      }
	    } catch (_) { setInterceptorActive('location', false); }

    try {
      if (PERF_DEBUG && !BL.PolicyNetwork.__perfDebugInstalled) {
        BL.PolicyNetwork.__perfDebugInstalled = true;
        __perfDebugLastTs = Date.now();
        __perfDebugLastReq = __perfNetReq;

        setInterval(function () {
          try {
            var now = Date.now();
            var dt = now - (__perfDebugLastTs || now);
            var curReq = __perfNetReq;
            var dReq = curReq - (__perfDebugLastReq || 0);
            __perfDebugLastTs = now;
            __perfDebugLastReq = curReq;

            var rps = dt > 0 ? (dReq * 1000 / dt) : 0;
            var lp = null;
            try { if (BL.Log && typeof BL.Log.perf === 'function') lp = BL.Log.perf(); } catch (_) { lp = null; }

            var mode = lp ? lp.mode : getLogModeFast();
            var lines = lp ? lp.lines : 0;
            var vis = lp ? lp.visible : false;
            var ws = !!BL.PolicyNetwork.__wsHooked;

            var msg = '[BlackLampa][PERF] NET:' + rps.toFixed(1) + ' req/s'
              + ' | BLOCK:' + String(__perfNetBlocked)
              + ' | LOG:mode=' + String(mode) + ' lines=' + String(lines)
              + ' | POPUP:' + (vis ? '1' : '0')
              + ' | WS:' + (ws ? '1' : '0');

            if (BL.Console && BL.Console.info) return BL.Console.info(msg);
            try { if (window.console && console.log) console.log(msg); } catch (_) { }
          } catch (_) { }
        }, 2000);
      }
    } catch (_) { }

	    if (isLogEnabledFast()) logCall(log, 'showOk', 'Policy', 'installed', 'Yandex + Google + YouTube + Statistics + BWA:CORS(/cors/check) + CUB:blacklist([])');
		  }

  BL.PolicyNetwork.install = install;
  BL.PolicyNetwork.isBlockedUrl = isBlockedUrl;

  BL.PolicyNetwork.blocklist = BL.PolicyNetwork.blocklist || {};
  BL.PolicyNetwork.blocklist.builtin = BL.PolicyNetwork.blocklist.builtin || {};
  BL.PolicyNetwork.blocklist.user = BL.PolicyNetwork.blocklist.user || {};
  BL.PolicyNetwork.blocklist.storage = BL.PolicyNetwork.blocklist.storage || {};

  BL.PolicyNetwork.blocklist.builtin.getAll = getBuiltinRulesForUi;
  BL.PolicyNetwork.blocklist.builtin.setEnabled = setBuiltinEnabled;
	  BL.PolicyNetwork.blocklist.user.getAll = getUserRulesForUi;
	  BL.PolicyNetwork.blocklist.user.getParseError = function () { return __userRulesParseError; };
	  BL.PolicyNetwork.blocklist.user.add = addUserRule;
	  BL.PolicyNetwork.blocklist.user.setEnabled = setUserRuleEnabled;
	  BL.PolicyNetwork.blocklist.user.remove = removeUserRule;
	  BL.PolicyNetwork.blocklist.user.reset = resetUserRules;

	  BL.PolicyNetwork.blocklist.storage.lsBuiltinYandex = LS_BUILTIN_YANDEX;
	  BL.PolicyNetwork.blocklist.storage.lsBuiltinGoogleLegacy = LS_BUILTIN_GOOGLE_LEGACY;
	  BL.PolicyNetwork.blocklist.storage.lsBuiltinGoogle = LS_BUILTIN_GOOGLE;
	  BL.PolicyNetwork.blocklist.storage.lsBuiltinYouTube = LS_BUILTIN_YOUTUBE;
	  BL.PolicyNetwork.blocklist.storage.lsBuiltinStats = LS_BUILTIN_STATS;
	  BL.PolicyNetwork.blocklist.storage.lsBuiltinBwaCors = LS_BUILTIN_BWA_CORS;
	  BL.PolicyNetwork.blocklist.storage.lsUserRules = LS_USER_RULES;
})();
