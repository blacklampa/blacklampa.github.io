(function () {
  'use strict';

  var BL = window.BL = window.BL || {};
  BL.ModuleExtFilters = BL.ModuleExtFilters || {};

  var API = BL.ModuleExtFilters;
  if (API.__blModuleExtFiltersLoaded) return;
  API.__blModuleExtFiltersLoaded = true;

  function impl() {
    try { return (window.BL && BL.ExtFilters) ? BL.ExtFilters : null; } catch (_) { return null; }
  }

  API.isEnabled = function () {
    try {
      var m = impl();
      if (m && typeof m.isEnabled === 'function') return !!m.isEnabled();
    } catch (_) { }
    return false;
  };

  API.toggle = function (on) {
    try {
      var m = impl();
      if (!m) return;
      if (typeof m.setEnabled === 'function') m.setEnabled(!!on);
      if (typeof m.refresh === 'function') m.refresh();
    } catch (_) { }
  };

  API.installHooks = function () {
    try {
      var m = impl();
      if (m && typeof m.refresh === 'function') m.refresh();
    } catch (_) { }
  };

  API.refresh = function () {
    try {
      var m = impl();
      if (m && typeof m.refresh === 'function') m.refresh();
    } catch (_) { }
  };
})();

