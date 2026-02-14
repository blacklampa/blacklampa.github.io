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
    preferredSource: 'blmod.preferred_source',
    logLevel: 'blmod.log_level'
  };

  // Built-in registry derived from online_mod.js all_sources.
  // Runtime must not read /lampa/scripts/*.js.
  var BUILTIN_SOURCES = [
    { id: 'lumex', title: 'Lumex', origin: 'builtin', kind: 'balancer' },
    { id: 'lumex2', title: 'Lumex (Ads)', origin: 'builtin', kind: 'balancer' },
    { id: 'rezka2', title: 'HDrezka', origin: 'builtin', kind: 'balancer' },
    { id: 'kinobase', title: 'Kinobase', origin: 'builtin', kind: 'balancer' },
    { id: 'collaps', title: 'Collaps', origin: 'builtin', kind: 'balancer' },
    { id: 'collaps-dash', title: 'Collaps (DASH)', origin: 'builtin', kind: 'balancer' },
    { id: 'cdnmovies', title: 'CDNMovies', origin: 'builtin', kind: 'balancer' },
    { id: 'filmix', title: 'Filmix', origin: 'builtin', kind: 'balancer' },
    { id: 'zetflix', title: 'Zetflix', origin: 'builtin', kind: 'balancer' },
    { id: 'fancdn', title: 'FanCDN', origin: 'builtin', kind: 'balancer' },
    { id: 'fancdn2', title: 'FanCDN (ID)', origin: 'builtin', kind: 'balancer' },
    { id: 'fanserials', title: 'FanSerials', origin: 'builtin', kind: 'balancer' },
    { id: 'videoseed', title: 'VideoSeed', origin: 'builtin', kind: 'balancer' },
    { id: 'vibix', title: 'Vibix', origin: 'builtin', kind: 'balancer' },
    { id: 'redheadsound', title: 'RedHeadSound', origin: 'builtin', kind: 'balancer' },
    { id: 'redheadsound-dash', title: 'RedHeadSound (DASH)', origin: 'builtin', kind: 'balancer' },
    { id: 'cdnvideohub', title: 'CDNVideoHub', origin: 'builtin', kind: 'balancer' },
    { id: 'anilibria', title: 'AniLibria', origin: 'builtin', kind: 'balancer' },
    { id: 'anilibria2', title: 'AniLibria.top', origin: 'builtin', kind: 'balancer' },
    { id: 'animelib', title: 'AnimeLib', origin: 'builtin', kind: 'balancer' },
    { id: 'kodik', title: 'Kodik', origin: 'builtin', kind: 'balancer' },
    { id: 'alloha', title: 'Alloha', origin: 'builtin', kind: 'balancer' },
    { id: 'kinopub', title: 'KinoPub', origin: 'builtin', kind: 'balancer' }
  ];

  function nowMs() {
    return Date.now();
  }

  function str(v) {
    return v === undefined || v === null ? '' : String(v);
  }

  function toInt(v, d) {
    var n = parseInt(v, 10);
    return isFinite(n) ? n : d;
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

  function sourceEnabledKey(id) {
    return 'blmod.source.enabled.' + str(id || '');
  }

  function isSourceEnabled(id) {
    return toBool(sGet(sourceEnabledKey(id), '1'), true);
  }

  function setSourceEnabled(id, on) {
    sSet(sourceEnabledKey(id), on ? '1' : '0');
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

  function log(level, msg, meta) {
    try {
      if (MP && typeof MP.log === 'function') return MP.log(level, msg, meta || null);
    } catch (_) { }
    try {
      if (toBool(sGet(LS.debug, '0'), false) && console && console.log) console.log('[BL-Mod][OnlineCore][' + str(level || 'INF') + '] ' + str(msg || ''), meta || null);
    } catch (_) { }
  }

  function uniqSources(list) {
    var out = [];
    var map = {};
    (list || []).forEach(function (s) {
      var id = str(s && (s.id || s.key) || '');
      if (!id || map[id]) return;
      map[id] = 1;
      out.push(s);
    });
    return out;
  }

  function allSources() {
    return BUILTIN_SOURCES.map(function (s) {
      return {
        id: str(s.id),
        key: str(s.id),
        title: str(s.title || s.id),
        origin: str(s.origin || 'builtin'),
        kind: str(s.kind || 'balancer'),
        enabled: isSourceEnabled(s.id)
      };
    });
  }

  function enabledSources() {
    return allSources().filter(function (s) { return !!s.enabled; });
  }

  function choosePreferredSource(sources) {
    sources = Array.isArray(sources) ? sources : [];
    if (!sources.length) return null;
    var preferred = str(sGet(LS.preferredSource, '') || '').toLowerCase();
    if (preferred) {
      for (var i = 0; i < sources.length; i++) {
        var sid = str(sources[i] && (sources[i].id || sources[i].key) || '').toLowerCase();
        if (sid === preferred) return sources[i];
      }
    }
    return sources[0];
  }

  function componentId() {
    return 'blmod_online';
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

  function catalogHasRows(cat) {
    if (!cat || typeof cat !== 'object') return false;
    if (Array.isArray(cat.videos) && cat.videos.length) return true;
    if (Array.isArray(cat.links) && cat.links.length) return true;
    if (Array.isArray(cat.buttons) && cat.buttons.length) return true;
    return false;
  }

  function mergeWithRuntimeSources(builtin, runtime) {
    runtime = Array.isArray(runtime) ? runtime : [];
    var byId = {};
    runtime.forEach(function (s) { byId[str(s && s.id || '').toLowerCase()] = s; });
    return builtin.map(function (s) {
      var id = str(s && s.id || '').toLowerCase();
      var rt = byId[id];
      if (rt) {
        var out = $.extend(true, {}, rt);
        out.id = str(out.id || id);
        out.key = str(out.key || out.id);
        out.title = str(s.title || out.title || out.id);
        out.origin = str(out.origin || 'builtin_runtime');
        out.enabled = true;
        return out;
      }
      return {
        id: id,
        key: id,
        title: str(s.title || id),
        origin: 'builtin_unresolved',
        kind: 'balancer',
        enabled: true
      };
    });
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
    var viewMode = 'idle';

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
      viewMode = 'loading';
      clearList();
      list.append(listRow(text || 'Loading...', '', null));
      focusFirst();
    }

    function showError(text) {
      viewMode = 'error';
      clearList();
      list.append(listRow('Ошибка', text || 'unknown', null));
      if (sources.length) {
        list.append(listRow('Сменить источник', 'Открыть список источников', function () {
          renderSourcesScreen();
        }));
      }
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

    function catalogInfo(cat) {
      var line = [];
      try {
        if (cat && cat.buttons && cat.buttons.length) line.push('voices=' + cat.buttons.length);
        if (cat && cat.videos && cat.videos.length) line.push('videos=' + cat.videos.length);
        if (cat && cat.links && cat.links.length) line.push('links=' + cat.links.length);
      } catch (_) { }
      return line.join(' ');
    }

    function renderSourcesScreen() {
      viewMode = 'sources';
      clearList();
      setHead('Источники');

      if (stack.length) {
        list.append(listRow('Назад к результатам', 'Вернуться к текущему каталогу', function () {
          var cat = stack[stack.length - 1];
          renderCatalog(cat, stack.length === 1);
        }));
      }

      list.append(listRow('Источники (' + sources.length + ')', 'Выберите источник для загрузки результатов', null));
      sources.forEach(function (s) {
        list.append(listRow(s.title || s.id, 'id=' + str(s.id) + ' • ' + str(s.origin || 'builtin'), function () {
          currentSource = s;
          API.setPreferredSource(str(s.id || ''));
          loadCatalogForSource(s, false);
        }));
      });
      if (!sources.length) list.append(listRow('sources_empty', 'Встроенный список источников пуст', null));
      focusFirst();
    }

    function renderCatalog(cat, isRoot) {
      cat = cat || null;
      viewMode = 'catalog';
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
        list.append(listRow('Сменить источник', 'Открыть список источников', function () {
          renderSourcesScreen();
        }));
      }

      list.append(listRow('Текущий источник: ' + str(currentSource && currentSource.id || ''), catalogInfo(cat), null));

      (cat.buttons || []).forEach(function (b) {
        var t = 'Озвучка: ' + str(b.text || b.title || 'Voice');
        var subline = b.active ? 'active' : 'Открыть';
        list.append(listRow(t, subline, function () {
          if (!b.url) return;
          showLoading('Загрузка озвучки...');
          MP.SourceKit.resolveCatalogByUrl(ctx, currentSource.id, b.url).then(function (nextCat) {
            stack.push(nextCat);
            renderCatalog(nextCat, false);
          })['catch'](function (e) {
            showError('Не удалось открыть озвучку: ' + str(e && (e.message || e)));
          });
        }));
      });

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

      if (!catalogHasRows(cat)) list.append(listRow('Нет элементов', 'Попробуйте другой источник', null));
      focusFirst();
    }

    function buildFallbackOrder(startSource) {
      var order = [];
      var startId = str(startSource && startSource.id || '');
      var i;
      if (startId) {
        for (i = 0; i < sources.length; i++) if (str(sources[i].id) === startId) order.push(sources[i]);
      }
      for (i = 0; i < sources.length; i++) {
        if (startId && str(sources[i].id) === startId) continue;
        order.push(sources[i]);
      }
      return uniqSources(order);
    }

    function runFallback(order, idx, maxAttempts) {
      if (idx >= order.length || idx >= maxAttempts) {
        showError('Не найдены результаты ни в одном источнике');
        return;
      }
      currentSource = order[idx];
      showLoading('Поиск видео в источнике: ' + str(currentSource.title || currentSource.id));
      MP.SourceKit.resolveCatalog(ctx, currentSource.id).then(function (cat) {
        if (catalogHasRows(cat)) {
          stack = [cat];
          renderCatalog(cat, true);
          return;
        }
        log('WRN', 'source_empty_fallback', { source: currentSource.id, index: idx + 1 });
        runFallback(order, idx + 1, maxAttempts);
      })['catch'](function (e) {
        log('WRN', 'source_error_fallback', { source: currentSource.id, err: str(e && (e.message || e)) });
        runFallback(order, idx + 1, maxAttempts);
      });
    }

    function loadCatalogForSource(source, allowFallback) {
      if (!source || !ctx || !MP.SourceKit) return;
      var order = allowFallback ? buildFallbackOrder(source) : [source];
      runFallback(order, 0, allowFallback ? 5 : 1);
    }

    function initialize() {
      showLoading('Загрузка источников...');
      ctx = MP.SourceKit && MP.SourceKit.buildContext ? MP.SourceKit.buildContext(object.movie || null) : null;
      if (!ctx || !ctx.movie) {
        showError('Не удалось получить контекст карточки');
        return;
      }

      API.getSources().then(function (builtin) {
        if (!builtin || !builtin.length) {
          showError('Все источники отключены (BL-Mod -> Sources)');
          return;
        }
        MP.SourceKit.listSources(ctx).then(function (runtimeSources) {
          sources = mergeWithRuntimeSources(builtin, runtimeSources);
          if (!sources.length) {
            showError('sources_empty');
            return;
          }
          var preferred = choosePreferredSource(sources);
          if (!preferred) {
            showError('Нет доступного preferred source');
            return;
          }
          loadCatalogForSource(preferred, true);
        })['catch'](function (e) {
          showError('Ошибка загрузки runtime источников: ' + str(e && (e.message || e)));
        });
      })['catch'](function (e2) {
        showError('Ошибка списка источников: ' + str(e2 && (e2.message || e2)));
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
      if (viewMode === 'sources' && stack.length) {
        var cat = stack[stack.length - 1];
        renderCatalog(cat, stack.length === 1);
        return;
      }
      if (stack.length > 1) {
        stack.pop();
        renderCatalog(stack[stack.length - 1], stack.length === 1);
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

  API.sourceEnabledKey = function (id) {
    return sourceEnabledKey(id);
  };

  API.setSourceEnabled = function (id, enabled) {
    setSourceEnabled(id, !!enabled);
    return true;
  };

  API.builtinSources = function () {
    return allSources();
  };

  API.getPreferredSource = function () {
    var preferred = str(sGet(LS.preferredSource, '') || '');
    if (!preferred) {
      var enabled = enabledSources();
      return enabled.length ? str(enabled[0].id) : '';
    }
    return preferred;
  };

  API.setPreferredSource = function (id) {
    sSet(LS.preferredSource, str(id || ''));
    return true;
  };

  API.getSources = function (opts) {
    opts = opts || {};
    if (opts.includeDisabled) return Promise.resolve(allSources());
    return Promise.resolve(enabledSources());
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

  API.openResultsScreen = function (movieCtx) {
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
    return API.getSources({ includeDisabled: true }).then(function (all) {
      var enabled = (all || []).filter(function (s) { return !!s.enabled; });
      var hasComponent = false;
      try { hasComponent = !!(window.Lampa && Lampa.Component && Lampa.Component.get && Lampa.Component.get(componentId())); } catch (_) { }
      return {
        ts: nowMs(),
        enabled: toBool(sGet(LS.enabled, '1'), true),
        debug: toBool(sGet(LS.debug, '0'), false),
        sourceCount: enabled.length,
        sourceTotal: all.length,
        sourceEnabled: enabled.length,
        preferred: API.getPreferredSource(),
        sourceIds: enabled.map(function (s) { return s.id; }).slice(0, 200),
        hasSourceKit: !!(MP.SourceKit && MP.SourceKit.listSources && MP.SourceKit.resolveCatalog),
        componentRegistered: hasComponent
      };
    });
  };

  API.showSources = function () {
    return API.getSources({ includeDisabled: true }).then(function (sources) {
      var text = 'BL-Mod built-in sources: ' + sources.length + '\n\n' + JSON.stringify(sources, null, 2);
      showModal('BL-Mod Builtin Sources', text);
      return sources;
    });
  };

  API.state = function () {
    var all = allSources();
    var enabled = all.filter(function (s) { return !!s.enabled; });
    return {
      ts: nowMs(),
      sourceTotal: all.length,
      sourceEnabled: enabled.length,
      preferred: API.getPreferredSource()
    };
  };

  API.resetDefaults = function () {
    sSet(LS.enabled, 'true');
    sSet(LS.debug, '0');
    sSet(LS.logLevel, 'normal');
    sSet(LS.preferredSource, '');
    BUILTIN_SOURCES.forEach(function (s) {
      try { sSet(sourceEnabledKey(s.id), '1'); } catch (_) { }
    });
    return true;
  };
})();
