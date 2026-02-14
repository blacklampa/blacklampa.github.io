(function () {
  'use strict';

  var BL = window.BL = window.BL || {};
  var MP = BL.ModPlayer = BL.ModPlayer || {};
  if (MP.UI && MP.UI.Picker && MP.UI.Picker.__loaded) return;

  MP.UI = MP.UI || {};
  var Picker = MP.UI.Picker = MP.UI.Picker || {};
  Picker.__loaded = true;

  var POPUP_FONT = '12px/1.35 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif';
  var CTRL_ID = 'blmod_picker';
  var CSS_PATH = 'bl.mod.player/ui/popup.css';

  var STATE = {
    open: false,
    host: null,
    shadow: null,
    root: null,
    titleEl: null,
    bodyEl: null,
    footerEl: null,
    items: [],
    index: 0,
    resolve: null,
    prevController: 'content',
    controllerAdded: false,
    cssText: '',
    cssLoaded: false,
    cssLoading: false,
    cssWaiters: []
  };

  var CSS_FALLBACK = [
    ':host, .blmod-popup, .blmod-popup * { box-sizing: border-box; }',
    '.blmod-popup { all: initial; font: ' + POPUP_FONT + '; position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 72vw; max-width: 72vw; max-height: 80vh; display: flex; flex-direction: column; background: rgba(12,12,12,0.96); color: #f2f2f2; border: 1px solid rgba(255,255,255,0.16); border-radius: 10px; z-index: 2147483647; }',
    '.blmod-head { flex: 0 0 auto; padding: 10px 12px; border-bottom: 1px solid rgba(255,255,255,0.12); font: ' + POPUP_FONT + '; color: #c7e4ff; }',
    '.blmod-body { flex: 1; overflow: auto; padding: 8px 0; font: ' + POPUP_FONT + '; }',
    '.blmod-item { all: initial; display: block; font: ' + POPUP_FONT + '; color: #efefef; padding: 8px 12px; border-bottom: 1px solid rgba(255,255,255,0.05); cursor: pointer; }',
    '.blmod-item.focus { background: rgba(93,176,255,0.18); }',
    '.blmod-item-sub { display: block; font: 11px/1.3 ' + POPUP_FONT.split(' ').slice(1).join(' ') + '; color: rgba(255,255,255,0.62); margin-top: 2px; }',
    '.blmod-foot { flex: 0 0 auto; padding: 8px 12px; border-top: 1px solid rgba(255,255,255,0.12); color: rgba(255,255,255,0.7); font: ' + POPUP_FONT + '; }'
  ].join('\n');

  function nowMs() {
    return Date.now();
  }

  function str(v) {
    return v === undefined || v === null ? '' : String(v);
  }

  function esc(s) {
    return str(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function log(level, msg, meta) {
    try {
      if (MP && typeof MP.log === 'function') MP.log(level, msg, meta || null);
    } catch (_) { }
  }

  function abs(url) {
    try {
      var base = (BL.ctx && BL.ctx.base) ? BL.ctx.base : location.href;
      return String(new URL(str(url), base).href);
    } catch (_) {
      return str(url);
    }
  }

  function loadCssOnce(done) {
    if (STATE.cssLoaded) return done(STATE.cssText || CSS_FALLBACK);

    STATE.cssWaiters.push(done);
    if (STATE.cssLoading) return;

    STATE.cssLoading = true;
    $.ajax({
      url: abs(CSS_PATH),
      dataType: 'text',
      timeout: 4000
    }).done(function (css) {
      STATE.cssText = str(css || '').trim() || CSS_FALLBACK;
      STATE.cssLoaded = true;
      STATE.cssLoading = false;
      while (STATE.cssWaiters.length) {
        try { STATE.cssWaiters.shift()(STATE.cssText); } catch (_) { }
      }
    }).fail(function () {
      STATE.cssText = CSS_FALLBACK;
      STATE.cssLoaded = true;
      STATE.cssLoading = false;
      while (STATE.cssWaiters.length) {
        try { STATE.cssWaiters.shift()(STATE.cssText); } catch (_) { }
      }
    });
  }

  function ensureController() {
    if (STATE.controllerAdded) return;
    STATE.controllerAdded = true;

    try {
      Lampa.Controller.add(CTRL_ID, {
        up: function () {
          if (!STATE.open) return;
          if (!STATE.items.length) return;
          STATE.index = (STATE.index - 1 + STATE.items.length) % STATE.items.length;
          renderItems();
        },
        down: function () {
          if (!STATE.open) return;
          if (!STATE.items.length) return;
          STATE.index = (STATE.index + 1) % STATE.items.length;
          renderItems();
        },
        left: function () {
          if (!STATE.open) return;
        },
        right: function () {
          if (!STATE.open) return;
        },
        enter: function () {
          if (!STATE.open) return;
          if (!STATE.items.length) return;
          resolveWith(STATE.items[STATE.index]);
        },
        back: function () {
          if (!STATE.open) return;
          resolveWith(null, true);
        }
      });
    } catch (e) {
      log('WRN', 'picker_controller_add_fail', { err: e && e.message ? e.message : String(e) });
    }
  }

  function destroyDom() {
    try {
      if (STATE.host && STATE.host.parentNode) STATE.host.parentNode.removeChild(STATE.host);
    } catch (_) { }

    STATE.host = null;
    STATE.shadow = null;
    STATE.root = null;
    STATE.titleEl = null;
    STATE.bodyEl = null;
    STATE.footerEl = null;
  }

  function resolveWith(item, byBack) {
    var done = STATE.resolve;
    STATE.resolve = null;
    STATE.open = false;

    destroyDom();

    try {
      if (window.Lampa && Lampa.Controller && typeof Lampa.Controller.toggle === 'function') {
        Lampa.Controller.toggle(str(STATE.prevController || 'content'));
      }
    } catch (_) { }

    if (typeof done === 'function') {
      done({
        canceled: !item,
        back: !!byBack,
        item: item || null
      });
    }
  }

  function renderItems() {
    if (!STATE.bodyEl) return;

    var html = '';
    STATE.items.forEach(function (row, idx) {
      var cls = 'blmod-item' + (idx === STATE.index ? ' focus' : '');
      html += '<div class="' + cls + '" data-idx="' + idx + '">' +
        esc(row.title || '') +
        (row.subtitle ? '<span class="blmod-item-sub">' + esc(row.subtitle) + '</span>' : '') +
      '</div>';
    });

    STATE.bodyEl.innerHTML = html;

    var nodes = STATE.bodyEl.querySelectorAll('.blmod-item');
    var i;
    for (i = 0; i < nodes.length; i++) {
      (function (n) {
        n.addEventListener('mouseenter', function () {
          var idx = parseInt(n.getAttribute('data-idx'), 10);
          if (!isFinite(idx)) return;
          STATE.index = idx;
          renderItems();
        });
        n.addEventListener('click', function () {
          var idx = parseInt(n.getAttribute('data-idx'), 10);
          if (!isFinite(idx)) return;
          STATE.index = idx;
          resolveWith(STATE.items[idx]);
        });
      })(nodes[i]);
    }

    try {
      var focusNode = STATE.bodyEl.querySelector('.blmod-item.focus');
      if (focusNode && typeof focusNode.scrollIntoView === 'function') {
        focusNode.scrollIntoView({ block: 'nearest' });
      }
    } catch (_) { }
  }

  function createDom(title, subtitle, rows, resolveFn) {
    destroyDom();

    STATE.items = rows || [];
    STATE.index = 0;
    STATE.resolve = resolveFn;

    STATE.host = document.createElement('div');
    STATE.host.className = 'blmod-popup-host';

    try {
      STATE.shadow = STATE.host.attachShadow({ mode: 'open' });
    } catch (_) {
      STATE.shadow = null;
    }

    var rootDoc = STATE.shadow || STATE.host;

    var style = document.createElement('style');
    style.type = 'text/css';
    style.textContent = STATE.cssText || CSS_FALLBACK;

    var root = document.createElement('div');
    root.className = 'blmod-popup';

    var head = document.createElement('div');
    head.className = 'blmod-head';
    head.innerHTML = esc(title || 'BL-Mod') + (subtitle ? ('<br><span class="blmod-item-sub">' + esc(subtitle) + '</span>') : '');

    var body = document.createElement('div');
    body.className = 'blmod-body';

    var foot = document.createElement('div');
    foot.className = 'blmod-foot';
    foot.textContent = 'OK: выбрать   Back: назад';

    root.appendChild(head);
    root.appendChild(body);
    root.appendChild(foot);

    rootDoc.appendChild(style);
    rootDoc.appendChild(root);

    STATE.root = root;
    STATE.titleEl = head;
    STATE.bodyEl = body;
    STATE.footerEl = foot;

    document.body.appendChild(STATE.host);
    renderItems();
  }

  Picker.choose = function (title, rows, opts) {
    opts = opts || {};

    var items = (rows || []).filter(function (r) { return !!r; });
    if (!items.length) {
      return Promise.resolve({ canceled: true, back: false, item: null });
    }

    ensureController();

    return new Promise(function (resolve) {
      loadCssOnce(function () {
        STATE.open = true;

        try {
          var enabled = Lampa.Controller.enabled();
          STATE.prevController = str(enabled && enabled.name || 'content');
        } catch (_) {
          STATE.prevController = 'content';
        }

        createDom(title || 'BL-Mod', opts.subtitle || '', items, resolve);

        try {
          if (window.Lampa && Lampa.Controller && typeof Lampa.Controller.toggle === 'function') {
            Lampa.Controller.toggle(CTRL_ID);
          }
        } catch (_) { }
      });
    });
  };

  Picker.close = function () {
    if (!STATE.open) return;
    resolveWith(null, true);
  };
})();
