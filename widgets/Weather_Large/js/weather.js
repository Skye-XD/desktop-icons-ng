/* DING: Desktop Icons New Generation for GNOME Shell
 *
 * Gtk4 Port Copyright (C) 2022 - 2026 Sundeep Mediratta (smedius@gmail.com)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, version 3 of the License.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

/* eslint-disable no-undef */
/* eslint-disable no-restricted-globals */
'use strict';
import {DingClient} from '../widgetHelper.js';
import {debounce} from './util.js';
import {fetchForecast} from './openMeteoClient.js';
import {normalizeOpenMeteo} from './normalizeOpenMeteo.js';
import {setIconInto} from './iconLoader.js';
import {formatTemp, formatTempPair} from './units.js';

const LOCAL_LOCATION_KEY = 'wx-last-location';
const LOCAL_SETTINGS_KEY = 'wx-last-settings';

function _api() {
    return window.ding || window.DING || window.WidgetAPI || null;
}

function _defaults() {
    return {
        location: {label: '', lat: null, lon: null},
        units: 'system',
        refreshMinutes: 30,
        animationsEnabled: false,
        textColor: '#f5f6f8',
        bgColor: '#ffffff',
        bgAlpha: 0,
        cache: null,
    };
}

function _merge(base, patch) {
    if (!patch || typeof patch !== 'object')
        return base;
    const out = {...base, ...patch};
    if (patch.location && typeof patch.location === 'object')
        out.location = {...base.location, ...patch.location};
    return out;
}

class WeatherApp {
    constructor() {
        this._ding = _api();
        this._client = new DingClient({mode: 'widget'});
        this._host = {reducedMotion: false, locale: null};
        this._cfg = _defaults();
        this._timer = null;
        this._busy = false;
        this._acceptConfigRefresh = false;
        this._destroyed = false;
        this._teardowns = [];

        this._els = {
            html: document.documentElement,
            root: document.getElementById('root'),
            location: document.getElementById('location'),
            alertDot: document.getElementById('alertDot'),
            nowIcon: document.getElementById('nowIcon'),
            temp: document.getElementById('temp'),
            condition: document.getElementById('condition'),
            precip: document.getElementById('precip'),
            status: document.getElementById('statusLine'),
            fc: [
                {dow: document.getElementById('fcDow1'), icon: document.getElementById('fcIcon1'), temp: document.getElementById('fcTemp1')},
                {dow: document.getElementById('fcDow2'), icon: document.getElementById('fcIcon2'), temp: document.getElementById('fcTemp2')},
                {dow: document.getElementById('fcDow3'), icon: document.getElementById('fcIcon3'), temp: document.getElementById('fcTemp3')},
            ],
        };
    }

    async init() {
        if (this._destroyed)
            return;

        try {
            this._applySizeClass();
            this._syncDraggableSurface();
            this._syncPinnedMoveSurface();
            const onResize = debounce(() => {
                if (!this._destroyed)
                    this._applySizeClass();
                this._syncDraggableSurface();
            }, 60);
            window.addEventListener('resize', onResize);
            this._teardowns.push(() => window.removeEventListener('resize', onResize));

            const onStorage = ev => {
                if (this._destroyed)
                    return;
                if (ev.key === LOCAL_SETTINGS_KEY || ev.key === LOCAL_LOCATION_KEY) {
                    this._maybeAdoptLocalState(true);
                    this._applyMotionClass();
                    this._applyAppearance();
                    this._renderFromCache();
                    this._restartTimer();
                    this.refresh('storage');
                }
            };
            window.addEventListener('storage', onStorage);
            this._teardowns.push(() => window.removeEventListener('storage', onStorage));

            const unsubscribeHost = this._client.onHostState(st => {
                if (this._destroyed)
                    return;
                this._host = {...this._host, ...st || {}};
                this._applyMotionClass();
                this._applyAppearance();
                this._renderFromCache();
            });
            if (typeof unsubscribeHost === 'function')
                this._teardowns.push(unsubscribeHost);

            const unsubscribeConfig = this._client.onConfigChanged((cfg, meta) => {
                if (this._destroyed)
                    return;
                const prevCfg = this._cfg;
                this._cfg = _merge(this._cfg, cfg);
                this._maybeAdoptLocalState();
                this._applyMotionClass();
                this._applyAppearance();
                this._renderFromCache();
                this._persistLocalState();
                this._restartTimer();
                if (this._acceptConfigRefresh && this._shouldRefreshForConfigChange(prevCfg, this._cfg, meta))
                    this.refresh('config');
            });
            if (typeof unsubscribeConfig === 'function')
                this._teardowns.push(unsubscribeConfig);

            const initial = this._ding?.getConfigSync?.() ?? null;
            if (initial)
                this._cfg = _merge(this._cfg, initial);

            this._maybeAdoptLocalState();
            this._persistLocalState();

            this._applyMotionClass();
            this._applyAppearance();
            this._renderFromCache();

            if (!this._cfg.location?.lat || !this._cfg.location?.lon) {
                this._setStatus('Set a location in preferences.');
                return;
            }

            this._restartTimer();

            const onVisibilityChange = () => {
                if (this._destroyed)
                    return;
                this._renderFromCache();
            };
            document.addEventListener('visibilitychange', onVisibilityChange);
            this._teardowns.push(() => document.removeEventListener('visibilitychange', onVisibilityChange));

            if (this._hasFreshCache()) {
                this._setStatus(`Updated ${new Date(Number(this._cfg.cache.fetchedAt) * 1000).toLocaleTimeString()}`);
                return;
            }

            await this.refresh('startup');
        } finally {
            this._acceptConfigRefresh = true;
        }
    }

