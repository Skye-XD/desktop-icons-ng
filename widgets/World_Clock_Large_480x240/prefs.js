/* eslint-disable no-restricted-globals */
/* eslint-disable no-undef */
/* World Clock prefs logic (instant apply; no scrolling) */

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

    const labelInput = document.getElementById('labelInput');
    const offsetInput = document.getElementById('offsetInput');
    const offsetError = document.getElementById('offsetError');
    const fmt12 = document.getElementById('fmt12');
    const fmt24 = document.getElementById('fmt24');
    const colorPicker = document.getElementById('colorPicker');
    const bgColorPicker = document.getElementById('bgColorPicker');
    const bgOpacity = document.getElementById('bgOpacity');
    const bgOpacityValue = document.getElementById('bgOpacityValue');
    const restoreDefaults = document.getElementById('restoreDefaults');
    const headerTitle = document.getElementById('headerTitle');

    let config = {...DEFAULT_CONFIG};
    let labelTimer = null;
    let offsetTimer = null;

    function pad2(n) {
        return n < 10 ? `0${n}` : String(n);
    }

    function parseOffsetToMinutes(raw) {
        if (typeof raw !== 'string')
            return null;
        let s = raw.trim();
        if (!s)
            return null;

        // Accept forms:
        // -5, -05, -0500, -05:00, +9, +09:30
        let sign = 1;
        if (s.startsWith('+')) {
            sign = 1;
            s = s.slice(1);
        } else if (s.startsWith('-')) {
            sign = -1;
            s = s.slice(1);
        }

        s = s.trim();

        // If contains ':', split HH:MM
        if (s.includes(':')) {
            const parts = s.split(':');
            if (parts.length !== 2)
                return null;
            const hh = Number(parts[0]);
            const mm = Number(parts[1]);
            if (!Number.isInteger(hh) || !Number.isInteger(mm))
                return null;
            if (hh < 0 || hh > 14)
                return null;
            if (mm < 0 || mm >= 60)
                return null;
            const total = hh * 60 + mm;
            if (total > 14 * 60)
                return null;
            return sign * total;
        }

        // Digits only forms
        if (!/^[0-9]+$/.test(s))
            return null;

        if (s.length <= 2) {
            const hh = Number(s);
            if (!Number.isInteger(hh) || hh > 14)
                return null;
            return sign * (hh * 60);
        }

        if (s.length === 3 || s.length === 4) {
            // HMM or HHMM
            const hh = Number(s.slice(0, s.length - 2));
            const mm = Number(s.slice(s.length - 2));
            if (!Number.isInteger(hh) || !Number.isInteger(mm))
                return null;
            if (hh < 0 || hh > 14)
                return null;
            if (mm < 0 || mm >= 60)
                return null;
            const total = hh * 60 + mm;
            if (total > 14 * 60)
                return null;
            return sign * total;
        }

        return null;
    }

    function formatOffset(mins) {
        const sign = mins < 0 ? '-' : '+';
        const abs = Math.abs(mins);
        const hh = Math.floor(abs / 60);
        const mm = abs % 60;
        return `${sign}${pad2(hh)}:${pad2(mm)}`;
    }

    function setPressed(btn, pressed) {
        btn.setAttribute('aria-pressed', pressed ? 'true' : 'false');
    }

    function normalizeHexColor(value) {
        if (typeof value !== 'string')
            return null;
        const s = value.trim();
        return /^#([0-9a-f]{6})$/i.test(s) ? s.toLowerCase() : null;
    }

    function pickEffectiveColor(cfg) {
        const direct = normalizeHexColor(cfg.neonColor);
        if (direct)
            return direct;
        const preset = (cfg.neonPreset && String(cfg.neonPreset).toLowerCase()) || 'cyan';
        return PRESET_COLORS[preset] || PRESET_COLORS.cyan;
    }

    function pickBackgroundColor(cfg) {
        const direct = normalizeHexColor(cfg.bgColor);
        if (direct)
            return direct;
        return pickEffectiveColor(cfg);
    }

    function clamp(n, lo, hi) {
        return Math.max(lo, Math.min(hi, n));
    }

    function formatOpacity(alpha) {
        const pct = Math.round(alpha * 100);
        return `${pct}%`;
    }

    function syncUiFromConfig() {
        headerTitle.textContent = 'World Clock'; // localized later via registry UI

        labelInput.value = typeof config.label === 'string' ? config.label : DEFAULT_CONFIG.label;
        offsetInput.value = formatOffset(Number.isFinite(config.utcOffsetMinutes) ? config.utcOffsetMinutes : DEFAULT_CONFIG.utcOffsetMinutes);

        const fmt = config.hourFormat === '24' ? '24' : '12';
        setPressed(fmt12, fmt === '12');
        setPressed(fmt24, fmt === '24');

        colorPicker.value = pickEffectiveColor(config);
        bgColorPicker.value = pickBackgroundColor(config);

        const rawAlpha = Number(config.bgAlpha);
        const alpha = Number.isFinite(rawAlpha) ? clamp(rawAlpha, 0, 0.35) : DEFAULT_CONFIG.bgAlpha;
        bgOpacity.value = String(alpha);
        bgOpacityValue.textContent = formatOpacity(alpha);
    }

    function pushConfig() {
        try {
            if (window.ding && typeof window.ding.saveConfig === 'function')
                window.ding.saveConfig(config);
        } catch (e) {}
    }

    function updateConfig(patch) {
        config = {...config, ...patch};
        pushConfig();
    }

    function showOffsetError(show) {
        offsetError.classList.toggle('hidden', !show);
    }

    function wire() {
    // Label: debounce so typing feels smooth
        labelInput.addEventListener('input', () => {
            if (labelTimer)
                clearTimeout(labelTimer);
            labelTimer = setTimeout(() => {
                updateConfig({label: labelInput.value});
            }, 180);
        });

        // Offset: validate and only apply when parseable
        offsetInput.addEventListener('input', () => {
            if (offsetTimer)
                clearTimeout(offsetTimer);
            offsetTimer = setTimeout(() => {
                const mins = parseOffsetToMinutes(offsetInput.value);
                if (mins === null) {
                    showOffsetError(true);
                    return;
                }
                showOffsetError(false);
                updateConfig({utcOffsetMinutes: mins});
            }, 220);
        });

        offsetInput.addEventListener('blur', () => {
            const mins = parseOffsetToMinutes(offsetInput.value);
            if (mins === null) {
                showOffsetError(true);
                return;
            }
            showOffsetError(false);
            offsetInput.value = formatOffset(mins);
            updateConfig({utcOffsetMinutes: mins});
        });

        // Segmented buttons
        fmt12.addEventListener('click', () => {
            setPressed(fmt12, true);
            setPressed(fmt24, false);
            updateConfig({hourFormat: '12'});
        });

        fmt24.addEventListener('click', () => {
            setPressed(fmt12, false);
            setPressed(fmt24, true);
            updateConfig({hourFormat: '24'});
        });

        // Color picker
        colorPicker.addEventListener('input', () => {
            const hex = normalizeHexColor(colorPicker.value);
            if (!hex)
                return;
            updateConfig({neonColor: hex});
        });

        // Background color picker
        bgColorPicker.addEventListener('input', () => {
            const hex = normalizeHexColor(bgColorPicker.value);
            if (!hex)
                return;
            updateConfig({bgColor: hex});
        });

        // Background opacity
        bgOpacity.addEventListener('input', () => {
            const raw = Number(bgOpacity.value);
            const alpha = Number.isFinite(raw) ? clamp(raw, 0, 0.35) : DEFAULT_CONFIG.bgAlpha;
            bgOpacityValue.textContent = formatOpacity(alpha);
            updateConfig({bgAlpha: alpha});
        });

        restoreDefaults.addEventListener('click', () => {
            updateConfig({
                neonPreset: DEFAULT_CONFIG.neonPreset,
                neonColor: DEFAULT_CONFIG.neonColor,
                bgColor: DEFAULT_CONFIG.bgColor,
                bgAlpha: DEFAULT_CONFIG.bgAlpha,
            });
            syncUiFromConfig();
        });
    }

    async function init() {
    // Try to populate from live config, then fall back.
        try {
            if (window.ding && typeof window.ding.getConfig === 'function') {
                const cfg = await window.ding.getConfig();
                if (cfg && typeof cfg === 'object')
                    config = {...DEFAULT_CONFIG, ...cfg};
            }
        } catch (e) {}

        syncUiFromConfig();
        wire();

        // React to external config changes (e.g., another prefs or host update)
        try {
            if (window.ding && typeof window.ding.onConfigChanged === 'function') {
                window.ding.onConfigChanged((cfg, _meta) => {
                    if (cfg && typeof cfg === 'object')
                        config = {...DEFAULT_CONFIG, ...cfg};
                    else
                        config = {...DEFAULT_CONFIG};
                    syncUiFromConfig();
                });
            }
        } catch (e) {}
    }

    if (document.readyState === 'loading')
        document.addEventListener('DOMContentLoaded', init, {once: true});
    else
        init();
})();
