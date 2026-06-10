/* eslint-disable no-await-in-loop */
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
'use strict';
const FORECAST_BASE = 'https://api.open-meteo.com/v1/forecast';
const GEOCODE_BASE = 'https://geocoding-api.open-meteo.com/v1/search';
const RETRYABLE_STATUS = 502;
const MAX_502_RETRIES = 4;
const BACKOFF_BASE_MS = 1000;
const BACKOFF_MAX_MS = 15000;
function _qs(p) {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(p)) {
        if (v === null || v === undefined)
            continue;
        u.set(k, String(v));
    }
    return u.toString();
}
function _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
// eslint-disable-next-line consistent-return
async function _fetchJson(url, {timeoutMs = 12000} = {}) {
    for (let attempt = 0; attempt <= MAX_502_RETRIES; attempt++) {
        const ac = new AbortController();
        const t = setTimeout(() => ac.abort(), timeoutMs);
        try {
            const res = await fetch(url, {signal: ac.signal, cache: 'no-store'});
            if (!res.ok) {
                const text = await res.text().catch(() => '');
                const e = new Error(`HTTP ${res.status}`);
                e.status = res.status;
                e.body = text;
                throw e;
            }
            return await res.json();
        } catch (e) {
            if (e?.status !== RETRYABLE_STATUS || attempt >= MAX_502_RETRIES)
                throw e;
            const delayMs = Math.min(BACKOFF_BASE_MS * (2 ** attempt), BACKOFF_MAX_MS);
            await _sleep(delayMs);
        } finally {
            clearTimeout(t);
        }
    }
}
/**
 *
 * @param {object} root0 Forecast request parameters.
 * @param {number} root0.lat Latitude for the forecast lookup.
 * @param {number} root0.lon Longitude for the forecast lookup.
 */
// eslint-disable-next-line require-await
export async function fetchForecast({lat, lon}) {
    const params = {
        latitude: lat, longitude: lon,
        current: ['temperature_2m', 'weather_code', 'is_day'].join(','),
        daily: ['weather_code',
            'temperature_2m_max',
            'temperature_2m_min',
            'precipitation_probability_max']
          .join(','),
        forecast_days: 4, timezone: 'auto',
    };
    return _fetchJson(`${FORECAST_BASE}?${_qs(params)}`);
}
/**
 *
 * @param {object} root0 Geocoding request parameters.
 * @param {string} root0.query Free-form place name to search for.
 * @param {number} [root0.count] Maximum number of matches to return.
 * @param {string} [root0.language] Preferred response language code.
 */
// eslint-disable-next-line require-await
export async function geocodeSearch({query, count = 10, language = 'en'}) {
    return _fetchJson(`${GEOCODE_BASE}?${_qs({name: query, count, language})}`);
}