    destroy() {
        if (this._destroyed)
            return;

        this._destroyed = true;

        if (this._timer) {
            clearInterval(this._timer);
            this._timer = null;
        }

        for (const teardown of this._teardowns.splice(0)) {
            try {
                teardown();
            } catch (e) {}
        }

        this._client?.destroy?.();

        if (window.__weatherApp === this)
            delete window.__weatherApp;
    }

    _applySizeClass() {
        const w = document.body.clientWidth || 0;
        const h = document.body.clientHeight || 0;

        const dSmall = Math.abs(w - 260) + Math.abs(h - 160);
        const dMed = Math.abs(w - 320) + Math.abs(h - 200);
        const dLarge = Math.abs(w - 420) + Math.abs(h - 260);

        let cls = 'wx-medium';
        if (dSmall <= dMed && dSmall <= dLarge)
            cls = 'wx-small';
        else if (dLarge <= dSmall && dLarge <= dMed)
            cls = 'wx-large';

        const html = this._els.html;
        html.classList.remove('wx-small', 'wx-medium', 'wx-large');
        html.classList.add(cls);
    }

    _syncDraggableSurface() {
        if (this._destroyed || !this._els.root)
            return;

        this._client?.setDraggable?.(this._els.root);
    }

    _syncPinnedMoveSurface() {
        if (this._destroyed || !this._els.root)
            return;

        const teardown = this._client?.attachPinnedMoveHandle?.(this._els.root);
        if (typeof teardown === 'function')
            this._teardowns.push(teardown);
    }

    _applyMotionClass() {
        const systemReduced = !!this._host.reducedMotion;
        const localEnabled = !!this._cfg.animationsEnabled;
        const enabled = !systemReduced && localEnabled;
        this._els.html.classList.toggle('wx-no-anim', !enabled);
    }

    _applyAppearance() {
        const defaultText = '#f5f6f8';
        const defaultStrong = '#ffffff';
        const defaultMuted = '#e8eaee';
        const text = this._normalizeHex(this._cfg.textColor) || defaultText;
        const bg = this._normalizeHex(this._cfg.bgColor) || '#ffffff';
        const rawAlpha = Number(this._cfg.bgAlpha);
        const alpha = Number.isFinite(rawAlpha) ? Math.max(0, Math.min(0.35, rawAlpha)) : 0;

        this._els.html.style.setProperty('--wx-text', text);
        const strong = text === defaultText ? defaultStrong : text;
        const muted = text === defaultText ? defaultMuted : this._withAlpha(text, 0.85);
        this._els.html.style.setProperty('--wx-text-strong', strong);
        this._els.html.style.setProperty('--wx-text-muted', muted);
        this._els.html.style.setProperty('--wx-bg-color', bg);
        this._els.html.style.setProperty('--wx-bg-alpha', String(alpha));

        if (!CSS.supports('background: color-mix(in srgb, #000 50%, transparent)')) {
            const rgb = this._hexToRgb(bg);
            const target = this._els.root || document.body;
            if (rgb && target)
                target.style.background = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
        } else {
            const target = this._els.root || document.body;
            if (target)
                target.style.background = '';
        }
    }

