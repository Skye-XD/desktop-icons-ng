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
function _qs(p) {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(p)) {
        if (v === null || v === undefined)
            continue;
        u.set(k, String(v));
    }
    return u.toString();
}
async function _fetchJson(url, {timeoutMs = 12000} = {}) {
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
    } finally {
        clearTimeout(t);
    }
}
/**
 *
 * @param {object} root0
 * @param {number} root0.lat
 * @param {number} root0.lon
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
 * @param {object} root0
 * @param {string} root0.query
 * @param {number} [root0.count]
 * @param {string} [root0.language]
 */
// eslint-disable-next-line require-await
export async function geocodeSearch({query, count = 10, language = 'en'}) {
    return _fetchJson(`${GEOCODE_BASE}?${_qs({name: query, count, language})}`);
}
