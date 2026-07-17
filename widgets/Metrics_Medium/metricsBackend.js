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


// metricsBackend.js
//
// Metrics backend app (cpu/mem/net via libgtop, battery via UPowerGlib)
// Implements ONLY these host->backend methods:
//   - getSnapshot
//   - setPeriodMs
//
// Emits ONLY this backend->host event:
//   - {type:'event', name:'metrics', payload:{snapshot}}
//
// Protocol is exactly the one used by HtmlWidgetHostWithBackend:
//   hello/request/event/shutdown in, response/event/log out.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GTop from 'gi://GTop';
import UPowerGlib from 'gi://UPowerGlib';
import GObject from 'gi://GObject';

import {BackendApp, runBackend} from './backEndApp.js';

const DEFAULT_PERIOD_MS = 1000;
const MIN_PERIOD_MS = 250;
const MAX_PERIOD_MS = 10000;

// libgtop if_flags are exposed as flag indices, not kernel IFF_* bits.
const GLIBTOP_IF_FLAG_LOOPBACK = 4;

export const MetricsBackendApp = GObject.registerClass(
class MetricsBackendApp extends BackendApp {
    constructor(params = {}) {
        super({applicationId: null, devKeepAlive: params.devKeepAlive});

        this._periodMs = DEFAULT_PERIOD_MS;

        this._timerId = 0;

        // CPU delta cache
        this._prevCpuTotal = null;
        this._prevCpuIdle = null;

        // Network delta cache: iface -> {bytesIn, bytesOut, tsMs}
        this._netPrev = new Map();
        this._selectedNetworkInterface = null;
        this._routeRefreshTimerId = 0;

        // UPower
        this._upClient = null;
        this._upDisplay = null;

        this._cpuSample = new GTop.glibtop_cpu();
        this._memSample = new GTop.glibtop_mem();
        this._netSample = new GTop.glibtop_netload();
        this._routeFile = Gio.File.new_for_path('/proc/net/route');

        // Register ONLY the two methods we support
        this.registerMethod('getSnapshot', this._rpcGetSnapshot.bind(this));
        this.registerMethod('setPeriodMs', this._rpcSetPeriodMs.bind(this));
    }

    onHello(_ctx) {
        // Initialize UPowerGlib lazily on hello.
        this._ensureUpower();
        this._refreshDefaultRoute();

        // Emit immediately once on startup (as requested)
        this._sampleAndEmit('startup');

        // Start periodic sampling
        this._startTimer();
        this._startRouteRefreshTimer();
    }

    onShutdown() {
        this._stopTimer();
        this._stopRouteRefreshTimer();
        // Nothing else required; process exits via base class.
    }

    // ------------------------------------------------------------
    // RPC handlers
    // ------------------------------------------------------------

    _rpcGetSnapshot(_params, _ctx) {
        return {snapshot: this._takeSnapshot()};
    }

    _rpcSetPeriodMs(params, _ctx) {
        const requested = params?.periodMs;
        const next = this._clampPeriodMs(requested);

        this._periodMs = next;
        this._restartTimer();

        this._sampleAndEmit('periodChanged');

        return {periodMs: this._periodMs};
    }

    // ------------------------------------------------------------
    // Timer control
    // ------------------------------------------------------------

    _startTimer() {
        if (this._timerId)
            return;

        this._timerId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            this._periodMs,
            () => {
                this._sampleAndEmit('tick');
                return GLib.SOURCE_CONTINUE;
            }
        );
    }

    _stopTimer() {
        if (!this._timerId)
            return;

        try {
            GLib.Source.remove(this._timerId);
        } catch (e) {
            this.warn('Failed to remove timer:', e?.message ?? e);
        }

        this._timerId = 0;
    }

    _restartTimer() {
        this._stopTimer();
        this._startTimer();
        this._stopRouteRefreshTimer();
        this._startRouteRefreshTimer();
    }

    _startRouteRefreshTimer() {
        if (this._routeRefreshTimerId)
            return;

        this._routeRefreshTimerId = GLib.timeout_add_seconds(
            GLib.PRIORITY_LOW,
            30,
            () => {
                this._refreshDefaultRoute();
                return GLib.SOURCE_CONTINUE;
            }
        );
    }

    _stopRouteRefreshTimer() {
        if (!this._routeRefreshTimerId)
            return;

        try {
            GLib.Source.remove(this._routeRefreshTimerId);
        } catch (e) {
            this.warn(
                'Failed to remove route refresh timer:',
                e?.message ?? e
            );
        }

        this._routeRefreshTimerId = 0;
    }

    // ------------------------------------------------------------
    // Sampling + emit
    // ------------------------------------------------------------

    _sampleAndEmit(_reason) {
        this.sendEvent('metrics', {snapshot: this._takeSnapshot()});
    }

    _takeSnapshot() {
        const tsMs = this._nowMs();
        return this._buildSnapshot({
            tsMs,
            cpuUsagePct: this._sampleCpuUsagePct(),
            mem: this._sampleMem(),
            net: this._sampleNet(tsMs),
            battery: this._sampleBattery(),
        });
    }

    _buildSnapshot({tsMs, cpuUsagePct, mem, net, battery}) {
        let hostName = null;
        try {
            hostName = GLib.get_host_name();
        } catch (_e) {}

        // Stable schema v1
        return {
            v: '1',
            tsMs,
            periodMs: this._periodMs,
            hostName,
            cpu: {usagePct: cpuUsagePct},
            mem: {
                totalBytes: mem.totalBytes,
                usedBytes: mem.usedBytes,
                freeBytes: mem.freeBytes,
                cachedBytes: mem.cachedBytes,
            },
            net: {
                rxBps: net.rxBps,
                txBps: net.txBps,
            },
            battery,
        };
    }

    // ------------------------------------------------------------
    // CPU (libgtop)
    // ------------------------------------------------------------

    _sampleCpuUsagePct() {
        GTop.glibtop_get_cpu(this._cpuSample);

        const total = Number(this._cpuSample.total ?? 0);
        const idle = Number(this._cpuSample.idle ?? 0);

        // First sample: prime, report 0
        if (this._prevCpuTotal === null || this._prevCpuIdle === null) {
            this._prevCpuTotal = total;
            this._prevCpuIdle = idle;
            return 0;
        }

        const dTotal = total - this._prevCpuTotal;
        const dIdle = idle - this._prevCpuIdle;

        this._prevCpuTotal = total;
        this._prevCpuIdle = idle;

        if (!(dTotal > 0))
            return 0;

        const busy = dTotal - dIdle;
        let pct = (busy / dTotal) * 100;
        if (!Number.isFinite(pct))
            pct = 0;
        if (pct < 0)
            pct = 0;
        if (pct > 100)
            pct = 100;
        return pct;
    }

    // ------------------------------------------------------------
    // Memory (libgtop)
    // ------------------------------------------------------------

    _sampleMem() {
        GTop.glibtop_get_mem(this._memSample);

        const totalBytes = Number(this._memSample.total ?? 0);
        const usedBytes = Number(this._memSample.used ?? 0);
        const freeBytes = Number(this._memSample.free ?? 0);
        const cachedBytes = Number(this._memSample.cached ?? 0);

        return {totalBytes, usedBytes, freeBytes, cachedBytes};
    }

    // ------------------------------------------------------------
    // Network (libgtop)
    //  - Selected interface only
    //  - Default route chosen from /proc/net/route
    //  - Totals only (v1)
    // ------------------------------------------------------------

    _hasNetloadFlag(netload, flagIndex) {
        const ifFlags = Number(netload?.if_flags ?? 0);
        if (!(ifFlags > 0))
            return false;

        const bit = 1 << (flagIndex - 1);
        return (ifFlags & bit) !== 0;
    }

    _isIfaceLoopback(iface, netload) {
        if (iface === 'lo')
            return true;

        return this._hasNetloadFlag(netload, GLIBTOP_IF_FLAG_LOOPBACK);
    }

    _sampleNet(tsMs) {
        const iface = this._selectedNetworkInterface;
        if (typeof iface !== 'string' || !iface)
            return {rxBps: 0, txBps: 0};

        GTop.glibtop_get_netload(this._netSample, iface);

        if (this._isIfaceLoopback(iface, this._netSample))
            return {rxBps: 0, txBps: 0};

        const bytesIn = Number(this._netSample.bytes_in ?? 0);
        const bytesOut = Number(this._netSample.bytes_out ?? 0);

        if (!Number.isFinite(bytesIn) || !Number.isFinite(bytesOut))
            return {rxBps: 0, txBps: 0};

        const prev = this._netPrev.get(iface);
        this._netPrev.set(iface, {bytesIn, bytesOut, tsMs});

        if (!prev)
            return {rxBps: 0, txBps: 0};

        const dt = tsMs - prev.tsMs;
        if (!(dt > 0))
            return {rxBps: 0, txBps: 0};

        const drx = bytesIn - prev.bytesIn;
        const dtx = bytesOut - prev.bytesOut;

        const rxBps = (drx > 0 ? drx : 0) * (1000 / dt);
        const txBps = (dtx > 0 ? dtx : 0) * (1000 / dt);

        return {
            rxBps,
            txBps,
        };
    }

    _refreshDefaultRoute() {
        const nextIface = this._readDefaultRouteInterface();
        if (!nextIface)
            return false;

        if (nextIface === this._selectedNetworkInterface)
            return false;

        this._selectedNetworkInterface = nextIface;
        this._netPrev.clear();
        return true;
    }

    _readDefaultRouteInterface() {
        try {
            const [, contents] = this._routeFile.load_contents(null);
            const text = contents ? this._decoder.decode(contents) : '';
            if (!text)
                return null;

            let bestIface = null;
            let bestMetric = Number.POSITIVE_INFINITY;

            const lines = text.split(/\r?\n/);
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line)
                    continue;

                const parts = line.split(/\s+/);
                if (parts.length < 8)
                    continue;

                const iface = parts[0];
                const destination = parts[1];
                const mask = parts[7];
                const metric = Number.parseInt(parts[6], 10);

                if (destination !== '00000000' || mask !== '00000000')
                    continue;

                if (!iface || !Number.isFinite(metric))
                    continue;

                if (metric < bestMetric) {
                    bestMetric = metric;
                    bestIface = iface;
                }
            }

            return bestIface;
        } catch {
            return null;
        }
    }

    // ------------------------------------------------------------
    // Battery (UPowerGlib)
    // ------------------------------------------------------------

    _ensureUpower() {
        if (this._upClient)
            return;

        try {
            this._upClient = new UPowerGlib.Client();
            this._upDisplay = this._upClient.get_display_device();
        } catch (e) {
            this._upClient = null;
            this._upDisplay = null;

            // Use host logging channel; do not throw.
            this.warn('UPowerGlib init failed:', e?.message ?? e);
        }
    }

    _sampleBattery() {
        this._ensureUpower();

        const dev = this._upDisplay;

        if (!dev)
            return {present: false};

        // Present check
        let present = this._get(dev, 'is_present', null);

        if (present === null)
            present = this._get(dev, 'present', null);

        if (present === null)
            // display device may not expose present; assume true
            present = true;

        present = !!present;

        // If display device says not present, return minimal
        if (!present)
            return {present: false};

        const percent = Number(this._get(dev, 'percentage', 0));

        const state =
            this._batteryStateToString(
                this._get(dev, 'state', UPowerGlib.DeviceState.UNKNOWN)
            );

        // Times are in seconds in UPower
        const secsToEmpty = Number(this._get(dev, 'time_to_empty', 0));
        const secsToFull = Number(this._get(dev, 'time_to_full', 0));

        const energyRateW = Number(this._get(dev, 'energy_rate', 0));

        const out = {
            present: true,
            percent: Number.isFinite(percent) ? percent : 0,
            state,
        };

        if (Number.isFinite(secsToEmpty) && secsToEmpty > 0)
            out.secsToEmpty = Math.floor(secsToEmpty);

        if (Number.isFinite(secsToFull) && secsToFull > 0)
            out.secsToFull = Math.floor(secsToFull);

        if (Number.isFinite(energyRateW) && energyRateW > 0)
            out.energyRateW = energyRateW;

        return out;
    }

    // ------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------

    _clampPeriodMs(x) {
        if (typeof x !== 'number' || !Number.isFinite(x))
            return DEFAULT_PERIOD_MS;
        x = Math.floor(x);
        if (x < MIN_PERIOD_MS)
            x = MIN_PERIOD_MS;
        if (x > MAX_PERIOD_MS)
            x = MAX_PERIOD_MS;
        return x;
    }

    _nowMs() {
        return Date.now();
    }

    _get(obj, prop, fallback = null) {
        try {
            if (obj && (prop in obj))
                return obj[prop];
        } catch {}

        try {
            const m = `get_${prop}`;
            if (obj && typeof obj[m] === 'function')
                return obj[m]();
        } catch {}

        return fallback;
    }

    _batteryStateToString(state) {
        switch (state) {
        case UPowerGlib.DeviceState.CHARGING: return 'charging';
        case UPowerGlib.DeviceState.DISCHARGING: return 'discharging';
        case UPowerGlib.DeviceState.FULLY_CHARGED: return 'full';
        case UPowerGlib.DeviceState.EMPTY: return 'empty';
        case UPowerGlib.DeviceState.PENDING_CHARGE: return 'pending_charge';
        case UPowerGlib.DeviceState.PENDING_DISCHARGE: return 'pending_discharge';
        default: return 'unknown';
        }
    }
});

runBackend(MetricsBackendApp);
