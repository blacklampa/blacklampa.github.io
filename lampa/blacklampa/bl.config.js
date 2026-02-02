(function () {
  'use strict';

  var BL = window.BL = window.BL || {};
  BL.Config = BL.Config || {};

  if (typeof BL.Config.get !== 'function') {
    BL.Config.get = function () { return BL.Config; };
  }

  function ensureObj(root, key) {
    try {
      var v = root[key];
      if (v && typeof v === 'object' && !Array.isArray(v)) return v;
    } catch (_) { }
    root[key] = {};
    return root[key];
  }

  function setDefault(obj, key, value) {
    try {
      if (obj[key] === undefined || obj[key] === null) obj[key] = value;
    } catch (_) { }
  }

  var cfg = BL.Config;

  BL.LocalStorageKeys = BL.LocalStorageKeys || {};
  var K = BL.LocalStorageKeys;
  K.prefix = K.prefix || 'blacklampa_';
  var p = String(K.prefix || 'blacklampa_');
  function kp(s) { return p + String(s || ''); }
  var L = ('lang log_mode_v1 auth_ok_v2 preload_applied_v1 preload_json_v1 ap_installer_done_v1 ap_installer_sig_v1 ap_installer_ts_v1 '
    + 'net_policy_enabled net_block_yandex_v1 net_block_google_v1 net_block_stats_v1 net_block_bwa_cors_v1 net_user_rules_v1 '
    + 'jsqp_enabled jsqp_force jsqp_origin_mode jsqp_origin_value jsqp_logged_mode jsqp_logged_value jsqp_reset_mode jsqp_reset_value jsqp_match jsqp_params '
    + 'ext_filters ua_original_v1 ua_preset_id_v1 ua_custom_v1 ua_header_override_supported_v1 ua_enabled_v1 ua_mode_v1 '
    + 'backup_cfg_v1 backup_history_v1 fs_concurrency_v1').split(' ');
  for (var i = 0; i < L.length; i++) { var n = L[i]; if (n && !K[n]) K[n] = kp(n); }
  try { BL.Keys = K; } catch (_) { }

  var ui = ensureObj(cfg, 'ui');
  var log = ensureObj(cfg, 'log');
  var auth = ensureObj(cfg, 'auth');
  var preload = ensureObj(cfg, 'preload');
  var autoplugin = ensureObj(cfg, 'autoplugin');
  var storage = ensureObj(cfg, 'storage');

  setDefault(ui, 'popupZIndex', 2147483647);
  setDefault(ui, 'popupInsetPx', 5);
  setDefault(ui, 'popupBorderRadiusPx', 12);
  setDefault(ui, 'popupProgressHeightPx', 2);
  setDefault(ui, 'popupScrollTolPx', 40);

  setDefault(cfg, 'LOG_MODE', 0);
  setDefault(log, 'titlePrefix', 'BlackLampa log');
  setDefault(log, 'popupMs', 5000);
  setDefault(log, 'maxLines', 120);
  setDefault(log, 'showThrottleMs', 0);
  setDefault(log, 'domImmediate', true);

  setDefault(ui, 'popupMs', log.popupMs);
  setDefault(log, 'immediate', log.domImmediate);

  setDefault(auth, 'key', K.auth_ok_v2);
  setDefault(auth, 'authJson', '/lampa/blacklampa/bl.auth.json');

  setDefault(preload, 'jsonFile', 'bl.preload.json');
  setDefault(preload, 'appliedFlagKey', K.preload_applied_v1);
  setDefault(preload, 'fallbackJsonKey', K.preload_json_v1);

  setDefault(autoplugin, 'jsonFile', 'bl.autoplugin.json');
  setDefault(autoplugin, 'doneFallbackMs', 30000);
  var apFlags = ensureObj(autoplugin, 'flags');
  setDefault(apFlags, 'done', K.ap_installer_done_v1);
  setDefault(apFlags, 'sig', K.ap_installer_sig_v1);
  setDefault(apFlags, 'ts', K.ap_installer_ts_v1);

  var apUi = ensureObj(autoplugin, 'settings');
  setDefault(apUi, 'componentId', 'bl_autoplugin');
  setDefault(apUi, 'extrasComponentId', 'bl_autoplugin_extras');
  setDefault(apUi, 'extraPluginComponentPrefix', 'bl_autoplugin_extras_plugin_');

  var pluginsInstaller = ensureObj(cfg, 'pluginsInstaller');
  var piUi = ensureObj(pluginsInstaller, 'settings');
  setDefault(piUi, 'componentId', apUi.componentId);
  setDefault(piUi, 'name', 'BlackLampa');
  setDefault(piUi, 'icon', '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm1 14.5h-2v-2h2v2zm0-4h-2V6h2v6.5z" fill="currentColor"/></svg>');

  setDefault(storage, 'pluginsBlacklistKey', 'plugins_blacklist');
  setDefault(storage, 'pluginsBlacklistEmpty', '[]');
  setDefault(storage, 'pluginsBlacklistWatchdogMs', 2000);

  setDefault(cfg, 'langDefault', 'ru');
  setDefault(cfg, 'langStorageKey', K.lang);
  setDefault(cfg, 'storagePrefix', p);

  var menu = ensureObj(cfg, 'menu');
  setDefault(menu, 'rootParamPrefix', 'bl_pi_root_');
  setDefault(menu, 'enableAutoChildrenMenu', true);

  var i18n = ensureObj(cfg, 'i18n');
  setDefault(i18n, 'preferJson', true);
  setDefault(i18n, 'dictBasePath', '');
  setDefault(i18n, 'fallbackToKey', true);

  setDefault(cfg, 'NET_HOOK_WS', 0);
  setDefault(cfg, 'PERF_DEBUG', 0);

  try { BL.cfg = cfg; } catch (_) { }

  function logCall(method, msg, extra) {
    try { if (BL.Log && typeof BL.Log[method] === 'function') return BL.Log[method]('Keys', msg, extra); } catch (_) { }
  }
  function lsHas(k) { try { return localStorage.getItem(String(k)) !== null; } catch (_) { return false; } }
  function lsGet(k) { try { return localStorage.getItem(String(k)); } catch (_) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(String(k), String(v)); } catch (_) { } }
  function lsDel(k) { try { localStorage.removeItem(String(k)); } catch (_) { } }

  BL.migrateKeysOnce = BL.migrateKeysOnce || function () {
    try {
      var moved = 0, dropped = 0;
      var map = {
        bl_lang: K.lang,
        bl_log_mode_v1: K.log_mode_v1,
        msx_fake_auth_ok_v2: K.auth_ok_v2,
        msx_preload_applied_v1: K.preload_applied_v1,
        msx_preload_json_v1: K.preload_json_v1,
        ap_installer_done_v1: K.ap_installer_done_v1,
        ap_installer_sig_v1: K.ap_installer_sig_v1,
        ap_installer_ts_v1: K.ap_installer_ts_v1,
        bl_net_policy_enabled: K.net_policy_enabled,
        bl_net_block_yandex_v1: K.net_block_yandex_v1,
        bl_net_block_google_v1: K.net_block_google_v1,
        bl_net_block_stats_v1: K.net_block_stats_v1,
        bl_net_block_bwa_cors_v1: K.net_block_bwa_cors_v1,
        bl_net_user_rules_v1: K.net_user_rules_v1,
        bl_net_rule_add_pattern: kp('net_rule_new_pattern'),
        bl_jsqp_enabled: K.jsqp_enabled,
        bl_jsqp_force: K.jsqp_force,
        bl_jsqp_origin_mode: K.jsqp_origin_mode,
        bl_jsqp_origin_value: K.jsqp_origin_value,
        bl_jsqp_logged_mode: K.jsqp_logged_mode,
        bl_jsqp_logged_value: K.jsqp_logged_value,
        bl_jsqp_reset_mode: K.jsqp_reset_mode,
        bl_jsqp_reset_value: K.jsqp_reset_value,
        bl_jsqp_match: K.jsqp_match,
        bl_jsqp_params: K.jsqp_params,
        bl_ext_filters: K.ext_filters,
        bl_ua_original_v1: K.ua_original_v1,
        bl_ua_preset_id_v1: K.ua_preset_id_v1,
        bl_ua_custom_v1: K.ua_custom_v1,
        bl_ua_header_override_supported_v1: K.ua_header_override_supported_v1,
        bl_ua_enabled: K.ua_enabled_v1,
        bl_ua_mode: K.ua_mode_v1,
        bl_ua_custom: K.ua_custom_v1,
        bl_backup_cfg_v1: K.backup_cfg_v1,
        bl_backup_history_v1: K.backup_history_v1,
        bl_backup_key_input_v1: kp('backup_key_input_v1'),
        bl_backup_key_hint_v1: kp('backup_key_hint_v1'),
        bl_backup_prefixes_v1: kp('backup_prefixes_v1'),
        bl_backup_provider_v1: kp('backup_provider_v1'),
        bl_backup_unsafe_store_key_v1: kp('backup_unsafe_store_key_v1'),
        bl_backup_import_mode_v1: kp('backup_import_mode_v1'),
        bl_backup_import_id_v1: kp('backup_import_id_v1'),
        bl_fs_concurrency_v1: K.fs_concurrency_v1
      };
      for (var from in map) {
        var to = map[from];
        if (!to || from === to) continue;
        if (lsHas(from)) {
          if (!lsHas(to)) { lsSet(to, lsGet(from)); moved++; }
          lsDel(from);
          dropped++;
        }
      }
      if (moved || dropped) {
        var s = 'moved=' + moved + ' dropped=' + dropped;
        logCall('showInfo', 'migrated keys', s);
        try { if (!BL.Log) BL.__pendingKeyMigrationLog = { type: 'keys', action: 'migrate', channel: 'storage', from: s }; } catch (_) { }
      }
      return !!(moved || dropped);
    } catch (e) {
      logCall('showWarn', 'migrateKeysOnce failed', e && e.message ? e.message : e);
      return false;
    }
  };
  try { BL.migrateKeysOnce(); } catch (_) { }
})();
