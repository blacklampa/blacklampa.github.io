(function () {
  'use strict';

  var BL = window.BL = window.BL || {};
  var MP = BL.ModPlayer = BL.ModPlayer || {};

  MP.UI = MP.UI || {};
  if (MP.UI.Button && MP.UI.Button.__loaded) return;

  var Button = MP.UI.Button = MP.UI.Button || {};
  Button.__loaded = true;

  var BTN_CLASS = 'view--blmod';
  var BTN_HTML = '' +
    '<div class="full-start__button selector ' + BTN_CLASS + '" data-subtitle="BL-Mod Player">' +
      '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">' +
        '<path d="M6 4v16l13-8z" fill="currentColor"></path>' +
      '</svg>' +
      '<span>BL-Mod</span>' +
    '</div>';

  var installed = false;

  function log(level, msg, meta) {
    try {
      if (MP && typeof MP.log === 'function') MP.log(level, msg, meta || null);
    } catch (_) { }
  }

  function openFromMovie(movie) {
    try {
      if (MP && typeof MP.openFromCard === 'function') MP.openFromCard(movie);
    } catch (e) {
      log('ERR', 'button_open_fail', { err: e && e.message ? e.message : String(e) });
    }
  }

  function mount(target, movie) {
    if (!target || !target.length) return false;

    try {
      if (target.parent().find('.' + BTN_CLASS).length) return true;
    } catch (_) { }

    var btn = $(BTN_HTML);

    btn.on('hover:enter', function () {
      openFromMovie(movie);
    });

    btn.on('click', function (e) {
      try { if (e && e.preventDefault) e.preventDefault(); } catch (_) { }
      openFromMovie(movie);
      return false;
    });

    try {
      target.before(btn);
      return true;
    } catch (_) { }

    return false;
  }

  function mountIntoButtons(render, movie) {
    if (!render || !render.length) return false;

    if (render.find('.' + BTN_CLASS).length) return true;

    var primary = render.find('.button--play');
    if (primary.length && mount(primary.eq(0), movie)) return true;

    var torrent = render.find('.view--torrent');
    if (torrent.length && mount(torrent.eq(0), movie)) return true;

    var newButtons = render.find('.full-start-new__buttons');
    if (newButtons.length) {
      var btn = $(BTN_HTML);
      btn.on('hover:enter', function () { openFromMovie(movie); });
      btn.on('click', function (e) {
        try { if (e && e.preventDefault) e.preventDefault(); } catch (_) { }
        openFromMovie(movie);
        return false;
      });
      try {
        newButtons.eq(0).append(btn);
        return true;
      } catch (_) { }
    }

    var oldButtons = render.find('.full-start__buttons');
    if (oldButtons.length) {
      var btnOld = $(BTN_HTML);
      btnOld.on('hover:enter', function () { openFromMovie(movie); });
      btnOld.on('click', function (e) {
        try { if (e && e.preventDefault) e.preventDefault(); } catch (_) { }
        openFromMovie(movie);
        return false;
      });
      try {
        oldButtons.eq(0).append(btnOld);
        return true;
      } catch (_) { }
    }

    return false;
  }

  function tryActiveFull() {
    try {
      var active = Lampa.Activity.active();
      if (!active || active.component !== 'full') return;
      var render = active.activity && active.activity.render ? active.activity.render() : null;
      var movie = active.card || (active.activity && active.activity.movie) || null;
      if (render && movie) mountIntoButtons(render, movie);
    } catch (_) { }
  }

  Button.install = function () {
    if (installed) return true;
    installed = true;

    try {
      Lampa.Listener.follow('full', function (e) {
        try {
          if (!e || e.type !== 'complite') return;
          var render = e.object && e.object.activity && e.object.activity.render ? e.object.activity.render() : null;
          var movie = e.data && e.data.movie ? e.data.movie : null;
          if (render && movie) mountIntoButtons(render, movie);
        } catch (_) { }
      });
    } catch (_) { }

    try {
      Lampa.Listener.follow('activity', function (e) {
        try {
          if (!e || e.type !== 'start') return;
          if (!e.component || e.component !== 'full') return;
          setTimeout(tryActiveFull, 0);
          setTimeout(tryActiveFull, 300);
        } catch (_) { }
      });
    } catch (_) { }

    setTimeout(tryActiveFull, 0);
    setTimeout(tryActiveFull, 600);

    log('INF', 'button_installed', null);
    return true;
  };
})();
