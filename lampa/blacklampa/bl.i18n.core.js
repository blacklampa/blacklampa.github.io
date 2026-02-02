(function () {
  'use strict';

  var BL = window.BL = window.BL || {};

  if (BL.t && BL.lang) return;

  var FALLBACK_CFG = {
    langDefault: 'ru',
    langStorageKey: 'blacklampa_lang',
    i18n: {
      preferJson: true,
      dictBasePath: '',
      fallbackToKey: true
    }
  };

  function safe(fn, fallback) { try { return fn(); } catch (_) { return fallback; } }

  function getCfg() {
    var c = null;
    try { c = (window.BL && BL.Config) ? BL.Config : null; } catch (_) { c = null; }
    try { if (c && typeof c.get === 'function') c = c.get() || c; } catch (_) { }
    return c || FALLBACK_CFG;
  }

  function lsGet(k) { return safe(function () { return localStorage.getItem(String(k)); }, null); }
  function lsSet(k, v) { safe(function () { localStorage.setItem(String(k), String(v)); }); }

  function getLang() {
    var cfg = getCfg();
    var key = safe(function () { return String(cfg.langStorageKey || FALLBACK_CFG.langStorageKey); }, FALLBACK_CFG.langStorageKey);
    var def = safe(function () { return String(cfg.langDefault || FALLBACK_CFG.langDefault); }, FALLBACK_CFG.langDefault);

    var v = lsGet(key);
    if (v === null || v === undefined) return def;
    v = String(v || '').trim().toLowerCase();
    return v || def;
  }

  function resolveUrl(p) {
    try {
      var base = (BL.ctx && BL.ctx.base) ? String(BL.ctx.base) : String(location.href);
      return String(new URL(String(p), base).href);
    } catch (_) {
      return String(p);
    }
  }

  function isPlainObject(x) {
    try { return !!x && typeof x === 'object' && !Array.isArray(x); } catch (_) { return false; }
  }

  function cloneDict(d) {
    try { return isPlainObject(d) ? JSON.parse(JSON.stringify(d)) : {}; } catch (_) { return {}; }
  }

  var I18N = BL.I18N = BL.I18N || {};
  I18N.dicts = I18N.dicts || {};

  try { if (BL.I18N_RU && !I18N.dicts.ru) I18N.dicts.ru = cloneDict(BL.I18N_RU); } catch (_) { }

  function setDict(lang, dict) {
    try { I18N.dicts[String(lang || '')] = cloneDict(dict || {}); } catch (_) { }
  }

  function getDict(lang) {
    try { return I18N.dicts[String(lang || '')] || null; } catch (_) { return null; }
  }

  function format(str, vars) {
    try {
      if (!vars || !isPlainObject(vars)) return String(str);
      return String(str).replace(/\{([^}]+)\}/g, function (_, k) {
        try {
          var v = vars[k];
          if (v === undefined || v === null) return '';
          return String(v);
        } catch (_) {
          return '';
        }
      });
    } catch (_) {
      return String(str);
    }
  }

  function t(key, vars) {
    key = String(key || '');
    var lang = getLang();
    var d = getDict(lang);
    var str = null;
    try { if (d && d[key] !== undefined) str = d[key]; } catch (_) { str = null; }

    if (str === null || str === undefined) {
      var cfg = getCfg();
      var fb = true;
      try { fb = !!(cfg && cfg.i18n && cfg.i18n.fallbackToKey); } catch (_) { fb = true; }
      str = fb ? key : '';
    }
    return format(str, vars);
  }

  function loadJson(lang) {
    lang = String(lang || 'ru');
    try {
      var cfg = getCfg();
      var prefer = true;
      try { prefer = !!(cfg && cfg.i18n && cfg.i18n.preferJson); } catch (_) { prefer = true; }
      if (!prefer) return;
      if (!window.fetch) return;

      var basePath = '';
      try { basePath = String(cfg && cfg.i18n && cfg.i18n.dictBasePath ? cfg.i18n.dictBasePath : ''); } catch (_) { basePath = ''; }
      basePath = String(basePath || '');
      if (basePath && basePath.charAt(basePath.length - 1) !== '/') basePath = basePath + '/';

      var url = resolveUrl(basePath + 'bl.i18n.' + lang + '.json');
      fetch(url, { cache: 'no-cache' }).then(function (r) {
        if (!r || !r.ok) throw new Error('fetch fail');
        return r.json();
      }).then(function (json) {
        if (isPlainObject(json)) setDict(lang, json);
      })['catch'](function () { /* silent */ });
    } catch (_) { }
  }

  BL.lang = function () { return getLang(); };
  BL.setLang = function (lang) {
    var cfg = getCfg();
    var key = safe(function () { return String(cfg.langStorageKey || FALLBACK_CFG.langStorageKey); }, FALLBACK_CFG.langStorageKey);
    var def = safe(function () { return String(cfg.langDefault || FALLBACK_CFG.langDefault); }, FALLBACK_CFG.langDefault);
    var v = String(lang || def);
    lsSet(key, v);
    loadJson(v);
  };
  BL.t = t;
  BL.I18N.setDict = setDict;
  BL.I18N.getDict = getDict;
  BL.I18N.loadJson = loadJson;

  loadJson(getLang());
})();