    _setStatus(s) {
        this._els.status.textContent = s || '';
    }

    _renderFromCache() {
        const c = this._cfg.cache;
        const cfgLabel = this._cfg.location?.label || 'Set location';

        if (c) {
            // If cache is for a different location, prefer showing the chosen label until new data arrives
            if (c.location?.label && c.location.label !== cfgLabel) {
                this._els.location.textContent = cfgLabel;
                return;
            }
            this._render(c, {fromCache: true});
            return;
        }
        // No cached weather yet—reflect the chosen location label and show pending state
        this._els.location.textContent = cfgLabel ? `${cfgLabel} · updating…` : 'Updating…';
    }

    _restartTimer() {
        if (this._destroyed)
            return;
        if (this._timer) {
            clearInterval(this._timer);
            this._timer = null;
        }
        const mins = Number(this._cfg.refreshMinutes) || 30;
        const ms = Math.max(15, mins) * 60 * 1000;
        this._timer = setInterval(() => this.refresh('timer'), ms);
    }

    _shouldRefreshForConfigChange(prevCfg, nextCfg, _meta) {
        const prevLoc = prevCfg?.location ?? null;
        const nextLoc = nextCfg?.location ?? null;

        return prevLoc?.lat !== nextLoc?.lat ||
            prevLoc?.lon !== nextLoc?.lon;
    }

    _cacheMaxAgeMs() {
        const mins = Number(this._cfg.refreshMinutes) || 30;
        return Math.max(15, mins) * 60 * 1000;
    }

    _hasFreshCache() {
        const fetchedAt = Number(this._cfg.cache?.fetchedAt);
        if (!Number.isFinite(fetchedAt) || fetchedAt <= 0)
            return false;
        return (Date.now() - (fetchedAt * 1000)) < this._cacheMaxAgeMs();
    }

    async refresh(_reason) {
        if (this._destroyed || this._busy)
            return;
        if (!this._cfg.location?.lat || !this._cfg.location?.lon)
            return;

        this._busy = true;
        this._setStatus('Updating…');

        try {
            const raw = await fetchForecast({lat: this._cfg.location.lat, lon: this._cfg.location.lon});
            if (this._destroyed)
                return;
            const norm = normalizeOpenMeteo({raw, locationLabel: this._cfg.location.label, locale: this._host.locale});
            this._cfg.cache = norm;
            this._persistLocalState();
            this._client.patchConfig({cache: norm}).catch(() => {});
            await this._render(norm, {fromCache: false});
            if (this._destroyed)
                return;
            this._setStatus(`Updated ${new Date().toLocaleTimeString()}`);
        } catch (e) {
            if (this._destroyed)
                return;
            console.error('[weather] refresh failed', e);
            this._setStatus(this._cfg.cache ? 'Offline — showing cached data' : 'Unable to load weather');
        } finally {
            this._busy = false;
        }
    }

    _persistLocalState() {
        try {
            localStorage.setItem(LOCAL_LOCATION_KEY, JSON.stringify(this._cfg.location || {}));
            const payload = {
                location: this._cfg.location,
                units: this._cfg.units,
                refreshMinutes: this._cfg.refreshMinutes,
                animationsEnabled: this._cfg.animationsEnabled,
                textColor: this._cfg.textColor,
                bgColor: this._cfg.bgColor,
                bgAlpha: this._cfg.bgAlpha,
            };
            localStorage.setItem(LOCAL_SETTINGS_KEY, JSON.stringify(payload));
        } catch (e) {}
    }

    _loadLocalLocation() {
        try {
            const raw = localStorage.getItem(LOCAL_LOCATION_KEY);
            if (!raw)
                return null;
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object' && parsed.lat && parsed.lon)
                return parsed;
        } catch (e) {}
        return null;
    }

