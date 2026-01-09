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
/**
 * Debounce a function by ms milliseconds.
 *
 * @param {Function} fn - Function to debounce.
 * @param {number} ms - Delay in milliseconds.
 */
export function debounce(fn, ms) {
    let t = null;
    return (...a) => {
        if (t)
            clearTimeout(t);

        t = setTimeout(() => fn(...a), ms);
    };
}
/**
 *
 */
export function nowUnix() {
    return Math.floor(Date.now() / 1000);
}
/**
 * Format an ISO date string into a short weekday name.
 *
 * @param {string|Date} dateIso - ISO date string (YYYY-MM-DD) or a Date object.
 * @param {string} [locale] - Optional locale string.
 * @returns {string} Short weekday name (e.g. 'Mon') or '--' if invalid.
 */
export function fmtWeekday(dateIso, locale) {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    if (typeof dateIso === 'string') {
        const parts = dateIso.split('-').map(Number);
        if (parts.length === 3 && parts.every(n => Number.isFinite(n))) {
            const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
            if (!isNaN(d.getTime())) {
                try {
                    return (
                        new Intl.DateTimeFormat(locale ||
                        undefined, {weekday: 'short'}).format(d)
                    );
                } catch (e) {}
                return days[d.getUTCDay()];
            }
        }
        if (dateIso.length >= 3)
            return dateIso.slice(0, 3);
    }
    return '--';
}
