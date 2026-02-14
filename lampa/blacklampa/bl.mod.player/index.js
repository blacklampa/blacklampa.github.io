(function () {
  'use strict';

  var BL = window.BL = window.BL || {};
  var MP = BL.ModPlayer = BL.ModPlayer || {};
  if (MP.__loaded) return;
  MP.__loaded = true;

  var VERSION = '1.0.0';
  var LOG_CAP = 120;

  var LS = {
    enabled: 'blmod.enabled',
    logLevel: 'blmod.log_level',
    lastSource: 'blmod.lastChoice.source',
    lastVoice: 'blmod.lastChoice.voice',
    lastBranch: 'blmod.lastChoice.branch',
    lastFile: 'blmod.lastChoice.file'
  };

  var LOG = {
    rows: [],
    cap: LOG_CAP
  };

  var STATE = {
    installed: false,
    busy: false,
    lastPlaybackMeta: null
  };

  function nowMs() {
    return Date.now();
  }

  function toInt(v, d) {
    var n = parseInt(v, 10);
    return isFinite(n) ? n : d;
  }

  function str(v) {
    return v === undefined || v === null ? '' : String(v);
  }

  function obj(v) {
    return v && typeof v === 'object' ? v : {};
  }

  function safeJson(v) {
    try { return JSON.stringify(v || {}); } catch (_) { return ''; }
  }

  function normalizeLogLevel(v) {
    var s = str(v || 'normal').toLowerCase();
    if (s !== 'silent' && s !== 'trace') s = 'normal';
    return s;
  }

  function currentLogLevel() {
    var lvl = 'normal';
    try { lvl = normalizeLogLevel(Lampa.Storage.get(LS.logLevel, 'normal')); } catch (_) { }
    return lvl;
  }

  function pushLogRow(level, msg, meta) {
    var t = nowMs();
    var m = str(msg || '');
    var payload = safeJson(meta || null);
    var key = str(level || 'INF') + '|' + m + '|' + payload;

    var rows = LOG.rows;
    var last = rows.length ? rows[rows.length - 1] : null;

    if (last && last.key === key) {
      last.n += 1;
      last.ts = t;
      return;
    }

    rows.push({
      ts: t,
      level: str(level || 'INF'),
      msg: m,
      meta: meta || null,
      n: 1,
      key: key
    });

    if (rows.length > LOG.cap) rows.splice(0, rows.length - LOG.cap);
  }

  function allowConsole(level) {
    var mode = currentLogLevel();
    if (mode === 'silent') return false;
    if (mode === 'trace') return true;
    return level !== 'DBG';
  }

  function consoleOut(level, msg, meta) {
    if (!allowConsole(level)) return;
    var line = '[BL-Mod] ' + str(level) + ' ' + str(msg);
    if (meta && typeof meta === 'object') line += ' | ' + safeJson(meta);
    try {
      if (level === 'ERR' && console.error) return console.error(line);
      if (level === 'WRN' && console.warn) return console.warn(line);
      if (level === 'DBG' && console.debug) return console.debug(line);
      if (console.log) console.log(line);
    } catch (_) { }
  }

  function log(level, msg, meta) {
    var lvl = str(level || 'INF').toUpperCase();
    pushLogRow(lvl, msg, meta || null);
    consoleOut(lvl, msg, meta || null);
  }

  function isEnabled() {
    try {
      var raw = Lampa.Storage.get(LS.enabled, 'true');
      return raw === true || raw === 'true' || raw === 1 || raw === '1';
    } catch (_) {
      return true;
    }
  }

  function readMap(key) {
    try {
      var data = Lampa.Storage.get(key, {});
      if (data && typeof data === 'object') return data;
    } catch (_) { }
    return {};
  }

  function writeMap(key, map) {
    try { Lampa.Storage.set(key, obj(map)); } catch (_) { }
  }

  function ctxKey(ctx) {
    return str(ctx && ctx.ctxSig || '');
  }

  function remember(mapKey, key, value) {
    var m = readMap(mapKey);
    m[str(key)] = value;
    writeMap(mapKey, m);
  }

  function recall(mapKey, key) {
    var m = readMap(mapKey);
    return m[str(key)];
  }

  function pickBySaved(rows, value, fields) {
    var found = null;
    fields = fields || ['id', 'value', 'title'];

    rows.some(function (r) {
      var ok = false;
      fields.some(function (f) {
        if (str(r && r[f]) && str(r[f]) === str(value)) {
          ok = true;
          return true;
        }
        return false;
      });
      if (ok) {
        found = r;
        return true;
      }
      return false;
    });

    return found;
  }

  function showNoty(text) {
    try {
      if (window.Lampa && Lampa.Noty && typeof Lampa.Noty.show === 'function') Lampa.Noty.show(str(text || 'BL-Mod error'));
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

  function showSourcesDiag(diag) {
    var lines = [];
    lines.push('BL-Mod: sources_empty');
    lines.push('hasSourceKit=' + (diag && diag.hasSourceKit ? 1 : 0));
    lines.push('componentRegistered=' + (diag && diag.componentRegistered ? 1 : 0));
    lines.push('builtin total=' + toInt(diag && diag.sourceTotal, 0));
    lines.push('builtin enabled=' + toInt(diag && diag.sourceEnabled, 0));
    lines.push('preferred=' + str(diag && diag.preferred || ''));

    try {
      var ids = (diag && diag.sourceIds && diag.sourceIds.length) ? diag.sourceIds.join(', ') : '';
      if (ids) lines.push('sourceIds=' + ids);
    } catch (_) { }

    lines.push('hint: включи хотя бы один builtin source в BL -> BL-Mod');
    showNoty('BL-Mod: sources_empty');

    try {
      if (window.Lampa && Lampa.Modal && typeof Lampa.Modal.open === 'function') {
        Lampa.Modal.open({
          title: 'BL-Mod Diagnostics',
          align: 'center',
          html: '<div class="about"><pre style="white-space:pre-wrap;word-break:break-word;max-height:70vh;overflow:auto">' + escHtml(lines.join('\n')) + '</pre></div>'
        });
        return;
      }
    } catch (_) { }
  }

  function hasComponent(name) {
    try {
      return !!(window.Lampa && Lampa.Component && typeof Lampa.Component.get === 'function' && Lampa.Component.get(name));
    } catch (_) {
      return false;
    }
  }

  function applySourceSelection(source) {
    var key = str(source && (source.key || source.id) || '');
    if (!key) return;
    try { Lampa.Storage.set('source', key); } catch (_) { }
    try { Lampa.Storage.set('active_balanser', key); } catch (_) { }
    try { Lampa.Storage.set('online_balanser', key); } catch (_) { }
    try { Lampa.Storage.set('online_mod_balanser', key); } catch (_) { }
    try { if (Lampa.Params && typeof Lampa.Params.trigger === 'function') Lampa.Params.trigger('source', key); } catch (_) { }
  }

  function onlinePushData(ctx, componentName) {
    var movie = obj(ctx && ctx.movie);
    var title = str(movie.title || movie.name || '');
    return {
      url: '',
      title: title ? ('BL-Mod: ' + title) : 'BL-Mod',
      component: componentName,
      search: title,
      search_one: title,
      search_two: str(movie.original_title || movie.original_name || ''),
      movie: movie,
      page: 1
    };
  }

  function delegateCandidates() {
    var list = [];
    var add = function (name) {
      if (!name) return;
      if (list.indexOf(name) >= 0) return;
      list.push(name);
    };

    try {
      var diag = MP.ScriptsRegistry && MP.ScriptsRegistry.inspect ? MP.ScriptsRegistry.inspect() : null;
      var flags = obj(diag && diag.flags);
      if (flags.loaded_modss) add('modss_online');
      if (flags.smotrolet_plugin) add('smotrolet');
      if (flags.onlyskaz_plugin) {
        add('lampacskaz');
        add('iptvskaz');
      }
    } catch (_) { }

    add('modss_online');
    add('online_mod');
    add('smotrolet');
    add('lampacskaz');
    add('iptvskaz');
    add('lampac');

    return list.filter(function (name) { return hasComponent(name); });
  }

  function delegatePlayToInstalledComponent(ctx, source) {
    var candidates = delegateCandidates();
    if (!candidates.length) return Promise.resolve(false);

    applySourceSelection(source);

    try {
      log('INF', 'delegate_source', {
        source: str(source && (source.key || source.id)),
        origin: str(source && source.origin || ''),
        candidates: candidates
      });
    } catch (_) { }

    return new Promise(function (resolve) {
      var ok = false;
      var i;
      for (i = 0; i < candidates.length; i++) {
        var componentName = candidates[i];
        try {
          Lampa.Activity.push(onlinePushData(ctx, componentName));
          log('OK', 'delegate_open_component', { component: componentName });
          ok = true;
          break;
        } catch (e) {
          log('WRN', 'delegate_component_fail', { component: componentName, err: str(e && e.message) });
        }
      }
      resolve(ok);
    });
  }

  function ensureDeps() {
    return !!(MP.OnlineCore && MP.SourceKit && MP.Player && MP.UI && MP.UI.Button);
  }

  function toPickerRows(list, mapFn) {
    var out = [];
    (list || []).forEach(function (item, i) {
      var row = mapFn(item, i);
      if (row) out.push(row);
    });
    return out;
  }

  function choose(title, rows, opts) {
    return MP.UI.Picker.choose(title, rows, opts || {}).then(function (res) {
      if (!res || res.canceled || !res.item) return null;
      return res.item.value;
    });
  }

  function linkTitle(item) {
    var title = str(item && (item.text || item.title || item.name || 'Раздел'));
    var se = [];
    if (item && item.season) se.push('S' + item.season);
    if (item && item.episode) se.push('E' + item.episode);
    return title + (se.length ? ' [' + se.join(' ') + ']' : '');
  }

  function fileTitle(item) {
    var parts = [];
    var name = str(item && (item.title || item.text || 'Файл'));
    if (name) parts.push(name);
    if (item && item.season) parts.push('S' + item.season);
    if (item && item.episode) parts.push('E' + item.episode);
    return parts.join(' ');
  }

  function chooseVoiceIfNeeded(ctx, source, catalog) {
    if (!catalog || !catalog.buttons || !catalog.buttons.length) return Promise.resolve(catalog);
    if (catalog.hasPlayable) return Promise.resolve(catalog);

    if (catalog.buttons.length === 1) {
      var only = catalog.buttons[0];
      if (only && only.url && !only.active) {
        return MP.SourceKit.resolveCatalogByUrl(ctx, source.id, only.url);
      }
      return Promise.resolve(catalog);
    }

    var key = ctxKey(ctx) + '|' + source.id;
    var savedVoice = recall(LS.lastVoice, key);

    var rows = toPickerRows(catalog.buttons, function (b) {
      return {
        title: str(b.text || b.title || 'Voice'),
        subtitle: b.active ? 'active' : '',
        value: b,
        id: str(b.url || b.text || '')
      };
    });

    var preferred = pickBySaved(rows, savedVoice, ['id', 'title']) || rows[0];
    if (preferred) {
      rows = [preferred].concat(rows.filter(function (r) { return r !== preferred; }));
    }

    return choose('BL-Mod: Источник -> Озвучка', rows, { subtitle: source.title }).then(function (voice) {
      if (!voice || !voice.url) return null;
      remember(LS.lastVoice, key, str(voice.url || voice.text || ''));
      return MP.SourceKit.resolveCatalogByUrl(ctx, source.id, voice.url);
    });
  }

  function chooseBranchUntilPlayable(ctx, source, catalog) {
    var depth = 0;

    function step(cat) {
      depth += 1;
      if (!cat) return Promise.resolve(null);

      if (cat.needsRch) {
        showNoty('BL-Mod: источник требует RCH и не может быть открыт автономно');
        return Promise.resolve(null);
      }

      if (cat.videos && cat.videos.length) return Promise.resolve(cat);

      var branches = [];
      if (cat.links && cat.links.length) branches = branches.concat(cat.links);
      if (!branches.length && cat.similar && cat.similar.length) branches = branches.concat(cat.similar);
      if (!branches.length) return Promise.resolve(null);

      var key = ctxKey(ctx) + '|' + source.id;
      var savedBranch = recall(LS.lastBranch, key);

      var rows = toPickerRows(branches, function (b) {
        return {
          title: linkTitle(b),
          subtitle: str(b.details || ''),
          value: b,
          id: str(b.url || b.title || b.text || '')
        };
      });

      var preferred = pickBySaved(rows, savedBranch, ['id', 'title']) || rows[0];
      if (preferred) rows = [preferred].concat(rows.filter(function (r) { return r !== preferred; }));

      return choose('BL-Mod: Раздел', rows, { subtitle: source.title }).then(function (branch) {
        if (!branch || !branch.url) return null;
        remember(LS.lastBranch, key, str(branch.url || branch.title || branch.text || ''));
        return MP.SourceKit.resolveCatalogByUrl(ctx, source.id, branch.url).then(step);
      });
    }

    return step(catalog);
  }

  function chooseFile(ctx, source, catalog) {
    if (!catalog || !catalog.videos || !catalog.videos.length) return Promise.resolve(null);

    var files = catalog.videos;
    if (files.length === 1) return Promise.resolve(files[0]);

    var key = ctxKey(ctx) + '|' + source.id;
    var savedFile = recall(LS.lastFile, key);

    var rows = toPickerRows(files, function (f) {
      var qualityMap = f.qualitys || f.quality || {};
      var qCount = 0;
      try {
        qCount = Lampa.Arrays.getKeys(qualityMap).length;
      } catch (_) {
        qCount = Object.keys(qualityMap || {}).length;
      }
      var sub = [];
      if (f.voice_name) sub.push(str(f.voice_name));
      if (qCount) sub.push('q:' + qCount);
      return {
        title: fileTitle(f),
        subtitle: sub.join(' • '),
        value: f,
        id: str(f.url || fileTitle(f))
      };
    });

    var preferred = pickBySaved(rows, savedFile, ['id', 'title']) || rows[0];
    if (preferred) rows = [preferred].concat(rows.filter(function (r) { return r !== preferred; }));

    return choose('BL-Mod: Файл', rows, { subtitle: source.title }).then(function (selected) {
      if (!selected) return null;
      remember(LS.lastFile, key, str(selected.url || fileTitle(selected)));
      return selected;
    });
  }

  function chooseSource(ctx, sources) {
    if (!sources || !sources.length) return Promise.resolve(null);
    if (sources.length === 1) return Promise.resolve(sources[0]);

    var key = ctxKey(ctx);
    var saved = recall(LS.lastSource, key);
    var preferredObj = null;

    var rows = toPickerRows(sources, function (s) {
      var sub = [];
      if (s && s.kind) sub.push(str(s.kind));
      if (s && s.origin) sub.push(str(s.origin));
      return {
        title: str(s.title || s.id),
        subtitle: sub.join(' • '),
        value: s,
        id: str(s.id || '')
      };
    });

    var preferred = pickBySaved(rows, saved, ['id', 'title']);
    if (!preferred && preferredObj) preferred = pickBySaved(rows, str(preferredObj.id || preferredObj.key || ''), ['id']);
    if (!preferred) preferred = rows[0];
    if (preferred) rows = [preferred].concat(rows.filter(function (r) { return r !== preferred; }));

    return choose('BL-Mod: Источники', rows, { subtitle: str((ctx.movie && (ctx.movie.title || ctx.movie.name)) || '') }).then(function (selected) {
      if (!selected) return null;
      remember(LS.lastSource, key, str(selected.id));
      return selected;
    });
  }

  function buildContext(movieArg) {
    if (MP.SourceKit && typeof MP.SourceKit.buildContext === 'function') {
      var ctx = MP.SourceKit.buildContext(movieArg);
      if (ctx && ctx.movie) return ctx;
    }

    var movie = movieArg || null;
    try {
      if (!movie && window.Lampa && Lampa.Activity && typeof Lampa.Activity.active === 'function') {
        var act = Lampa.Activity.active();
        movie = (act && (act.card || (act.activity && act.activity.card) || (act.activity && act.activity.movie))) || null;
      }
    } catch (_) { }
    if (!movie) return null;

    var copy = $.extend(true, {}, movie);
    var seed = str(copy.id || copy.tmdb_id || copy.imdb_id || copy.kinopoisk_id || (copy.title || copy.name || '') + '|' + nowMs());
    var sig = (MP.SourceKit && typeof MP.SourceKit.hashSig === 'function') ? MP.SourceKit.hashSig(seed) : seed;

    return {
      movie: copy,
      queryTitle: str(copy.title || copy.name || ''),
      clarification: false,
      similar: false,
      ctxSig: sig,
      createdTs: nowMs(),
      memkey: ''
    };
  }

  function playViaLegacySourceKit(ctx, source) {
    if (!(MP.SourceKit && MP.Resolver && MP.Player)) return Promise.resolve(false);
    if (!(MP.SourceKit.resolveCatalog && MP.SourceKit.resolveFile)) return Promise.resolve(false);

    return MP.SourceKit.resolveCatalog(ctx, source.id).then(function (catalog) {
      if (!catalog) return null;
      return chooseVoiceIfNeeded(ctx, source, catalog).then(function (voiceCatalog) {
        return chooseBranchUntilPlayable(ctx, source, voiceCatalog || catalog).then(function (finalCatalog) {
          if (!finalCatalog) return null;
          return chooseFile(ctx, source, finalCatalog).then(function (selectedFile) {
            if (!selectedFile) return null;
            return MP.SourceKit.resolveFile(ctx, source.id, selectedFile).then(function (resolved) {
              return MP.Player.playResolved(ctx, source, selectedFile, resolved, finalCatalog).then(function (payload) {
                STATE.lastPlaybackMeta = payload && payload.blmod ? payload.blmod : null;
                return true;
              });
            });
          });
        });
      });
    })['catch'](function (e) {
      log('WRN', 'legacy_sourcekit_fail', { err: str(e && (e.message || e.msg || e.c || 'unknown')) });
      return false;
    });
  }

  function openFlow(movieArg) {
    if (STATE.busy) {
      showNoty('BL-Mod: дождитесь завершения текущего выбора');
      return Promise.resolve(false);
    }

    if (!isEnabled()) {
      showNoty('BL-Mod отключен (blmod.enabled=false)');
      return Promise.resolve(false);
    }

    if (!ensureDeps()) {
      showNoty('BL-Mod не готов: отсутствуют модули');
      return Promise.resolve(false);
    }

    var ctx = buildContext(movieArg);
    if (!ctx || !ctx.movie) {
      showNoty('BL-Mod: не удалось получить контекст карточки');
      return Promise.resolve(false);
    }

    STATE.busy = true;
    log('INF', 'flow_start', { ctx: ctx.ctxSig, title: ctx.movie.title || ctx.movie.name || '' });

    return MP.OnlineCore.getSources({ force: false }).then(function (sources) {
      if (!sources || !sources.length) {
        return MP.OnlineCore.diagnose().then(function (diag) {
          log('ERR', 'sources_empty', diag || {});
          showSourcesDiag(diag);
          throw new Error('sources_empty');
        });
      }
      log('INF', 'online_sources_ready', {
        count: sources.length,
        keys: sources.map(function (s) { return str(s.id || s.key || s.title); }).slice(0, 50)
      });
      return MP.OnlineCore.openResultsScreen(ctx.movie, { autoSearch: true }).then(function (ok) {
        if (!ok) throw new Error('open_results_screen_failed');
        STATE.lastPlaybackMeta = {
          sourceId: '',
          origin: 'online_core',
          ctxSig: str(ctx.ctxSig || ''),
          mode: 'results_screen',
          ts: nowMs()
        };
        return true;
      });
    }).then(function (ok) {
      STATE.busy = false;
      if (!ok) {
        log('INF', 'flow_canceled', { ctx: ctx.ctxSig });
        return false;
      }
      log('OK', 'flow_done', { ctx: ctx.ctxSig });
      return true;
    })['catch'](function (e) {
      STATE.busy = false;
      var err = str(e && (e.message || e.msg || e.c || 'unknown'));
      log('ERR', 'flow_failed', { err: err });
      if (err !== 'sources_empty') showNoty('BL-Mod: ' + err);
      return false;
    });
  }

  function installStopHook() {
    try {
      if (!window.Lampa || !Lampa.Player || !Lampa.Player.listener || typeof Lampa.Player.listener.follow !== 'function') return;

      Lampa.Player.listener.follow('send', function (e) {
        try {
          if (!e || !e.type) return;
          var t = str(e.type).toLowerCase();
          if (t !== 'destroy' && t !== 'stop' && t !== 'close' && t !== 'end') return;
          if (!STATE.lastPlaybackMeta) return;
          MP.Player.notifyStop(STATE.lastPlaybackMeta);
        } catch (_) { }
      });
    } catch (_) { }
  }

  MP.version = VERSION;
  MP.log = log;
  MP.logTail = function () { return LOG.rows.slice(); };
  MP.state = function () {
    return {
      version: VERSION,
      installed: STATE.installed,
      busy: STATE.busy,
      enabled: isEnabled(),
      logLevel: currentLogLevel(),
      lastPlaybackMeta: STATE.lastPlaybackMeta
    };
  };

  MP.openFromCard = function (movie) {
    return openFlow(movie);
  };

  MP.open = MP.openFromCard;

  MP.ensureDonorsLoaded = function (force) {
    return Promise.resolve(null);
  };

  MP.sourcesDump = function () {
    return MP.OnlineCore && MP.OnlineCore.state ? MP.OnlineCore.state() : {};
  };

  MP.sourcesDiag = function (ctx, force) {
    if (!MP.OnlineCore || !MP.OnlineCore.diagnose) return Promise.resolve(null);
    return MP.OnlineCore.diagnose();
  };

  MP.install = function () {
    if (STATE.installed) return true;

    if (!ensureDeps()) {
      setTimeout(MP.install, 500);
      return false;
    }

    STATE.installed = true;

    try { MP.UI.Button.install(); } catch (e) { log('ERR', 'button_install_fail', { err: str(e && e.message) }); }
    installStopHook();

    log('OK', 'installed', { version: VERSION });
    return true;
  };

  MP.install();
})();
