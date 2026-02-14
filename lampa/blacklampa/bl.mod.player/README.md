# BL-Mod Player

Автономный модуль запуска онлайн-источников по модели `online_mod.js`, без автоподгрузки и без рантайм-чтения donor-скриптов.

## Что делает
- Добавляет кнопку `BL-Mod` на карточке (рядом с `Play`/`Torrent`).
- Использует встроенный (builtin) реестр источников внутри BL-Mod.
- Кнопка `BL-Mod` открывает отдельный results-screen (не popup picker).
- Внутри results-screen: источник -> раздел -> файл -> запуск плеера.
- Резолвит ссылку и запускает `Lampa.Player.play()` с payload, совместимым с online/onlines.
- Передает метаданные в payload:
  - `payload.blmod.sourceId`
  - `payload.blmod.fileId`
  - `payload.blmod.voice`
  - `payload.blmod.season/episode`
  - `payload.blmod.urlSig`
  - `payload.blmod.ctxSig`

## Ключи storage (`blmod.*`)
- `blmod.enabled` (`true|false`) — включение модуля.
- `blmod.log_level` (`silent|normal|trace`) — уровень логирования.
- `blmod.host` — базовый host lampac (по умолчанию `http://smotret24.com/`).
- `blmod.uid` — fallback UID для запросов.
- `blmod.debug` (`1|0`) — debug режим OnlineCore.
- `blmod.preferred_source` — preferred source id для results-screen.
- `blmod.source.enabled.<id>` — включение/выключение builtin источника.
- `blmod.lastChoice.source` — последние источники (map).
- `blmod.lastChoice.voice` — последние озвучки (map).
- `blmod.lastChoice.branch` — последние разделы/сезоны (map).
- `blmod.lastChoice.file` — последние файлы (map).

## Меню BL
Раздел `BL -> BL-Mod`:
- `BL-Mod: Enable`
- `BL-Mod: Debug`
- `BL-Mod: Preferred source`
- `BL-Mod: Show builtin sources`
- `BL-Mod: Open results screen (test)`
- `BL-Mod: Diagnose now`
- `BL-Mod: Reset defaults`

## Диагностика `sources_empty`
Если источники не найдены, BL-Mod показывает диагностику:
- количество включённых/всех builtin sources
- preferred source
- статус `SourceKit`
- список source id

## Добавление нового источника
Источник в BL-Mod — это запись SourceKit (`id/title/url`) из `lite/events`/`lifeevents`.
Для отдельного драйвера можно расширить `sourcekit.js`:
1. Добавить `supports(ctx)`.
2. Реализовать `resolveCatalogByUrl(...)` для нужного формата ответа.
3. Реализовать `resolveFile(...)` в `resolver.js` при нестандартном `method`.

## Интеграция с PG Overlay
Если доступен объект overlay с методами:
- `onPlaybackStart({ blmodMeta, playPayload })`
- `onPlaybackStop({ blmodMeta })`

BL-Mod вызывает их опционально (без жесткой зависимости).
