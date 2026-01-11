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
const ICON_DIR = 'icons/meteocons';
const SLOW_FACTOR = 6;

function _scaleDur(v, f) {
    const m = String(v).trim().match(/^([0-9]*\.?[0-9]+)\s*(ms|s)$/i);
    if (!m)
        return v;
    const num = parseFloat(m[1]);
    const unit = m[2].toLowerCase();
    const scaled = num * f;
    const out = unit === 'ms' ? String(Math.round(scaled)) : String(Math.round(scaled * 100) / 100);
    return out + unit;
}

function _slowSmil(svg, f) {
    return svg.replace(/\bdur\s*=\s*["']([^"']+)["']/gi, (m, dur) => `dur="${_scaleDur(dur, f)}"`);
}

async function _fetchText(url) {
    // Use no-store so switching animation on/off doesn't reuse cached SVG
    const res = await fetch(url, {cache: 'no-store'});
    if (!res.ok)
        throw new Error(`Icon fetch failed: HTTP ${res.status}`);
    const a = await res.text();
    return a;
}

/**
 *
 * @param {string} stem
 * @param {object} root0
 * @param {boolean} root0.animationsEnabled
 */
export async function loadIconSvgText(stem, {animationsEnabled}) {
    const s = stem || 'not-available';
    const cacheBust = animationsEnabled ? 'on' : 'off';
    const url = `${ICON_DIR}/${s}.svg?anim=${cacheBust}`;
    try {
        let svg = await _fetchText(url);
        svg = animationsEnabled ? _slowSmil(svg, SLOW_FACTOR) : svg;
        return svg;
    } catch (e) {
        if (s !== 'not-available') {
            try {
                return await loadIconSvgText('not-available', {animationsEnabled});
            } catch (_) {}
        }
        if (s !== 'unknown') {
            try {
                return await loadIconSvgText('unknown', {animationsEnabled});
            } catch (_) {}
        }
        throw e;
    }
}

/**
 *
 * @param {HTMLElement} el
 * @param {string} stem
 * @param {object} root0
 * @param {boolean} root0.animationsEnabled
 */
export async function setIconInto(el, stem, {animationsEnabled}) {
    el.innerHTML = await loadIconSvgText(stem, {animationsEnabled});
    if (!animationsEnabled) {
        const svg = el.querySelector('svg');
        if (svg && typeof svg.pauseAnimations === 'function') {
            try {
                svg.pauseAnimations();
            } catch (_) {}
        }
    }
}
