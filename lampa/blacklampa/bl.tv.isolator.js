(function () {
  'use strict';

  var BL = window.BL = window.BL || {};
  BL.TVIsolator = BL.TVIsolator || {};

  var API = BL.TVIsolator;
  if (API.__blTVIsolatorLoadedV1) return;
  API.__blTVIsolatorLoadedV1 = true;

  var LS_PREFIX = 'blacklampa_';
  try { if (BL.Keys && BL.Keys.prefix) LS_PREFIX = String(BL.Keys.prefix || 'blacklampa_'); } catch (_) { }

  var KEY_ENABLED = LS_PREFIX + 'tv_isolate_video_hider_added';
  var TAG_CLASS = 'hider-added';

  var STATE = {
    installed: false,
    enabled: false,
    observer: null,
    applyScheduled: false,
    videosTaggedCount: 0,
    lastAppliedTs: 0
  };

  function nowMs() {
    try { return Date.now(); } catch (_) { return +new Date(); }
  }

  function toInt(v, d) {
    var n = parseInt(v, 10);
    return isNaN(n) ? d : n;
  }

  function parseBool(v, def) {
    if (v === undefined || v === null || v === '') return !!def;
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return isFinite(v) && v !== 0;
    try { v = String(v).trim(); } catch (_) { return !!def; }
    if (v === '') return !!def;
    return !/^(0|false|off|no)$/i.test(v);
  }

  function sGet(key, fallback) {
    var v = null;
    try { if (window.Lampa && Lampa.Storage && Lampa.Storage.get) v = Lampa.Storage.get(String(key)); } catch (_) { v = null; }
    if (v === undefined || v === null) { try { if (window.localStorage) v = localStorage.getItem(String(key)); } catch (_) { v = null; } }
    return (v === undefined || v === null) ? fallback : v;
  }

  function sSet(key, value) {
    try { if (window.Lampa && Lampa.Storage && Lampa.Storage.set) return Lampa.Storage.set(String(key), String(value)); } catch (_) { }
    try { if (window.localStorage) localStorage.setItem(String(key), String(value)); } catch (_) { }
  }

  function isVideoNode(node) {
    if (!node || typeof node !== 'object') return false;
    try { return String(node.tagName || '').toLowerCase() === 'video'; } catch (_) { return false; }
  }

  function tagVideo(video) {
    if (!video || !STATE.enabled) return false;
    if (!isVideoNode(video)) return false;
    try {
      if (!video.classList) return false;
      if (video.classList.contains(TAG_CLASS)) return false;
      video.classList.add(TAG_CLASS);
      STATE.videosTaggedCount = toInt(STATE.videosTaggedCount, 0) + 1;
      STATE.lastAppliedTs = nowMs();
      return true;
    } catch (_) {
      return false;
    }
  }

  function untagVideo(video) {
    if (!video || !isVideoNode(video)) return false;
    try {
      if (!video.classList || !video.classList.contains(TAG_CLASS)) return false;
      video.classList.remove(TAG_CLASS);
      return true;
    } catch (_) {
      return false;
    }
  }

  function applyToNode(root) {
    if (!STATE.enabled || !root) return 0;
    var changed = 0;

    if (isVideoNode(root)) {
      if (tagVideo(root)) changed++;
      return changed;
    }

    try {
      if (!root.querySelectorAll) return changed;
      var list = root.querySelectorAll('video');
      for (var i = 0; i < list.length; i++) {
        if (tagVideo(list[i])) changed++;
      }
    } catch (_) { }

    return changed;
  }

  function applyToAllVideos(doc) {
    doc = doc || document;
    if (!STATE.enabled || !doc) return 0;
    var changed = 0;
    try { changed += applyToNode(doc.documentElement || doc); } catch (_) { }
    if (changed > 0 && !STATE.lastAppliedTs) STATE.lastAppliedTs = nowMs();
    return changed;
  }

  function removeFromAllVideos(doc) {
    doc = doc || document;
    if (!doc) return 0;
    var removed = 0;
    try {
      var root = doc.documentElement || doc;
      if (isVideoNode(root)) removed += untagVideo(root) ? 1 : 0;
      if (root && root.querySelectorAll) {
        var list = root.querySelectorAll('video');
        for (var i = 0; i < list.length; i++) {
          if (untagVideo(list[i])) removed++;
        }
      }
      if (removed > 0) STATE.lastAppliedTs = nowMs();
    } catch (_) { }
    return removed;
  }

  function scheduleApply() {
    if (!STATE.enabled || STATE.applyScheduled) return;
    STATE.applyScheduled = true;
    setTimeout(function () {
      STATE.applyScheduled = false;
      if (!STATE.enabled) return;
      try { applyToAllVideos(document); } catch (_) { }
    }, 0);
  }

  function connectObserver() {
    if (!STATE.enabled || STATE.observer || typeof MutationObserver !== 'function') return;
    try {
      var root = document && document.documentElement;
      if (!root) return;
      STATE.observer = new MutationObserver(function (mutations) {
        if (!STATE.enabled || !mutations || !mutations.length) return;
        for (var i = 0; i < mutations.length; i++) {
          var m = mutations[i];
          if (!m || !m.addedNodes || !m.addedNodes.length) continue;
          scheduleApply();
          return;
        }
      });
      STATE.observer.observe(root, { childList: true, subtree: true });
    } catch (_) {
      try { if (STATE.observer && STATE.observer.disconnect) STATE.observer.disconnect(); } catch (__e) { }
      STATE.observer = null;
    }
  }

  function disconnectObserver() {
    try {
      if (STATE.observer && STATE.observer.disconnect) STATE.observer.disconnect();
    } catch (_) { }
    STATE.observer = null;
    STATE.applyScheduled = false;
  }

  function setEnabledStored(on) {
    sSet(KEY_ENABLED, on ? '1' : '0');
  }

  function readEnabled() {
    return parseBool(sGet(KEY_ENABLED, '0'), false);
  }

  function enableRuntime() {
    STATE.enabled = true;
    applyToAllVideos(document);
    connectObserver();
  }

  function disableRuntime() {
    STATE.enabled = false;
    disconnectObserver();
  }

  API.install = function () {
    if (STATE.installed) return true;
    STATE.installed = true;
    API.refresh();
    return true;
  };

  API.apply = function () {
    if (!STATE.enabled) return 0;
    return applyToAllVideos(document);
  };

  API.enable = function () {
    setEnabledStored(true);
    API.refresh();
    return API.state();
  };

  API.disable = function () {
    setEnabledStored(false);
    API.refresh();
    return API.state();
  };

  API.refresh = function () {
    var wanted = readEnabled();
    if (wanted) {
      if (!STATE.enabled) enableRuntime();
      else scheduleApply();
    } else if (STATE.enabled) {
      disableRuntime();
    }
    return API.state();
  };

  API.removeNow = function () {
    return removeFromAllVideos(document);
  };

  API.state = function () {
    return {
      enabled: !!STATE.enabled,
      videosTaggedCount: toInt(STATE.videosTaggedCount, 0),
      lastAppliedTs: toInt(STATE.lastAppliedTs, 0),
      observerActive: !!STATE.observer
    };
  };

  API.install();
})();
