# BL-Mod Player

Автономный модуль запуска онлайн-источников без изменения legacy-скриптов `lampa/scripts/*`.

## Что делает
- Добавляет кнопку `BL-Mod` на карточке (рядом с `Play`/`Torrent`).
- Загружает список источников из единого SourceHub:
  - `Lampa.Api.sources` (основной канал),
  - fallback из legacy `SourceKit`,
  - статический fallback по donor-скриптам из `/lampa/scripts/*.js`.
- Показывает пошаговый выбор: источник -> раздел/озвучка -> файл.
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
- `blmod.autoload_donors` (`1|0`) — автозагрузка donor-скриптов.
- `blmod.host` — базовый host lampac (по умолчанию `http://smotret24.com/`).
- `blmod.uid` — fallback UID для запросов.
- `blmod.preferred_source` — preferred source id.
- `blmod.source_priority` — csv-приоритет источников.
- `blmod.donor_enabled.<id>` — включение donor-скрипта.
- `blmod.source_enabled.<hash>` — включение конкретного источника в реестре.
- `blmod.lastChoice.source` — последние источники (map).
- `blmod.lastChoice.voice` — последние озвучки (map).
- `blmod.lastChoice.branch` — последние разделы/сезоны (map).
- `blmod.lastChoice.file` — последние файлы (map).

## Меню BL
Добавлен раздел `BL -> BL-Mod`:
- `Main`: enable, log mode, auto-load donors, load now, diagnose, dump.
- `Donors`: список donor-скриптов `/lampa/scripts/*.js` с toggle ON/OFF.
- `Sources`: включение/выключение источников, preferred source, приоритет.
- `Diagnostics`: ручной запуск диагностики и просмотр dump.

## Диагностика `sources_empty`
Если источники не найдены, BL-Mod показывает диагностику:
- состояние `Lampa.Api.sources`
- количество и список ключей
- флаги загруженных online-скриптов
- доступность online-компонентов (`modss_online`, `online_mod`, `smotrolet`, ...)
- статус donor-скриптов и snapshot реестра (`all/enabled/playable`)

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
