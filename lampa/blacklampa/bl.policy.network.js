(function () {
	  'use strict';

	  var BL = window.BL = window.BL || {};
	  BL.Net = BL.Net || {};
	  BL.PolicyNetwork = BL.PolicyNetwork || {};

	  function logCall(log, method, source, message, extra) {
	    try {
	      if (!log) return;
	      var fn = log[method];
      if (typeof fn === 'function') fn.call(log, source, message, extra);
    } catch (_) { }
  }

  // ============================================================================
  // NETWORK POLICY (как в старом autoplugin)
  //
  // Цель:
  // - блокировать трекеры/статистику и нежелательные домены (Yandex / Google / Stats)
  // - блокировать BWA CORS check (/cors/check) чтобы не засорять сеть
  // - подменять CUB blacklist на [] (чтобы внешние blacklist не отключали плагины)
  //
  // Важно: install() должен быть идемпотентным — он вызывается и в PHASE 0 (до auth),
  // и позже из AutoPlugin (на всякий случай).
  // ============================================================================
  var BLOCK_YANDEX_RE =
    /(^|\.)((yandex\.(ru|com|net|by|kz|ua|uz|tm|tj))|(ya\.ru)|(yastatic\.net)|(yandex\.(net|com)\.tr))$/i;

  var BLOCK_GOOGLE_YT_RE =
    /(^|\.)((google\.com)|(google\.[a-z.]+)|(gstatic\.com)|(googlesyndication\.com)|(googleadservices\.com)|(doubleclick\.net)|(googletagmanager\.com)|(google-analytics\.com)|(analytics\.google\.com)|(api\.google\.com)|(accounts\.google\.com)|(recaptcha\.net)|(youtube\.com)|(ytimg\.com)|(googlevideo\.com)|(youtu\.be)|(youtube-nocookie\.com))$/i;

  var BLOCK_STATS_RE =
    /(^|\.)((scorecardresearch\.com)|(quantserve\.com)|(cdn\.quantserve\.com)|(hotjar\.com)|(static\.hotjar\.com)|(mixpanel\.com)|(api\.mixpanel\.com)|(sentry\.io)|(o\\d+\\.ingest\\.sentry\\.io)|(datadoghq\\.com)|(segment\\.com)|(api\\.segment\\.io)|(amplitude\\.com)|(api\\.amplitude\\.com)|(branch\\.io)|(app-measurement\\.com))$/i;

  // ============================================================================
  // Blocklist settings (localStorage)
  // ============================================================================
  var LS_BUILTIN_YANDEX = 'bl_net_block_yandex_v1';
  var LS_BUILTIN_GOOGLE = 'bl_net_block_google_v1';
  var LS_BUILTIN_STATS = 'bl_net_block_stats_v1';
  var LS_BUILTIN_BWA_CORS = 'bl_net_block_bwa_cors_v1';
  var LS_USER_RULES = 'bl_net_user_rules_v1';

  function lsGet(key) { try { return localStorage.getItem(String(key)); } catch (_) { return null; } }
  function lsSet(key, val) { try { localStorage.setItem(String(key), String(val)); } catch (_) { } }

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

  var BUILTIN_RULES = [
    { id: 'yandex', title: 'Yandex', reason: 'Yandex', lsKey: LS_BUILTIN_YANDEX, description: 'Блокировка доменов Yandex/ya.ru/yastatic.' },
    { id: 'google', title: 'Google/YouTube', reason: 'Google/YouTube', lsKey: LS_BUILTIN_GOOGLE, description: 'Блокировка Google/YouTube/Analytics/Ads.' },
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

  // ============================================================================
  // User rules (localStorage)
  // ============================================================================
  var __userRulesCache = null;
  var __userRulesCacheRaw = null;

  function isPlainObject(x) {
    try { return !!x && typeof x === 'object' && !Array.isArray(x); } catch (_) { return false; }
  }

  function makeRuleId() {
    try {
      var t = Date.now().toString(36);
      var r = Math.random().toString(36).slice(2, 7);
      return 'r_' + t + '_' + r;
    } catch (_) {
      return 'r_' + String(+new Date());
    }
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

      // /regex/i
      if (p.charAt(0) === '/' && p.lastIndexOf('/') > 1) {
        var last = p.lastIndexOf('/');
        var body = p.slice(1, last);
        var flags = p.slice(last + 1);
        // Only treat as regex when flags look valid; otherwise it's a normal substring like "/path/to".
        if (!flags || /^[gimsuy]*$/.test(flags)) {
          if (!flags) flags = 'i';
          try { return new RegExp(body, flags).test(u); } catch (_) { return false; }
        }
      }

      // wildcard (*)
      if (p.indexOf('*') !== -1) {
        var re = escapeRe(p).replace(/\\\*/g, '.*');
        try { return new RegExp(re, 'i').test(u); } catch (_) { return false; }
      }

      // substring
      return u.toLowerCase().indexOf(p.toLowerCase()) !== -1;
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

  function normalizeUserRule(rule, idx) {
    try {
      if (!isPlainObject(rule)) return null;
      var pat = '';
      try { pat = String(rule.pattern || '').trim(); } catch (_) { pat = ''; }
      if (!pat) return null;

      var id = '';
      try { id = String(rule.id || '').trim(); } catch (_) { id = ''; }
      if (!id) id = 'legacy_' + String(idx != null ? idx : makeRuleId());

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

      var out = { id: id, enabled: enabled, pattern: pat, type: type };

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
    var raw = null;
    try { raw = lsGet(LS_USER_RULES); } catch (_) { raw = null; }
    if (raw === __userRulesCacheRaw && __userRulesCache) return __userRulesCache;

    __userRulesCacheRaw = raw;
    var arr = [];
    try { arr = raw ? JSON.parse(raw) : []; } catch (_) { arr = []; }
    if (!Array.isArray(arr)) arr = [];

    var out = [];
    var touched = false;
    for (var i = 0; i < arr.length; i++) {
      var r = normalizeUserRule(arr[i], i);
      if (r) {
        out.push(r);
        try {
          if (!arr[i] || !arr[i].id || String(arr[i].id || '').trim() !== String(r.id)) touched = true;
        } catch (_) { }
      }
    }

    __userRulesCache = out;
    if (touched) {
      try { saveUserRules(out); } catch (_) { }
    }
    return out;
  }

  function saveUserRules(list) {
    try {
      var out = Array.isArray(list) ? list : [];
      var raw = JSON.stringify(out);
      __userRulesCache = out;
      __userRulesCacheRaw = raw;
      lsSet(LS_USER_RULES, raw);
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
      var r = normalizeUserRule(rule, null);
      if (!r) return null;
      if (!r.id || r.id.indexOf('legacy_') === 0) r.id = makeRuleId();

      var list = loadUserRules();
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
      if (isBwaCorsCheck(url) && isBuiltinEnabled('bwa_cors')) return 'BWA:CORS';

      var h = String(url.hostname || '').toLowerCase();
      if (!h) return null;

      if (isBuiltinEnabled('yandex') && BLOCK_YANDEX_RE.test(h)) return 'Yandex';
      if (isBuiltinEnabled('google') && BLOCK_GOOGLE_YT_RE.test(h)) return 'Google/YouTube';
      if (isBuiltinEnabled('stats') && BLOCK_STATS_RE.test(h)) return 'Statistics';

      return null;
    } catch (_) {
      return null;
    }
  }

  function getBlockContext(u) {
    try {
      if (!u) return null;
      var url = new URL(String(u), location.href);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

      var urlAbs = '';
      try { urlAbs = String(url.href || ''); } catch (_) { urlAbs = String(u || ''); }

      // User rules first (more specific).
      var ur = loadUserRules();
      for (var i = 0; i < ur.length; i++) {
        var r = ur[i];
        if (!r || !r.enabled) continue;
        if (!r.pattern) continue;
        if (!matchPattern(urlAbs, r.pattern)) continue;

        var ctx = { url: urlAbs, reason: 'User:' + String(r.id || i) };

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
      if (why) return { url: urlAbs, reason: why };
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

	  // ============================================================================
	  // Unified blocking model:
	  //   block => fake "OK" response + mandatory WRN log
	  // ============================================================================
	  function normalizeUrlString(u) { try { return String(u || ''); } catch (_) { return ''; } }

		  // Perf counters + rate-limited logging (must be ultra-cheap).
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

		  // Logging is always recorded (ring buffer). Mode only affects auto-popup/UI.
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

	    // Advanced overrides (user rules).
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

		  BL.Net.logBlocked = BL.Net.logBlocked || function (context) {
		    try {
		      try { if (BL.cfg && BL.cfg.PERF_DEBUG) __perfNetBlocked++; } catch (_) { }
		      if (!netLogAllow()) return;

	      context = context || {};
	      var u = normalizeUrlString(context.url);
	      var t = String(context.type || '');
	      var r = String(context.reason || '');
	      var line = '[BlackLampa][NET][BLOCK][' + t + '] ' + r + ' ' + u;

		      // Prefer popup logger (and its console mirror) when available.
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

	      // Best-effort header getter.
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

  // [ADDED] CUB blacklist override (return empty array)
  function isCubBlacklistUrl(u) {
    try {
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
	    // idempotency guard (do not wrap fetch/xhr/ws twice)
	    if (BL.PolicyNetwork.__installed) {
	      if (isLogEnabledFast()) logCall(log, 'showDbg', 'Policy', 'already installed', '');
	      return;
	    }
    BL.PolicyNetwork.__installed = true;

    // Config flags (read once at install)
    var cfg0 = null;
    try { cfg0 = (BL.Config && typeof BL.Config.get === 'function') ? BL.Config.get() : BL.Config; } catch (_) { cfg0 = BL.Config; }
    cfg0 = cfg0 || {};
    var NET_HOOK_WS = false;
    try { NET_HOOK_WS = !!cfg0.NET_HOOK_WS; } catch (_) { NET_HOOK_WS = false; }
    var PERF_DEBUG = false;
    try { PERF_DEBUG = !!cfg0.PERF_DEBUG; } catch (_) { PERF_DEBUG = false; }

	    if (window.fetch) {
	      var origFetch = window.fetch.bind(window);
	      window.fetch = function (input, init) {
	        if (PERF_DEBUG) __perfNetReq++;
	        var u = (typeof input === 'string') ? input : (input && input.url) ? input.url : '';

		        if (isCubBlacklistUrl(u)) {
		          if (isLogEnabledFast()) logCall(log, 'showOk', 'CUB', 'blacklist overridden', 'fetch | ' + String(u));
		          return Promise.resolve(BL.Net.makeFakeOkResponse({ url: u, type: 'fetch', reason: 'CUB:blacklist' }));
		        }

	        var ctx = getBlockContext(u);
	        if (ctx && ctx.reason) {
	          var c = { url: ctx.url || u, type: 'fetch', reason: ctx.reason };
	          try { if (ctx.overrideContentType) c.overrideContentType = ctx.overrideContentType; } catch (_) { }
	          try { if (ctx.overrideBodyMode) c.overrideBodyMode = ctx.overrideBodyMode; } catch (_) { }
	          BL.Net.logBlocked(c);
	          return Promise.resolve(BL.Net.makeFakeOkResponse(c));
	        }
	        return origFetch(input, init);
	      };
	    }

	    if (window.XMLHttpRequest) {
      var XHR = window.XMLHttpRequest;
      var origOpen = XHR.prototype.open;
      var origSend = XHR.prototype.send;

      XHR.prototype.open = function (method, url) {
        if (PERF_DEBUG) __perfNetReq++;
        this.__ap_url = url;
        this.__ap_mock_cub_blacklist = isCubBlacklistUrl(url);
        this.__ap_block_ctx = getBlockContext(url);
        return origOpen.apply(this, arguments);
      };

	      XHR.prototype.send = function () {
	        if (this.__ap_mock_cub_blacklist) {
	          var xhr0 = this;
	          var u0 = this.__ap_url;

		          setTimeout(function () {
		            try {
		              if (isLogEnabledFast()) logCall(log, 'showOk', 'CUB', 'blacklist overridden', 'XHR | ' + String(u0));
		              var fake = BL.Net.makeFakeOkResponse({ url: u0, type: 'xhr', reason: 'CUB:blacklist' });
		              if (fake && fake.applyToXhr) fake.applyToXhr(xhr0);
		            } catch (_) { }
		          }, 0);
	          return;
	        }

	        if (this.__ap_block_ctx && this.__ap_block_ctx.reason) {
	          var u = this.__ap_url;
	          var ctx = this.__ap_block_ctx;
	          var c = { url: ctx.url || u, type: 'xhr', reason: ctx.reason };
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
	        return origSend.apply(this, arguments);
	      };
	    }

	    if (navigator.sendBeacon) {
	      var origBeacon = navigator.sendBeacon.bind(navigator);
	      navigator.sendBeacon = function (url, data) {
	        if (PERF_DEBUG) __perfNetReq++;
	        var ctx = getBlockContext(url);
	        if (ctx && ctx.reason) {
	          var c = { url: ctx.url || url, type: 'beacon', reason: ctx.reason };
	          BL.Net.logBlocked(c);
	          return !!BL.Net.makeFakeOkResponse(c);
	        }
	        return origBeacon(url, data);
	      };
	    }

	    if (window.WebSocket) {
	      if (NET_HOOK_WS) {
	        BL.PolicyNetwork.__wsHooked = true;
	        var OrigWS = window.WebSocket;
	        window.WebSocket = function (url, protocols) {
	          if (PERF_DEBUG) __perfNetReq++;
	          var ctx = getBlockContext(url);
	          if (ctx && ctx.reason) {
	            var c = { url: ctx.url || url, type: 'ws', reason: ctx.reason };
	            // WebSocket must never be logged (even when logging is enabled).
	            return BL.Net.makeFakeOkResponse(c);
	          }
	          return (protocols !== undefined) ? new OrigWS(url, protocols) : new OrigWS(url);
	        };
	        window.WebSocket.prototype = OrigWS.prototype;
	      } else {
	        BL.PolicyNetwork.__wsHooked = false;
	      }
	    }

    // Optional perf diagnostics (disabled by default)
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

    if (isLogEnabledFast()) logCall(log, 'showOk', 'Policy', 'installed', 'Yandex + Google/YouTube + Statistics + BWA:CORS(/cors/check) + CUB:blacklist([])');
	  }

  BL.PolicyNetwork.install = install;
  BL.PolicyNetwork.isBlockedUrl = isBlockedUrl;

  // UI/API for AutoPlugin Installer → URL Blocklist
  BL.PolicyNetwork.blocklist = BL.PolicyNetwork.blocklist || {};
  BL.PolicyNetwork.blocklist.builtin = BL.PolicyNetwork.blocklist.builtin || {};
  BL.PolicyNetwork.blocklist.user = BL.PolicyNetwork.blocklist.user || {};
  BL.PolicyNetwork.blocklist.storage = BL.PolicyNetwork.blocklist.storage || {};

  BL.PolicyNetwork.blocklist.builtin.getAll = getBuiltinRulesForUi;
  BL.PolicyNetwork.blocklist.builtin.setEnabled = setBuiltinEnabled;
  BL.PolicyNetwork.blocklist.user.getAll = getUserRulesForUi;
  BL.PolicyNetwork.blocklist.user.add = addUserRule;
  BL.PolicyNetwork.blocklist.user.setEnabled = setUserRuleEnabled;
  BL.PolicyNetwork.blocklist.user.remove = removeUserRule;

  BL.PolicyNetwork.blocklist.storage.lsBuiltinYandex = LS_BUILTIN_YANDEX;
  BL.PolicyNetwork.blocklist.storage.lsBuiltinGoogle = LS_BUILTIN_GOOGLE;
  BL.PolicyNetwork.blocklist.storage.lsBuiltinStats = LS_BUILTIN_STATS;
  BL.PolicyNetwork.blocklist.storage.lsBuiltinBwaCors = LS_BUILTIN_BWA_CORS;
  BL.PolicyNetwork.blocklist.storage.lsUserRules = LS_USER_RULES;
})();
