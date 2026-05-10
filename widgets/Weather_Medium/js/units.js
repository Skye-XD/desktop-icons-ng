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
 *
 * @param {number} c Temperature in Celsius.
 */
export function cToF(c) {
    return c * 9 / 5 + 32;
}
/**
 *
 * @param {number} n Numeric value to round.
 */
export function round0(n) {
    return n === null || n === undefined ? null : Math.round(n);
}
/**
 *
 * @param {number} valueC Temperature in Celsius.
 * @param {string} unitsMode Unit system identifier.
 */
export function formatTemp(valueC, unitsMode) {
    if (valueC === null || valueC === undefined)
        return null;
    if (unitsMode === 'imperial')
        return round0(cToF(valueC));
    return round0(valueC);
}
/**
 *
 * @param {number} hiC High temperature in Celsius.
 * @param {number} loC Low temperature in Celsius.
 * @param {string} unitsMode Unit system identifier.
 */
export function formatTempPair(hiC, loC, unitsMode) {
    const hi = formatTemp(hiC, unitsMode);
    const lo = formatTemp(loC, unitsMode);
    if (hi === null || lo === null)
        return null;
    return `${hi}°/${lo}°`;
}
