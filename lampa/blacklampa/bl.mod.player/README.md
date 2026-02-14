# BL-Mod Player

BL-Mod — тонкий автономный wrapper вокруг нативного `online_mod`.

## Контракт
- BL-Mod НЕ парсит и НЕ читает `/lampa/scripts/*.js` в рантайме.
- BL-Mod НЕ подгружает donor-скрипты и не активирует их UI/кнопки.
- Кнопка `BL-Mod` на карточке просто открывает нативный компонент `online_mod`.

## Что делает
- Добавляет кнопку `BL-Mod` рядом с `Play`/`Torrent`.
- По нажатию открывает `Lampa.Activity.push({ component: 'online_mod', ... })`.
- Пишет маркер запуска в `blmod.last_open`:
  - `ts`, `from`, `reason`, `component`, `cardId`, `title`, id-поля.

## Ключи storage (`blmod.*`)
- `blmod.enabled` (`true|false`) — включение кнопки BL-Mod.
- `blmod.debug` (`1|0`) — debug режим BL-Mod.
- `blmod.log_level` (`silent|normal|trace`) — уровень логов.
- `blmod.last_open` (object/json) — последний запуск через BL-Mod.

## Меню BL
`BL -> BL-Mod`:
- `BL-Mod: Enable`
- `BL-Mod: Debug`
- `BL-Mod: Open Online-Mod (test)`
- `BL-Mod: Reset defaults`

## Ошибки
Если `online_mod` не зарегистрирован в `Lampa.Component`, BL-Mod покажет:
- `BL-Mod: online_mod not loaded`

BL-Mod в этом случае НЕ пытается подгружать чужие скрипты.
