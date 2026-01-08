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

import {DingClient} from '../widgetHelper.js';

export class CalendarWidget {
    constructor(root) {
        this._root = root;
        this._client = new DingClient({mode: 'widget'});
        this._lastSnapshot = null;
        this._tickId = null;

        this._client.onBackendEvent((name, payload) => {
            if (name === 'update')
                this._render(payload);
        });

        this._client.onVisibilityChange(visible => {
            if (visible && this._lastSnapshot)
                this._render(this._lastSnapshot);
        });

        this._startTick();
    }

    _render(s) {
        if (!s)
            return;
        this._lastSnapshot = s;

        // Empty day
        if (!s.allday.length && !s.timed.length) {
            this._root.innerHTML = `
        ${this._renderHeader(s.nowUnix)}
        <div class="cal-empty">No events today</div>
      `;
            return;
        }

        const activeTimed =
      s.timed.some(e => !e.allDay && e.startUnix <= s.nowUnix && e.endUnix > s.nowUnix);

        const nextTimed =
      !activeTimed
          ? s.timed.find(e => !e.allDay && e.startUnix > s.nowUnix) ?? null
          : null;

        // background tint from *current* event only
        const nowEv =
      s.timed.find(e => !e.allDay && e.startUnix <= s.nowUnix && e.endUnix > s.nowUnix) ?? null;

        this._root.style.setProperty(
            '--now-tint',
            nowEv?.calendarColor ?? 'transparent'
        );

        this._root.innerHTML = `
      ${this._renderHeader(s.nowUnix)}
      ${this._renderAllDay(s.allday)}
      ${this._renderTimed(s.timed, s.nowUnix, nextTimed)}
    `;
    }

    _renderHeader(nowUnix) {
        const d = new Date(nowUnix * 1000);
        const date = d.toLocaleDateString([], {month: 'short', day: 'numeric'});

        return `
      <div class="cal-header">
        <div class="cal-today">Today</div>
        <div class="cal-date">${date}</div>
      </div>
    `;
    }

    _renderAllDay(items) {
        if (!items.length)
            return '';

        const shown = items.slice(0, 2);
        const extra = items.length - shown.length;

        return `
      <section>
        <header>All day</header>
        ${shown.map(ev => `
          <div class="row">
            <div class="bar" style="background:${ev.calendarColor}"></div>
            <div class="title">${this._escape(ev.summary)}</div>
          </div>
        `).join('')}
        ${extra > 0 ? `<div class="more">+${extra} more</div>` : ''}
      </section>
    `;
    }

    _renderTimed(items, nowUnix, nextTimed) {
        if (!items.length)
            return '';

        let injectedNow = false;
        const rows = items.slice(0, 6).map(ev => {
            let nowLine = '';

            if (!ev.allDay && !injectedNow && ev.startUnix > nowUnix) {
                injectedNow = true;
                if (nextTimed) {
                    nowLine = `
          <div class="cal-now-line">
            <span class="cal-next-label">Next Up</span>
            <span class="cal-next-eta">${this._formatEta(nextTimed.startUnix, nowUnix)}</span>
          </div>
        `;
                }
            }

            const isActive =
                !ev.allDay && ev.startUnix <= nowUnix && ev.endUnix > nowUnix;

            const color = ev.calendarColor || '#888888';
            const tint = this._rgba(color, isActive ? 0.18 : 0.08);

            return `
        ${nowLine}
        <div class="row cal-row ${isActive ? 'is-active' : ''}"
             style="--cal-color:${color}; --cal-tint:${tint}">
          <div class="bar" style="background:var(--cal-color)"></div>
          <div class="title">${this._escape(ev.summary)}</div>
          <div class="time">${this._formatTime(ev.startUnix, ev.endUnix)}</div>
        </div>
      `;
        }).join('');

        const endLine = !nextTimed
            ? `
        <div class="cal-now-line">
          <span class="cal-next-label">No more events today</span>
        </div>
      `
            : '';

        return `
      <section>
        <header>Schedule</header>
        ${rows}
        ${endLine}
      </section>
    `;
    }

    _formatTime(start, end) {
        const f = t =>
            new Date(t * 1000)
        .toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'});
        return `${f(start)}–${f(end)}`;
    }

    _formatEta(startUnix, nowUnix) {
        const diffSec = Math.max(0, startUnix - nowUnix);
        const mins = Math.ceil(diffSec / 60);
        if (mins < 60)
            return `in ${Math.max(1, mins)} minute${mins === 1 ? '' : 's'}`;
        const hours = Math.max(1, Math.round(mins / 60));
        return `in ${hours} hour${hours === 1 ? '' : 's'}`;
    }

    _startTick() {
        if (this._tickId)
            return;
        this._tickId = setInterval(() => {
            if (this._lastSnapshot) {
                const next = {...this._lastSnapshot, nowUnix: Math.floor(Date.now() / 1000)};
                this._render(next);
            }
        }, 60000);
    }

    _escape(s) {
        return s?.replace(/[&<>]/g, c =>
            ({'&': '&amp;', '<': '&lt;', '>': '&gt;'}[c])) ?? '';
    }

    _rgba(hex, a) {
        let h = String(hex || '').trim();
        if (h.startsWith('#'))
            h = h.slice(1);

        // Support #rgb and #rrggbb. Fall back to neutral.
        if (h.length === 3)
            h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
        if (!/^[0-9a-fA-F]{6}$/.test(h))
            return `rgba(128,128,128,${a})`;

        const r = parseInt(h.slice(0, 2), 16);
        const g = parseInt(h.slice(2, 4), 16);
        const b = parseInt(h.slice(4, 6), 16);
        return `rgba(${r},${g},${b},${a})`;
    }
}

new CalendarWidget(document.getElementById('root'));
