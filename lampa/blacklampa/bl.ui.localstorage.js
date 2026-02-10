(function () {
  'use strict';

  var BL = window.BL = window.BL || {};
  BL.LocalStorageManager = BL.LocalStorageManager || {};

  var API = BL.LocalStorageManager;
  if (API.__blLocalStorageManagerLoaded) return;
  API.__blLocalStorageManagerLoaded = true;

  var STATE = {
    inited: false,
    open: false,
    keyHandlerInstalled: false,

    styleEl: null,
    baseStyleEl: null,
    rootEl: null,
    listScrollEl: null,
    listEl: null,
    filterEl: null,
    closeBtnEl: null,
    footerEl: null,

    contentTitleEl: null,
    contentStateEl: null,
    contentScrollEl: null,

    keyEl: null,
    renameBtnEl: null,
    renameOkEl: null,
    renameCancelEl: null,

    valueEl: null,

    saveBtnEl: null,
    deleteBtnEl: null,
    copyKeyBtnEl: null,
    copyValBtnEl: null,
    fmtJsonBtnEl: null,
    minJsonBtnEl: null,
    addBtnEl: null,

    metaLenEl: null,
    metaJsonEl: null,
    metaJsonErrEl: null,

    addWrapEl: null,
    addKeyEl: null,
    addValEl: null,
    addCreateEl: null,
    addCancelEl: null,
    addErrEl: null,

    focusZone: 'list',
    filter: '',
    allKeys: [],
    keys: [],
    rows: [],
    selectedIndex: 0,
    selectedKey: '',
    renameMode: false
  };

  function safe(fn, fallback) { try { return fn(); } catch (_) { return fallback; } }

  function getConfigSafe() {
    try { return (BL.Config && typeof BL.Config.get === 'function') ? (BL.Config.get() || {}) : (BL.Config || {}); } catch (_) { }
    return {};
  }

  function getPopupZIndex() {
    try {
      var cfg = getConfigSafe();
      var uiCfg = cfg.ui || {};
      if (typeof uiCfg.popupZIndex === 'number') return uiCfg.popupZIndex + 4;
    } catch (_) { }
    return 100000 + 4;
  }

  function showNoty(msg) {
    try { if (window.Lampa && Lampa.Noty && typeof Lampa.Noty.show === 'function') return Lampa.Noty.show(String(msg || '')); } catch (_) { }
    try { if (window.console && console.log) console.log('[BlackLampa] ' + String(msg || '')); } catch (_) { }
  }

  function confirmAction(title, text, onYes) {
    try {
      if (window.Lampa && Lampa.Modal && typeof Lampa.Modal.open === 'function' && window.$) {
        var html = $('<div class="about"></div>');
        var t = $('<div class="about__text"></div>');
        t.text(String(text || title || 'Confirm?'));
        html.append(t);
        Lampa.Modal.open({
          title: String(title || ''),
          size: 'medium',
          align: 'center',
          mask: true,
          html: html,
          onBack: function () {
            try { if (Lampa.Modal && Lampa.Modal.close) Lampa.Modal.close(); } catch (_) { }
          },
          buttons: [{
            name: 'Отмена',
            onSelect: function () {
              try { if (Lampa.Modal && Lampa.Modal.close) Lampa.Modal.close(); } catch (_) { }
            }
          }, {
            name: 'OK',
            onSelect: function () {
              try { if (Lampa.Modal && Lampa.Modal.close) Lampa.Modal.close(); } catch (_) { }
              try { if (typeof onYes === 'function') onYes(); } catch (_) { }
            }
          }]
        });
        return;
      }
    } catch (_) { }
    try { if (window.confirm(String(text || title || 'Confirm?'))) { if (typeof onYes === 'function') onYes(); } } catch (_) { }
  }

  function isModalOpen() {
    try {
      if (window.Lampa && Lampa.Controller && typeof Lampa.Controller.enabled === 'function') {
        var en = Lampa.Controller.enabled();
        return !!(en && en.name && String(en.name) === 'modal');
      }
    } catch (_) { }
    return false;
  }

  function isEditableEl(el) {
    try {
      if (!el) return false;
      var tag = String(el.tagName || '').toUpperCase();
      if (tag === 'INPUT' || tag === 'TEXTAREA') return true;
      if (el.isContentEditable) return true;
    } catch (_) { }
    return false;
  }

  function isBackKeyCode(k, allowBackspace) {
    if (k === 27 || k === 461 || k === 10009) return true;
    if (allowBackspace && (k === 8 || k === 4)) return true;
    return false;
  }

  function isOkKeyCode(k) { return k === 13 || k === 23; }

  function clamp(n, a, b) {
    if (n < a) return a;
    if (n > b) return b;
    return n;
  }

  function truncateText(s, max) {
    try {
      s = (s === undefined || s === null) ? '' : String(s);
      max = (typeof max === 'number' && max > 0) ? max : 60;
      return (s.length <= max) ? s : (s.slice(0, max - 1) + '…');
    } catch (_) { return ''; }
  }

  function lsSupported() {
    try { return !!(window.localStorage && typeof localStorage.getItem === 'function'); } catch (_) { return false; }
  }

  function lsGet(k) { try { return lsSupported() ? localStorage.getItem(String(k)) : null; } catch (_) { return null; } }
  function lsSet(k, v) { try { if (!lsSupported()) return false; localStorage.setItem(String(k), String(v)); return true; } catch (_) { return false; } }
  function lsDel(k) { try { if (!lsSupported()) return false; localStorage.removeItem(String(k)); return true; } catch (_) { return false; } }
  function lsHas(k) { try { return lsGet(k) !== null; } catch (_) { return false; } }

  function guessType(raw) {
    try {
      if (raw === null || raw === undefined) return { kind: 'missing', label: 'MISSING' };
      var s = String(raw);
      if (s === '') return { kind: 'empty', label: 'empty' };

      var t = s.trim();
      if (t === '') return { kind: 'empty', label: 'empty' };
      if (t === 'null') return { kind: 'null', label: 'null' };
      if (t === 'true' || t === 'false') return { kind: 'bool', label: 'bool' };

      if (/^-?\d+(\.\d+)?$/.test(t)) return { kind: 'number', label: 'number' };

      if ((t.charAt(0) === '{' && t.charAt(t.length - 1) === '}') || (t.charAt(0) === '[' && t.charAt(t.length - 1) === ']')) {
        if (t.length <= 20000) {
          try {
            var parsed = JSON.parse(t);
            if (parsed && typeof parsed === 'object') return { kind: 'json', label: 'JSON' };
          } catch (_) { }
        }
      }

      return { kind: 'string', label: 'string' };
    } catch (_) {
      return { kind: 'string', label: 'string' };
    }
  }

  function jsonInfo(text) {
    var out = { ok: false, err: '', value: null };
    try {
      var s = (text === undefined || text === null) ? '' : String(text);
      var t = s.trim();
      if (t === '') {
        out.ok = false;
        out.err = 'empty';
        return out;
      }
      out.value = JSON.parse(t);
      out.ok = true;
      return out;
    } catch (e) {
      out.ok = false;
      try { out.err = e && e.message ? String(e.message) : String(e); } catch (_) { out.err = 'parse error'; }
      return out;
    }
  }

  function logInfo(msg, extra) {
    try { if (window.BL && BL.Log && typeof BL.Log.showInfo === 'function') return BL.Log.showInfo('LocalStorage', String(msg || ''), extra); } catch (_) { }
  }

  function copyTextToClipboard(text) {
    text = (text === undefined || text === null) ? '' : String(text);

    try {
      if (navigator && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return false; });
      }
    } catch (_) { }

    return new Promise(function (resolve) {
      try {
        if (!document || !document.createElement) return resolve(false);
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        ta.style.top = '-9999px';
        (document.body || document.documentElement).appendChild(ta);
        ta.select();
        var ok = false;
        try { ok = document.execCommand('copy'); } catch (_) { ok = false; }
        try { ta.parentNode.removeChild(ta); } catch (_) { }
        resolve(!!ok);
      } catch (_) {
        resolve(false);
      }
    });
  }

  function ensureBaseStyle() {
    try {
      if (STATE.baseStyleEl) return;
      if (!document || !document.createElement) return;
      if (document.getElementById('__bl_fs_style')) return;
      if (document.getElementById('__bl_ls_fs_style')) return;

      var st = document.createElement('style');
      st.type = 'text/css';
      st.id = '__bl_ls_fs_style';
      st.textContent = [
        '.bl_fs_root{position:fixed;top:18px;left:18px;right:18px;bottom:18px;display:none;background:rgba(0,0,0,0.70);color:#fff;z-index:100000;font-family:system-ui,-apple-system,\"Segoe UI\",Roboto,Arial,sans-serif;}',
        '.bl_fs_panel{position:absolute;top:0;left:0;right:0;bottom:0;display:flex;flex-direction:column;background:rgba(20,20,20,0.97);border:1px solid rgba(255,255,255,0.10);border-radius:14px;overflow:hidden;}',
        '.bl_fs_header{padding:10px 12px;border-bottom:1px solid rgba(255,255,255,0.10);}',
        '.bl_fs_header_top{display:flex;gap:10px;align-items:center;justify-content:space-between;}',
        '.bl_fs_title{font-size:16px;font-weight:650;letter-spacing:0.2px;}',
        '.bl_fs_close{flex:0 0 auto;cursor:pointer;user-select:none;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.18);color:#fff;font-size:12px;line-height:1;border-radius:999px;padding:5px 10px;}',
        '.bl_fs_help{margin-top:4px;font-size:12px;opacity:0.85;}',
        '.bl_fs_progress_row{display:flex;gap:10px;align-items:center;margin-top:8px;}',
        '.bl_fs_progress{flex:1;min-width:0;height:6px;background:rgba(255,255,255,0.12);border-radius:999px;overflow:hidden;}',
        '.bl_fs_progress_fill{height:100%;width:0%;background:#52c41a;}',
        '.bl_fs_progress_count{flex:0 0 auto;font-size:11px;opacity:0.85;}',
        '.bl_fs_body{flex:1;min-height:0;display:flex;}',
        '.bl_fs_col{min-height:0;display:flex;flex-direction:column;}',
        '.bl_fs_list_col{width:42%;min-width:320px;border-right:1px solid rgba(255,255,255,0.10);}',
        '.bl_fs_list_scroll{flex:1;min-height:0;overflow:auto;}',
        '.bl_fs_list{display:flex;flex-direction:column;}',
        '.bl_fs_row{display:flex;gap:10px;align-items:center;padding:8px 10px;border-bottom:1px solid rgba(255,255,255,0.06);}',
        '.bl_fs_row_main{flex:1;min-width:0;}',
        '.bl_fs_row_url{font-size:12px;word-break:break-all;}',
        '.bl_fs_row_tag{font-size:11px;opacity:0.70;margin-top:2px;}',
        '.bl_fs_row_status{flex:0 0 auto;font-size:11px;padding:2px 7px;border-radius:999px;border:1px solid rgba(255,255,255,0.18);opacity:0.95;}',
        '.bl_fs_row_sel{background:rgba(64,169,255,0.18);}',
        '.bl_fs_row_state_ok .bl_fs_row_status{color:#52c41a;border-color:rgba(82,196,26,0.70);}',
        '.bl_fs_row_state_loading .bl_fs_row_status{color:#ffa940;border-color:rgba(255,169,64,0.75);}',
        '.bl_fs_row_state_unknown .bl_fs_row_status{color:#8c8c8c;border-color:rgba(140,140,140,0.55);}',
        '.bl_fs_row_state_missing .bl_fs_row_status{color:#ff4d4f;border-color:rgba(255,77,79,0.75);}',
        '.bl_fs_row_state_blocked .bl_fs_row_status{color:#ff4d4f;border-color:rgba(255,77,79,0.75);}',
        '.bl_fs_row_state_timeout .bl_fs_row_status{color:#ff4d4f;border-color:rgba(255,77,79,0.75);}',
        '.bl_fs_row_state_err .bl_fs_row_status{color:#ff4d4f;border-color:rgba(255,77,79,0.75);}',
        '.bl_fs_content_col{flex:1;min-width:0;}',
        '.bl_fs_content_head{display:flex;gap:10px;align-items:baseline;padding:10px 12px;border-bottom:1px solid rgba(255,255,255,0.10);}',
        '.bl_fs_content_title{flex:1;min-width:0;font-size:12px;opacity:0.92;word-break:break-all;}',
        '.bl_fs_content_state{flex:0 0 auto;font-size:11px;opacity:0.92;}',
        '.bl_fs_content_scroll{flex:1;min-height:0;overflow:auto;padding:10px 12px;}',
        '.bl_fs_content_pre{margin:0;font:12px/1.35 system-ui,-apple-system,\"Segoe UI\",Roboto,Arial,sans-serif;white-space:pre-wrap;}',
        '.bl_fs_nowrap .bl_fs_content_pre{white-space:pre;}',
        '.bl_fs_footer{padding:8px 12px;border-top:1px solid rgba(255,255,255,0.10);font-size:12px;opacity:0.92;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
        '.bl_fs_focus_list .bl_fs_list_col{box-shadow:inset 0 0 0 2px rgba(64,169,255,0.55);}',
        '.bl_fs_focus_content .bl_fs_content_col{box-shadow:inset 0 0 0 2px rgba(64,169,255,0.55);}'
      ].join('');

      (document.head || document.documentElement).appendChild(st);
      STATE.baseStyleEl = st;
    } catch (_) { }
  }

  function ensureStyle() {
    try {
      if (STATE.styleEl) return;
      if (!document || !document.createElement) return;
      ensureBaseStyle();

      var st = document.createElement('style');
      st.type = 'text/css';
      st.id = '__bl_ls_style';
      st.textContent = [
        '.bl_ls_list_head{padding:8px 10px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;gap:8px;align-items:center;}',
        '.bl_ls_filter{flex:1;min-width:0;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.14);color:#fff;border-radius:10px;padding:6px 10px;font-size:12px;outline:none;}',
        '.bl_ls_filter::placeholder{color:rgba(255,255,255,0.55);}',
        '.bl_ls_count{flex:0 0 auto;font-size:11px;opacity:0.75;}',
        '.bl_ls_editor{display:flex;flex-direction:column;gap:12px;}',
        '.bl_ls_section{display:flex;flex-direction:column;gap:6px;}',
        '.bl_ls_label{font-size:11px;opacity:0.80;}',
        '.bl_ls_row_line{display:flex;gap:8px;align-items:center;}',
        '.bl_ls_input{flex:1;min-width:0;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.14);color:#fff;border-radius:10px;padding:6px 10px;font-size:12px;outline:none;}',
        '.bl_ls_input[readonly]{opacity:0.82;}',
        '.bl_ls_textarea{width:100%;min-height:170px;resize:vertical;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.14);color:#fff;border-radius:12px;padding:8px 10px;font-size:12px;line-height:1.35;outline:none;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,\"Liberation Mono\",\"Courier New\",monospace;}',
        '.bl_ls_actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;}',
        '.bl_ls_btn{cursor:pointer;user-select:none;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.18);color:#fff;font-size:12px;line-height:1.2;border-radius:12px;padding:8px 10px;text-align:center;}',
        '.bl_ls_btn:hover{background:rgba(255,255,255,0.10);}',
        '.bl_ls_btn:disabled{opacity:0.45;cursor:not-allowed;}',
        '.bl_ls_meta{font-size:11px;opacity:0.88;display:flex;flex-direction:column;gap:4px;}',
        '.bl_ls_meta_k{opacity:0.70;}',
        '.bl_ls_meta_err{opacity:0.85;color:#ff7875;white-space:pre-wrap;}',
        '.bl_ls_add{display:none;padding:10px 12px;border:1px solid rgba(255,255,255,0.10);border-radius:12px;background:rgba(0,0,0,0.25);}',
        '.bl_ls_add.bl_ls_add_on{display:block;}',
        '.bl_ls_hint{font-size:11px;opacity:0.75;}'
      ].join('');

      (document.head || document.documentElement).appendChild(st);
      STATE.styleEl = st;
    } catch (_) { }
  }

  function ensureDom() {
    try {
      if (STATE.rootEl) return;
      if (!document || !document.createElement) return;
      ensureStyle();

      var root = document.createElement('div');
      root.id = '__bl_ls_root';
      root.className = 'bl_fs_root bl_fs_focus_list';
      root.style.zIndex = String(getPopupZIndex());
      root.innerHTML = [
        '<div class="bl_fs_panel">',
          '<div class="bl_fs_header">',
            '<div class="bl_fs_header_top">',
              '<div class="bl_fs_title">LocalStorage</div>',
              '<button class="bl_fs_close" type="button">× Закрыть</button>',
            '</div>',
            '<div class="bl_fs_help">↑↓ list/content • ←→ focus • BACK=close</div>',
          '</div>',
          '<div class="bl_fs_body">',
            '<div class="bl_fs_col bl_fs_list_col">',
              '<div class="bl_ls_list_head">',
                '<input class="bl_ls_filter" type="text" placeholder="Filter keys..." />',
                '<div class="bl_ls_count"></div>',
              '</div>',
              '<div class="bl_fs_list_scroll"><div class="bl_fs_list"></div></div>',
            '</div>',
            '<div class="bl_fs_col bl_fs_content_col">',
              '<div class="bl_fs_content_head">',
                '<div class="bl_fs_content_title"></div>',
                '<div class="bl_fs_content_state"></div>',
              '</div>',
              '<div class="bl_fs_content_scroll">',
                '<div class="bl_ls_editor">',
                  '<div class="bl_ls_section">',
                    '<div class="bl_ls_label">Key</div>',
                    '<div class="bl_ls_row_line">',
                      '<input class="bl_ls_input bl_ls_key" type="text" readonly />',
                      '<button class="bl_ls_btn bl_ls_rename" type="button">Rename</button>',
                      '<button class="bl_ls_btn bl_ls_rename_ok" type="button" style="display:none;">OK</button>',
                      '<button class="bl_ls_btn bl_ls_rename_cancel" type="button" style="display:none;">Cancel</button>',
                    '</div>',
                    '<div class="bl_ls_hint">Rename: setItem(newKey, oldValue) + removeItem(oldKey)</div>',
                  '</div>',
                  '<div class="bl_ls_section">',
                    '<div class="bl_ls_label">Value</div>',
                    '<textarea class="bl_ls_textarea bl_ls_value" spellcheck="false"></textarea>',
                  '</div>',
                  '<div class="bl_ls_section">',
                    '<div class="bl_ls_label">Actions</div>',
                    '<div class="bl_ls_actions">',
                      '<button class="bl_ls_btn bl_ls_save" type="button">Save</button>',
                      '<button class="bl_ls_btn bl_ls_delete" type="button">Delete</button>',
                      '<button class="bl_ls_btn bl_ls_copy_key" type="button">Copy key</button>',
                      '<button class="bl_ls_btn bl_ls_copy_val" type="button">Copy value</button>',
                      '<button class="bl_ls_btn bl_ls_fmt_json" type="button">Format JSON</button>',
                      '<button class="bl_ls_btn bl_ls_min_json" type="button">Minify JSON</button>',
                      '<button class="bl_ls_btn bl_ls_add_btn" type="button">Add</button>',
                    '</div>',
                  '</div>',
                  '<div class="bl_ls_section bl_ls_add">',
                    '<div class="bl_ls_label">Add new key</div>',
                    '<input class="bl_ls_input bl_ls_add_key" type="text" placeholder="Key" />',
                    '<textarea class="bl_ls_textarea bl_ls_add_val" spellcheck="false" placeholder="Value"></textarea>',
                    '<div class="bl_ls_actions" style="margin-top:8px;">',
                      '<button class="bl_ls_btn bl_ls_add_create" type="button">Create</button>',
                      '<button class="bl_ls_btn bl_ls_add_cancel" type="button">Cancel</button>',
                    '</div>',
                    '<div class="bl_ls_meta_err bl_ls_add_err" style="margin-top:6px;"></div>',
                  '</div>',
                  '<div class="bl_ls_section">',
                    '<div class="bl_ls_label">Meta</div>',
                    '<div class="bl_ls_meta">',
                      '<div><span class="bl_ls_meta_k">length</span>: <span class="bl_ls_meta_len"></span></div>',
                      '<div><span class="bl_ls_meta_k">valid JSON</span>: <span class="bl_ls_meta_json"></span></div>',
                      '<div class="bl_ls_meta_err bl_ls_meta_json_err"></div>',
                    '</div>',
                  '</div>',
                '</div>',
              '</div>',
            '</div>',
          '</div>',
          '<div class="bl_fs_footer"></div>',
        '</div>'
      ].join('');

      (document.body || document.documentElement).appendChild(root);

      STATE.rootEl = root;
      STATE.listScrollEl = root.querySelector('.bl_fs_list_scroll');
      STATE.listEl = root.querySelector('.bl_fs_list');
      STATE.filterEl = root.querySelector('.bl_ls_filter');
      STATE.closeBtnEl = root.querySelector('.bl_fs_close');
      STATE.footerEl = root.querySelector('.bl_fs_footer');

      STATE.contentTitleEl = root.querySelector('.bl_fs_content_title');
      STATE.contentStateEl = root.querySelector('.bl_fs_content_state');
      STATE.contentScrollEl = root.querySelector('.bl_fs_content_scroll');

      STATE.keyEl = root.querySelector('.bl_ls_key');
      STATE.renameBtnEl = root.querySelector('.bl_ls_rename');
      STATE.renameOkEl = root.querySelector('.bl_ls_rename_ok');
      STATE.renameCancelEl = root.querySelector('.bl_ls_rename_cancel');

      STATE.valueEl = root.querySelector('.bl_ls_value');

      STATE.saveBtnEl = root.querySelector('.bl_ls_save');
      STATE.deleteBtnEl = root.querySelector('.bl_ls_delete');
      STATE.copyKeyBtnEl = root.querySelector('.bl_ls_copy_key');
      STATE.copyValBtnEl = root.querySelector('.bl_ls_copy_val');
      STATE.fmtJsonBtnEl = root.querySelector('.bl_ls_fmt_json');
      STATE.minJsonBtnEl = root.querySelector('.bl_ls_min_json');
      STATE.addBtnEl = root.querySelector('.bl_ls_add_btn');

      STATE.metaLenEl = root.querySelector('.bl_ls_meta_len');
      STATE.metaJsonEl = root.querySelector('.bl_ls_meta_json');
      STATE.metaJsonErrEl = root.querySelector('.bl_ls_meta_json_err');

      STATE.addWrapEl = root.querySelector('.bl_ls_add');
      STATE.addKeyEl = root.querySelector('.bl_ls_add_key');
      STATE.addValEl = root.querySelector('.bl_ls_add_val');
      STATE.addCreateEl = root.querySelector('.bl_ls_add_create');
      STATE.addCancelEl = root.querySelector('.bl_ls_add_cancel');
      STATE.addErrEl = root.querySelector('.bl_ls_add_err');

      var countEl = root.querySelector('.bl_ls_count');

      if (STATE.closeBtnEl && !STATE.closeBtnEl.__blBound) {
        STATE.closeBtnEl.__blBound = true;
        STATE.closeBtnEl.addEventListener('click', function (e) {
          try { if (e) { e.preventDefault(); e.stopPropagation(); } } catch (_) { }
          API.close();
        }, false);
      }

      if (STATE.filterEl && !STATE.filterEl.__blBound) {
        STATE.filterEl.__blBound = true;
        STATE.filterEl.addEventListener('input', function () {
          try { STATE.filter = String(STATE.filterEl.value || ''); } catch (_) { STATE.filter = ''; }
          refreshList(STATE.selectedKey);
        }, false);
      }

      function footer(msg) {
        try { if (STATE.footerEl) STATE.footerEl.textContent = String(msg || ''); } catch (_) { }
      }

      function setCount() {
        try { if (countEl) countEl.textContent = String(STATE.keys.length || 0); } catch (_) { }
      }

      function setAddError(msg) {
        try { if (STATE.addErrEl) STATE.addErrEl.textContent = String(msg || ''); } catch (_) { }
      }

      function setMeta(value) {
        try {
          var s = (value === undefined || value === null) ? '' : String(value);
          if (STATE.metaLenEl) STATE.metaLenEl.textContent = String(s.length);

          var ji = jsonInfo(s);
          if (STATE.metaJsonEl) STATE.metaJsonEl.textContent = ji.ok ? 'yes' : 'no';
          if (STATE.metaJsonErrEl) STATE.metaJsonErrEl.textContent = ji.ok ? '' : ('error: ' + String(ji.err || 'parse error'));

          // header hint
          if (STATE.contentStateEl) {
            var t = guessType(s);
            var parts = [];
            parts.push(t.label);
            parts.push('json:' + (ji.ok ? 'yes' : 'no'));
            STATE.contentStateEl.textContent = parts.join(' • ');
          }
        } catch (_) { }
      }

      function setRenameMode(on) {
        STATE.renameMode = !!on;
        try {
          if (!STATE.keyEl || !STATE.renameBtnEl || !STATE.renameOkEl || !STATE.renameCancelEl) return;
          if (STATE.renameMode) {
            STATE.keyEl.readOnly = false;
            STATE.renameBtnEl.style.display = 'none';
            STATE.renameOkEl.style.display = '';
            STATE.renameCancelEl.style.display = '';
            try { STATE.keyEl.focus(); STATE.keyEl.select(); } catch (_) { }
          } else {
            STATE.keyEl.readOnly = true;
            STATE.renameBtnEl.style.display = '';
            STATE.renameOkEl.style.display = 'none';
            STATE.renameCancelEl.style.display = 'none';
            try { STATE.keyEl.value = String(STATE.selectedKey || ''); } catch (_) { }
          }
        } catch (_) { }
      }

      function setAddMode(on) {
        try {
          if (!STATE.addWrapEl) return;
          if (on) STATE.addWrapEl.classList.add('bl_ls_add_on');
          else STATE.addWrapEl.classList.remove('bl_ls_add_on');
          setAddError('');
          if (on) {
            try { if (STATE.addKeyEl) STATE.addKeyEl.value = ''; } catch (_) { }
            try { if (STATE.addValEl) STATE.addValEl.value = ''; } catch (_) { }
            try { if (STATE.addKeyEl) { STATE.addKeyEl.focus(); } } catch (_) { }
          }
        } catch (_) { }
      }

      function renderDetails() {
        try {
          var k = String(STATE.selectedKey || '');
          var v = (k && lsSupported()) ? lsGet(k) : null;
          if (v === null || v === undefined) v = '';
          if (STATE.contentTitleEl) STATE.contentTitleEl.textContent = k ? k : '(no key selected)';
          if (STATE.keyEl) STATE.keyEl.value = k;
          if (STATE.valueEl) STATE.valueEl.value = String(v);

          setMeta(String(v));
          setRenameMode(false);

          var hasSel = !!k;
          if (STATE.valueEl) STATE.valueEl.disabled = !hasSel;
          if (STATE.saveBtnEl) STATE.saveBtnEl.disabled = !hasSel;
          if (STATE.deleteBtnEl) STATE.deleteBtnEl.disabled = !hasSel;
          if (STATE.copyKeyBtnEl) STATE.copyKeyBtnEl.disabled = !hasSel;
          if (STATE.copyValBtnEl) STATE.copyValBtnEl.disabled = !hasSel;
          if (STATE.fmtJsonBtnEl) STATE.fmtJsonBtnEl.disabled = !hasSel;
          if (STATE.minJsonBtnEl) STATE.minJsonBtnEl.disabled = !hasSel;
          if (STATE.renameBtnEl) STATE.renameBtnEl.disabled = !hasSel;

          footer('keys: ' + String(STATE.keys.length || 0) + (STATE.filter ? (' • filter: ' + String(STATE.filter)) : ''));
          setCount();
        } catch (_) { }
      }

      function buildRows() {
        try {
          if (!STATE.listEl) return;

          STATE.listEl.innerHTML = '';
          STATE.rows = [];

          var frag = document.createDocumentFragment();
          for (var i = 0; i < STATE.keys.length; i++) {
            (function (idx) {
              var key = String(STATE.keys[idx] || '');
              var raw = lsGet(key);
              if (raw === null || raw === undefined) raw = '';
              var type = guessType(raw);

              var row = document.createElement('div');
              row.className = 'bl_fs_row bl_ls_list_row';

              var main = document.createElement('div');
              main.className = 'bl_fs_row_main';

              var url = document.createElement('div');
              url.className = 'bl_fs_row_url';
              url.textContent = key;

              var tag = document.createElement('div');
              tag.className = 'bl_fs_row_tag';
              tag.textContent = truncateText(raw, 80);

              main.appendChild(url);
              main.appendChild(tag);

              var st = document.createElement('div');
              st.className = 'bl_fs_row_status';
              st.textContent = type.label;

              row.appendChild(main);
              row.appendChild(st);

              row.addEventListener('click', function (e) {
                try { if (e) { e.preventDefault(); e.stopPropagation(); } } catch (_) { }
                setSelectedIndex(idx);
              }, false);

              STATE.rows.push(row);
              frag.appendChild(row);
            })(i);
          }

          STATE.listEl.appendChild(frag);
        } catch (_) { }
      }

      function ensureSelectedVisible() {
        try {
          if (!STATE.listScrollEl) return;
          var row = STATE.rows[STATE.selectedIndex || 0];
          if (!row) return;

          var top = row.offsetTop;
          var bottom = top + row.offsetHeight;
          var viewTop = STATE.listScrollEl.scrollTop;
          var viewBottom = viewTop + STATE.listScrollEl.clientHeight;

          if (top < viewTop) STATE.listScrollEl.scrollTop = top;
          else if (bottom > viewBottom) STATE.listScrollEl.scrollTop = Math.max(0, bottom - STATE.listScrollEl.clientHeight);
        } catch (_) { }
      }

      function setSelectedIndex(next) {
        try {
          var max = (STATE.keys.length || 0) - 1;
          if (max < 0) max = 0;
          next = clamp(next, 0, max);

          var prev = STATE.selectedIndex || 0;
          if (next === prev && STATE.selectedKey) return;

          STATE.selectedIndex = next;

          var pr = STATE.rows[prev];
          if (pr) pr.classList.remove('bl_fs_row_sel');

          var nr = STATE.rows[next];
          if (nr) nr.classList.add('bl_fs_row_sel');

          STATE.selectedKey = String(STATE.keys[next] || '');
          try { if (STATE.contentScrollEl) STATE.contentScrollEl.scrollTop = 0; } catch (_) { }

          renderDetails();
          ensureSelectedVisible();
        } catch (_) { }
      }

      function refreshKeys() {
        var all = [];
        try {
          if (!lsSupported()) return all;
          for (var i = 0; i < localStorage.length; i++) {
            var k = localStorage.key(i);
            if (k !== null && k !== undefined) all.push(String(k));
          }
        } catch (_) { }
        all.sort(function (a, b) { return String(a).localeCompare(String(b)); });
        return all;
      }

      function applyFilter(all, filter) {
        filter = String(filter || '');
        if (!filter) return all.slice(0);
        var f = filter.toLowerCase();
        var out = [];
        for (var i = 0; i < all.length; i++) {
          var k = String(all[i] || '');
          if (!k) continue;
          if (k.toLowerCase().indexOf(f) !== -1) out.push(k);
        }
        return out;
      }

      function refreshList(preserveKey) {
        preserveKey = String(preserveKey || '');
        STATE.allKeys = refreshKeys();
        STATE.keys = applyFilter(STATE.allKeys, STATE.filter);
        buildRows();

        var idx = 0;
        if (preserveKey) {
          for (var i = 0; i < STATE.keys.length; i++) {
            if (String(STATE.keys[i]) === preserveKey) { idx = i; break; }
          }
        }
        if (STATE.keys.length === 0) {
          STATE.selectedKey = '';
          STATE.selectedIndex = 0;
          renderDetails();
          return;
        }
        setSelectedIndex(idx);
      }

      function saveSelected() {
        try {
          var k = String(STATE.selectedKey || '');
          if (!k) return;
          var val = STATE.valueEl ? String(STATE.valueEl.value || '') : '';
          if (!lsSet(k, val)) {
            showNoty('[[BlackLampa]] localStorage setItem failed');
            return;
          }
          logInfo('LS set', k);
          refreshList(k);
          showNoty('[[BlackLampa]] Saved');
        } catch (_) { }
      }

      function deleteSelected() {
        var k = String(STATE.selectedKey || '');
        if (!k) return;
        confirmAction('Delete key?', 'removeItem(\"' + k + '\")', function () {
          if (!lsDel(k)) {
            showNoty('[[BlackLampa]] localStorage removeItem failed');
            return;
          }
          logInfo('LS remove', k);
          refreshList('');
          showNoty('[[BlackLampa]] Deleted');
        });
      }

      function renameSelected() {
        try {
          var oldKey = String(STATE.selectedKey || '');
          if (!oldKey) return;
          if (!STATE.keyEl) return;
          var nextKey = String(STATE.keyEl.value || '').trim();
          if (!nextKey) { showNoty('[[BlackLampa]] New key is empty'); return; }
          if (nextKey === oldKey) { setRenameMode(false); return; }
          if (lsHas(nextKey)) { showNoty('[[BlackLampa]] Key already exists'); return; }

          confirmAction('Rename key?', oldKey + ' → ' + nextKey, function () {
            var val = lsGet(oldKey);
            if (val === null || val === undefined) val = '';
            if (!lsSet(nextKey, val)) {
              showNoty('[[BlackLampa]] localStorage setItem failed');
              return;
            }
            lsDel(oldKey);
            logInfo('LS rename', oldKey + ' -> ' + nextKey);
            STATE.selectedKey = nextKey;
            refreshList(nextKey);
            showNoty('[[BlackLampa]] Renamed');
          });
        } catch (_) { }
      }

      function updateAddCreateState() {
        try {
          if (!STATE.addKeyEl || !STATE.addCreateEl) return;
          var k = String(STATE.addKeyEl.value || '').trim();
          if (!k) {
            STATE.addCreateEl.disabled = true;
            setAddError('');
            return;
          }
          if (lsHas(k)) {
            STATE.addCreateEl.disabled = true;
            setAddError('Key exists: ' + k);
            return;
          }
          STATE.addCreateEl.disabled = false;
          setAddError('');
        } catch (_) { }
      }

      function createNewKey() {
        try {
          if (!STATE.addKeyEl || !STATE.addValEl) return;
          var k = String(STATE.addKeyEl.value || '').trim();
          var v = String(STATE.addValEl.value || '');
          if (!k) { setAddError('Key is empty'); return; }
          if (lsHas(k)) { setAddError('Key exists: ' + k); return; }
          if (!lsSet(k, v)) { setAddError('setItem failed'); return; }
          logInfo('LS add', k);
          setAddMode(false);
          refreshList(k);
          showNoty('[[BlackLampa]] Created');
        } catch (_) { }
      }

      function formatSelectedJson(minify) {
        try {
          var k = String(STATE.selectedKey || '');
          if (!k || !STATE.valueEl) return;
          var s = String(STATE.valueEl.value || '');
          var ji = jsonInfo(s);
          if (!ji.ok) {
            showNoty('[[BlackLampa]] Invalid JSON: ' + String(ji.err || 'parse error'));
            setMeta(s);
            return;
          }
          var txt = '';
          try { txt = JSON.stringify(ji.value, null, minify ? 0 : 2); } catch (_) { txt = String(s); }
          STATE.valueEl.value = txt;
          setMeta(txt);
        } catch (_) { }
      }

      if (STATE.valueEl && !STATE.valueEl.__blBound) {
        STATE.valueEl.__blBound = true;
        STATE.valueEl.addEventListener('input', function () {
          try { setMeta(String(STATE.valueEl.value || '')); } catch (_) { }
        }, false);
      }

      if (STATE.renameBtnEl && !STATE.renameBtnEl.__blBound) {
        STATE.renameBtnEl.__blBound = true;
        STATE.renameBtnEl.addEventListener('click', function () { setRenameMode(true); }, false);
      }
      if (STATE.renameCancelEl && !STATE.renameCancelEl.__blBound) {
        STATE.renameCancelEl.__blBound = true;
        STATE.renameCancelEl.addEventListener('click', function () { setRenameMode(false); }, false);
      }
      if (STATE.renameOkEl && !STATE.renameOkEl.__blBound) {
        STATE.renameOkEl.__blBound = true;
        STATE.renameOkEl.addEventListener('click', function () { renameSelected(); }, false);
      }

      if (STATE.saveBtnEl && !STATE.saveBtnEl.__blBound) {
        STATE.saveBtnEl.__blBound = true;
        STATE.saveBtnEl.addEventListener('click', function () { saveSelected(); }, false);
      }
      if (STATE.deleteBtnEl && !STATE.deleteBtnEl.__blBound) {
        STATE.deleteBtnEl.__blBound = true;
        STATE.deleteBtnEl.addEventListener('click', function () { deleteSelected(); }, false);
      }
      if (STATE.copyKeyBtnEl && !STATE.copyKeyBtnEl.__blBound) {
        STATE.copyKeyBtnEl.__blBound = true;
        STATE.copyKeyBtnEl.addEventListener('click', function () {
          var k = String(STATE.selectedKey || '');
          if (!k) return;
          copyTextToClipboard(k).then(function (ok) { showNoty(ok ? '[[BlackLampa]] Copied key' : '[[BlackLampa]] Copy failed'); });
        }, false);
      }
      if (STATE.copyValBtnEl && !STATE.copyValBtnEl.__blBound) {
        STATE.copyValBtnEl.__blBound = true;
        STATE.copyValBtnEl.addEventListener('click', function () {
          var k = String(STATE.selectedKey || '');
          if (!k) return;
          var v = STATE.valueEl ? String(STATE.valueEl.value || '') : '';
          copyTextToClipboard(v).then(function (ok) { showNoty(ok ? '[[BlackLampa]] Copied value' : '[[BlackLampa]] Copy failed'); });
        }, false);
      }
      if (STATE.fmtJsonBtnEl && !STATE.fmtJsonBtnEl.__blBound) {
        STATE.fmtJsonBtnEl.__blBound = true;
        STATE.fmtJsonBtnEl.addEventListener('click', function () { formatSelectedJson(false); }, false);
      }
      if (STATE.minJsonBtnEl && !STATE.minJsonBtnEl.__blBound) {
        STATE.minJsonBtnEl.__blBound = true;
        STATE.minJsonBtnEl.addEventListener('click', function () { formatSelectedJson(true); }, false);
      }

      if (STATE.addBtnEl && !STATE.addBtnEl.__blBound) {
        STATE.addBtnEl.__blBound = true;
        STATE.addBtnEl.addEventListener('click', function () { setAddMode(true); updateAddCreateState(); }, false);
      }
      if (STATE.addCancelEl && !STATE.addCancelEl.__blBound) {
        STATE.addCancelEl.__blBound = true;
        STATE.addCancelEl.addEventListener('click', function () { setAddMode(false); }, false);
      }
      if (STATE.addCreateEl && !STATE.addCreateEl.__blBound) {
        STATE.addCreateEl.__blBound = true;
        STATE.addCreateEl.addEventListener('click', function () { createNewKey(); }, false);
      }
      if (STATE.addKeyEl && !STATE.addKeyEl.__blBound) {
        STATE.addKeyEl.__blBound = true;
        STATE.addKeyEl.addEventListener('input', function () { updateAddCreateState(); }, false);
      }

      // expose internals
      API.__refresh = function () { refreshList(STATE.selectedKey); };

      // initial render
      refreshList('');
      renderDetails();

      STATE.__refreshList = refreshList;
      STATE.__setSelectedIndex = setSelectedIndex;
      STATE.__ensureSelectedVisible = ensureSelectedVisible;
      STATE.__renderDetails = renderDetails;
      STATE.__setMeta = setMeta;
      STATE.__setCount = setCount;

    } catch (_) { }
  }

  function setOpen(on) {
    try {
      STATE.open = !!on;
      if (STATE.rootEl) STATE.rootEl.style.display = STATE.open ? 'block' : 'none';
    } catch (_) { }
  }

  function setFocus(zone) {
    zone = (zone === 'content') ? 'content' : 'list';
    STATE.focusZone = zone;
    try {
      if (!STATE.rootEl) return;
      STATE.rootEl.classList.remove('bl_fs_focus_list');
      STATE.rootEl.classList.remove('bl_fs_focus_content');
      STATE.rootEl.classList.add(zone === 'content' ? 'bl_fs_focus_content' : 'bl_fs_focus_list');
    } catch (_) { }
  }

  function keyHandler(e) {
    try {
      if (!STATE.open) return;
      if (!e) return;
      if (isModalOpen()) return;

      var k = e.keyCode || 0;
      var editableTarget = isEditableEl(e.target);
      var allowBackspaceAsBack = !editableTarget;

      if (isBackKeyCode(k, allowBackspaceAsBack)) {
        try { e.preventDefault(); e.stopImmediatePropagation(); } catch (_) { }
        API.close();
        return;
      }

      if (editableTarget) return;

      if (k === 37 || k === 39) {
        try { e.preventDefault(); e.stopImmediatePropagation(); } catch (_) { }
        if (k === 37) setFocus('list');
        else setFocus('content');
        return;
      }

      if (k === 38 || k === 19 || k === 40 || k === 20) {
        try { e.preventDefault(); e.stopImmediatePropagation(); } catch (_) { }

        var isUp = (k === 38 || k === 19);
        if (STATE.focusZone === 'content') {
          try {
            if (!STATE.contentScrollEl) return;
            var step = 140;
            var next = STATE.contentScrollEl.scrollTop + (isUp ? -step : step);
            STATE.contentScrollEl.scrollTop = clamp(next, 0, STATE.contentScrollEl.scrollHeight || next);
          } catch (_) { }
          return;
        }

        var nextIndex = (STATE.selectedIndex || 0) + (isUp ? -1 : 1);
        if (STATE.__setSelectedIndex) STATE.__setSelectedIndex(nextIndex);
        return;
      }

      if (isOkKeyCode(k)) {
        try { e.preventDefault(); e.stopImmediatePropagation(); } catch (_) { }
        if (STATE.focusZone === 'list') {
          setFocus('content');
          try { if (STATE.valueEl) STATE.valueEl.focus(); } catch (_) { }
        } else {
          try { if (STATE.valueEl) STATE.valueEl.focus(); } catch (_) { }
        }
      }
    } catch (_) { }
  }

  function installKeyHandler() {
    if (STATE.keyHandlerInstalled) return;
    STATE.keyHandlerInstalled = true;
    try { window.addEventListener('keydown', keyHandler, true); } catch (_) { }
  }

  function removeKeyHandler() {
    if (!STATE.keyHandlerInstalled) return;
    STATE.keyHandlerInstalled = false;
    try { window.removeEventListener('keydown', keyHandler, true); } catch (_) { }
  }

  API.init = function () {
    if (STATE.inited) return;
    STATE.inited = true;
    ensureDom();
    setFocus('list');
  };

  API.isOpen = function () { return !!STATE.open; };

  API.open = function () {
    try {
      if (!STATE.inited) API.init();
      ensureDom();
      if (!STATE.rootEl) return;

      try { if (window.BL && BL.Log && typeof BL.Log.closeViewer === 'function') BL.Log.closeViewer(); } catch (_) { }
      try { if (window.BL && BL.FileScanner && typeof BL.FileScanner.isOpen === 'function' && BL.FileScanner.isOpen() && typeof BL.FileScanner.close === 'function') BL.FileScanner.close(); } catch (_) { }

      setOpen(true);
      installKeyHandler();
      setFocus('list');

      try { if (STATE.__refreshList) STATE.__refreshList(STATE.selectedKey); } catch (_) { }
    } catch (_) { }
  };

  API.close = function () {
    try {
      setOpen(false);
      removeKeyHandler();
    } catch (_) { }
  };
})();
