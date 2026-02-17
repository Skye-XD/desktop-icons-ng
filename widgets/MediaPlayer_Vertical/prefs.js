/* eslint-disable no-restricted-globals */
/* eslint-disable no-undef */
// Media Player prefs: align styling/behavior with Media Player prefs

(() => {
    'use strict';

    const DEFAULT_CONFIG = {
        textColor: '#ffffff',
        progressColor: '#ffffff',
        bgColor: '#000000',
        bgAlpha: 0.3,
    };

    const textColorPicker = document.getElementById('textColorPicker');
    const progressColorPicker = document.getElementById('progressColorPicker');
    const bgColorPicker = document.getElementById('bgColorPicker');
    const bgOpacity = document.getElementById('bgOpacity');
    const bgOpacityValue = document.getElementById('bgOpacityValue');
    const restoreDefaults = document.getElementById('restoreDefaults');
    const headerTitle = document.getElementById('headerTitle');

    let config = {...DEFAULT_CONFIG};

    function syncUiFromConfig() {
        headerTitle.textContent = 'Media Player';

        const textColor = typeof config.textColor === 'string' ? config.textColor.trim() : DEFAULT_CONFIG.textColor;
        textColorPicker.value = normalizeHexColor(textColor) || DEFAULT_CONFIG.textColor;

        const progressColor = typeof config.progressColor === 'string' ? config.progressColor.trim() : DEFAULT_CONFIG.progressColor;
        progressColorPicker.value = normalizeHexColor(progressColor) || DEFAULT_CONFIG.progressColor;

        const bg = typeof config.bgColor === 'string' ? config.bgColor.trim() : DEFAULT_CONFIG.bgColor;
        bgColorPicker.value = normalizeHexColor(bg) || DEFAULT_CONFIG.bgColor;

        const rawAlpha = Number(config.bgAlpha);
        const alpha = Number.isFinite(rawAlpha) ? clamp(rawAlpha, 0, 1) : DEFAULT_CONFIG.bgAlpha;
        bgOpacity.value = String(alpha);
        bgOpacityValue.textContent = formatOpacity(alpha);
    }

    function pushConfig() {
        try {
            if (window.ding && typeof window.ding.saveConfig === 'function')
                window.ding.saveConfig(config);
        } catch (e) {
            // ignore
        }
    }

    function updateConfig(patch) {
        config = {...config, ...patch};
        pushConfig();
    }

    function wire() {
        textColorPicker.addEventListener('input', () => {
            const hex = normalizeHexColor(textColorPicker.value);
            if (!hex)
                return;
            updateConfig({textColor: hex});
        });

        progressColorPicker.addEventListener('input', () => {
            const hex = normalizeHexColor(progressColorPicker.value);
            if (!hex)
                return;
            updateConfig({progressColor: hex});
        });

        bgColorPicker.addEventListener('input', () => {
            const hex = normalizeHexColor(bgColorPicker.value);
            if (!hex)
                return;
            updateConfig({bgColor: hex});
        });

        bgOpacity.addEventListener('input', () => {
            const raw = Number(bgOpacity.value);
            const alpha = Number.isFinite(raw) ? clamp(raw, 0, 1) : DEFAULT_CONFIG.bgAlpha;
            bgOpacityValue.textContent = formatOpacity(alpha);
            updateConfig({bgAlpha: alpha});
        });

        restoreDefaults.addEventListener('click', () => {
            updateConfig({
                textColor: DEFAULT_CONFIG.textColor,
                progressColor: DEFAULT_CONFIG.progressColor,
                bgColor: DEFAULT_CONFIG.bgColor,
                bgAlpha: DEFAULT_CONFIG.bgAlpha,
            });
            syncUiFromConfig();
        });
    }

    function normalizeHexColor(value) {
        if (typeof value !== 'string')
            return null;
        const s = value.trim();
        return /^#([0-9a-f]{6})$/i.test(s) ? s.toLowerCase() : null;
    }

    function clamp(n, lo, hi) {
        return Math.max(lo, Math.min(hi, n));
    }

    function formatOpacity(alpha) {
        const pct = Math.round(alpha * 100);
        return `${pct}%`;
    }

    async function init() {
    // Load persisted config if available
        try {
            if (window.ding && typeof window.ding.getConfig === 'function') {
                const cfg = await window.ding.getConfig();
                if (cfg && typeof cfg === 'object')
                    config = {...DEFAULT_CONFIG, ...cfg};
            }
        } catch (e) {}

        syncUiFromConfig();
        wire();

        // Live updates from host
        try {
            if (window.ding && typeof window.ding.onConfigChanged === 'function') {
                window.ding.onConfigChanged(cfg => {
                    if (cfg && typeof cfg === 'object')
                        config = {...DEFAULT_CONFIG, ...cfg};
                    else
                        config = {...DEFAULT_CONFIG};
                    syncUiFromConfig();
                });
            }
        } catch (e) {}
    }

    init();
})();
