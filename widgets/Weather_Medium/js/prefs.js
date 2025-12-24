'use strict';
import { debounce } from './util.js';
import { geocodeSearch } from './openMeteoClient.js';

/*
 * Weather widget prefs
 * Uses ONLY the injected DING Widget API (window.ding):
 *   - ding.getConfig() / ding.getConfigSync()
 *   - ding.saveConfig(fullConfig)
 *   - ding.onConfigChanged(cb)
 *   - ding.onHostStateChanged(cb)
 */

function _defaults() {
    return {
        location: { label: '', lat: null, lon: null },
        units: 'system',
        refreshMinutes: 30,
        animationsEnabled: true,
    };
}

function _isObject(v) {
    return v && typeof v === 'object' && !Array.isArray(v);
}

function _normalize(cfg) {
    const d = _defaults();
    const out = _isObject(cfg) ? { ...d, ...cfg } : { ...d };

    // Keep stable nested shape
    const loc = _isObject(out.location) ? { ...d.location, ...out.location } : { ...d.location };
    out.location = loc;

    // Types / bounds
    if (out.units == null)
        out.units = d.units;

    const rm = Number(out.refreshMinutes);
    out.refreshMinutes = Number.isFinite(rm) ? Math.max(1, Math.floor(rm)) : d.refreshMinutes;

    out.animationsEnabled = !!out.animationsEnabled;

    // Allow lat/lon to be 0; only null/undefined means "not set"
    if (loc.lat === undefined)
        loc.lat = null;
    if (loc.lon === undefined)
        loc.lon = null;
    if (loc.label === undefined)
        loc.label = '';

    return out;
}

function _label(r) {
    const parts = [];
    if (r?.name)
        parts.push(r.name);
    if (r?.admin1)
        parts.push(r.admin1);
    if (r?.country)
        parts.push(r.country);
    return parts.filter(Boolean).join(', ');
}

class PrefsApp {
    constructor() {
        // Per your constraint: exactly one API, no fallbacks.
        this._api = window.ding;

        this._cfg = _defaults();
        this._host = { reducedMotion: false };

        this._initializing = true;   // blocks handlers during programmatic UI writes

        this._els = {
            locInput: document.getElementById('locInput'),
            locResults: document.getElementById('locResults'),
            refresh: document.getElementById('refreshSelect'),
            anim: document.getElementById('animToggle'),
            animHint: document.getElementById('animHint'),
            radios: Array.from(document.querySelectorAll('input[name="units"]')),
        };
    }

    async init() {
        // Host state (reduced motion, etc.)
        this._api.onHostStateChanged(st => {
            this._host = { ...this._host, ...(st || {}) };
            this._applyHostStateToUi();
        });

        // Downward config updates (including initial snapshot)
        this._api.onConfigChanged((cfg /*, meta */) => {
            this._cfg = _normalize(cfg);
            this._applyCfgToUi();
        });

        // Paint defaults quickly; DO NOT push
        this._cfg = _normalize(null);
        this._applyCfgToUi();
        this._applyHostStateToUi();

        // Fetch authoritative config. Some hosts reply via the postMessage path
        // and will also trigger onConfigChanged; we still apply the returned cfg.
        const cfg = await this._api.getConfig();
        if (cfg && typeof cfg === 'object') {
            this._cfg = _normalize(cfg);
            this._applyCfgToUi();
        }

        // Now wire user handlers (so default/apply cannot push)
        this._wire();

        this._initializing = false;
    }

    _wire() {
        // Units
        for (const r of this._els.radios) {
            r.addEventListener('change', () => {
                if (this._initializing || !r.checked)
                    return;

                this._cfg.units = r.value;
                this._saveFullConfig();
            });
        }

        // Refresh minutes
        this._els.refresh.addEventListener('change', () => {
            if (this._initializing)
                return;

            const v = Number(this._els.refresh.value);
            this._cfg.refreshMinutes = Number.isFinite(v) ? v : 30;
            this._saveFullConfig();
        });

        // Animations toggle (disabled by reduced motion via host state)
        this._els.anim.addEventListener('change', () => {
            if (this._initializing)
                return;

            this._cfg.animationsEnabled = !!this._els.anim.checked;
            this._saveFullConfig();
        });

        // Location search
        const doSearch = debounce(async () => {
            const q = (this._els.locInput.value || '').trim();
            if (q.length < 2) {
                this._setResults([]);
                return;
            }

            try {
                const raw = await geocodeSearch({ query: q, count: 10, language: 'en' });
                const results = (raw?.results || []).map(r => ({
                    label: _label(r),
                    lat: r.latitude,
                    lon: r.longitude,
                }));
                this._setResults(results);
            } catch (e) {
                console.error('[weather-prefs] geocode failed', e);
                this._setResults([]);
            }
        }, 250);

        this._els.locInput.addEventListener('input', doSearch);
        this._els.locInput.addEventListener('focus', doSearch);
    }

    _saveFullConfig() {
        // Always send a FULL normalized config (host requirement).
        const full = _normalize(this._cfg);
        this._cfg = full;

        // If host enforces reduced motion globally, we do NOT rewrite the user's
        // stored preference here; we only disable the control in UI.
        this._api.saveConfig(full);
    }

    _applyCfgToUi() {
        const prev = this._initializing;
        this._initializing = true;

        const cfg = _normalize(this._cfg);

        this._els.locInput.value = cfg.location?.label || '';

        const units = cfg.units || 'system';
        for (const r of this._els.radios)
            r.checked = (r.value === units);

        this._els.refresh.value = String(cfg.refreshMinutes || 30);
        this._els.anim.checked = !!cfg.animationsEnabled;

        this._initializing = prev;
    }

    _applyHostStateToUi() {
        const reduced = !!this._host.reducedMotion;

        this._els.anim.disabled = reduced;
        if (reduced) {
            // UI-only hint; don't mutate cfg or push.
            const prev = this._initializing;
            this._initializing = true;
            this._els.anim.checked = false;
            this._initializing = prev;

            this._els.animHint.textContent = 'Disabled by system reduced motion setting.';
        } else {
            this._els.animHint.textContent = '';
        }
    }

    _setResults(results) {
        const box = this._els.locResults;
        box.innerHTML = '';

        if (!results.length) {
            box.hidden = true;
            return;
        }

        for (const r of results) {
            const row = document.createElement('div');
            row.className = 'prefs-result';
            row.textContent = r.label;

            row.addEventListener('click', () => {
                box.hidden = true;
                box.innerHTML = '';

                // UI update without triggering handlers
                const prev = this._initializing;
                this._initializing = true;
                this._els.locInput.value = r.label;
                this._initializing = prev;

                this._cfg.location = { label: r.label, lat: r.lat, lon: r.lon };
                this._saveFullConfig();
            });

            box.appendChild(row);
        }

        box.hidden = false;
    }
}

(async () => {
    try {
        const app = new PrefsApp();
        await app.init();
        window.__weatherPrefs = app;
    } catch (e) {
        console.error('[weather-prefs] init failed', e);
    }
})();
