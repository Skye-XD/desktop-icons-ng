/* eslint-disable no-restricted-globals */
/* eslint-disable no-undef */
(function () {
    'use strict';

    const root = document.getElementById('clock-root');
    const timeEl = document.getElementById('ding-clock-time');
    const dateEl = document.getElementById('ding-clock-date');
    const modeEl = document.getElementById('ding-clock-mode');
    const secondsEl = document.getElementById('ding-clock-seconds');
    const debugEl = document.getElementById('ding-clock-debug');

    function dbg(msg) {
        if (!debugEl)
            return;
        const line = `[${new Date().toISOString()}] ${msg}`;
        debugEl.textContent = `${line}\n${debugEl.textContent || ''}`;
    }

    const hasDing = typeof window.ding === 'object' && window.ding !== null;
    const instanceId = hasDing ? window.ding.instanceId : null;

    function hostLog(msg) {
        dbg(msg);
        if (!hasDing || !instanceId)
            return;
        try {
            window.ding.log(`clock-widget: ${msg} (instance=${instanceId})`);
        } catch (_) {}
    }

    hostLog('starting up');

    let config = {
        theme: 'dark',      // 'dark' | 'light'
        mode24h: true,      // true: 24h, false: 12h
        showSeconds: true,  // true / false
    };

    function applyTheme() {
        if (!root)
            return;
        root.classList.toggle('ding-clock-theme-dark', config.theme === 'dark');
        root.classList.toggle('ding-clock-theme-light', config.theme === 'light');
    }

    function formatTime(date) {
        let h = date.getHours();
        const m = date.getMinutes();
        const s = date.getSeconds();

        let suffix = '';
        if (!config.mode24h) {
            suffix = h >= 12 ? ' PM' : ' AM';
            h %= 12;
            if (h === 0)
                h = 12;
        }

        const hh = config.mode24h ? String(h).padStart(2, '0') : String(h);
        const mm = String(m).padStart(2, '0');
        const ss = String(s).padStart(2, '0');

        if (config.showSeconds)
            return `${hh}:${mm}:${ss}${suffix}`;

        return `${hh}:${mm}${suffix}`;
    }

    function formatDate(date) {
        const y = date.getFullYear();
        const m = date.getMonth() + 1;
        const d = date.getDate();

        // YYYY-MM-DD for now; can localize later
        return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }

    let tickTimer = null;

    function startTicking() {
        if (tickTimer !== null)
            clearInterval(tickTimer);

        const update = () => {
            const now = new Date();
            if (timeEl)
                timeEl.textContent = formatTime(now);
            if (dateEl)
                dateEl.textContent = formatDate(now);
        };

        update();
        tickTimer = setInterval(update, 1000);
    }

    function renderStatus() {
        if (modeEl)
            modeEl.textContent = config.mode24h ? '24h' : '12h';
        if (secondsEl)
            secondsEl.textContent = config.showSeconds ? 'sec on' : 'sec off';
    }

    function renderAll() {
        applyTheme();
        renderStatus();
        startTicking();
    }

    function persist(reason) {
        if (!hasDing || !instanceId)
            return;
        try {
            window.ding.saveConfig(config);
            hostLog(`${reason} -> ${JSON.stringify(config)}`);
        } catch (e) {
            dbg(`persist failed: ${e}`);
        }
    }

    async function initConfig() {
        if (!hasDing || !instanceId || typeof window.ding.getConfig !== 'function') {
            hostLog('ding not available, using defaults');
            renderAll();
            return;
        }

        hostLog('calling getConfig()');

        try {
            const saved = await window.ding.getConfig();
            if (saved && typeof saved === 'object') {
                if (typeof saved.theme === 'string')
                    config.theme = saved.theme === 'light' ? 'light' : 'dark';
                if (typeof saved.mode24h === 'boolean')
                    config.mode24h = saved.mode24h;
                if (typeof saved.showSeconds === 'boolean')
                    config.showSeconds = saved.showSeconds;
                hostLog(`loaded config ${JSON.stringify(saved)}`);
            } else {
                hostLog('no saved config, using defaults');
            }
        } catch (e) {
            hostLog(`getConfig failed: ${e}`);
        }

        renderAll();
    }

    if (root) {
        root.addEventListener('click', () => {
            config.mode24h = !config.mode24h;
            renderAll();
            persist('toggled hour mode');
        });

        root.addEventListener('contextmenu', ev => {
            ev.preventDefault();
            config.showSeconds = !config.showSeconds;
            renderAll();
            persist('toggled seconds');
        }, false);
    }

    (function () {
        let lastTap = 0;
        if (!root)
            return;
        root.addEventListener('touchend', () => {
            const now = Date.now();
            if (now - lastTap < 300) {
                config.theme = config.theme === 'dark' ? 'light' : 'dark';
                renderAll();
                persist('toggled theme (double-tap)');
            }
            lastTap = now;
        });
    })();

    applyTheme();
    startTicking();
    renderStatus();

    initConfig();
})();
