(function () {
  'use strict';

  var BL = window.BL = window.BL || {};
  var MP = BL.ModPlayer = BL.ModPlayer || {};
  if (MP.OnlineCore && MP.OnlineCore.__loaded) return;

  var API = MP.OnlineCore = MP.OnlineCore || {};
  API.__loaded = true;

  var LS = {
    enabled: 'blmod.enabled',
    debug: 'blmod.debug',
    preferredSource: 'blmod.online.source'
  };

  var CACHE = {
    ts: 0,
    sources: [],
    rawLen: 0,
    err: '',
    lastPath: ''
  };

  var TTL_MS = 3 * 60 * 1000;
  var ONLINE_MOD_PATHS = [
    '/lampa/scripts/online_mod.js',
    '/scripts/online_mod.js',
    'scripts/online_mod.js'
  ];

  function nowMs() {
    return Date.now();
  }

  function str(v) {
    return v === undefined || v === null ? '' : String(v);
  }

  function toBool(v, d) {
    if (v === undefined || v === null || v === '') return !!d;
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return isFinite(v) && v !== 0;
    var s = str(v).toLowerCase().trim();
    if (!s) return !!d;
    return !(s === '0' || s === 'false' || s === 'off' || s === 'no');
  }

  function sGet(key, fallback) {
    var v = null;
    try { if (window.Lampa && Lampa.Storage && Lampa.Storage.get) v = Lampa.Storage.get(String(key)); } catch (_) { v = null; }
    if (v === undefined || v === null) {
      try { if (window.localStorage) v = localStorage.getItem(String(key)); } catch (_) { v = null; }
    }
    return (v === undefined || v === null) ? fallback : v;
  }

  function sSet(key, value) {
    try { if (window.Lampa && Lampa.Storage && Lampa.Storage.set) Lampa.Storage.set(String(key), value); } catch (_) { }
    try { if (window.localStorage) localStorage.setItem(String(key), (typeof value === 'object') ? JSON.stringify(value) : String(value)); } catch (_) { }
  }

  function log(level, msg, meta) {
    try {
      if (MP && typeof MP.log === 'function') return MP.log(level, msg, meta || null);
    } catch (_) { }
    try {
      if (toBool(sGet(LS.debug, '0'), false) && console && console.log) console.log('[BL-Mod][OnlineCore][' + str(level || 'INF') + '] ' + str(msg || ''), meta || null);
    } catch (_) { }
  }

  function escHtml(s) {
    return str(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function showModal(title, text) {
    try {
      if (window.Lampa && Lampa.Modal && typeof Lampa.Modal.open === 'function') {
        Lampa.Modal.open({
          title: str(title || 'BL-Mod'),
          align: 'center',
          html: '<div class="about"><pre style="white-space:pre-wrap;word-break:break-word;max-height:70vh;overflow:auto">' + escHtml(str(text || '')) + '</pre></div>'
        });
        return true;
      }
    } catch (_) { }
    return false;
  }

  function parseObjectsFromBlock(block) {
    var list = [];
    if (!block) return list;
    var re = /\{[^{}]{0,600}\}/g;
    var m;
    while ((m = re.exec(block))) list.push(m[0]);
    return list;
  }

  function parseSourceObject(rawObj) {
    var raw = str(rawObj || '');
    if (!raw) return null;
    var nameMatch = /name\s*:\s*['"]([^'"]+)['"]/i.exec(raw);
    var titleMatch = /title\s*:\s*['"]([^'"]+)['"]/i.exec(raw);
    var balMatch = /(?:balanser|source|id)\s*:\s*['"]([^'"]+)['"]/i.exec(raw);
    var name = nameMatch ? str(nameMatch[1]) : '';
    var title = titleMatch ? str(titleMatch[1]) : '';
    var bal = balMatch ? str(balMatch[1]) : '';
    var id = (bal || name || title || '').toLowerCase().trim();
    if (!id) return null;
    if (id === 'tmdb') return null;
    return {
      id: id,
      key: id,
      title: title || name || bal || id,
      origin: 'online_mod.all_sources',
      kind: 'balancer'
    };
  }

  function extractAllSourcesBlock(text) {
    var src = str(text || '');
    var idx = src.indexOf('all_sources');
    if (idx < 0) return '';
    var from = src.indexOf('[', idx);
    if (from < 0) return '';
    var i;
    var depth = 0;
    for (i = from; i < src.length; i++) {
      var ch = src.charAt(i);
      if (ch === '[') depth++;
      else if (ch === ']') {
        depth--;
        if (depth === 0) return src.slice(from + 1, i);
      }
    }
    return '';
  }

  function uniqSources(list) {
    var map = {};
    var out = [];
    (list || []).forEach(function (s) {
      var id = str(s && (s.id || s.key) || '');
      if (!id || map[id]) return;
      map[id] = 1;
      out.push(s);
    });
    return out;
  }

  function fetchTextByPaths(paths, idx) {
    idx = toInt(idx, 0);
    if (idx >= paths.length) return Promise.reject(new Error('online_mod_fetch_failed'));
    var p = str(paths[idx]);
    return fetch(p, { cache: 'no-store' }).then(function (r) {
      if (!r || !r.ok) throw new Error('http_' + toInt(r && r.status, 0));
      return r.text().then(function (text) { return { text: text, path: p }; });
    })['catch'](function () {
      return fetchTextByPaths(paths, idx + 1);
    });
  }

  function fetchOnlineModSources() {
    if (typeof fetch !== 'function') return Promise.resolve([]);
    return fetchTextByPaths(ONLINE_MOD_PATHS, 0).then(function (res) {
      var text = str(res && res.text || '');
      var block = extractAllSourcesBlock(text);
      var rows = parseObjectsFromBlock(block).map(parseSourceObject).filter(Boolean);
      CACHE.rawLen = str(block).length;
      CACHE.lastPath = str(res && res.path || '');
      return uniqSources(rows);
    });
  }

  function cachedSourcesValid() {
    return CACHE.sources.length && (nowMs() - CACHE.ts < TTL_MS);
  }

  function componentId() {
    return 'blmod_online';
  }

  function choosePreferredSource(sources) {
    sources = Array.isArray(sources) ? sources : [];
    if (!sources.length) return null;
    var preferred = str(sGet(LS.preferredSource, '') || '').toLowerCase();
    var found = null;
    if (preferred) {
      sources.some(function (s) {
        if (str(s.id).toLowerCase() === preferred || str(s.key).toLowerCase() === preferred) {
          found = s;
          return true;
        }
        return false;
      });
    }
    return found || sources[0];
  }

  function listRowsContainer() {
    return $('<div class="blmod-online-list"></div>');
  }

  function listRow(title, sub, handler) {
    var row = $('<div class="selector" style="padding:1.1em 1em;border-bottom:1px solid rgba(255,255,255,.08)"></div>');
    var h = $('<div style="font-size:1.05em;"></div>').text(str(title || ''));
    var d = $('<div style="opacity:.75;font-size:.9em;margin-top:.2em;"></div>').text(str(sub || ''));
    row.append(h).append(d);
    if (handler) {
      row.on('hover:enter click', function (e) {
        try { if (e && e.preventDefault) e.preventDefault(); } catch (_) { }
        try { handler(); } catch (_) { }
      });
    }
    return row;
  }

  function addController(self, root, container) {
    try {
      Lampa.Controller.add('content', {
        toggle: function () {
          try {
            Lampa.Controller.collectionSet(container);
            Lampa.Controller.collectionFocus(self.last || false, container);
          } catch (_) { }
        },
        up: function () { try { if (Navigator.canmove('up')) Navigator.move('up'); else Lampa.Controller.toggle('head'); } catch (_) { } },
        down: function () { try { Navigator.move('down'); } catch (_) { } },
        right: function () { try { if (Navigator.canmove('right')) Navigator.move('right'); } catch (_) { } },
        left: function () { try { if (Navigator.canmove('left')) Navigator.move('left'); else Lampa.Controller.toggle('menu'); } catch (_) { } },
        back: self.back.bind(self)
      });
      Lampa.Controller.toggle('content');
    } catch (_) { }
  }

  function Component(object) {
    var self = this;
    var scroll = new Lampa.Scroll({ mask: true, over: true });
    var root = $('<div class="blmod-online-screen"></div>');
    var head = $('<div style="padding:1em;border-bottom:1px solid rgba(255,255,255,.1)"></div>');
    var title = $('<div style="font-size:1.35em"></div>').text(str((object.movie && (object.movie.title || object.movie.name)) || 'BL-Mod'));
    var sub = $('<div style="opacity:.75;margin-top:.3em"></div>').text('BL-Mod Online');
    var list = listRowsContainer();
    var initialized = false;
    var ctx = null;
    var sources = [];
    var currentSource = null;
    var stack = [];

    head.append(title).append(sub);
    scroll.body().addClass('blmod-online-body');
    scroll.body().append(list);
    root.append(head).append(scroll.render());

    function setHead(extra) {
      sub.text('BL-Mod Online' + (extra ? (' • ' + extra) : ''));
    }

    function clearList() {
      list.empty();
      self.last = null;
    }

    function focusFirst() {
      try {
        var first = list.find('.selector').first();
        if (first.length) {
          self.last = first;
          Lampa.Controller.collectionSet(scroll.render());
          Lampa.Controller.collectionFocus(first, scroll.render());
        }
      } catch (_) { }
    }

    function showLoading(text) {
      clearList();
      list.append(listRow(text || 'Loading...', '', null));
      focusFirst();
    }

    function showError(text) {
      clearList();
      list.append(listRow('Ошибка', text || 'unknown', null));
      focusFirst();
    }

    function playFile(file, catalog) {
      if (!MP.SourceKit || !MP.SourceKit.resolveFile || !MP.Player || !MP.Player.playResolved) return;
      showLoading('Подготовка ссылки...');
      MP.SourceKit.resolveFile(ctx, currentSource.id, file).then(function (resolved) {
        return MP.Player.playResolved(ctx, currentSource, file, resolved, catalog || null);
      })['catch'](function (e) {
        showError('Не удалось открыть файл: ' + str(e && (e.message || e)));
      });
    }

    function renderSourcesScreen() {
      clearList();
      setHead('Источники');
      list.append(listRow('Источники (' + sources.length + ')', 'Выберите источник для загрузки результатов', null));
      sources.forEach(function (s) {
        list.append(listRow(s.title || s.id, 'id=' + str(s.id) + ' • ' + str(s.origin || 'online_mod'), function () {
          currentSource = s;
          try { sSet(LS.preferredSource, str(s.id || '')); } catch (_) { }
          loadCatalogRoot();
        }));
      });
      if (!sources.length) {
        list.append(listRow('sources_empty', 'Не удалось извлечь источники online_mod', null));
      }
      focusFirst();
    }

    function catalogInfo(cat) {
      var line = [];
      try {
        if (cat && cat.buttons && cat.buttons.length) line.push('voices=' + cat.buttons.length);
        if (cat && cat.videos && cat.videos.length) line.push('videos=' + cat.videos.length);
        if (cat && cat.links && cat.links.length) line.push('links=' + cat.links.length);
      } catch (_) { }
      return line.join(' ');
    }

    function renderCatalog(cat, isRoot) {
      cat = cat || null;
      clearList();
      setHead((currentSource && currentSource.title) || 'Catalog');

      if (!cat) {
        showError('Каталог пуст');
        return;
      }

      if (!isRoot) {
        list.append(listRow('Назад', 'Вернуться к предыдущему уровню', function () {
          stack.pop();
          var prev = stack.length ? stack[stack.length - 1] : null;
          if (!prev) renderSourcesScreen();
          else renderCatalog(prev, stack.length === 1);
        }));
      } else {
        list.append(listRow('Сменить источник', 'Вернуться к выбору источника', function () {
          renderSourcesScreen();
        }));
      }

      list.append(listRow('Текущий источник: ' + str(currentSource && currentSource.id || ''), catalogInfo(cat), null));

      (cat.videos || []).forEach(function (v) {
        var t = str(v.title || v.text || 'Файл');
        if (v.season) t += ' S' + v.season;
        if (v.episode) t += 'E' + v.episode;
        list.append(listRow(t, str(v.voice_name || ''), function () { playFile(v, cat); }));
      });

      (cat.links || []).forEach(function (l) {
        var t2 = str(l.title || l.text || 'Раздел');
        if (l.season) t2 += ' S' + l.season;
        if (l.episode) t2 += 'E' + l.episode;
        list.append(listRow(t2, 'Открыть раздел', function () {
          if (!l.url) return;
          showLoading('Загрузка раздела...');
          MP.SourceKit.resolveCatalogByUrl(ctx, currentSource.id, l.url).then(function (nextCat) {
            stack.push(nextCat);
            renderCatalog(nextCat, false);
          })['catch'](function (e) {
            showError('Не удалось открыть раздел: ' + str(e && (e.message || e)));
          });
        }));
      });

      if (!(cat.videos && cat.videos.length) && !(cat.links && cat.links.length)) {
        list.append(listRow('Нет элементов', 'Попробуйте другой источник', null));
      }

      focusFirst();
    }

    function loadCatalogRoot() {
      if (!currentSource || !ctx || !MP.SourceKit) return;
      showLoading('Поиск видео в источнике...');
      MP.SourceKit.resolveCatalog(ctx, currentSource.id).then(function (cat) {
        stack = [cat];
        renderCatalog(cat, true);
      })['catch'](function (e) {
        showError('Ошибка загрузки источника: ' + str(e && (e.message || e)));
      });
    }

    function initialize() {
      showLoading('Загрузка источников...');
      ctx = MP.SourceKit && MP.SourceKit.buildContext ? MP.SourceKit.buildContext(object.movie || null) : null;
      if (!ctx || !ctx.movie) {
        showError('Не удалось получить контекст карточки');
        return;
      }
      API.getSources().then(function (srcList) {
        if (!srcList || !srcList.length) {
          showError('sources_empty (online_mod all_sources)');
          return;
        }
        MP.SourceKit.listSources(ctx).then(function (runtimeSources) {
          runtimeSources = Array.isArray(runtimeSources) ? runtimeSources : [];
          var byId = {};
          runtimeSources.forEach(function (s) { byId[str(s.id || '').toLowerCase()] = s; });

          sources = srcList.map(function (s) {
            var id = str(s.id || '').toLowerCase();
            var rt = byId[id];
            if (rt) return rt;
            return { id: id, key: id, title: s.title || id, kind: 'balancer', origin: 'online_mod.all_sources' };
          });
          sources = uniqSources(sources);
          if (!sources.length) {
            showError('sources_empty (runtime map)');
            return;
          }
          currentSource = choosePreferredSource(sources);
          renderSourcesScreen();
        })['catch'](function (e) {
          showError('Ошибка runtime источников: ' + str(e && (e.message || e)));
        });
      })['catch'](function (e2) {
        showError('Ошибка извлечения all_sources: ' + str(e2 && (e2.message || e2)));
      });
    }

    this.create = function () {
      return this.render();
    };

    this.render = function () {
      return root;
    };

    this.start = function () {
      if (Lampa.Activity.active().activity !== self.activity) return;
      if (!initialized) {
        initialized = true;
        initialize();
      }
      try { Lampa.Background.immediately(Lampa.Utils.cardImgBackgroundBlur(object.movie)); } catch (_) { }
      addController(self, root, scroll.render());
    };

    this.back = function () {
      if (stack.length > 1) {
        stack.pop();
        var prev = stack[stack.length - 1];
        renderCatalog(prev, stack.length === 1);
        return;
      }
      if (stack.length === 1 && list.find('.selector').length && !list.find('.selector').first().text().match(/Сменить источник/i)) {
        renderSourcesScreen();
        return;
      }
      Lampa.Activity.backward();
    };

    this.pause = function () { };
    this.stop = function () { };
    this.destroy = function () {
      try { scroll.destroy(); } catch (_) { }
      try { root.remove(); } catch (_) { }
    };
  }

  function ensureComponent() {
    try {
      if (!window.Lampa || !Lampa.Component || !Lampa.Component.get || !Lampa.Component.add) return false;
      if (!Lampa.Component.get(componentId())) Lampa.Component.add(componentId(), Component);
      return true;
    } catch (_) {
      return false;
    }
  }

  API.getSources = function (opts) {
    opts = opts || {};
    var force = !!opts.force;
    if (!force && cachedSourcesValid()) return Promise.resolve(CACHE.sources.slice());

    return fetchOnlineModSources().then(function (sources) {
      CACHE.sources = sources.slice();
      CACHE.ts = nowMs();
      CACHE.err = '';
      log('INF', 'online_sources_loaded', { count: sources.length, rawLen: CACHE.rawLen, path: CACHE.lastPath });
      return sources.slice();
    })['catch'](function (e) {
      CACHE.err = str(e && (e.message || e));
      CACHE.ts = nowMs();
      CACHE.sources = [];
      CACHE.lastPath = '';
      log('WRN', 'online_sources_failed', { err: CACHE.err });
      return [];
    });
  };

  API.search = function (movieCtx, opts) {
    opts = opts || {};
    var ctx = MP.SourceKit && MP.SourceKit.buildContext ? MP.SourceKit.buildContext(movieCtx || null) : null;
    if (!ctx || !ctx.movie) return Promise.resolve({ ok: false, reason: 'ctx_missing', sources: [], runtime: [] });
    return Promise.all([API.getSources(opts), MP.SourceKit.listSources(ctx)]).then(function (rows) {
      return {
        ok: true,
        reason: '',
        sources: rows[0] || [],
        runtime: rows[1] || [],
        ctx: ctx
      };
    });
  };

  API.openResultsScreen = function (movieCtx, opts) {
    opts = opts || {};
    if (!ensureComponent()) return Promise.resolve(false);

    var movie = movieCtx || null;
    try {
      if (!movie && window.Lampa && Lampa.Activity && typeof Lampa.Activity.active === 'function') {
        var act = Lampa.Activity.active();
        movie = (act && (act.card || (act.activity && act.activity.card) || (act.activity && act.activity.movie))) || null;
      }
    } catch (_) { }
    if (!movie) return Promise.resolve(false);

    try {
      Lampa.Activity.push({
        url: '',
        title: 'BL-Mod Online',
        component: componentId(),
        movie: movie,
        page: 1,
        search: str(movie.title || movie.name || ''),
        search_one: str(movie.title || movie.name || ''),
        search_two: str(movie.original_title || movie.original_name || '')
      });
      return Promise.resolve(true);
    } catch (_) {
      return Promise.resolve(false);
    }
  };

  API.diagnose = function () {
    return API.getSources({ force: false }).then(function (sources) {
      var hasComponent = false;
      try { hasComponent = !!(window.Lampa && Lampa.Component && Lampa.Component.get && Lampa.Component.get(componentId())); } catch (_) { }
      return {
        ts: nowMs(),
        enabled: toBool(sGet(LS.enabled, '1'), true),
        debug: toBool(sGet(LS.debug, '0'), false),
        sourceCount: sources.length,
        sourceIds: sources.map(function (s) { return s.id; }).slice(0, 200),
        cacheTs: CACHE.ts,
        cacheRawLen: CACHE.rawLen,
        cacheErr: CACHE.err,
        cachePath: CACHE.lastPath,
        hasSourceKit: !!(MP.SourceKit && MP.SourceKit.listSources && MP.SourceKit.resolveCatalog),
        componentRegistered: hasComponent
      };
    });
  };

  API.showSources = function () {
    return API.getSources({ force: false }).then(function (sources) {
      var text = 'BL-Mod Online sources: ' + sources.length + '\n\n' + JSON.stringify(sources, null, 2);
      showModal('BL-Mod Sources', text);
      return sources;
    });
  };

  API.state = function () {
    return {
      ts: nowMs(),
      cacheTs: CACHE.ts,
      cacheErr: CACHE.err,
      cacheCount: CACHE.sources.length,
      cachePath: CACHE.lastPath
    };
  };

  API.resetDefaults = function () {
    sSet(LS.enabled, 'true');
    sSet(LS.debug, '0');
    sSet('blmod.log_level', 'normal');
    sSet(LS.preferredSource, '');
    return true;
  };
})();
