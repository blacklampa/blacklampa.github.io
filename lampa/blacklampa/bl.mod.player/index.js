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

  var LEVELS = {
    silent: 0,
    normal: 1,
    trace: 2
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

  function ensureDeps() {
    return !!(MP.SourceKit && MP.Resolver && MP.Player && MP.UI && MP.UI.Picker && MP.UI.Button);
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

    var rows = toPickerRows(sources, function (s) {
      return {
        title: str(s.title || s.id),
        subtitle: str(s.kind || 'source'),
        value: s,
        id: str(s.id || '')
      };
    });

    var preferred = pickBySaved(rows, saved, ['id', 'title']) || rows[0];
    if (preferred) rows = [preferred].concat(rows.filter(function (r) { return r !== preferred; }));

    return choose('BL-Mod: Источники', rows, { subtitle: str((ctx.movie && (ctx.movie.title || ctx.movie.name)) || '') }).then(function (selected) {
      if (!selected) return null;
      remember(LS.lastSource, key, str(selected.id));
      return selected;
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

    var ctx = MP.SourceKit.buildContext(movieArg);
    if (!ctx || !ctx.movie) {
      showNoty('BL-Mod: не удалось получить контекст карточки');
      return Promise.resolve(false);
    }

    STATE.busy = true;
    log('INF', 'flow_start', { ctx: ctx.ctxSig, title: ctx.movie.title || ctx.movie.name || '' });

    return MP.SourceKit.listSources(ctx).then(function (sources) {
      if (!sources || !sources.length) throw new Error('sources_empty');
      return chooseSource(ctx, sources);
    }).then(function (source) {
      if (!source) return null;
      return MP.SourceKit.resolveCatalog(ctx, source.id).then(function (catalog) {
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
      showNoty('BL-Mod: ' + err);
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
