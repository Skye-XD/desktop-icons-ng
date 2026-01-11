/* eslint-disable no-restricted-globals */
/* eslint-disable no-undef */
/* World Clock widget face logic (UTC offset; no seconds; minute-aligned) */

(() => {
    'use strict';

    const PRESET_COLORS = {
        pink: '#ff4fd8',
        cyan: '#31e6ff',
        lime: '#7dff3a',
        purple: '#b070ff',
        amber: '#ffb020',
    };

    const DEFAULT_CONFIG = {
        label: 'New York',
        utcOffsetMinutes: -300,
        hourFormat: '12', // '12' | '24'
        neonPreset: 'cyan', // legacy
        neonColor: '#31e6ff',
        bgColor: '#31e6ff',
        bgAlpha: 0.08,
    };

    const cityEl = document.getElementById('city');
    const cityTextEl = document.getElementById('cityText');
    const timeTextEl = document.getElementById('timeText');
    const ampmTextEl = document.getElementById('ampmText');
    const utcTextEl = document.getElementById('utcText');
    const rootEl = document.getElementById('root');

    let config = {...DEFAULT_CONFIG};
    let timer = null;
    let interval = null;

    function clamp(n, lo, hi) {
        return Math.max(lo, Math.min(hi, n));
    }

    function pad2(n) {
        return n < 10 ? `0${n}` : String(n);
    }

    function formatUtcOffset(mins) {
        const sign = mins < 0 ? '-' : '+';
        const abs = Math.abs(mins);
        const hh = Math.floor(abs / 60);
        const mm = abs % 60;
        return `UTC${sign}${pad2(hh)}:${pad2(mm)}`;
    }

    function computeFontsFromHeight(H) {
        const pad = clamp(Math.round(H * 0.05), 6, 14);

        const fsCity = clamp(Math.round(H * 0.15), 14, 16); // keep small-size cap
        const fsUtc  = clamp(Math.round(H * 0.14), 12, 14); // keep small-size cap
        const fsTime = clamp(Math.round(H * 0.60), 60, 140);
        const fsAmpm = clamp(Math.round(fsTime * 0.24), 10, 26);

        return {pad, fsCity, fsUtc, fsTime, fsAmpm};
    }

    function applySizing() {
        const H = window.innerHeight || 160;
        const {pad, fsCity, fsUtc, fsTime, fsAmpm} = computeFontsFromHeight(H);

        document.documentElement.style.setProperty('--pad', `${pad}px`);
        document.documentElement.style.setProperty('--fs-city', `${fsCity}px`);
        document.documentElement.style.setProperty('--fs-utc', `${fsUtc}px`);
        document.documentElement.style.setProperty('--fs-time', `${fsTime}px`);
        document.documentElement.style.setProperty('--fs-ampm', `${fsAmpm}px`);
    }

    function applyNeon() {
        const direct = typeof config.neonColor === 'string' ? config.neonColor.trim() : '';
        const directOk = /^#([0-9a-f]{6})$/i.test(direct);
        const preset = (config.neonPreset && String(config.neonPreset).toLowerCase()) || 'cyan';
        const neonColor = directOk ? direct : PRESET_COLORS[preset] || PRESET_COLORS.cyan;

        const bgDirect = typeof config.bgColor === 'string' ? config.bgColor.trim() : '';
        const bgOk = /^#([0-9a-f]{6})$/i.test(bgDirect);
        const bgColor = bgOk ? bgDirect : neonColor;

        const rawAlpha = Number(config.bgAlpha);
        const bgAlpha = Number.isFinite(rawAlpha) ? clamp(rawAlpha, 0, 0.35) : DEFAULT_CONFIG.bgAlpha;

        document.documentElement.style.setProperty('--neon-color', neonColor);
        document.documentElement.style.setProperty('--bg-color', bgColor);
        document.documentElement.style.setProperty('--bg-alpha', String(bgAlpha));

        // If color-mix fallback is active, it won't respond to --neon-color.
        // Keep it minimal: update fallback by setting inline rgba on root.
        if (!CSS.supports('background: color-mix(in srgb, #000 50%, transparent)')) {
            // Parse hex -> rgb
            const m = /^#?([0-9a-f]{6})$/i.exec(bgColor);
            if (m) {
                const hex = m[1];
                const r = parseInt(hex.slice(0, 2), 16);
                const g = parseInt(hex.slice(2, 4), 16);
                const b = parseInt(hex.slice(4, 6), 16);
                rootEl.style.background = `rgba(${r}, ${g}, ${b}, ${bgAlpha})`;
            }
        } else {
            rootEl.style.background = '';
        }
    }

    function getUtcNowMillis(localNow) {
    // Date stores UTC milliseconds already; just reuse the epoch value
        return localNow.getTime();
    }

    function renderOnce() {
        const now = new Date();
        const utcMillis = getUtcNowMillis(now);
        const offsetMin = Number.isFinite(config.utcOffsetMinutes) ? config.utcOffsetMinutes : DEFAULT_CONFIG.utcOffsetMinutes;
        const target = new Date(utcMillis + offsetMin * 60000);

        const hours = target.getUTCHours(); // target is in "UTC" representation of shifted millis
        const mins = target.getUTCMinutes();

        const fmt = config.hourFormat === '24' ? '24' : '12';

        let hh = hours;
        let ampm = '';
        if (fmt === '12') {
            ampm = hours >= 12 ? 'PM' : 'AM';
            hh = hours % 12;
            if (hh === 0)
                hh = 12;
        }

        timeTextEl.textContent = `${pad2(hh)}:${pad2(mins)}`;
        ampmTextEl.textContent = fmt === '12' ? ampm : '';

        const label = typeof config.label === 'string' && config.label.trim() ? config.label.trim() : DEFAULT_CONFIG.label;
        cityTextEl.textContent = label;
        cityEl.title = label;

        utcTextEl.textContent = formatUtcOffset(offsetMin);
    }

    function restartTimer() {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
        if (interval) {
            clearInterval(interval);
            interval = null;
        }

        // Align to next minute boundary based on real time.
        const now = new Date();
        const msToNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
        timer = setTimeout(() => {
            renderOnce();
            interval = setInterval(renderOnce, 60000);
        }, Math.max(50, msToNextMinute));
    }

    function initFromConfigObject(obj) {
        if (obj && typeof obj === 'object')
            config = {...DEFAULT_CONFIG, ...obj};
        else
            config = {...DEFAULT_CONFIG};
    }

    function main() {
        applySizing();
        window.addEventListener('resize', () => applySizing());

        // Initialize from synchronous cache first for fast first paint
        try {
            if (window.ding && typeof window.ding.getConfigSync === 'function')
                initFromConfigObject(window.ding.getConfigSync());
        } catch (e) {}

        applyNeon();
        renderOnce();
        restartTimer();

        document.addEventListener('visibilitychange', () => {
            if (!document.hidden)
                renderOnce();
        });

        // React to host updates
        try {
            if (window.ding && typeof window.ding.onConfigChanged === 'function') {
                window.ding.onConfigChanged((cfg, _meta) => {
                    initFromConfigObject(cfg);
                    applyNeon();
                    renderOnce();
                    restartTimer();
                });
            }
        } catch (e) {
            // keep running with defaults
        }
    }

    if (document.readyState === 'loading')
        document.addEventListener('DOMContentLoaded', main, {once: true});
    else
        main();
})();
