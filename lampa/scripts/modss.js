(function () {
    'use strict';

    // === настройки ===
    var CHECK_EVERY_MS = 3000;   // перепроверка каждые 3 сек
    var TIMEOUT_MS     = 10000;  // таймаут сети
    var MAX_ROUNDS     = 10;      // 0 = бесконечно; иначе кол-во полных кругов по urls

    // === "реальный признак загрузки" (подстрой под свой плагин) ===
    // ВАЖНО: лучше проверять не loaded_modss, а то, что плагин реально зарегистрировался.
    function isModssActuallyReady() {
        // примерные варианты (выбери/добавь свой реальный признак):
        // return !!(window.Modss && window.Modss.init);
        // return !!(Lampa && Lampa.Plugin && Lampa.Plugin.get && Lampa.Plugin.get('modss'));
        // fallback:
        return window.loaded_modss === true && window.__modss_eval_ok === true;
    }

    function Protocol() {
        return window.location.protocol === 'https:' ? 'https://' : 'http://';
    }

    var urls = [Protocol() + 'lampa.stream/modss', Protocol() + 'modss.tv', Protocol() + 'n.modss.tv'];

    // если уже крутится — не плодим циклы
    if (window.__modss_loader_running) return;
    window.__modss_loader_running = true;

    // НЕ выставляем loaded_modss=true заранее
    if (typeof window.loaded_modss !== 'boolean') window.loaded_modss = false;
    window.__modss_eval_ok = false;

    var network = new Lampa.Reguest();
    var idx = 0;
    var rounds = 0;
    var inFlight = false;

    function log() {
        try { console.log.apply(console, arguments); } catch (e) {}
    }

    function attemptOnce() {
        if (inFlight) return;
        if (isModssActuallyReady()) {
            stopLoop();
            return;
        }

        var url = urls[idx];
        idx = (idx + 1) % urls.length;
        if (idx === 0) {
            rounds++;
            if (MAX_ROUNDS > 0 && rounds > MAX_ROUNDS) {
                log('Modss', 'loader', 'stop: max rounds reached');
                stopLoop(true);
                return;
            }
        }

        inFlight = true;
        network.timeout(TIMEOUT_MS);

        // requestData оставил, но можно упростить если не нужно
        var cashe = encodeURIComponent(Lampa.Base64.encode(window.location.origin));
        var requestData = {
            user_id: '',
            uid: '145e884a14a0724a6b0ea55ed',
            ips: '127.0.0.1',
            cas: cashe,
            cache: true,
            id: '',
            or: 'dW5kZWZpbmVk',
            auth: undefined
        };

        log('Modss', 'loader', 'try', url);

        network.silent(
            url,
            function onOk(txt) {
                try {
                    // ВАЖНО: ставим флаги только после успешного eval
                    log('Modss', 'loader', 'eval', url);
                    eval(String(txt) + '\n//# sourceURL=' + window.location.origin + '/plugin_modss.js');
                    window.__modss_eval_ok = true;
                    window.loaded_modss = true;

                    // если после eval "реальный признак" появился — стопаемся
                    if (isModssActuallyReady()) {
                        log('Modss', 'loader', 'ready');
                        stopLoop();
                    }
                } catch (e) {
                    window.__modss_eval_ok = false;
                    window.loaded_modss = false;
                    log('Modss', 'loader', 'eval error', url, e && e.message);
                } finally {
                    inFlight = false;
                }
            },
            function onErr(a, c) {
                try {
                    var errMsg = network.errorDecode(a, c);
                    var statusNum = (typeof a === 'number')
                    ? a
                    : (a && (a.status != null ? a.status : (a.statusCode != null ? a.statusCode : null)));
                    log('Modss', 'loader', 'net error', url, 'status:', statusNum, errMsg);
                } catch (e) {}
                inFlight = false;
                window.__modss_eval_ok = false;
                window.loaded_modss = false;
            },
            requestData,
            { dataType: 'text' }
        );
    }

    var timer = null;

    function startLoop() {
        // сразу пробуем
        attemptOnce();
        // и далее каждые N сек
        timer = setInterval(attemptOnce, CHECK_EVERY_MS);
    }

    function stopLoop(failed) {
        if (timer) clearInterval(timer);
        timer = null;
        window.__modss_loader_running = false;
        if (failed) {
            try {
                Lampa.Noty.show('MODSs: загрузчик остановлен (достигнут лимит попыток).', { time: 8000 });
            } catch (e) {}
        }
    }

    startLoop();
})();
