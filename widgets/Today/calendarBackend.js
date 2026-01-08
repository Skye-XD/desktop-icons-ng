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

// Calendar Backend
//
// Provides a synchronous, data-only snapshot of calendars and events
// for the current day using Evolution Data Server (EDS).
//
// Responsibilities:
//  - Enumerate calendars and events
//  - Normalize and cache daily snapshots
//  - Emit updates only when calendar data changes
//
// Non-responsibilities:
//  - Tracking current time (“now”)
//  - UI timing, animation, or presentation logic
//
// Time-based updates are handled entirely by the widget frontend.

import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import EDataServer from 'gi://EDataServer';
import ECal from 'gi://ECal';

import {BackendApp, runBackend} from './backEndApp.js';

const CALENDAR_EXTENSION = EDataServer.SOURCE_EXTENSION_CALENDAR;

export const CalendarBackend = GObject.registerClass(
class CalendarBackend extends BackendApp {
    constructor(params) {
        super(params);

        this._registry = null;

        // uid -> {
        //   uid, name, color, selected,
        //   source, client
        // }
        this._calendars = new Map();

        // Last computed snapshot
        this._lastSnapshot = {
            nowUnix: 0,
            dayStartUnix: 0,
            dayEndUnix: 0,
            allday: [],
            timed: [],
        };

        // Poll refresh source id (seconds)
        this._refreshSource = 0;

        // Request API
        this.registerMethod('getSnapshot', () => {
            return this._lastSnapshot;
        });
    }

    // ------------------------------------------------------------
    // Backend lifecycle
    // ------------------------------------------------------------

    onHello(_ctx) {
        try {
            this._initRegistry();
            this._loadCalendars();
            this._ensureClients();
            this._refreshToday();
        } catch (e) {
            this.error('Failed to initialize calendar backend:', e?.message ?? e);
            return;
        }

        this.sendEvent('update', this._lastSnapshot);

        this._ensureRefreshTimer();
    }

    onShutdown() {
        this.log('CalendarBackend shutdown');

        if (this._refreshSource) {
            GLib.Source.remove(this._refreshSource);
            this._refreshSource = 0;
        }

        for (const info of this._calendars.values()) {
            info.client = null;
            info.source = null;
        }

        this._calendars.clear();
        this._registry = null;
    }

    // ------------------------------------------------------------
    // EDS integration
    // ------------------------------------------------------------

    _initRegistry() {
        if (this._registry)
            return;

        this._registry = EDataServer.SourceRegistry.new_sync(null);
    }

    _loadCalendars() {
        this._calendars.clear();

        const sources = this._registry.list_sources(null);

        for (const source of sources) {
            if (!source.has_extension(CALENDAR_EXTENSION))
                continue;

            const uid = source.get_uid();
            const name = source.get_display_name();

            let selected = false;
            let color = null;

            const ext = source.get_extension(CALENDAR_EXTENSION);
            selected = ext.get_selected();
            color = ext.get_color();

            const info = {
                uid,
                name,
                color,
                selected,
                source,
                client: null,
            };

            this._calendars.set(uid, info);
        }
    }

    // ------------------------------------------------------------
    // EDS integration
    // ------------------------------------------------------------

    _ensureClients() {
        // Connect an ECal.Client for each *selected* calendar.
        for (const info of this._calendars.values()) {
            if (!info.selected)
                continue;

            if (info.client)
                continue;

            const waitForConnectedSeconds = 1;
            try {
                // EVENTS calendars
                info.client = ECal.Client.connect_sync(
                    info.source,
                    ECal.ClientSourceType.EVENTS,
                    waitForConnectedSeconds,
                    null
                );
            } catch (e) {
                info.client = null;
                this.warn('Failed to connect calendar client:', info.uid, e?.message ?? e);
            }
        }
    }

    _todayRangeUnix() {
        const now = GLib.DateTime.new_now_local();
        const y = now.get_year();
        const m = now.get_month();
        const d = now.get_day_of_month();

        const dayStart = GLib.DateTime.new_local(y, m, d, 0, 0, 0);
        const dayEnd = dayStart.add_days(1);

        return {
            nowUnix: now.to_unix(),
            dayStartUnix: dayStart.to_unix(),
            dayEndUnix: dayEnd.to_unix(),
        };
    }

    _refreshToday() {
        const {nowUnix, dayStartUnix, dayEndUnix} = this._todayRangeUnix();

        const calendarsOut = [];
        for (const info of this._calendars.values()) {
            calendarsOut.push({
                uid: info.uid,
                name: info.name,
                color: info.color,
                selected: info.selected,
            });
        }

        // Build events list across selected calendars
        const events = [];

        for (const info of this._calendars.values()) {
            if (!info.selected || !info.client)
                continue;

            const calUid = info.uid;
            const calName = info.name;
            const calColor = info.color;

            try {
                info.client.generate_instances_sync(
                    dayStartUnix,
                    dayEndUnix,
                    null,
                    (icomp, instanceStart, instanceEnd) => {
                        // icomp: ICalGLib.Component
                        // instanceStart/End: ICalGLib.Time
                        let summary = '';
                        let location = null;
                        let uid = null;

                        try {
                            summary = icomp.get_summary() ?? '';
                        } catch {}
                        try {
                            location = icomp.get_location?.() ?? null;
                        } catch {}
                        try {
                            uid = icomp.get_uid?.() ?? null;
                        } catch {}

                        let allDay = false;
                        try {
                            allDay = !!instanceStart?.is_date?.();
                        } catch {}

                        let startUnix = 0;
                        let endUnix = 0;

                        try {
                            startUnix = instanceStart?.as_timet?.() ?? 0;
                            endUnix = instanceEnd?.as_timet?.() ?? 0;
                        } catch {}

                        // Safety: clamp to today window if backend gives oddities
                        if (startUnix < dayStartUnix)
                            startUnix = dayStartUnix;
                        if (endUnix > dayEndUnix)
                            endUnix = dayEndUnix;

                        // Stable id for UI diffing (good enough for today view)
                        const id = `${calUid}:${uid ?? 'no-uid'}:${startUnix}:${endUnix}`;

                        events.push({
                            id,
                            calendarUid: calUid,
                            calendarName: calName,
                            calendarColor: calColor,
                            summary,
                            location,
                            allDay,
                            startUnix,
                            endUnix,
                        });

                        return true;
                    }
                );
            } catch (e) {
                this.warn('Failed to generate instances:', calUid, e?.message ?? e);
            }
        }

        // Sort: all-day first, then by start time, then by summary
        events.sort((a, b) => {
            if (!!a.allDay !== !!b.allDay)
                return a.allDay ? -1 : 1;
            if (a.startUnix !== b.startUnix)
                return a.startUnix - b.startUnix;
            return String(a.summary ?? '').localeCompare(String(b.summary ?? ''));
        });

        this._lastSnapshot = {
            nowUnix,
            dayStartUnix,
            dayEndUnix,
            allday: events.filter(e => e.allDay),
            timed: events.filter(e => !e.allDay),
        };
    }

    _ensureRefreshTimer() {
        if (this._refreshSource)
            return;

        this._refreshSource = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT,
            60,
            () => {
                // Don’t spam logs; just refresh + emit if something changed.
                const prev = this._lastSnapshot;

                this._refreshToday();
                const next = this._lastSnapshot;

                const pa = prev?.allday ?? [];
                const pt = prev?.timed ?? [];
                const na = next?.allday ?? [];
                const nt = next?.timed ?? [];

                let changed = false;
                if (pa.length !== na.length || pt.length !== nt.length) {
                    changed = true;
                } else if ((prev?.nowUnix ?? 0) === 0) {
                    changed = true;
                } else {
                    const pe = pa.concat(pt);
                    const ne = na.concat(nt);
                    // Compare first few ids + times (fast, good enough)
                    const n = Math.min(6, pe.length, ne.length);
                    for (let i = 0; i < n; i++) {
                        if (pe[i].id !== ne[i].id ||
                            pe[i].startUnix !== ne[i].startUnix ||
                            pe[i].endUnix !== ne[i].endUnix) {
                            changed = true;
                            break;
                        }
                    }
                }

                if (changed)
                    this.sendEvent('update', next);

                return GLib.SOURCE_CONTINUE;
            }
        );
    }
});

runBackend(CalendarBackend);
