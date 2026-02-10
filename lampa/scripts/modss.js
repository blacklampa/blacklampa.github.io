(function () {
    'use strict';

    // === guard ===
    if (window.__modss_loader_running) return;
    window.__modss_loader_running = true;

    // === CONFIG ===
    var CHECK_EVERY_MS = 3000;
    var TIMEOUT_MS = 10000;
    var KEEP_LAST_ERRORS = 8;
    var MAX_ROUNDS = 10; // 0 = бесконечно

    var FONT =
    'font:12px/1.35 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;';

    function Protocol() {
        return window.location.protocol === 'https:' ? 'https://' : 'http://';
    }

    var urls = [
        Protocol() + 'lampa.stream/modss',
 Protocol() + 'modss.tv',
 Protocol() + 'n.modss.tv'
    ];

    function isModssReady() {
        return window.loaded_modss === true && window.__modss_eval_ok === true;
    }

    if (typeof window.loaded_modss !== 'boolean') window.loaded_modss = false;
    window.__modss_eval_ok = false;

    var network = new Lampa.Reguest();

    // === Noty ===
    var lastNotyText = '';
    var lastNotyAt = 0;

    function showNoty(html) {
        try {
            Lampa.Noty.show(
                '<div style="' + FONT + '">' + html + '</div>',
                { time: 60 * 60 * 1000 }
            );
        } catch (e) {}
    }

    function updateNoty(html, force) {
        var now = Date.now();
        if (!force && now - lastNotyAt < 900) return;
        if (!force && html === lastNotyText) return;
        lastNotyAt = now;
        lastNotyText = html;
        showNoty(html);
    }

    function esc(s) {
        s = String(s == null ? '' : s);
        return s.replace(/[&<>"']/g, function (c) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
        });
    }

    // === error journal ===
    var journal = [];
    function pushErr(o) {
        journal.unshift({
            at: new Date().toISOString(),
                        stage: o.stage || '?',
                        url: o.url || '?',
                        status: o.status ?? '?',
                        msg: o.msg || '',
                        extra: o.extra || ''
        });
        if (journal.length > KEEP_LAST_ERRORS) journal.length = KEEP_LAST_ERRORS;
    }

    function renderStatus(s) {
        var out = [];
        out.push('<b>MODSs loader</b> ' + (isModssReady() ? '✅ READY' : '⏳ LOADING'));
        out.push('origin: <code>' + esc(location.origin) + '</code>');
        out.push(
            'attempt: <b>' + s.attempt + '</b>' +
            ' | round: <b>' + s.rounds + '</b>/' + (s.maxRounds === 0 ? '∞' : s.maxRounds) +
            ' | url: <code>' + esc(s.url) + '</code>'
        );
        out.push(
            'stage: <b>' + esc(s.stage) + '</b>' +
            ' | timeout: ' + TIMEOUT_MS + 'ms' +
            ' | retry: ' + CHECK_EVERY_MS + 'ms'
        );

        if (journal.length) {
            out.push('<hr style="opacity:.25;margin:.4em 0">');
            out.push('<b>Last errors:</b>');
            for (var i = 0; i < journal.length; i++) {
                var e = journal[i];
                out.push(
                    '<div>' +
                    '<code>' + esc(e.at.slice(11, 19)) + '</code>' +
                    ' [' + esc(e.stage) + ']' +
                    ' <code>' + esc(e.url) + '</code>' +
                    ' status:<b>' + esc(e.status) + '</b>' +
                    (e.msg ? ' — ' + esc(e.msg) : '') +
                    (e.extra ? ' <span style="opacity:.7">(' + esc(e.extra) + ')</span>' : '') +
                    '</div>'
                );
            }
        }
        return out.join('<br>');
    }

    function makeRequestData() {
        var cashe = encodeURIComponent(Lampa.Base64.encode(location.origin));
        return {
            user_id: '1',
            uid: '',
            ips: '127.0.0.1',
            cas: cashe,
            cache: true,
            id: 'null',
            or: 'dW5kZWZpbmVk',
            auth: undefined
        };
    }

    // === loader loop ===
    var idx = 0, attempt = 0, rounds = 0, hits = 0;
    var inFlight = false, timer = null;

    function nextUrl() {
        var u = urls[idx];
        idx = (idx + 1) % urls.length;
        return u;
    }

    function bumpRound() {
        if (++hits >= urls.length) {
            hits = 0;
            rounds++;
        }
    }

    function stop(reason) {
        if (timer) clearInterval(timer);
        timer = null;
        window.__modss_loader_running = false;

        if (reason === 'max_rounds') {
            updateNoty(renderStatus({
                attempt,
                url: '-',
                stage: 'STOP (max rounds)',
                                    rounds,
                                    maxRounds: MAX_ROUNDS
            }), true);
        }
    }

    function tryOnce() {
        if (inFlight) return;

        if (isModssReady()) {
            updateNoty(renderStatus({
                attempt,
                url: '-',
                stage: 'READY',
                rounds,
                maxRounds: MAX_ROUNDS
            }), true);
            stop('ready');
            return;
        }

        if (MAX_ROUNDS > 0 && rounds >= MAX_ROUNDS) {
            stop('max_rounds');
            return;
        }

        var url = nextUrl();
        bumpRound();
        attempt++;
        inFlight = true;

        updateNoty(renderStatus({
            attempt,
            url,
            stage: 'request',
            rounds,
            maxRounds: MAX_ROUNDS
        }));

        network.timeout(TIMEOUT_MS);
        network.silent(
            url,
            function (txt) {
                updateNoty(renderStatus({
                    attempt,
                    url,
                    stage: 'eval',
                    rounds,
                    maxRounds: MAX_ROUNDS
                }));

                try {
                    eval(String(txt) + '\n//# sourceURL=' + location.origin + '/plugin_modss.js');
                    window.__modss_eval_ok = true;
                    window.loaded_modss = true;

                    updateNoty(renderStatus({
                        attempt,
                        url,
                        stage: 'OK',
                        rounds,
                        maxRounds: MAX_ROUNDS
                    }), true);

                    if (isModssReady()) stop('ready');
                } catch (e) {
                    window.__modss_eval_ok = false;
                    window.loaded_modss = false;
                    pushErr({
                        stage: 'eval',
                        url,
                        status: 'OK',
                        msg: e.message,
                        extra: e.name
                    });
                    updateNoty(renderStatus({
                        attempt,
                        url,
                        stage: 'EVAL ERROR',
                        rounds,
                        maxRounds: MAX_ROUNDS
                    }), true);
                } finally {
                    inFlight = false;
                }
            },
            function (a, c) {
                var status =
                typeof a === 'number'
                ? a
                : a?.status ?? a?.statusCode ?? '?';

                var msg = '';
                try { msg = network.errorDecode(a, c); } catch {}

                window.__modss_eval_ok = false;
                window.loaded_modss = false;

                pushErr({
                    stage: 'net',
                    url,
                    status,
                    msg,
                    extra: c
                });

                updateNoty(renderStatus({
                    attempt,
                    url,
                    stage: 'NET ERROR',
                    rounds,
                    maxRounds: MAX_ROUNDS
                }), true);

                inFlight = false;
            },
            makeRequestData(),
                       { dataType: 'text' }
        );
    }

    updateNoty(renderStatus({
        attempt: 0,
        url: '-',
        stage: 'START',
        rounds,
        maxRounds: MAX_ROUNDS
    }), true);

    tryOnce();
    timer = setInterval(tryOnce, CHECK_EVERY_MS);
})();
