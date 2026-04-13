/* eslint-disable no-restricted-globals */
/* eslint-disable no-undef */
/* World Clock widget face logic (timezone aware; no seconds; minute-aligned) */

import {DingClient} from './widgetHelper.js';
import {getDefaultZone, getDisplayLabelForZone, getZoneInfo} from './timezones.js';

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
const client = new DingClient({mode: 'widget'});

let config = {...DEFAULT_CONFIG};
let timer = null;
let interval = null;
let resizeHandler = null;
let visibilityHandler = null;
let pinnedMoveCleanup = null;
let configCleanup = null;
let destroyed = false;

function clamp(n, lo, hi) {
    return Math.max(lo, Math.min(hi, n));
}

function pad2(n) {
    return n < 10 ? `0${n}` : String(n);
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

function computeFontsFromHeight(H) {
    const pad = clamp(Math.round(H * 0.04), 5, 12);

    const fsCity = clamp(Math.round(H * 0.15), 14, 16);
    const fsUtc  = clamp(Math.round(H * 0.14), 12, 14);
    const fsTime = clamp(Math.round(H * 0.55), 56, 140);
    const fsAmpm = clamp(Math.round(fsTime * 0.24), 10, 26);

    return {pad, fsCity, fsUtc, fsTime, fsAmpm};
}

function applySizing() {
    const H = window.innerHeight || 120;
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

    if (!CSS.supports('background: color-mix(in srgb, #000 50%, transparent)')) {
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

function getTimeZoneOffsetMinutes(date, timeZoneId) {
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: timeZoneId,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
    });

    const parts = formatter.formatToParts(date);
    const values = Object.create(null);
    for (const part of parts) {
        if (part.type !== 'literal')
            values[part.type] = part.value;
    }

    const targetUtcMillis = Date.UTC(
        Number(values.year),
        Number(values.month) - 1,
        Number(values.day),
        Number(values.hour),
        Number(values.minute),
        Number(values.second)
    );

    return Math.round((targetUtcMillis - date.getTime()) / 60000);
}

function formatUtcOffset(mins) {
    const sign = mins < 0 ? '-' : '+';
    const abs = Math.abs(mins);
    const hh = Math.floor(abs / 60);
    const mm = abs % 60;
    return `UTC${sign}${pad2(hh)}:${pad2(mm)}`;
}

function formatTimeParts(date, timeZoneId, hourFormat) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: timeZoneId,
        hour: '2-digit',
        minute: '2-digit',
        hour12: hourFormat !== '24',
    }).formatToParts(date);

    const values = Object.create(null);
    for (const part of parts) {
        if (part.type !== 'literal')
            values[part.type] = part.value;
    }

    return {
        hour: values.hour ?? '00',
        minute: values.minute ?? '00',
        dayPeriod: values.dayPeriod ?? '',
    };
}

function getEffectiveLabel() {
    const rawLabel = typeof config.label === 'string' ? config.label.trim() : '';
    return rawLabel || config.timeZoneLabel || getDisplayLabelForZone(config.timeZoneId);
}

function renderOnce() {
    const now = new Date();
    const zoneId = config.timeZoneId;
    const timeParts = formatTimeParts(now, zoneId, config.hourFormat);
    const offsetMin = getTimeZoneOffsetMinutes(now, zoneId);
    const label = getEffectiveLabel();

    timeTextEl.textContent = `${timeParts.hour}:${timeParts.minute}`;
    ampmTextEl.textContent = config.hourFormat === '12' ? timeParts.dayPeriod : '';
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

    const now = new Date();
    const msToNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
    timer = setTimeout(() => {
        renderOnce();
        interval = setInterval(renderOnce, 60000);
    }, Math.max(50, msToNextMinute));
}

function syncDragSurfaces() {
    if (destroyed || !rootEl)
        return;

    client.setDraggable(rootEl);

    if (!pinnedMoveCleanup) {
        const teardown = client.attachPinnedMoveHandle(rootEl);
        if (typeof teardown === 'function')
            pinnedMoveCleanup = teardown;
    }
}

function stopTimers() {
    if (timer) {
        clearTimeout(timer);
        timer = null;
    }
    if (interval) {
        clearInterval(interval);
        interval = null;
    }
}

function cleanup() {
    if (destroyed)
        return;

    destroyed = true;
    stopTimers();

    if (resizeHandler)
        window.removeEventListener('resize', resizeHandler);
    if (visibilityHandler)
        document.removeEventListener('visibilitychange', visibilityHandler);
    if (configCleanup)
        configCleanup();
    configCleanup = null;

    pinnedMoveCleanup?.();
    pinnedMoveCleanup = null;
    client.destroy();
}

async function main() {
    applySizing();
    resizeHandler = () => {
        if (destroyed)
            return;
        applySizing();
        syncDragSurfaces();
    };
    window.addEventListener('resize', resizeHandler);
    syncDragSurfaces();

    try {
        const cfg = await client.getConfig();
        if (cfg)
            config = normalizeConfigObject(cfg);
    } catch (_error) {}

    applyNeon();
    renderOnce();
    restartTimer();

    visibilityHandler = () => {
        if (!document.hidden)
            renderOnce();
    };
    document.addEventListener('visibilitychange', visibilityHandler);

    try {
        const unsubscribe = client.onConfigChanged((cfg, _meta) => {
            if (destroyed)
                return;
            if (cfg) {
                config = normalizeConfigObject(cfg);
                applyNeon();
                renderOnce();
                restartTimer();
                syncDragSurfaces();
            }
        });
        if (typeof unsubscribe === 'function')
            configCleanup = unsubscribe;
    } catch (_error) {
        // Keep running with defaults.
    }

    window.addEventListener('beforeunload', cleanup, {once: true});
}

if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', main, {once: true});
else
    main();
