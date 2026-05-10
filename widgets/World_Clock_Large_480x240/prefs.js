/* eslint-disable no-restricted-globals */
/* eslint-disable no-undef */
/* World Clock prefs logic (instant apply; no scrolling) */

import {
    TIMEZONE_REGIONS,
    getDefaultZone,
    getDisplayLabelForZone,
    getRegionIdForZone,
    getRegionInfo,
    getZoneInfo
} from './timezones.js';

const PRESET_COLORS = {
    pink: '#ff4fd8',
    cyan: '#31e6ff',
    lime: '#7dff3a',
    purple: '#b070ff',
    amber: '#ffb020',
};

const DEFAULT_CONFIG = {
    label: '',
    timeZoneId: getDefaultZone().id,
    timeZoneLabel: getDefaultZone().label,
    hourFormat: '12',
    neonPreset: 'cyan',
    neonColor: '#31e6ff',
    bgColor: '#31e6ff',
    bgAlpha: 0.08,
};

const labelInput = document.getElementById('labelInput');
const regionSelect = document.getElementById('regionSelect');
const timeZoneSelect = document.getElementById('timeZoneSelect');
const fmt12 = document.getElementById('fmt12');
const fmt24 = document.getElementById('fmt24');
const colorPicker = document.getElementById('colorPicker');
const bgColorPicker = document.getElementById('bgColorPicker');
const bgOpacity = document.getElementById('bgOpacity');
const bgOpacityValue = document.getElementById('bgOpacityValue');
const restoreDefaults = document.getElementById('restoreDefaults');
const headerTitle = document.getElementById('headerTitle');
const tabButtons = Array.from(document.querySelectorAll('.prefs-tab'));
const tabPanels = Array.from(document.querySelectorAll('.prefs-panel'));

let config = {...DEFAULT_CONFIG};
let labelTimer = null;

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

function normalizeConfigObject(obj) {
    const next = obj && typeof obj === 'object'
        ? {...DEFAULT_CONFIG, ...obj}
        : {...DEFAULT_CONFIG};

    const zoneId = typeof next.timeZoneId === 'string' &&
        getZoneInfo(next.timeZoneId)
        ? next.timeZoneId
        : DEFAULT_CONFIG.timeZoneId;

    return {
        ...next,
        label: typeof next.label === 'string' ? next.label : DEFAULT_CONFIG.label,
        timeZoneId: zoneId,
        timeZoneLabel: typeof next.timeZoneLabel === 'string' &&
            next.timeZoneLabel.trim()
            ? next.timeZoneLabel.trim()
            : getDisplayLabelForZone(zoneId),
        hourFormat: next.hourFormat === '24' ? '24' : '12',
    };
}

function pushConfig() {
    try {
        if (window.ding && typeof window.ding.saveConfig === 'function')
            window.ding.saveConfig(config);
    } catch (_error) {}
}

function updateConfig(patch) {
    config = normalizeConfigObject({...config, ...patch});
    pushConfig();
}

function populateRegionSelect(selectedRegionId) {
    regionSelect.innerHTML = '';
    for (const region of TIMEZONE_REGIONS) {
        const option = document.createElement('option');
        option.value = region.id;
        option.textContent = region.label;
        option.selected = region.id === selectedRegionId;
        regionSelect.append(option);
    }
}

function populateTimeZoneSelect(regionId, selectedTimeZoneId, selectedTimeZoneLabel) {
    const region = getRegionInfo(regionId) ?? getRegionInfo(getRegionIdForZone(DEFAULT_CONFIG.timeZoneId));
    const zones = region?.zones ?? [getDefaultZone()];

    timeZoneSelect.innerHTML = '';
    for (const zone of zones) {
        const option = document.createElement('option');
        option.value = zone.id;
        option.textContent = zone.label;
        option.selected = zone.id === selectedTimeZoneId &&
            zone.label === selectedTimeZoneLabel;
        timeZoneSelect.append(option);
    }

    if (timeZoneSelect.selectedIndex < 0 && zones.length > 0)
        timeZoneSelect.selectedIndex = 0;
}

function syncUiFromConfig() {
    headerTitle.textContent = 'World Clock';

    const timeZoneId = config.timeZoneId;
    const regionId = getRegionIdForZone(timeZoneId);
    const zoneLabel = config.timeZoneLabel || getDisplayLabelForZone(timeZoneId);

    labelInput.value = typeof config.label === 'string' ? config.label : DEFAULT_CONFIG.label;
    labelInput.placeholder = zoneLabel;

    populateRegionSelect(regionId);
    populateTimeZoneSelect(regionId, timeZoneId, zoneLabel);

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

function switchTab(tabId) {
    for (const button of tabButtons)
        button.classList.toggle('is-active', button.dataset.tab === tabId);

    for (const panel of tabPanels)
        panel.hidden = panel.dataset.panel !== tabId;
}

function wire() {
    for (const button of tabButtons) {
        button.addEventListener('click', () => {
            switchTab(button.dataset.tab || 'settings');
        });
    }

    labelInput.addEventListener('input', () => {
        if (labelTimer)
            clearTimeout(labelTimer);
        labelTimer = setTimeout(() => {
            updateConfig({label: labelInput.value});
        }, 180);
    });

    regionSelect.addEventListener('change', () => {
        const region = getRegionInfo(regionSelect.value) ?? TIMEZONE_REGIONS[0];
        const nextZone = region.zones[0] ?? getDefaultZone();
        populateTimeZoneSelect(region.id, nextZone.id, nextZone.label);
        labelInput.placeholder = nextZone.label;
        updateConfig({
            timeZoneId: nextZone.id,
            timeZoneLabel: nextZone.label,
        });
    });

    timeZoneSelect.addEventListener('change', () => {
        const nextZoneId = timeZoneSelect.value || DEFAULT_CONFIG.timeZoneId;
        const nextZoneLabel =
            timeZoneSelect.selectedOptions[0]?.textContent?.trim() ||
            getDisplayLabelForZone(nextZoneId);
        labelInput.placeholder = nextZoneLabel;
        updateConfig({
            timeZoneId: nextZoneId,
            timeZoneLabel: nextZoneLabel,
        });
    });

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

    colorPicker.addEventListener('input', () => {
        const hex = normalizeHexColor(colorPicker.value);
        if (!hex)
            return;
        updateConfig({neonColor: hex});
    });

    bgColorPicker.addEventListener('input', () => {
        const hex = normalizeHexColor(bgColorPicker.value);
        if (!hex)
            return;
        updateConfig({bgColor: hex});
    });

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
    try {
        if (window.ding && typeof window.ding.getConfig === 'function') {
            const cfg = await window.ding.getConfig();
            config = normalizeConfigObject(cfg);
        }
    } catch (_error) {}

    syncUiFromConfig();
    switchTab('settings');
    wire();

    try {
        if (window.ding && typeof window.ding.onConfigChanged === 'function') {
            window.ding.onConfigChanged((cfg, _meta) => {
                config = normalizeConfigObject(cfg);
                syncUiFromConfig();
            });
        }
    } catch (_error) {}
}

if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', init, {once: true});
else
    init();
