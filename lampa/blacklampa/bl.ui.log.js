(function () {
	'use strict';

		var BL = window.BL = window.BL || {};
		BL.Log = BL.Log || {};

		var MODE_LS_KEY = (BL.Keys && BL.Keys.log_mode_v1) ? BL.Keys.log_mode_v1 : 'blacklampa_log_mode_v1';
		var MODE_SILENT = 'silent';
		var MODE_POPUP = 'popup';

		var LOG_MODE = 0;
		var LOG_MODE_STR = MODE_SILENT;

		var RING_MAX = 1000;
		var ring = new Array(RING_MAX);
		var ringPos = 0;
		var ringCount = 0;

		var PREFIX = '[BlackLampa]';

	var TITLE_PREFIX = '';

	var POPUP_MS = 0;
	var MAX_LINES = 0;
	var SCROLL_TOL_PX = 0;
	var SHOW_THROTTLE_MS = 0;

	var POPUP_Z_INDEX = 0;
	var POPUP_INSET_PX = 0;
	var POPUP_BORDER_RADIUS_PX = 0;
	var POPUP_PROGRESS_HEIGHT_PX = 0;

	var popupEl = null;
	var popupTimer = null;
	var lastShowTs = 0;

	var popupBodyEl = null;
	var popupScrollEl = null;
	var popupHeaderEl = null;
	var popupHeaderHeight = 0;
	var popupResizeTimer = null;
	var popupProgressTopEl = null;
	var popupProgressBottomEl = null;
	var popupProgressFillEl = null;
	var popupProgressFillBottomEl = null;
	var popupProgressSeq = 0;
	var popupCloseEl = null;

	var viewerMode = false;
	var viewerPrevPopupPointerEvents = '';
	var viewerPrevPopupUserSelect = '';
	var viewerPrevPopupTouchAction = '';
	var viewerPrevScrollPointerEvents = '';
	var viewerPrevScrollUserSelect = '';
	var viewerPrevScrollTouchAction = '';
	var viewerPrevProgressTopDisplay = '';
	var viewerPrevProgressBottomDisplay = '';
	var viewerScrollLocked = false;
	var viewerKeyHandlerInstalled = false;
	var viewerScrollHandlerInstalled = false;

	var TAG_STYLE = {
		'ERR': { color: '#ff4d4f' },
		'WRN': { color: '#ffa940' },
		'OK': { color: '#52c41a' },
		'INF': { color: '#40a9ff' },
		'DBG': { color: '#8c8c8c' }
	};

		var POPUP_FONT = '12px/1.35 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif';

		function safe(fn) { try { return fn(); } catch (_) { return null; } }

		function lsGet(k) { try { return localStorage.getItem(String(k || '')); } catch (_) { return null; } }
		function lsSet(k, v) { try { localStorage.setItem(String(k || ''), String(v)); } catch (_) { } }

		function normalizeMode(m) {
			try { m = String(m || '').toLowerCase(); } catch (_) { m = ''; }
			return (m === MODE_POPUP) ? MODE_POPUP : MODE_SILENT;
		}

		function readModeFromStorage() {
			var m = null;
			try { m = lsGet(MODE_LS_KEY); } catch (_) { m = null; }
			if (m === null || m === undefined || m === '') {
				try { lsSet(MODE_LS_KEY, MODE_SILENT); } catch (_) { }
				return MODE_SILENT;
			}
			return normalizeMode(m);
		}

		function applyMode(mode) {
			mode = normalizeMode(mode);
			LOG_MODE_STR = mode;
			LOG_MODE = (mode === MODE_POPUP) ? 1 : 0;

			try {
				if (BL.cfg && typeof BL.cfg === 'object') BL.cfg.LOG_MODE = LOG_MODE;
			} catch (_) { }

			safe(function () {
				if (!popupEl) return;
				try {
					var t = document.getElementById('__autoplugin_popup_title');
					if (t) t.textContent = String(TITLE_PREFIX) + ' (' + String(LOG_MODE_STR) + ')';
				} catch (_) { }

				if (LOG_MODE === 0 && !viewerMode) {
					try { if (popupTimer) { clearTimeout(popupTimer); popupTimer = null; } } catch (_) { }
					safe(function () { if (popupEl) popupEl.style.display = 'none'; });
				}
			});
		}

		function isPopupEnabled() { return LOG_MODE_STR === MODE_POPUP; }

		function ringPush(tag, line) {
			try {
				ring[ringPos] = { t: Date.now(), tag: String(tag || ''), line: String(line || '') };
				ringPos = (ringPos + 1) % RING_MAX;
				if (ringCount < RING_MAX) ringCount++;
			} catch (_) { }
		}

		function ringSnapshot() {
			var out = [];
			try {
				var n = ringCount;
				if (!n) return out;
				out = new Array(n);
				var start = ringPos - n;
				if (start < 0) start += RING_MAX;
				for (var i = 0; i < n; i++) {
					out[i] = ring[(start + i) % RING_MAX];
				}
			} catch (_) { out = []; }
			return out;
		}

		applyMode(readModeFromStorage());

		function formatLine(tag, module, message, extra) {
			var base = String(PREFIX) + ' ' + String(tag) + ' ' + String(module) + ': ' + String(message);
			if (!extra) return base;
			var s = String(extra);
		if (s.indexOf('\n') !== -1) return base + '\n' + s;
		return base + ' | ' + s;
	}

	function fmtErrSafe(e) {
		try { return (BL.Core && BL.Core.fmtErr) ? BL.Core.fmtErr(e) : String(e || 'error'); } catch (_) { }
		try { return String(e || 'error'); } catch (_) { return 'error'; }
	}

	function trimStack(stack, maxLines) {
		try {
			var s = String(stack || '');
			if (!s) return '';
			var lines = s.split('\n');
			var n = (typeof maxLines === 'number' && maxLines > 0) ? maxLines : 16;
			if (lines.length > n) lines = lines.slice(0, n);
			return lines.join('\n');
		} catch (_) {
			try { return String(stack || ''); } catch (__e) { return ''; }
		}
	}

	function filterStack(stack) {
		try {
			var s = String(stack || '');
			if (!s) return '';
			var lines = s.split('\n');
			var out = [];

			for (var i = 0; i < lines.length; i++) {
				var ln = String(lines[i] || '');
				if (!ln) continue;

				var l = ln.toLowerCase();
				if (l.indexOf('blacklampa/bl.ui.log.js') !== -1) continue;
				if (l.indexOf('bl.ui.log.js') !== -1) continue;

				out.push(ln);
			}

			if (out.length <= 1) return '';
			return out.join('\n');
		} catch (_) {
			return '';
		}
	}

	function normalizeError(err, context) {
		var out = { msg: '', name: '', file: '', line: null, col: null, stack: '', eventType: '', target: '' };
		try {
			if (err && typeof err === 'object' && typeof err.message === 'string' && ('filename' in err || 'lineno' in err || 'colno' in err || 'error' in err)) {
				out.msg = String(err.message || 'error');
				out.file = err.filename ? String(err.filename) : '';
				out.line = (typeof err.lineno === 'number') ? err.lineno : null;
				out.col = (typeof err.colno === 'number') ? err.colno : null;
				if (err.error) {
					try { if (err.error.name) out.name = String(err.error.name); } catch (_) { }
					try { if (err.error.stack) out.stack = String(err.error.stack); } catch (_) { }
				}
			}
				else if (err && typeof err === 'object' && ('reason' in err)) {
					var r = err.reason;
					out.msg = fmtErrSafe(r);
					try { if (r && r.name) out.name = String(r.name); } catch (_) { }
					try { if (r && r.stack) out.stack = String(r.stack); } catch (_) { }
				}
				else if (err && typeof err === 'object' && typeof err.type === 'string') {
					try { out.eventType = String(err.type || ''); } catch (_) { out.eventType = ''; }

					var msg2 = '';
					try { if (typeof err.message === 'string') msg2 = String(err.message || ''); } catch (_) { msg2 = ''; }
					if (!msg2 || msg2 === '[object Event]') msg2 = 'event';
					out.msg = msg2;

					try { if (err.filename) out.file = String(err.filename); } catch (_) { }
					try { if (typeof err.lineno === 'number') out.line = err.lineno; } catch (_) { }
					try { if (typeof err.colno === 'number') out.col = err.colno; } catch (_) { }

					try {
						if (err.error) {
							try { if (err.error.name) out.name = String(err.error.name); } catch (_) { }
							try { if (err.error.message) out.msg = String(err.error.message); } catch (_) { }
							try { if (err.error.stack) out.stack = String(err.error.stack); } catch (_) { }
						}
					} catch (_) { }

					try {
						var t = err.target || err.currentTarget;
						if (t) {
							var tag = '';
							try { tag = t.tagName ? String(t.tagName).toLowerCase() : ''; } catch (_) { tag = ''; }
							var u = '';
							try { if (!u && typeof t.src === 'string') u = String(t.src); } catch (_) { }
							try { if (!u && typeof t.href === 'string') u = String(t.href); } catch (_) { }
							out.target = (tag ? tag : 'target') + (u ? (' ' + u) : '');
						}
					} catch (_) { }
				}
				else if (err && typeof err === 'object' && typeof err.name === 'string' && typeof err.message === 'string') {
					out.name = String(err.name || '');
					out.msg = String(err.message || 'error');
					try { if (err.stack) out.stack = String(err.stack); } catch (_) { }
			}
			else {
				out.msg = fmtErrSafe(err);
			}
		} catch (_) {
			out.msg = 'error';
		}

			if (!out.msg) out.msg = 'error';

			out.stack = trimStack(filterStack(out.stack), 18);
			return out;
		}

		function buildExceptionExtra(info, context) {
		try {
			var hasAt = !!(info.file || info.line != null || info.col != null);
			var hasStack = !!(info.stack);

			if (!hasAt && !hasStack) {
				var parts = [];
				if (info.eventType) parts.push('type=' + String(info.eventType));
				else if (context && context.type) parts.push('type=' + String(context.type));
				parts.push('message=' + String(info.msg || 'error'));
				if (info.target) parts.push('target=' + String(info.target));
				return parts.join(' | ');
			}

			var lines = [];
			if (info.eventType) lines.push('type: ' + String(info.eventType));
			lines.push('msg: ' + String(info.msg || 'error'));
			if (info.name) lines.push('name: ' + String(info.name));

			if (hasAt) {
				lines.push('at: ' + String(info.file || '(no file)') + ':' + String(info.line != null ? info.line : '?') + ':' + String(info.col != null ? info.col : '?'));
			}
			if (info.target) lines.push('target: ' + String(info.target));

			if (hasStack) lines.push('stack:\n' + String(info.stack));
			return lines.join('\n');
		} catch (_) {
			return '';
		}
		}

		function updatePopupLayout() {
			try {
				if (!popupEl || !popupHeaderEl || !popupScrollEl) return;

			var h = popupHeaderEl.offsetHeight || 0;
			if (h > 0) popupHeaderHeight = h;
			else h = popupHeaderHeight || 0;

			popupScrollEl.style.top = String(h + POPUP_PROGRESS_HEIGHT_PX) + 'px';
		} catch (_) { }
		}

		function ensurePopup(force) {
			if (!force && !viewerMode && !isPopupEnabled()) return null;
			if (popupEl) return popupEl;
			if (!document || !document.body) return null;

		var el = document.createElement('div');
		el.id = '__autoplugin_popup';
			el.style.cssText = [
				'all:initial',
				'unicode-bidi:plaintext',
				'position:fixed',
				'isolation:isolate',
			'top:' + String(POPUP_INSET_PX) + 'px',
			'left:' + String(POPUP_INSET_PX) + 'px',
			'right:' + String(POPUP_INSET_PX) + 'px',
			'bottom:' + String(POPUP_INSET_PX) + 'px',
			'z-index:' + String(POPUP_Z_INDEX),
			'background:rgba(0,0,0,0.88)',
			'color:#fff',
			'border-radius:' + String(POPUP_BORDER_RADIUS_PX) + 'px',
			'box-sizing:border-box',
			'padding:0',
			'font:' + POPUP_FONT,
			'font-weight:500',
			'font-variant-ligatures:none',
			'letter-spacing:0',
			'-webkit-font-smoothing:antialiased',
			'text-rendering:optimizeSpeed',
			'pointer-events:none',
			'user-select:none',
			'-webkit-user-select:none',
				'touch-action:none',
				'white-space:pre-wrap',
				'overflow-wrap:anywhere',
				'word-break:break-word',
				'overflow:hidden',
				'display:block',
				'box-shadow:0 10px 30px rgba(0,0,0,0.25)'
				].join(';');

		var progress = document.createElement('div');
		progress.id = '__autoplugin_popup_progress';
		progress.style.cssText = [
			'position:absolute',
			'top:0',
			'left:0',
			'right:0',
			'z-index:3',
			'height:' + String(POPUP_PROGRESS_HEIGHT_PX) + 'px',
			'background:rgba(255,255,255,0.15)',
			'border-radius:' + String(POPUP_BORDER_RADIUS_PX) + 'px ' + String(POPUP_BORDER_RADIUS_PX) + 'px 0 0',
			'overflow:hidden',
			'pointer-events:none'
		].join(';');

		var progressFill = document.createElement('div');
		progressFill.id = '__autoplugin_popup_progress_fill';
		progressFill.style.cssText = [
			'height:100%',
			'width:100%',
			'background:#40a9ff',
			'transform-origin:left center',
			'transform:scaleX(1)',
			'will-change:transform',
			'pointer-events:none'
		].join(';');
		progress.appendChild(progressFill);

		var progressBottom = document.createElement('div');
		progressBottom.id = '__autoplugin_popup_progress_bottom';
		progressBottom.style.cssText = [
			'position:absolute',
			'left:0',
			'right:0',
			'bottom:0',
			'z-index:3',
			'height:' + String(POPUP_PROGRESS_HEIGHT_PX) + 'px',
			'background:rgba(255,255,255,0.15)',
			'border-radius:0 0 ' + String(POPUP_BORDER_RADIUS_PX) + 'px ' + String(POPUP_BORDER_RADIUS_PX) + 'px',
			'overflow:hidden',
			'pointer-events:none'
		].join(';');

		var progressBottomFill = document.createElement('div');
		progressBottomFill.id = '__autoplugin_popup_progress_bottom_fill';
		progressBottomFill.style.cssText = [
			'height:100%',
			'width:100%',
			'background:#40a9ff',
			'transform-origin:left center',
			'transform:scaleX(1)',
			'will-change:transform',
			'pointer-events:none'
		].join(';');
		progressBottom.appendChild(progressBottomFill);

		var headerWrap = document.createElement('div');
		headerWrap.style.cssText = [
			'position:relative',
			'z-index:1',
			'box-sizing:border-box',
			'padding:10px 12px 6px 12px',
			'pointer-events:none',
			'user-select:none',
			'-webkit-user-select:none'
		].join(';');

		var title = document.createElement('div');
		title.id = '__autoplugin_popup_title';
			title.style.cssText = [
			'font:' + POPUP_FONT,
			'font-weight:700',
			'margin:0',
			'opacity:.95'
			].join(';');
			title.textContent = String(TITLE_PREFIX) + ' (' + String(LOG_MODE_STR) + ')';

		var bodyWrap = document.createElement('div');
		bodyWrap.style.cssText = [
			'position:absolute',
			'z-index:1',
			'box-sizing:border-box',
			'left:12px',
			'right:12px',
			'bottom:12px',
			'top:0',
			'overflow:auto',
			'-webkit-overflow-scrolling:touch',
			'pointer-events:none',
			'user-select:none',
			'-webkit-user-select:none'
		].join(';');

		var body = document.createElement('div');
		body.id = '__autoplugin_popup_body';

		el.appendChild(progress);
		headerWrap.appendChild(title);
		bodyWrap.appendChild(body);
		el.appendChild(headerWrap);
		el.appendChild(bodyWrap);
		el.appendChild(progressBottom);

		var closeBtn = document.createElement('div');
		closeBtn.id = '__autoplugin_popup_close';
		closeBtn.textContent = '× Закрыть';
		closeBtn.style.cssText = [
			'position:absolute',
			'top:8px',
			'right:10px',
			'z-index:4',
			'padding:4px 8px',
			'background:rgba(255,255,255,0.12)',
			'border:1px solid rgba(255,255,255,0.18)',
			'border-radius:8px',
			'pointer-events:auto',
			'cursor:pointer',
			'font:' + POPUP_FONT,
			'font-weight:700',
			'opacity:.9',
			'display:none',
			'user-select:none',
			'-webkit-user-select:none'
		].join(';');
		closeBtn.addEventListener('click', function () {
			try { if (BL.Log && typeof BL.Log.closeViewer === 'function') BL.Log.closeViewer(); } catch (_) { }
		}, true);
		el.appendChild(closeBtn);
		document.body.appendChild(el);

		popupEl = el;
		popupBodyEl = body;
		popupScrollEl = bodyWrap;
		popupHeaderEl = headerWrap;
		popupHeaderHeight = headerWrap.offsetHeight || popupHeaderHeight;
		popupProgressTopEl = progress;
		popupProgressBottomEl = progressBottom;
		popupProgressFillEl = progressFill;
		popupProgressFillBottomEl = progressBottomFill;
		popupCloseEl = closeBtn;

		updatePopupLayout();
		try {
			window.addEventListener('resize', function () {
				try {
					if (!popupEl) return;
					if (popupResizeTimer) clearTimeout(popupResizeTimer);
					popupResizeTimer = setTimeout(updatePopupLayout, 100);
				} catch (_) { }
			}, true);
		} catch (_) { }

		return el;
	}

	function isAtBottom(el) {
		try {
			return (el.scrollTop + el.clientHeight) >= (el.scrollHeight - SCROLL_TOL_PX);
		} catch (_) {
			return true;
		}
	}

	function scrollToBottom(el) {
		try { el.scrollTop = el.scrollHeight; } catch (_) { }
	}

	function makeRow(line, tag, ts) {
		var row = document.createElement('div');
		var t = ts;
		try {
			if (t === undefined || t === null) {
				var idx = ringPos - 1;
				if (idx < 0) idx = RING_MAX - 1;
				var last = ring[idx];
				if (last && typeof last.t === 'number') t = last.t;
				else if (last && typeof last.ts === 'number') t = last.ts;
			}
		} catch (_) { }

		function pad2(n) {
			n = n | 0;
			return (n < 10) ? ('0' + String(n)) : String(n);
		}

		function pad3(n) {
			n = n | 0;
			if (n < 10) return '00' + String(n);
			if (n < 100) return '0' + String(n);
			return String(n);
		}

		var stamp = '';
		try {
			var d = new Date((typeof t === 'number' && isFinite(t) && t > 0) ? t : Date.now());
			stamp = pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
			stamp += '.' + pad3(d.getMilliseconds());
		} catch (_) {
			stamp = '';
		}

		row.textContent = (stamp ? ('[' + stamp + '] ') : '') + String(line);
			row.style.cssText = [
				'font:' + POPUP_FONT,
				'font-weight:500',
				'margin:0',
				'padding:0',
				'white-space:pre-wrap',
				'overflow-wrap:anywhere',
				'word-break:break-word'
			].join(';');

		if (tag && TAG_STYLE[tag]) row.style.color = TAG_STYLE[tag].color;

		return row;
	}

		function appendPopupLine(line, tag) {
			if (!viewerMode && !isPopupEnabled()) return;
			var el = ensurePopup();
			var scrollEl = popupScrollEl;
			if (!el || !popupBodyEl || !scrollEl) return;

		var shouldScroll = isAtBottom(scrollEl);
		if (viewerMode && viewerScrollLocked) shouldScroll = false;

			popupBodyEl.appendChild(makeRow(line, tag));

			var max = viewerMode ? RING_MAX : MAX_LINES;
			if (max && max > 0) {
				while (popupBodyEl.childNodes.length > max) {
					try { popupBodyEl.removeChild(popupBodyEl.firstChild); } catch (_) { break; }
				}
		}

		if (shouldScroll) scrollToBottom(scrollEl);
		}

		function startProgressBars(ms) {
			if (!viewerMode && !isPopupEnabled()) return;
			if (!popupProgressFillEl && !popupProgressFillBottomEl) return;

		popupProgressSeq++;
		var seq = popupProgressSeq;
		var dur = (typeof ms === 'number') ? ms : POPUP_MS;

		function resetOne(el) {
			if (!el) return;
			el.style.transition = 'none';
			el.style.transform = 'scaleX(1)';
			void el.offsetWidth;
		}

		safe(function () {
			resetOne(popupProgressFillEl);
			resetOne(popupProgressFillBottomEl);
		});

		function start() {
			if (seq !== popupProgressSeq) return;
			safe(function () {
				if (popupProgressFillEl) {
					popupProgressFillEl.style.transition = 'transform ' + String(dur) + 'ms linear';
					popupProgressFillEl.style.transform = 'scaleX(0)';
				}
				if (popupProgressFillBottomEl) {
					popupProgressFillBottomEl.style.transition = 'transform ' + String(dur) + 'ms linear';
					popupProgressFillBottomEl.style.transform = 'scaleX(0)';
				}
			});
		}

		if (!dur || dur <= 0) return start();

		if (window.requestAnimationFrame) {
			window.requestAnimationFrame(function () {
				window.requestAnimationFrame(start);
			});
		} else setTimeout(start, 0);
	}

	function hidePopup() {
		if (!popupEl) return;
		if (viewerMode) return;
		popupEl.style.display = 'none';
	}

		function armPopupLifetime(reason) {
			if (!viewerMode && !isPopupEnabled()) return;
			var el = ensurePopup();
			var scrollEl = popupScrollEl;
			if (!el || !scrollEl) return;

		if (viewerMode) {
			el.style.display = 'block';
			updatePopupLayout();
			if (popupTimer) { clearTimeout(popupTimer); popupTimer = null; }
			return;
		}

		var now = Date.now();
		var wasVisible = (el.style.display !== 'none');

		if (wasVisible && lastShowTs && (now - lastShowTs) < SHOW_THROTTLE_MS) return;
		lastShowTs = now;

		el.style.display = 'block';
		updatePopupLayout();

		if (popupTimer) clearTimeout(popupTimer);
		popupTimer = setTimeout(function () {
			popupTimer = null;
			hidePopup();
		}, POPUP_MS);

		startProgressBars(POPUP_MS);

			safe(function () {
				try { if (!BL.cfg || !BL.cfg.PERF_DEBUG) return; } catch (_) { return; }
				if (!BL.Console || !BL.Console.debug) return;
				BL.Console.debug(String(PREFIX) + ' DBG LogUI: arm ' + String(reason || 'log') + ' | ms=' + String(POPUP_MS));
			});
		}

		function showPopupNow() {
			if (!viewerMode && !isPopupEnabled()) return;
			armPopupLifetime('log');
		}

		function pushPopupLine(line, tag) {
			if (!viewerMode && !isPopupEnabled()) return;
			armPopupLifetime('log');
			appendPopupLine(line, tag);
		}

		function consoleMirror(tag, line, force) {
			try {
				if (!force && !isPopupEnabled()) return;
				if (!BL.Console) return;

			var out = String(line);
			if (tag === 'ERR' && BL.Console.error) return BL.Console.error(out);
			if (tag === 'WRN' && BL.Console.warn) return BL.Console.warn(out);
			if (tag === 'INF' && BL.Console.info) return BL.Console.info(out);
			if (tag === 'DBG' && BL.Console.debug) return BL.Console.debug(out);
			if (tag === 'OK' && BL.Console.info) return BL.Console.info(out);
			if (BL.Console.log) return BL.Console.log(out);
		} catch (_) { }
		}

		function showLine(tag, source, message, extra) {
			var line = formatLine(tag, source, message, extra);

			ringPush(tag, line);
			consoleMirror(tag, line);
			pushPopupLine(line, tag);
		}

		function renderRingToPopup() {
			try {
				var el = ensurePopup(true);
				if (!el || !popupBodyEl || !popupScrollEl) return;

				try {
					while (popupBodyEl.firstChild) popupBodyEl.removeChild(popupBodyEl.firstChild);
				} catch (_) { }

				var snap = ringSnapshot();
				if (!snap || !snap.length) return;

				var frag = document.createDocumentFragment();
				for (var i = 0; i < snap.length; i++) {
					var it = snap[i];
					if (!it) continue;
					frag.appendChild(makeRow(it.line, it.tag, it.t));
				}
				popupBodyEl.appendChild(frag);
				scrollToBottom(popupScrollEl);
			} catch (_) { }
		}

		function installBodyObserverOnce() {
			safe(function () {
				if (!isPopupEnabled()) return;
				if (!document || !document.documentElement) return;

				if (BL.Log && BL.Log.__bodyObserverInstalled) return;
				BL.Log.__bodyObserverInstalled = true;

			var mo = new MutationObserver(function () {
				if (document.body && !popupEl) {
					ensurePopup();
					safe(function () { if (popupEl) popupEl.style.display = 'none'; });
				}
			});
				mo.observe(document.documentElement, { childList: true, subtree: true });
			});
		}

		BL.Log.init = function () {
		var cfg = null;
		try { cfg = (BL.Config && typeof BL.Config.get === 'function') ? BL.Config.get() : BL.Config; } catch (_) { cfg = BL.Config; }
		cfg = cfg || {};

		var uiCfg = cfg.ui || {};
		var logCfg = cfg.log || {};

			try { if (typeof logCfg.titlePrefix === 'string') TITLE_PREFIX = logCfg.titlePrefix; } catch (_) { }

		try { if (typeof logCfg.popupMs === 'number') POPUP_MS = logCfg.popupMs; } catch (_) { }
		try { if ((!POPUP_MS || POPUP_MS < 0) && typeof uiCfg.popupMs === 'number') POPUP_MS = uiCfg.popupMs; } catch (_) { }

		try { if (typeof logCfg.maxLines === 'number') MAX_LINES = logCfg.maxLines; } catch (_) { }
		try { if (typeof uiCfg.popupScrollTolPx === 'number') SCROLL_TOL_PX = uiCfg.popupScrollTolPx; } catch (_) { }
		try { if (typeof logCfg.showThrottleMs === 'number') SHOW_THROTTLE_MS = logCfg.showThrottleMs; } catch (_) { }

		try { if (typeof uiCfg.popupZIndex === 'number') POPUP_Z_INDEX = uiCfg.popupZIndex; } catch (_) { }
		try { if (typeof uiCfg.popupInsetPx === 'number') POPUP_INSET_PX = uiCfg.popupInsetPx; } catch (_) { }
		try { if (typeof uiCfg.popupBorderRadiusPx === 'number') POPUP_BORDER_RADIUS_PX = uiCfg.popupBorderRadiusPx; } catch (_) { }
		try { if (typeof uiCfg.popupProgressHeightPx === 'number') POPUP_PROGRESS_HEIGHT_PX = uiCfg.popupProgressHeightPx; } catch (_) { }

			applyMode(readModeFromStorage());

			installBodyObserverOnce();
			return LOG_MODE;
		};

		BL.Log.mode = function () { return LOG_MODE; };

		BL.Log.getMode = function () { return LOG_MODE_STR; };
		BL.Log.isPopupEnabled = function () { return isPopupEnabled(); };
		BL.Log.setMode = function (mode) {
			mode = normalizeMode(mode);
			try { lsSet(MODE_LS_KEY, mode); } catch (_) { }
			applyMode(mode);
		};

		BL.Log.ensurePopup = ensurePopup;
		BL.Log.hide = function () {
			safe(function () { if (popupEl && !viewerMode) popupEl.style.display = 'none'; });
		};

	function stopProgressBars() {
		popupProgressSeq++;
		safe(function () {
			if (popupProgressFillEl) {
				popupProgressFillEl.style.transition = 'none';
				popupProgressFillEl.style.transform = 'scaleX(1)';
			}
			if (popupProgressFillBottomEl) {
				popupProgressFillBottomEl.style.transition = 'none';
				popupProgressFillBottomEl.style.transform = 'scaleX(1)';
			}
		});
	}

	function isBackKeyCode(k) {
		return k === 27 || k === 8 || k === 461 || k === 10009;
	}

	function isViewerAtBottom(el) {
		try { return (el.scrollTop + el.clientHeight) >= (el.scrollHeight - 2); }
		catch (_) { return true; }
	}

	function viewerKeyHandler(e) {
		if (!viewerMode) return;
		var k = e.keyCode || 0;
		var el = popupScrollEl;
		if (!el) return;

		if (isBackKeyCode(k)) {
			e.preventDefault();
			e.stopImmediatePropagation();
			safe(function () { if (BL.Log && typeof BL.Log.closeViewer === 'function') BL.Log.closeViewer(); });
			return;
		}

		if (k === 38 || k === 19 || k === 40 || k === 20) {
			e.preventDefault();
			e.stopImmediatePropagation();
			var step = 120;
			if (k === 38 || k === 19) {
				el.scrollTop = Math.max(0, el.scrollTop - step);
				viewerScrollLocked = true;
			} else {
				el.scrollTop = Math.min(el.scrollHeight, el.scrollTop + step);
				viewerScrollLocked = !isViewerAtBottom(el);
			}
		}
	}

	function viewerScrollHandler() {
		if (!viewerMode || !popupScrollEl) return;
		viewerScrollLocked = !isViewerAtBottom(popupScrollEl);
	}

		function setViewerMode(on) {
			try {
				if (on === viewerMode) return;
				viewerMode = Boolean(on);

				var el = ensurePopup(true);
			if (!el || !popupScrollEl) return;

				if (!viewerMode) {
				if (viewerKeyHandlerInstalled) {
					viewerKeyHandlerInstalled = false;
					try { window.removeEventListener('keydown', viewerKeyHandler, true); } catch (_) { }
				}
				if (viewerScrollHandlerInstalled) {
					viewerScrollHandlerInstalled = false;
					try { popupScrollEl.removeEventListener('scroll', viewerScrollHandler, true); } catch (_) { }
				}

				try { el.style.pointerEvents = viewerPrevPopupPointerEvents; } catch (_) { }
				try { el.style.userSelect = viewerPrevPopupUserSelect; } catch (_) { }
				try { el.style.touchAction = viewerPrevPopupTouchAction; } catch (_) { }
				try { popupScrollEl.style.pointerEvents = viewerPrevScrollPointerEvents; } catch (_) { }
				try { popupScrollEl.style.userSelect = viewerPrevScrollUserSelect; } catch (_) { }
				try { popupScrollEl.style.touchAction = viewerPrevScrollTouchAction; } catch (_) { }
				try { if (popupProgressTopEl) popupProgressTopEl.style.display = viewerPrevProgressTopDisplay; } catch (_) { }
				try { if (popupProgressBottomEl) popupProgressBottomEl.style.display = viewerPrevProgressBottomDisplay; } catch (_) { }
				try { if (popupCloseEl) popupCloseEl.style.display = 'none'; } catch (_) { }

					viewerScrollLocked = false;
					safe(function () {
						if (!popupBodyEl) return;
						var keep = isPopupEnabled() ? MAX_LINES : 0;
						if (keep <= 0) {
							while (popupBodyEl.firstChild) popupBodyEl.removeChild(popupBodyEl.firstChild);
						} else {
							while (popupBodyEl.childNodes.length > keep) {
								try { popupBodyEl.removeChild(popupBodyEl.firstChild); } catch (_) { break; }
							}
						}
					});
					safe(function () { if (popupEl && !isPopupEnabled()) popupEl.style.display = 'none'; });
					return;
				}

				renderRingToPopup();
				viewerPrevPopupPointerEvents = String(el.style.pointerEvents || '');
			viewerPrevPopupUserSelect = String(el.style.userSelect || '');
			viewerPrevPopupTouchAction = String(el.style.touchAction || '');
			viewerPrevScrollPointerEvents = String(popupScrollEl.style.pointerEvents || '');
			viewerPrevScrollUserSelect = String(popupScrollEl.style.userSelect || '');
			viewerPrevScrollTouchAction = String(popupScrollEl.style.touchAction || '');
			viewerPrevProgressTopDisplay = popupProgressTopEl ? String(popupProgressTopEl.style.display || '') : '';
			viewerPrevProgressBottomDisplay = popupProgressBottomEl ? String(popupProgressBottomEl.style.display || '') : '';

			if (popupTimer) { clearTimeout(popupTimer); popupTimer = null; }
			stopProgressBars();
			try { if (popupProgressTopEl) popupProgressTopEl.style.display = 'none'; } catch (_) { }
			try { if (popupProgressBottomEl) popupProgressBottomEl.style.display = 'none'; } catch (_) { }

			try { el.style.pointerEvents = 'auto'; } catch (_) { }
			try { el.style.touchAction = 'auto'; } catch (_) { }
			try { popupScrollEl.style.pointerEvents = 'auto'; } catch (_) { }
			try { popupScrollEl.style.touchAction = 'auto'; } catch (_) { }
			try { if (popupCloseEl) popupCloseEl.style.display = 'block'; } catch (_) { }

			el.style.display = 'block';
			updatePopupLayout();
			viewerScrollLocked = !isViewerAtBottom(popupScrollEl);

			if (!viewerKeyHandlerInstalled) {
				viewerKeyHandlerInstalled = true;
				try { window.addEventListener('keydown', viewerKeyHandler, true); } catch (_) { }
			}
			if (!viewerScrollHandlerInstalled) {
				viewerScrollHandlerInstalled = true;
				try { popupScrollEl.addEventListener('scroll', viewerScrollHandler, true); } catch (_) { }
			}
			} catch (_) { }
		}

		BL.Log.setViewerMode = setViewerMode;
		BL.Log.openViewer = function () { setViewerMode(true); };
		BL.Log.closeViewer = function () { setViewerMode(false); };

		BL.Log.showError = function (source, message, extra) { showLine('ERR', source, message, extra); };
		BL.Log.showException = function (source, err, context) {
			try {
				var info = normalizeError(err, context);
				var extra = buildExceptionExtra(info, context);
				showLine('ERR', source || 'ERR', 'exception', extra);
			} catch (_) { }
		};
		BL.Log.showWarn = function (source, message, extra) { showLine('WRN', source, message, extra); };
		BL.Log.showOk = function (source, message, extra) { showLine('OK', source, message, extra); };
		BL.Log.showInfo = function (source, message, extra) { showLine('INF', source, message, extra); };
		BL.Log.showDbg = function (source, message, extra) { showLine('DBG', source, message, extra); };

			BL.Log.raw = function (tag, line, force) {
				try {
					ringPush(tag, line);
					consoleMirror(tag, line, Boolean(force));
					pushPopupLine(line, tag);
				} catch (_) { }
			};

			(function installEventPush() {
				var lastKey = '';
				var lastTs = 0;

				function upper(s) { try { return String(s || '').toUpperCase(); } catch (_) { return ''; } }
				function oneLine(v) {
					try { v = (v === undefined || v === null) ? '' : String(v); } catch (_) { v = ''; }
					if (!v) return '';
					if (v.indexOf('\n') !== -1) v = v.split('\n').join(' ');
					if (v.indexOf('\r') !== -1) v = v.split('\r').join(' ');
					return v;
				}

				function dedupAllow(key, ms) {
					try {
						var now = Date.now();
						var win = (typeof ms === 'number' && ms >= 0) ? ms : 1200;
						if (key && lastKey === key && lastTs && (now - lastTs) < win) return false;
						lastKey = key || '';
						lastTs = now;
					} catch (_) { }
					return true;
				}

				BL.Log.push = function (evt) {
					try {
						if (!evt || typeof evt !== 'object') return;

						var type = oneLine(evt.type || '');
						var action = oneLine(evt.action || '');
						var channel = oneLine(evt.channel || 'other') || 'other';
						var from = oneLine(evt.from);
						var to = (evt.to === undefined || evt.to === null) ? '' : oneLine(evt.to);
						var rule = (evt.rule === undefined || evt.rule === null) ? '' : oneLine(evt.rule);

						if (!type || !action) return;

						var key = type + '|' + action + '|' + channel + '|' + from;
						if (!dedupAllow(key, evt.dedupMs)) return;

						var tag = 'INF';
						if (action === 'block' || action === 'sanitize') tag = 'WRN';
						else if (action === 'override') tag = 'INF';
						else if (action === 'rewrite') tag = 'INF';

						var line = '[BlackLampa][EVT][' + upper(type) + '][' + upper(action) + '][' + channel + ']';
						if (from) line += ' ' + from;
						if (to) line += ' -> ' + to;
						if (rule) line += ' | ' + rule;

						if (BL.Log && typeof BL.Log.raw === 'function') BL.Log.raw(tag, line);
					} catch (_) { }
				};
			})();

			BL.Log.isEnabled = function () { return true; };

		BL.Log.perf = function () {
		try {
			var visible = false;
			var lines = 0;
			try { visible = !!popupEl && popupEl.style.display !== 'none'; } catch (_) { visible = false; }
			try { lines = popupBodyEl && popupBodyEl.childNodes ? popupBodyEl.childNodes.length : 0; } catch (_) { lines = 0; }
			return { mode: LOG_MODE, viewer: viewerMode, visible: visible, lines: lines };
		} catch (_) {
			return { mode: LOG_MODE, viewer: viewerMode, visible: false, lines: 0 };
		}
	};
})();