    _loadLocalSettings() {
        try {
            const raw = localStorage.getItem(LOCAL_SETTINGS_KEY);
            if (!raw)
                return null;
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object')
                return parsed;
        } catch (e) {}
        return null;
    }

    _maybeAdoptLocalState(force = false) {
        const cached = this._loadLocalSettings();
        if (cached) {
            if (force || this._cfg.units === undefined || this._cfg.units === null || this._cfg.units === '')
                this._cfg.units = cached.units || this._cfg.units;
            if (force || this._cfg.refreshMinutes === undefined || this._cfg.refreshMinutes === null)
                this._cfg.refreshMinutes = cached.refreshMinutes || this._cfg.refreshMinutes;
            if (cached.animationsEnabled !== undefined) {
                // Only adopt local value as a fallback. Do NOT override host-provided config.
                if (force || this._cfg.animationsEnabled === undefined || this._cfg.animationsEnabled === null)
                    this._cfg.animationsEnabled = cached.animationsEnabled;
            }
            if (cached.textColor && (force || !this._cfg.textColor))
                this._cfg.textColor = cached.textColor;
            if (cached.bgColor && (force || !this._cfg.bgColor))
                this._cfg.bgColor = cached.bgColor;
            if (cached.bgAlpha !== undefined && (force || this._cfg.bgAlpha === undefined || this._cfg.bgAlpha === null))
                this._cfg.bgAlpha = cached.bgAlpha;
        }

        if (force || !this._cfg.location?.lat || !this._cfg.location?.lon) {
            const loc = this._loadLocalLocation();
            if (loc) {
                this._cfg.location = loc;
                this._client.patchConfig({location: loc}).catch(() => {});
            }
        }
    }

    async _render(n, {_fromCache}) {
        this._els.location.textContent = n.location?.label || 'Set location';
        this._els.alertDot.style.visibility = n.alerts && n.alerts.length ? 'visible' : 'hidden';

        let units = this._cfg.units || 'system';
        if (units === 'system')
            units = 'metric';

        const t = formatTemp(n.now?.tempC, units);
        this._els.temp.textContent = t === null ? '--' : String(t);
        this._els.condition.textContent = n.now?.condition?.label || '--';

        const pp = n.now?.precipProbPct;
        this._els.precip.textContent = pp === null || pp === undefined ? '--%' : `${Math.round(pp)}%`;

        const systemReduced = !!this._host.reducedMotion;
        const localEnabled = !!this._cfg.animationsEnabled;
        const animEnabled = !systemReduced && localEnabled;

        await setIconInto(this._els.nowIcon, n.now?.condition?.icon || 'not-available', {animationsEnabled: animEnabled});

        for (let i = 0; i < 3; i++) {
            const day = n.days?.[i + 1] || null;
            const col = this._els.fc[i];
            if (!day) {
                col.dow.textContent = '--';
                col.temp.textContent = '--/--';
                col.icon.innerHTML = '';
                continue;
            }
            col.dow.textContent = day.dow || '--';
            col.temp.textContent = day.hiC !== null && day.loC !== null ? formatTempPair(day.hiC, day.loC, units) || '--/--' : '--/--';
            // eslint-disable-next-line no-await-in-loop
            await setIconInto(col.icon, day.condition?.icon || 'not-available', {animationsEnabled: false});
        }
    }

    _normalizeHex(v) {
        if (typeof v !== 'string')
            return null;
        const s = v.trim();
        return /^#([0-9a-f]{6})$/i.test(s) ? s.toLowerCase() : null;
    }

    _hexToRgb(hex) {
        const h = this._normalizeHex(hex);
        if (!h)
            return null;
        const n = h.slice(1);
        return {
            r: parseInt(n.slice(0, 2), 16),
            g: parseInt(n.slice(2, 4), 16),
            b: parseInt(n.slice(4, 6), 16),
        };
    }

    _withAlpha(hex, a) {
        const rgb = this._hexToRgb(hex);
        if (!rgb)
            return hex;
        return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a})`;
    }
}

(async () => {
    try {
        if (window.__weatherApp && typeof window.__weatherApp.destroy === 'function')
            window.__weatherApp.destroy();
        const app = new WeatherApp();
        window.__weatherApp = app;
        await app.init();
    } catch (e) {
        console.error('[weather] init failed', e);
    }
})();
