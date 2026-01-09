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

'use strict';
import {nowUnix, fmtWeekday} from './util.js';

/**
 *
 * @param {number} code
 */
export function mapOpenMeteoWeatherCode(code) {
    if (code === 0)
        return {label: 'Clear', iconDay: 'clear-day', iconNight: 'clear-night'};
    if (code === 1 || code === 2)
        return {label: 'Partly cloudy', iconDay: 'partly-cloudy-day', iconNight: 'partly-cloudy-night'};
    if (code === 3)
        return {label: 'Cloudy', iconDay: 'cloudy', iconNight: 'cloudy'};
    if (code === 45 || code === 48)
        return {label: 'Fog', iconDay: 'fog', iconNight: 'fog'};
    if ([51, 53, 55, 56, 57].includes(code))
        return {label: 'Drizzle', iconDay: 'drizzle', iconNight: 'drizzle'};
    if ([61, 63, 65, 80, 81, 82].includes(code))
        return {label: 'Rain', iconDay: 'rain', iconNight: 'rain'};
    if ([66, 67].includes(code))
        return {label: 'Sleet', iconDay: 'sleet', iconNight: 'sleet'};
    if ([71, 73, 75, 77, 85, 86].includes(code))
        return {label: 'Snow', iconDay: 'snow', iconNight: 'snow'};
    if ([95, 96, 99].includes(code))
        return {label: 'Thunder', iconDay: 'thunderstorms', iconNight: 'thunderstorms'};
    return {label: 'Unknown', iconDay: 'not-available', iconNight: 'not-available'};
}

/**
 *
 * @param {object} root0
 * @param {object} root0.raw
 * @param {string} root0.locationLabel
 * @param {string} root0.locale
 */
export function normalizeOpenMeteo({raw, locationLabel, locale}) {
    const isDay = !!raw?.current?.is_day;
    const codeNow = raw?.current?.weather_code ?? null;
    const mapped = mapOpenMeteoWeatherCode(codeNow);

    const d = raw?.daily || {};
    const times = d.time || [];
    const wcodes = d.weather_code || [];
    const hi = d.temperature_2m_max || [];
    const lo = d.temperature_2m_min || [];
    const pp = d.precipitation_probability_max || [];

    const out = {
        status: 'ready',
        fetchedAt: nowUnix(),
        tz: raw?.timezone || null,
        location: {label: locationLabel || '', lat: raw?.latitude ?? null, lon: raw?.longitude ?? null},
        now: {
            tempC: raw?.current?.temperature_2m ?? null,
            precipProbPct: pp[0] ?? null,
            condition: {label: mapped.label, icon: isDay ? mapped.iconDay : mapped.iconNight},
        },
        days: [],
        error: null,
    };

    for (let i = 0; i < Math.min(4, times.length); i++) {
        const m = mapOpenMeteoWeatherCode(wcodes[i] ?? null);
        out.days.push({
            dateIso: times[i],
            dow: fmtWeekday(times[i], locale),
            hiC: hi[i] ?? null,
            loC: lo[i] ?? null,
            precipProbPct: pp[i] ?? null,
            condition: {label: m.label, icon: m.iconDay}, // static forecast icons
        });
    }

    return out;
}
