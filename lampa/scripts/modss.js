(function () {
    'use strict';

    // === guard: не запускать дважды ===
    if (window.__modss_loader_running) return;
    window.__modss_loader_running = true;

    // === CONFIG ===
    var CHECK_EVERY_MS = 3000;   // новая попытка каждые N мс
    var TIMEOUT_MS     = 10000;  // таймаут сети
    var KEEP_LAST_ERRORS = 8;    // сколько последних ошибок показывать
    var MAX_ROUNDS     = 10;      // 0 = бесконечно; иначе кол-во полных кругов по urls

    function Protocol() {
        return window.location.protocol === 'https:' ? 'https://' : 'http://';
    }

    var urls = [Protocol() + 'lampa.stream/modss', Protocol() + 'modss.tv', Protocol() + 'n.modss.tv'];

    // === Реальная готовность (ПОДСТРОЙ) ===
    // Лучше заменить на реальный признак регистрации плагина в Lampa.
    function isModssReady() {
        return window.loaded_modss === true && window.__modss_eval_ok === true;
    }

    // init flags
    if (typeof window.loaded_modss !== 'boolean') window.loaded_modss = false;
    window.__modss_eval_ok = false;

    // === network ===
    var network = new Lampa.Reguest();

    // === sticky bottom alert (Noty) ===
    var notyActive = false;
    var lastNotyText = '';
    var lastNotyAt = 0;

    function showSticky(html) {
        try {
            if (!notyActive) notyActive = true;
            // длинный таймер, по сути sticky
            Lampa.Noty.show(html, { time: 60 * 60 * 1000 });
        } catch (e) {}
    }

    function updateNoty(html, force) {
        var now = Date.now();
        if (!force && now - lastNotyAt < 900) return; // анти-спам
        if (!force && html === lastNotyText) return;

        lastNotyAt = now;
        lastNotyText = html;
        showSticky(html);
    }

    function esc(s) {
        s = String(s == null ? '' : s);
        return s.replace(/[&<>"']/g, function (c) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
        });
    }

    // === error journal ===
    var journal = []; // newest first
    function pushErr(obj) {
        journal.unshift({
            at: new Date().toISOString(),
                        stage: obj.stage || '?',
                        url: obj.url || '?',
                        status: obj.status == null ? '?' : obj.status,
                        msg: obj.msg || '',
                        extra: obj.extra || ''
        });
        if (journal.length > KEEP_LAST_ERRORS) journal.length = KEEP_LAST_ERRORS;
    }

    function renderStatus(state) {
        // state: {attempt, url, stage, rounds, maxRounds}
        var lines = [];
        lines.push('<b>MODSs loader</b> ' + (isModssReady() ? '✅ READY' : '⏳ LOADING'));
        lines.push('origin: <code>' + esc(window.location.origin) + '</code>');
        lines.push(
            'attempt: <b>' + esc(state.attempt) + '</b>' +
            ' | round: <b>' + esc(state.rounds) + '</b>/' + esc(state.maxRounds === 0 ? '∞' : state.maxRounds) +
            ' | url: <code>' + esc(state.url) + '</code>'
        );
        lines.push('stage: <b>' + esc(state.stage) + '</b> | timeout: ' + TIMEOUT_MS + 'ms | retry: ' + CHECK_EVERY_MS + 'ms');

        if (journal.length) {
            lines.push('<hr style="opacity:.25;margin:.35em 0;">');
            lines.push('<b>Last errors:</b>');
            for (var i = 0; i < journal.length; i++) {
                var e = journal[i];
                lines.push(
                    '<div style="opacity:.95">' +
                    '<code>' + esc(e.at.slice(11, 19)) + '</code>' +
                    ' [' + esc(e.stage) + ']' +
                    ' <code>' + esc(e.url) + '</code>' +
                    ' status:<b>' + esc(e.status) + '</b>' +
                    (e.msg ? ' — ' + esc(e.msg) : '') +
                    (e.extra ? ' <span style="opacity:.75">(' + esc(e.extra) + ')</span>' : '') +
                    '</div>'
                );
            }
        }

        return lines.join('<br>');
    }

    // === requestData (как у тебя) ===
    function makeRequestData() {
        //var cashe = encodeURIComponent(Lampa.Base64.encode(window.location.origin));
        var cashe = encodeURIComponent(Lampa.Base64.encode("yumata.github.io"));
        return {
            user_id: '1',
            uid: '',
            ips: '127.0.0.1',
            cas: cashe,
            cache: true,
            id: 'null',
            or: 'dHJ1ZQ',
            auth: true
        };
    }

    // === main loop ===
    var idx = 0;
    var attempt = 0;
    var inFlight = false;

    // rounds: считаем "полные круги по urls"
    // round=0 пока не прошли все urls хотя бы раз
    var rounds = 0;
    var hitsInRound = 0;

    var timer = null;

    function nextUrl() {
        var u = urls[idx];
        idx = (idx + 1) % urls.length;
        return u;
    }

    function bumpRoundCounter() {
        hitsInRound++;
        if (hitsInRound >= urls.length) {
            hitsInRound = 0;
            rounds++;
        }
    }

    function stop(reason) {
        if (timer) clearInterval(timer);
        timer = null;
        window.__modss_loader_running = false;

        if (reason === 'max_rounds') {
            updateNoty(renderStatus({
                attempt: attempt,
                url: '-',
                stage: 'STOP (max rounds reached)',
                                    rounds: rounds,
                                    maxRounds: MAX_ROUNDS
            }), true);
        }
    }

    function tryLoadOnce() {
        if (inFlight) return;

        if (isModssReady()) {
            updateNoty(renderStatus({ attempt: attempt, url: '-', stage: 'ready', rounds: rounds, maxRounds: MAX_ROUNDS }), true);
            stop('ready');
            return;
        }

        // лимит по полным кругам
        if (MAX_ROUNDS > 0 && rounds >= MAX_ROUNDS) {
            stop('max_rounds');
            return;
        }

        var url = nextUrl();
        bumpRoundCounter();
        attempt++;

        inFlight = true;
        updateNoty(renderStatus({ attempt: attempt, url: url, stage: 'request', rounds: rounds, maxRounds: MAX_ROUNDS }));

        network.timeout(TIMEOUT_MS);

        network.silent(
            url,
            function onOk(txt) {
                updateNoty(renderStatus({ attempt: attempt, url: url, stage: 'eval', rounds: rounds, maxRounds: MAX_ROUNDS }));

                try {
                    eval(String(txt) + '\n//# sourceURL=' + window.location.origin + '/plugin_modss.js');

                    window.__modss_eval_ok = true;
                    window.loaded_modss = true;

                    updateNoty(renderStatus({ attempt: attempt, url: url, stage: 'ok', rounds: rounds, maxRounds: MAX_ROUNDS }), true);

                    if (isModssReady()) stop('ready');
                } catch (e) {
                    window.__modss_eval_ok = false;
                    window.loaded_modss = false;

                    pushErr({
                        stage: 'eval',
                        url: url,
                        status: 'OK',
                        msg: (e && e.message) ? e.message : String(e),
                            extra: (e && e.name) ? e.name : ''
                    });

                    updateNoty(renderStatus({ attempt: attempt, url: url, stage: 'eval_error', rounds: rounds, maxRounds: MAX_ROUNDS }), true);
                } finally {
                    inFlight = false;
                }
            },
            function onErr(a, c) {
                var statusNum = (typeof a === 'number')
                ? a
                : (a && (a.status != null ? a.status : (a.statusCode != null ? a.statusCode : null)));

                var errMsg = '';
                try { errMsg = network.errorDecode(a, c) || ''; } catch (e) {}

                window.__modss_eval_ok = false;
                window.loaded_modss = false;

                pushErr({
                    stage: 'net',
                    url: url,
                    status: (statusNum == null ? '?' : statusNum),
                        msg: errMsg || 'request failed',
                        extra: (c != null ? String(c) : '')
                });

                updateNoty(renderStatus({ attempt: attempt, url: url, stage: 'net_error', rounds: rounds, maxRounds: MAX_ROUNDS }), true);
                inFlight = false;
            },
            makeRequestData(),
                       { dataType: 'text' }
        );
    }

    function start() {
        updateNoty(renderStatus({ attempt: 0, url: '-', stage: 'start', rounds: rounds, maxRounds: MAX_ROUNDS }), true);
        tryLoadOnce();
        timer = setInterval(tryLoadOnce, CHECK_EVERY_MS);
    }

    start();
})();
