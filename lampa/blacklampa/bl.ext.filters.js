(function () {
  'use strict';

  var BL = window.BL = window.BL || {};
  BL.ExtFilters = BL.ExtFilters || {};

  var API = BL.ExtFilters;
  if (API.__blExtFiltersLoaded) return;
  API.__blExtFiltersLoaded = true;

  var LS_KEY = (BL.Keys && BL.Keys.ext_filters) ? BL.Keys.ext_filters : 'blacklampa_ext_filters';

  var KEY_ORIG_RATING = '__bl_ext_filters_v1_orig_rating';
  var KEY_PATCHED_RATING = '__bl_ext_filters_v1_patched_rating';
  var KEY_ORIG_SORT = '__bl_ext_filters_v1_orig_sort';
  var KEY_PATCHED_SORT = '__bl_ext_filters_v1_patched_sort';

  var KEY_SELECT_WRAPPED = '__bl_ext_filters_v1_select_wrapped';
  var KEY_REQ_HOOKED = '__bl_ext_filters_v1_req_hooked';

  var KEY_FILTER_SORT_NODE = '__bl_ext_filters_v1_filter_sort_node';
  var KEY_FILTER_SESSION_ACTIVE = '__bl_ext_filters_v1_filter_session_active';
  var KEY_FILTER_SESSION_LOGGED = '__bl_ext_filters_v1_filter_session_logged';
  var KEY_SORT_RESTORE_LOGGED = '__bl_ext_filters_v1_sort_restore_logged';

  function safe(fn, fallback) { try { return fn(); } catch (_) { return fallback; } }

  function lsGet(k) { try { return localStorage.getItem(String(k)); } catch (_) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(String(k), String(v)); } catch (_) { } }

  function isEnabled() {
    var v = lsGet(LS_KEY);
    if (v === null || v === undefined) return false;
    v = String(v || '').trim();
    return v === '1' || v.toLowerCase() === 'true' || v.toLowerCase() === 'on';
  }

  function t(str) {
    str = String(str || '');
    try { if (window.Lampa && Lampa.Lang && typeof Lampa.Lang.translate === 'function') return String(Lampa.Lang.translate(str) || str); } catch (_) { }
    return str;
  }

  function logDbg(msg) {
    try { if (BL.Log && BL.Log.showDbg) BL.Log.showDbg('ExtFilters', String(msg || ''), ''); } catch (_) { }
  }

  function logWarn(msg) {
    try { if (BL.Log && BL.Log.showWarn) BL.Log.showWarn('ExtFilters', String(msg || ''), ''); } catch (_) { }
  }

  function logErr(msg, e) {
    try {
      var extra = '';
      try { extra = e && e.message ? String(e.message) : String(e); } catch (_) { extra = ''; }
      if (BL.Log && BL.Log.showError) BL.Log.showError('ExtFilters', String(msg || ''), extra);
    } catch (_) { }
  }

  function setHidden(obj, key, val) {
    try { Object.defineProperty(obj, key, { configurable: true, enumerable: false, writable: true, value: val }); }
    catch (_) { try { obj[key] = val; } catch (_) { } }
  }

  function getHidden(obj, key) {
    try { return obj ? obj[key] : undefined; } catch (_) { return undefined; }
  }

  var STOCK_SORT_ITEMS = [
    { title: '#{filter_any}' },
    { title: '#{title_new}', sort: 'now' },
    { title: '#{title_now_watch}', sort: 'now_playing' },
    { title: '#{title_in_top}', sort: 'top' },
    { title: '#{title_ongoing}', sort: 'airing' }
  ];

  function cloneStockSortItemsTranslated() {
    var out = [];
    try {
      for (var i = 0; i < STOCK_SORT_ITEMS.length; i++) {
        var it = STOCK_SORT_ITEMS[i];
        if (!it) continue;
        var o = { title: t(it.title) };
        if (it.sort) o.sort = String(it.sort);
        out.push(o);
      }
    } catch (_) { out = []; }
    return out;
  }

  function findNodeByItems(items, looksFn) {
    try {
      if (!Array.isArray(items)) return null;
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        if (!it || !it.items || !Array.isArray(it.items)) continue;
        if (looksFn(it.items)) return it;
      }
    } catch (_) { }
    return null;
  }

  function findFilterSortNode(items) { return findNodeByItems(items, looksLikeSortItems); }
  function findFilterRatingNode(items) { return findNodeByItems(items, looksLikeRatingItems); }

  function ensureFilterSortNode(items, src) {
    try {
      if (!Array.isArray(items)) return null;

      var sortNode = findFilterSortNode(items);
      if (!sortNode) {
        var cached = getHidden(API, KEY_FILTER_SORT_NODE);
        if (!cached) {
          cached = { title: t('#{filter_sorted}'), items: cloneStockSortItemsTranslated() };
          setHidden(API, KEY_FILTER_SORT_NODE, cached);
        }
        sortNode = cached;
        items.push(sortNode);

        if (!getHidden(API, KEY_SORT_RESTORE_LOGGED)) {
          setHidden(API, KEY_SORT_RESTORE_LOGGED, true);
          logWarn('restore sort: injected (src=' + String(src || '') + ')');
        }
      }

      if (!sortNode.title) sortNode.title = t('#{filter_sorted}');

      if (!sortNode.items || !Array.isArray(sortNode.items) || !sortNode.items.length) {
        sortNode.items = cloneStockSortItemsTranslated();

        if (!getHidden(API, KEY_SORT_RESTORE_LOGGED)) {
          setHidden(API, KEY_SORT_RESTORE_LOGGED, true);
          logWarn('restore sort: items reset (src=' + String(src || '') + ')');
        }
      }

      return sortNode;
    } catch (e) {
      logErr('ensureFilterSortNode failed', e);
      return null;
    }
  }

  function isFilterMainMenu(opts) {
    try {
      if (!opts || !opts.items || !Array.isArray(opts.items)) return false;

      var titleOk = false;
      try {
        if (window.Lampa && Lampa.Lang && typeof Lampa.Lang.translate === 'function') {
          var ft = String(Lampa.Lang.translate('title_filter') || '');
          titleOk = !!ft && String(opts.title || '') === ft;
        }
      } catch (_) { titleOk = false; }

      var t0 = '';
      try { t0 = String(opts.title || ''); } catch (_) { t0 = ''; }
      var tl = '';
      try { tl = t0.toLowerCase(); } catch (_) { tl = ''; }

      var hasSearch = false;
      try {
        for (var i = 0; i < opts.items.length; i++) {
          var it = opts.items[i];
          if (it && it.search) { hasSearch = true; break; }
        }
      } catch (_) { hasSearch = false; }

      var titleGuess = titleOk || (tl.indexOf('filter') !== -1) || (tl.indexOf('фильтр') !== -1);
      return hasSearch && titleGuess;
    } catch (_) {
      return false;
    }
  }

  function getSourceSafe() {
    try {
      if (window.Lampa && Lampa.Storage && typeof Lampa.Storage.field === 'function') return String(Lampa.Storage.field('source') || '');
    } catch (_) { }
    return '';
  }

  function extractBlSortMode(sortStr) {
    try {
      sortStr = String(sortStr || '');
      if (!sortStr) return '';
      var m = sortStr.match(/(?:^|[?&])__bl_sort=([^&]+)/);
      if (m && m[1]) return String(m[1]);
    } catch (_) { }
    return '';
  }

  function getSelectedBlSortModeFromNode(node) {
    try {
      if (!node || !node.items || !Array.isArray(node.items)) return '';
      for (var i = 0; i < node.items.length; i++) {
        var it = node.items[i];
        if (it && it.selected && it.sort) {
          var mode = extractBlSortMode(it.sort);
          if (mode) return mode;
        }
      }
    } catch (_) { }
    return '';
  }

  function getSelectedBlSortMode(items) {
    try {
      var node = findFilterSortNode(items);
      if (!node) node = getHidden(API, KEY_FILTER_SORT_NODE);
      var mode = getSelectedBlSortModeFromNode(node);
      return String(mode || '');
    } catch (_) {
      return '';
    }
  }

  function looksLikeRatingItems(items) {
    if (!Array.isArray(items) || !items.length) return false;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (it && it.voite !== undefined) return true;
    }
    return false;
  }

  function looksLikeSortItems(items) {
    if (!Array.isArray(items) || !items.length) return false;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (it && it.sort !== undefined) {
        var s = String(it.sort || '');
        if (s.indexOf('now_playing') !== -1) return true;
      }
    }
    return false;
  }

  function findIndexByStart(items, val) {
    var sv = String(val);
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (!it || it.start === undefined) continue;
      if (String(it.start) === sv) return i;
    }
    return -1;
  }

  function findIndexByVoite(items, val) {
    var sv = String(val);
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (!it || it.voite === undefined) continue;
      if (String(it.voite) === sv) return i;
    }
    return -1;
  }

  function hasStart(items, val) { return findIndexByStart(items, val) >= 0; }
  function hasVoite(items, val) { return findIndexByVoite(items, val) >= 0; }

  function mkRatingFrom(val) {
    return { title: t('#{filter_rating_from} ' + String(val)), start: val };
  }

  function mkRatingRange(a, b) {
    return { title: t('#{filter_rating_from} ' + String(a) + ' #{filter_rating_to} ' + String(b)), voite: String(a) + '-' + String(b) };
  }

  function patchRatingItems(items) {
    if (!Array.isArray(items) || !items.length) return;
    if (getHidden(items, KEY_PATCHED_RATING)) return;

    if (!getHidden(items, KEY_ORIG_RATING)) {
      setHidden(items, KEY_ORIG_RATING, items.slice());
    }

    var i8 = findIndexByStart(items, 8);
    var i6 = findIndexByStart(items, 6);

    var before8 = [];
    if (!hasStart(items, 9)) before8.push(mkRatingFrom(9));
    if (!hasStart(items, 8.5)) before8.push(mkRatingFrom(8.5));

    if (before8.length) {
      var at = i8 >= 0 ? i8 : 1;
      items.splice.apply(items, [at, 0].concat(before8));
    }

    i6 = findIndexByStart(items, 6);
    var between8and6 = [];
    if (!hasStart(items, 7.5)) between8and6.push(mkRatingFrom(7.5));
    if (!hasStart(items, 7.2)) between8and6.push(mkRatingFrom(7.2));
    if (!hasStart(items, 7)) between8and6.push(mkRatingFrom(7));

    if (between8and6.length) {
      var at2 = i6 >= 0 ? i6 : items.length;
      items.splice.apply(items, [at2, 0].concat(between8and6));
    }

    var i68 = findIndexByVoite(items, '6-8');
    var ranges = [];
    if (!hasVoite(items, '7-8')) ranges.push(mkRatingRange(7, 8));
    if (!hasVoite(items, '7-9')) ranges.push(mkRatingRange(7, 9));

    if (ranges.length) {
      var at3 = i68 >= 0 ? i68 + 1 : items.length;
      items.splice.apply(items, [at3, 0].concat(ranges));
    }

    setHidden(items, KEY_PATCHED_RATING, true);
  }

  function unpatchRatingItems(items) {
    if (!Array.isArray(items) || !items.length) return;
    if (!getHidden(items, KEY_PATCHED_RATING)) return;
    var orig = getHidden(items, KEY_ORIG_RATING);
    if (Array.isArray(orig) && orig.length) {
      items.length = 0;
      for (var i = 0; i < orig.length; i++) items.push(orig[i]);
    }
    setHidden(items, KEY_PATCHED_RATING, false);
  }

  function mkSortItem(title, sort) {
    return { title: title, sort: sort };
  }

  function hasBlSort(items, id) {
    id = String(id || '');
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (!it || !it.sort) continue;
      if (String(it.sort).indexOf('__bl_sort=' + id) !== -1) return true;
    }
    return false;
  }

  function patchSortItems(items) {
    if (!Array.isArray(items) || !items.length) return;
    if (getHidden(items, KEY_PATCHED_SORT)) return;

    if (!getHidden(items, KEY_ORIG_SORT)) {
      setHidden(items, KEY_ORIG_SORT, items.slice());
    }

    var titleRating = t('#{title_rating}');
    var titleYear = t('#{title_year}');

    var add = [];
    if (!hasBlSort(items, 'rating_desc')) add.push(mkSortItem(titleRating + ' ↓', 'latest&results=100&__bl_sort=rating_desc'));
    if (!hasBlSort(items, 'rating_asc')) add.push(mkSortItem(titleRating + ' ↑', 'latest&results=100&__bl_sort=rating_asc'));
    if (!hasBlSort(items, 'year_desc')) add.push(mkSortItem(titleYear + ' ↓', 'latest&results=100&__bl_sort=year_desc'));
    if (!hasBlSort(items, 'year_asc')) add.push(mkSortItem(titleYear + ' ↑', 'latest&results=100&__bl_sort=year_asc'));

    if (add.length) {
      var at = 1;
      items.splice.apply(items, [at, 0].concat(add));
    }

    setHidden(items, KEY_PATCHED_SORT, true);
  }

  function unpatchSortItems(items) {
    if (!Array.isArray(items) || !items.length) return;
    if (!getHidden(items, KEY_PATCHED_SORT)) return;
    var orig = getHidden(items, KEY_ORIG_SORT);
    if (Array.isArray(orig) && orig.length) {
      items.length = 0;
      for (var i = 0; i < orig.length; i++) items.push(orig[i]);
    }
    setHidden(items, KEY_PATCHED_SORT, false);
  }

  function walkAndPatch(items, enable) {
    if (!Array.isArray(items)) return;

    if (looksLikeRatingItems(items)) enable ? patchRatingItems(items) : unpatchRatingItems(items);
    if (looksLikeSortItems(items)) enable ? patchSortItems(items) : unpatchSortItems(items);

    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (!it || !it.items || !Array.isArray(it.items)) continue;
      if (looksLikeRatingItems(it.items)) enable ? patchRatingItems(it.items) : unpatchRatingItems(it.items);
      if (looksLikeSortItems(it.items)) enable ? patchSortItems(it.items) : unpatchSortItems(it.items);
    }
  }

  function parseQuery(url) {
    var out = {};
    try {
      var q = '';
      var qi = String(url || '').indexOf('?');
      if (qi >= 0) q = String(url || '').slice(qi + 1);
      if (!q) return out;
      var hash = q.indexOf('#');
      if (hash >= 0) q = q.slice(0, hash);
      var parts = q.split('&');
      for (var i = 0; i < parts.length; i++) {
        var kv = parts[i];
        if (!kv) continue;
        var eq = kv.indexOf('=');
        var k = eq >= 0 ? kv.slice(0, eq) : kv;
        var v = eq >= 0 ? kv.slice(eq + 1) : '';
        try { k = decodeURIComponent(k); } catch (_) { }
        try { v = decodeURIComponent(v); } catch (_) { }
        if (!k) continue;
        out[String(k)] = String(v);
      }
    } catch (_) { }
    return out;
  }

  function replaceQueryParam(url, key, val) {
    try {
      url = String(url || '');
      key = String(key || '');
      val = String(val === undefined || val === null ? '' : val);
      if (!key) return url;
      var qi = url.indexOf('?');
      if (qi < 0) return url + '?' + encodeURIComponent(key) + '=' + encodeURIComponent(val);
      var base = url.slice(0, qi);
      var q = url.slice(qi + 1);
      var hash = '';
      var hi = q.indexOf('#');
      if (hi >= 0) { hash = q.slice(hi); q = q.slice(0, hi); }
      var parts = q ? q.split('&') : [];
      var next = [];
      var found = false;
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        if (!p) continue;
        var eq = p.indexOf('=');
        var k = eq >= 0 ? p.slice(0, eq) : p;
        try { k = decodeURIComponent(k); } catch (_) { }
        if (String(k) === key) {
          found = true;
          next.push(encodeURIComponent(key) + '=' + encodeURIComponent(val));
        } else {
          next.push(p);
        }
      }
      if (!found) next.push(encodeURIComponent(key) + '=' + encodeURIComponent(val));
      return base + '?' + next.join('&') + hash;
    } catch (_) {
      return String(url || '');
    }
  }

  function ensureQueryParam(url, key, val) {
    try {
      var q = parseQuery(url);
      if (q && q[key] !== undefined) return url;
      return replaceQueryParam(url, key, val);
    } catch (_) {
      return String(url || '');
    }
  }

  function rewriteCubVoteDecimals(url) {
    try {
      url = String(url || '');
      if (url.indexOf('://tmdb.') === -1) return url;
      var q = parseQuery(url);
      if (!q || !q.vote) return url;
      var vote = String(q.vote || '');
      if (vote.indexOf('-') !== -1) return url; // range is already supported only as ints
      if (vote.indexOf('.') === -1) return url; // int threshold is supported natively

      var f = parseFloat(vote);
      if (isNaN(f)) return url;
      var flo = Math.floor(f);
      if (!isFinite(flo)) return url;

      url = replaceQueryParam(url, 'vote', String(flo));
      url = ensureQueryParam(url, '__bl_vote_min', String(f));
      url = ensureQueryParam(url, 'results', '100');
      return url;
    } catch (_) {
      return String(url || '');
    }
  }

  function getVote(item) {
    try {
      var v = item && (item.vote_average !== undefined ? item.vote_average : item.vote);
      if (v === undefined || v === null) return null;
      if (typeof v === 'string') v = parseFloat(v);
      if (typeof v !== 'number' || isNaN(v) || !isFinite(v)) return null;
      if (v <= 0) return null;
      return v;
    } catch (_) {
      return null;
    }
  }

  function getYear(item) {
    try {
      var d = '';
      try { d = String(item.release_date || item.first_air_date || ''); } catch (_) { d = ''; }
      if (d && d.length >= 4) {
        var y = parseInt(d.slice(0, 4), 10);
        if (!isNaN(y) && isFinite(y)) return y;
      }
    } catch (_) { }
    return null;
  }

  function sortResults(results, mode) {
    mode = String(mode || '');
    if (!Array.isArray(results) || results.length < 2) return;

    try {
      results.sort(function (a, b) {
        if (!a && !b) return 0;
        if (!a) return 1;
        if (!b) return -1;

        if (mode === 'rating_desc' || mode === 'rating_asc') {
          var va = getVote(a);
          var vb = getVote(b);
          if (va === null && vb === null) return 0;
          if (va === null) return 1;
          if (vb === null) return -1;
          if (va !== vb) return mode === 'rating_asc' ? (va - vb) : (vb - va);
          var ca = safe(function () { return Number(a.vote_count || 0); }, 0);
          var cb = safe(function () { return Number(b.vote_count || 0); }, 0);
          if (ca !== cb) return mode === 'rating_asc' ? (ca - cb) : (cb - ca);
          return 0;
        }

        if (mode === 'year_desc' || mode === 'year_asc') {
          var ya = getYear(a);
          var yb = getYear(b);
          if (ya === null && yb === null) return 0;
          if (ya === null) return 1;
          if (yb === null) return -1;
          if (ya !== yb) return mode === 'year_asc' ? (ya - yb) : (yb - ya);
          var va2 = getVote(a);
          var vb2 = getVote(b);
          if (va2 === null && vb2 === null) return 0;
          if (va2 === null) return 1;
          if (vb2 === null) return -1;
          if (va2 !== vb2) return vb2 - va2; // keep higher-rated first within same year
          return 0;
        }

        return 0;
      });
    } catch (_) { }
  }

  function filterByVoteMin(results, minStr) {
    if (!Array.isArray(results) || !results.length) return;
    var min = parseFloat(String(minStr || ''));
    if (isNaN(min) || !isFinite(min)) return;

    var out = [];
    for (var i = 0; i < results.length; i++) {
      var it = results[i];
      var v = getVote(it);
      if (v === null) continue;
      if (v >= min) out.push(it);
    }
    results.length = 0;
    for (var j = 0; j < out.length; j++) results.push(out[j]);
  }

  function installRequestHooksOnce() {
    if (getHidden(API, KEY_REQ_HOOKED)) return true;
    if (!window.Lampa || !Lampa.Listener) return false;
    try {
      if (Lampa.Listener && typeof Lampa.Listener.follow === 'function') {
        Lampa.Listener.follow('request', function (e) {
          try {
            if (!isEnabled()) return;
            if (!e || !e.params) return;
            if (!e.params.url) return;
            var url = rewriteCubVoteDecimals(e.params.url);

            try {
              if (url && url.indexOf('://tmdb.') !== -1 && url.indexOf('/discover/') !== -1 && url.indexOf('__bl_sort=') === -1) {
                var mode = getSelectedBlSortMode(null);
                if (mode) url = ensureQueryParam(url, '__bl_sort', mode);
              }
            } catch (_) { }

            e.params.url = url;
          } catch (_) { }
        });

        Lampa.Listener.follow('request_secuses', function (e) {
          try {
            if (!isEnabled()) return;
            if (!e || !e.params || !e.params.url || !e.data) return;
            var url = String(e.params.url || '');
            if (url.indexOf('://tmdb.') === -1) return;
            var q = parseQuery(url);
            if (!q) return;

            var data = e.data;
            if (!data || !data.results || !Array.isArray(data.results)) return;

            if (q.__bl_vote_min !== undefined) filterByVoteMin(data.results, q.__bl_vote_min);
            if (q.__bl_sort !== undefined) sortResults(data.results, q.__bl_sort);
          } catch (_) { }
        });

        setHidden(API, KEY_REQ_HOOKED, true);
        return true;
      }
    } catch (_) { }
    return false;
  }

  function installSelectHookOnce() {
    if (getHidden(API, KEY_SELECT_WRAPPED)) return true;
    if (!window.Lampa || !Lampa.Select || typeof Lampa.Select.show !== 'function') return false;

    try {
      var orig = Lampa.Select.show;
      if (orig && orig.__blExtFiltersWrapped) {
        setHidden(API, KEY_SELECT_WRAPPED, true);
        return true;
      }

        function wrapped() {
          try {
            var opts = arguments && arguments.length ? arguments[0] : null;
            if (opts && opts.items) {
              var enable = isEnabled();
              var isFilter = enable && isFilterMainMenu(opts);
              var src = '';

              if (isFilter) {
                src = getSourceSafe();

                // Restore hidden filter items for ext_filters=ON: make sure "Sort" exists and has items.
                ensureFilterSortNode(opts.items, src);

                // Reset session flag on exit/search.
                try {
                  if (opts.onBack && typeof opts.onBack === 'function') {
                    var ob = opts.onBack;
                    opts.onBack = function () {
                      try { setHidden(API, KEY_FILTER_SESSION_ACTIVE, false); } catch (_) { }
                      return ob.apply(this, arguments);
                    };
                  }
                  if (opts.onSelect && typeof opts.onSelect === 'function') {
                    var os = opts.onSelect;
                    opts.onSelect = function (a) {
                      try { if (a && a.search) setHidden(API, KEY_FILTER_SESSION_ACTIVE, false); } catch (_) { }
                      return os.apply(this, arguments);
                    };
                  }
                } catch (_) { }
              }

              // Patch rating/sort items safely for any source.
              walkAndPatch(opts.items, enable);

              if (isFilter) {
                // Log once per Filter session (no spam on internal rerenders).
                try {
                  var active = !!getHidden(API, KEY_FILTER_SESSION_ACTIVE);
                  if (!active) {
                    setHidden(API, KEY_FILTER_SESSION_ACTIVE, true);
                    setHidden(API, KEY_FILTER_SESSION_LOGGED, false);
                  }

                  if (!getHidden(API, KEY_FILTER_SESSION_LOGGED)) {
                    setHidden(API, KEY_FILTER_SESSION_LOGGED, true);

                    var sortNode = findFilterSortNode(opts.items) || getHidden(API, KEY_FILTER_SORT_NODE);
                    var ratingNode = findFilterRatingNode(opts.items);
                    var si = (sortNode && sortNode.items && Array.isArray(sortNode.items)) ? sortNode.items.length : 0;
                    var ri = (ratingNode && ratingNode.items && Array.isArray(ratingNode.items)) ? ratingNode.items.length : 0;

                    var sortLine = sortNode ? ('present(items=' + si + ')') : 'absent';
                    var ratingLine = ratingNode ? ('present(items=' + ri + ')') : 'absent';
                    var src2 = src || getSourceSafe();
                    var line = 'open Filter | sort=' + sortLine + ' rating=' + ratingLine + ' src=' + String(src2 || '');
                    logDbg(line);
                    try { if (window.console && console.debug) console.debug('[BlackLampa][ExtFilters] open Filter', { sort: sortNode ? { present: true, items: si } : { present: false, items: 0 }, rating: ratingNode ? { present: true, items: ri } : { present: false, items: 0 }, src: src2 || '' }); } catch (_) { }
                  }
                } catch (_) { }
              }
            }
          } catch (_) { }
          return orig.apply(this, arguments);
        }
      setHidden(wrapped, '__blExtFiltersWrapped', true);
      Lampa.Select.show = wrapped;

      setHidden(API, KEY_SELECT_WRAPPED, true);
      return true;
    } catch (_) {
      return false;
    }
  }

  function waitLampaAndInstall() {
    var tries = 0;
    var max = 160; // 40s @ 250ms
    var tmr = setInterval(function () {
      tries++;
      var ok = false;
      try {
        ok = !!(window.Lampa && Lampa.Listener && Lampa.Select && typeof Lampa.Select.show === 'function');
      } catch (_) { ok = false; }
      if (ok) {
        clearInterval(tmr);
        safe(installRequestHooksOnce);
        safe(installSelectHookOnce);
        return;
      }
      if (tries >= max) {
        clearInterval(tmr);
      }
    }, 250);
  }

  API.isEnabled = isEnabled;
  API.setEnabled = function (on) { lsSet(LS_KEY, on ? '1' : '0'); };
  API.refresh = function () { safe(installRequestHooksOnce); safe(installSelectHookOnce); };

  waitLampaAndInstall();
})();
