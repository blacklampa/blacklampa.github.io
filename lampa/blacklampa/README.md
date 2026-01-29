# BlackLampa (BL / bl)

**Ранний старт (PHASE 0):** `lampa/app.min.js` (BlackLampa hook) → `lampa/blacklampa/bl.init.js`

**PHASED DESIGN (жёстко):**
- PHASE 0 (до auth): логгер + policy + guards
- PHASE 1 (после auth): preload → autoplugin

## Файлы

- `lampa/blacklampa/bl.init.js` — единый orchestrator (`BL.Init.phase0/phase1/start`).
- `lampa/blacklampa/bl.auth.js` — авторизация (UI без переписывания) + чтение `lampa/blacklampa/bl.auth.json`.
- `lampa/blacklampa/bl.preload.js` — preload `localStorage` из `lampa/blacklampa/bl.preload.json` (только post-auth).
- `lampa/blacklampa/bl.autoplugin.js` — install/enable/inject + Settings UI; читает `lampa/blacklampa/bl.autoplugin.json` (только post-auth).
- `lampa/blacklampa/bl.storage.guards.js` — guard `plugins_blacklist` (wipe/guard/watchdog).
- `lampa/blacklampa/bl.policy.network.js` — network policy + CUB blacklist override.
- `lampa/blacklampa/bl.ui.log.js` — popup-лог + mirror в `console` (все строки начинаются с `[BlackLampa]`).
- `lampa/blacklampa/bl.core.js` — общие утилиты (без бизнес-логики).

## Конфиги (JSON)

- `lampa/blacklampa/bl.autoplugin.json` — `plugins[]` и `disabled[]` (lossless: все URL из закомментированных строк исходного списка).
- `lampa/blacklampa/bl.preload.json` — `{ meta, storage }`, где `storage` — карта ключей/значений для preload в `localStorage`.
- `lampa/blacklampa/bl.auth.json` — список допустимых хэшей пароля.

## Plugins (заглушка)

- `lampa/plugins/modification.js` — no-op (слишком поздно для PHASE 0; оставлен как placeholder).
