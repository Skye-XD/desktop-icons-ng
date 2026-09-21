/* eslint-env node */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {test} = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../widgets/Today/calendarBackend.js'), 'utf8');
const helper = fs.readFileSync(path.join(__dirname, '../Widget Helpers/calendarBackend.js'), 'utf8');
const available = spawnSync('gjs', ['-c', 'imports.gi.ECal; imports.gi.ICalGLib;']).status === 0;

test('calendar backend copies stay identical', () => assert.equal(source, helper));

for (const timezone of ['America/New_York', 'Europe/Berlin', 'UTC']) {
    test(`calendar dates and day boundaries in ${timezone}`, {
        skip: available ? false : 'Requires GJS, ECal and ICalGLib',
    }, () => {
        const script = `
const GLib = imports.gi.GLib;
const ICal = imports.gi.ICalGLib;
const ECal = imports.gi.ECal;
const EDataServer = imports.gi.EDataServer;
const GObject = {registerClass: cls => cls};
class BackendApp {
    registerMethod() {}
    warn(...args) { throw new Error(args.join(' ')); }
}
${source.replace(/^import .*;\n/gm, '').replace('export const CalendarBackend', 'const CalendarBackend').replace('runBackend(CalendarBackend);', '')}
function equal(actual, expected, label) {
    if (actual !== expected)
        throw new Error(label + ': expected ' + expected + ', got ' + actual);
}
const backend = new CalendarBackend({});
const local = (month, day, hour = 0, minute = 0) => GLib.DateTime.new_local(2026, month, day, hour, minute, 0).to_unix();
const time = value => ICal.Time.new_from_string(value);
equal(backend._icalTimeToUnix(time('20260922')), local(9, 22), 'all-day local midnight');
equal(backend._icalTimeToUnix(time('20260922T090000')), local(9, 22, 9), 'floating local time');
const utc = time('20260922T090000Z');
equal(backend._icalTimeToUnix(utc), utc.as_timet(), 'explicit UTC');
const zoned = time('20260922T090000');
const tokyo = ICal.Timezone.get_builtin_timezone('Asia/Tokyo');
zoned.set_timezone(tokyo);
equal(backend._icalTimeToUnix(zoned), zoned.as_timet_with_zone(tokyo), 'explicit foreign zone');

// Include both US and European DST transition dates, plus an ordinary day.
for (const [month, day] of [[3, 8], [11, 1], [3, 29], [10, 25], [9, 21]]) {
    const start = local(month, day);
    const end = local(month, day + 1);
    const date = d => '2026' + String(month).padStart(2, '0') + String(d).padStart(2, '0');
    const events = [
        ['today', date(day), date(day + 1)],
        ['tomorrow', date(day + 1), date(day + 2)],
        ['yesterday', date(day - 1), date(day)],
        ['overnight', date(day - 1) + 'T230000', date(day) + 'T010000'],
        ['point', date(day) + 'T000000', date(day) + 'T000000'],
        ['next-midnight', date(day + 1) + 'T000000', date(day + 1) + 'T000000'],
        ['floating', date(day) + 'T090000', date(day) + 'T100000'],
    ];
    // Build adjacent dates through GLib to cover the first day of a month.
    const base = GLib.DateTime.new_local(2026, month, day, 0, 0, 0);
    events[2][1] = base.add_days(-1).format('%Y%m%d');
    events[3][1] = base.add_days(-1).format('%Y%m%d') + 'T230000';
    let configuredZone = null;
    backend._todayRangeUnix = () => ({nowUnix: start, dayStartUnix: start, dayEndUnix: end});
    backend._calendars.set('test', {uid: 'test', selected: true, client: {
        set_default_timezone(zone) { configuredZone = zone; },
        generate_instances_sync(_start, _end, _cancel, callback) {
            if (!configuredZone)
                throw new Error('Timezone must be configured before querying');
            for (const [summary, from, to] of events)
                callback({get_summary: () => summary}, time(from), time(to));
        },
    }});
    backend._refreshToday();
    equal(configuredZone.get_location() || configuredZone.get_tzid(), '${timezone}', 'client timezone');
    const snapshot = backend._lastSnapshot;
    equal(snapshot.allday.length, 1, 'only today all-day');
    equal(snapshot.allday[0].summary, 'today', 'correct all-day event');
    equal(snapshot.allday[0].startUnix, start, 'day start');
    equal(snapshot.allday[0].endUnix, end, 'DST-aware day end');
    equal(snapshot.timed.length, 3, 'overnight, point and floating retained');
    equal(snapshot.timed.find(event => event.summary === 'overnight').startUnix, start, 'overnight clipped');
    equal(snapshot.timed.find(event => event.summary === 'floating').startUnix, local(month, day, 9), 'floating schedule');
}
`;
        const result = spawnSync('gjs', ['-c', script], {
            env: {...process.env, TZ: timezone}, encoding: 'utf8',
        });
        assert.equal(result.status, 0, result.stderr || result.stdout);
    });
}
