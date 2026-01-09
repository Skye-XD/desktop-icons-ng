/* eslint-disable no-restricted-globals */
/* eslint-disable no-undef */
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

class CalendarPrefs {
    constructor() {
        this._defaults = {
            headerColor: '#f5f6f8',
            eventColor: '#f5f6f8',
            panelColor: '#ffffff',
            panelAlpha: 0.06,
            nextColor: '#ffffff',
        };

        this._config = {...this._defaults};

        this._els = {
            headerColor: document.getElementById('headerColor'),
            eventColor: document.getElementById('eventColor'),
            nextColor: document.getElementById('nextColor'),
            panelColor: document.getElementById('panelColor'),
            panelAlpha: document.getElementById('panelAlpha'),
            panelAlphaValue: document.getElementById('panelAlphaValue'),
            restoreDefaults: document.getElementById('restoreDefaults'),
        };
    }

    async init() {
        try {
            if (window.ding && typeof window.ding.getConfig === 'function') {
                const cfg = await window.ding.getConfig();
                if (cfg && typeof cfg === 'object')
                    this._config = {...this._defaults, ...cfg};
            }
        } catch (e) {}

        this._syncUiFromConfig();
        this._wire();

        try {
            if (window.ding && typeof window.ding.onConfigChanged === 'function') {
                window.ding.onConfigChanged(cfg => {
                    if (cfg && typeof cfg === 'object')
                        this._config = {...this._defaults, ...cfg};
                    else
                        this._config = {...this._defaults};
                    this._syncUiFromConfig();
                });
            }
        } catch (e) {}
    }

    _normalizeHexColor(value) {
        if (typeof value !== 'string')
            return null;
        const s = value.trim();
        return /^#([0-9a-f]{6})$/i.test(s) ? s.toLowerCase() : null;
    }

    _clamp(n, lo, hi) {
        return Math.max(lo, Math.min(hi, n));
    }

    _formatOpacity(alpha) {
        const pct = Math.round(alpha * 100);
        return `${pct}%`;
    }

    _syncUiFromConfig() {
        const cfg = this._config;
        this._els.headerColor.value = this._normalizeHexColor(cfg.headerColor) || this._defaults.headerColor;
        this._els.eventColor.value = this._normalizeHexColor(cfg.eventColor) || this._defaults.eventColor;
        this._els.nextColor.value = this._normalizeHexColor(cfg.nextColor) || this._defaults.nextColor;
        this._els.panelColor.value = this._normalizeHexColor(cfg.panelColor) || this._defaults.panelColor;

        const rawAlpha = Number(cfg.panelAlpha);
        const alpha = Number.isFinite(rawAlpha)
            ? this._clamp(rawAlpha, 0, 0.35)
            : this._defaults.panelAlpha;
        this._els.panelAlpha.value = String(alpha);
        this._els.panelAlphaValue.textContent = this._formatOpacity(alpha);
    }

    _pushConfig() {
        try {
            if (window.ding && typeof window.ding.saveConfig === 'function')
                window.ding.saveConfig(this._config);
        } catch (e) {}
    }

    _updateConfig(patch) {
        this._config = {...this._config, ...patch};
        this._pushConfig();
    }

    _wire() {
        this._els.headerColor.addEventListener('input', () => {
            const hex = this._normalizeHexColor(this._els.headerColor.value);
            if (!hex)
                return;
            this._updateConfig({headerColor: hex});
        });

        this._els.eventColor.addEventListener('input', () => {
            const hex = this._normalizeHexColor(this._els.eventColor.value);
            if (!hex)
                return;
            this._updateConfig({eventColor: hex});
        });

        this._els.nextColor.addEventListener('input', () => {
            const hex = this._normalizeHexColor(this._els.nextColor.value);
            if (!hex)
                return;
            this._updateConfig({nextColor: hex});
        });

        this._els.panelColor.addEventListener('input', () => {
            const hex = this._normalizeHexColor(this._els.panelColor.value);
            if (!hex)
                return;
            this._updateConfig({panelColor: hex});
        });

        this._els.panelAlpha.addEventListener('input', () => {
            const raw = Number(this._els.panelAlpha.value);
            const alpha = Number.isFinite(raw)
                ? this._clamp(raw, 0, 0.35)
                : this._defaults.panelAlpha;
            this._els.panelAlphaValue.textContent = this._formatOpacity(alpha);
            this._updateConfig({panelAlpha: alpha});
        });

        this._els.restoreDefaults.addEventListener('click', () => {
            this._config = {...this._defaults};
            this._pushConfig();
            this._syncUiFromConfig();
        });
    }
}

const app = new CalendarPrefs();
if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', () => app.init(), {once: true});
else
    app.init();
