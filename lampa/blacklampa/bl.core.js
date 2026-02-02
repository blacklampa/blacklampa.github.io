(function () {
  'use strict';

  var BL = window.BL = window.BL || {};
  BL.Core = BL.Core || {};
  BL.Console = BL.Console || {};

  function safe(fn, fallback) {
    try { return fn(); } catch (_) { return fallback; }
  }

  function toInt(x, d) {
    var n = parseInt(x, 10);
    return isNaN(n) ? d : n;
  }

  function fmtErr(e) {
    try {
      if (!e) return 'unknown error';
      if (typeof e === 'string') return e;
      if (e && e.message) return e.message;
      return String(e);
    } catch (_) {
      return 'unknown error';
    }
  }

  function getQueryParam(name) {
    try {
      var s = String(location.search || '');
      if (!s) return null;
      if (s.charAt(0) === '?') s = s.slice(1);
      var parts = s.split('&');
      for (var i = 0; i < parts.length; i++) {
        var kv = parts[i].split('=');
        if (decodeURIComponent(kv[0] || '') === name) return decodeURIComponent(kv[1] || '');
      }
    } catch (_) { }
    return null;
  }

  function absUrl(u, base) {
    try { return String(new URL(String(u), base || location.href).href); }
    catch (_) { return String(u); }
  }

  function loadScript(url, opts) {
    return new Promise(function (resolve, reject) {
      try {
        opts = opts || {};
        var s = document.createElement('script');
        s.src = url;
        s.async = opts.async ? true : false;
        s.onload = function () { resolve(true); };
        s.onerror = function () { reject(new Error('load fail: ' + url)); };
        (document.head || document.documentElement).appendChild(s);
      } catch (e) {
        reject(e);
      }
    });
  }

  function loadScriptSeq(urls, opts) {
    return new Promise(function (resolve, reject) {
      opts = opts || {};
      if (!urls || !urls.length) return resolve(true);

      var i = 0;
      function next() {
        if (i >= urls.length) return resolve(true);
        var u = String(urls[i++]);
        loadScript(u, { async: false }).then(function () {
          setTimeout(next, 0);
        }).catch(function (e) {
          if (opts.continueOnError) {
            try { if (opts.onError) opts.onError(u, e); } catch (_) { }
            setTimeout(next, 0);
            return;
          }
          reject(e);
        });
      }
      next();
    });
  }

  function loadJson(url, opts) {
    opts = opts || {};
    var cache = opts.cache || 'no-store';

    return new Promise(function (resolve, reject) {
      try {
        if (window.fetch) {
          fetch(url, { cache: cache }).then(function (r) {
            if (!r) throw new Error('no response');
            return r.json();
          }).then(resolve).catch(reject);
          return;
        }

        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        try { xhr.setRequestHeader('Cache-Control', cache); } catch (_) { }
        xhr.onreadystatechange = function () {
          if (xhr.readyState !== 4) return;
          if (xhr.status >= 200 && xhr.status < 300) {
            try { resolve(JSON.parse(xhr.responseText || '{}')); } catch (e) { reject(e); }
          } else {
            reject(new Error('xhr status ' + String(xhr.status)));
          }
        };
        xhr.onerror = function () { reject(new Error('xhr error')); };
        xhr.send(null);
      } catch (e2) {
        reject(e2);
      }
    });
  }

  BL.Core.safe = safe;
  BL.Core.toInt = toInt;
  BL.Core.fmtErr = fmtErr;
  BL.Core.getQueryParam = getQueryParam;
  BL.Core.absUrl = absUrl;
  BL.Core.loadScript = loadScript;
  BL.Core.loadScriptSeq = loadScriptSeq;
  BL.Core.loadJson = loadJson;

  // ============================================================================
  // Clean console (iframe console)
  //
  // Lampa may wrap/override window.console. To keep consistent levels (warn/info/error)
  // we use a "clean" console from a hidden iframe when possible.
  // Must be safe for TV/old environments: always fallback to window.console.
  // ============================================================================
  var __cleanConsole = null;
  var __cleanConsoleTried = false;

  function getCleanConsole() {
    try {
      if (__cleanConsole) return __cleanConsole;
      if (__cleanConsoleTried && !document) return window.console;

      if (!document || !document.documentElement || !document.createElement) return window.console;

      // Retry until DOM is available; once we try with DOM, remember the outcome.
      __cleanConsoleTried = true;

      var iframe = document.createElement('iframe');
      iframe.style.display = 'none';

      document.documentElement.appendChild(iframe);

      if (iframe && iframe.contentWindow && iframe.contentWindow.console) {
        __cleanConsole = iframe.contentWindow.console;
        return __cleanConsole;
      }
    } catch (_) { }

    try { return window.console; } catch (_) { return null; }
  }

  function consoleCall(method, args) {
    try {
      var c = getCleanConsole();
      if (!c) return;
      var fn = null;

      try { fn = c[method]; } catch (_) { fn = null; }
      if (typeof fn !== 'function') {
        try { fn = c.log; } catch (_) { fn = null; }
      }
      if (typeof fn !== 'function') return;
      fn.apply(c, args);
    } catch (_) { }
  }

  BL.Console.get = getCleanConsole;
  BL.Console.log = function () { consoleCall('log', arguments); };
  BL.Console.info = function () { consoleCall('info', arguments); };
  BL.Console.warn = function () { consoleCall('warn', arguments); };
  BL.Console.error = function () { consoleCall('error', arguments); };
  BL.Console.debug = function () { consoleCall('debug', arguments); };
  BL.Console.table = function () { consoleCall('table', arguments); };
})();
