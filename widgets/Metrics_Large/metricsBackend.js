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

// Linux netdevice flags (for glibtop_netload.if_flags when available)
const IFF_UP = 0x1;
const IFF_RUNNING = 0x40;
const IFF_LOOPBACK = 0x8;

export const MetricsBackendApp = GObject.registerClass(
class MetricsBackendApp extends BackendApp {
    constructor() {
        super({applicationId: null});

        this._periodMs = DEFAULT_PERIOD_MS;

        this._timerId = 0;

        // Cached snapshot (wire schema v1)
        this._lastSnapshot = null;

        // CPU delta cache
        this._prevCpuTotal = null;
        this._prevCpuIdle = null;

        // Network delta cache: iface -> {rx, tx, tsMs}
        this._netPrev = new Map();

        // UPower
        this._upClient = null;
        this._upDisplay = null;

        // Register ONLY the two methods we support
        this.registerMethod('getSnapshot', this._rpcGetSnapshot.bind(this));
        this.registerMethod('setPeriodMs', this._rpcSetPeriodMs.bind(this));
   }

    async onHello(ctx) {
        // Initialize UPowerGlib lazily on hello.
        this._ensureUpower();

        // Emit immediately once on startup (as requested)
        this._sampleAndEmit('startup');

        // Start periodic sampling
        this._startTimer();
   }

    async onShutdown() {
        this._stopTimer();
        // Nothing else required; process exits via base class.
   }

    // ------------------------------------------------------------
    // RPC handlers
    // ------------------------------------------------------------

    async _rpcGetSnapshot(_params, _ctx) {
        if (!this._lastSnapshot) {
            this._lastSnapshot = this._buildSnapshot({
                cpuUsagePct: 0,
                mem: {totalBytes: 0, usedBytes: 0, freeBytes: 0, cachedBytes: 0},
                net: {rxBps: 0, txBps: 0},
                battery: {present: false},
                tsMs: this._nowMs(),
            });
        }

        return {snapshot: this._lastSnapshot};
    }

    async _rpcSetPeriodMs(params, _ctx) {
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
   }

    // ------------------------------------------------------------
    // Sampling + emit
    // ------------------------------------------------------------

    _sampleAndEmit(_reason) {
        const tsMs = this._nowMs();

        const cpuUsagePct = this._sampleCpuUsagePct();
        const mem = this._sampleMem();
        const net = this._sampleNet(tsMs);
        const battery = this._sampleBattery();

        this._lastSnapshot = this._buildSnapshot({
            tsMs,
            cpuUsagePct,
            mem,
            net,
            battery,
       });

        this.sendEvent('metrics', {snapshot: this._lastSnapshot});
    }

    _buildSnapshot({tsMs, cpuUsagePct, mem, net, battery}) {
        // Stable schema v1
        return {
            v: '1',
            tsMs,
            periodMs: this._periodMs,
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
            battery: battery,
       };
   }

    // ------------------------------------------------------------
    // CPU (libgtop)
    // ------------------------------------------------------------

    _sampleCpuUsagePct() {
        const cpu = new GTop.glibtop_cpu();
        GTop.glibtop_get_cpu(cpu);

        const total = Number(cpu.total ?? 0);
        const idle = Number(cpu.idle ?? 0);

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
        if (!Number.isFinite(pct)) pct = 0;
        if (pct < 0) pct = 0;
        if (pct > 100) pct = 100;
        return pct;
   }

    // ------------------------------------------------------------
    // Memory (libgtop)
    // ------------------------------------------------------------

    _sampleMem() {
        const mem = new GTop.glibtop_mem();
        GTop.glibtop_get_mem(mem);

        const totalBytes = Number(mem.total ?? 0);
        const usedBytes = Number(mem.used ?? 0);
        const freeBytes = Number(mem.free ?? 0);
        const cachedBytes = Number(mem.cached ?? 0);

        return {totalBytes, usedBytes, freeBytes, cachedBytes};
   }

    // ------------------------------------------------------------
    // Network (libgtop)
    //  - Exclude loopback
    //  - Exclude down interfaces
    //  - Totals only (v1)
    // ------------------------------------------------------------

    _isIfaceLoopbackOrDown(iface, netload) {
        // Exclude loopback by name always
        if (iface === 'lo')
            return true;

        const ifFlags = netload?.if_flags;
        if (typeof ifFlags === 'number') {
            if (ifFlags & IFF_LOOPBACK)
                return true;

            // Treat "down" as either not UP or not RUNNING
            const up = (ifFlags & IFF_UP) !== 0;
            const running = (ifFlags & IFF_RUNNING) !== 0;
            if (!up || !running)
                return true;

            return false;
       }

        // Fallback if libgtop doesn't expose flags in this build:
        // Use /sys/class/net/<iface>/operstate to exclude "down".
        try {
            const path = `/sys/class/net/${iface}/operstate`;
            const f = Gio.File.new_for_path(path);
            const [, contents] = f.load_contents(null);
            const s = new TextDecoder('utf-8').decode(contents).trim();

            if (s !== 'up')
                return true;
       } catch {
            // If we can't read operstate, be conservative and keep it.
       }

        return false;
   }

    _sampleNet(tsMs) {
        let rxBps = 0;
        let txBps = 0;

        const netlist = new GTop.glibtop_netlist();

        let ifaces;

        try {
            ifaces = GTop.glibtop_get_netlist(netlist);
       } catch {
            ifaces = [];
       }

        for (const iface of ifaces) {
            if (typeof iface !== 'string' || !iface)
                continue;

            const net = new GTop.glibtop_netload();

            try {
                GTop.glibtop_get_netload(net, iface);
            } catch {
                    continue;
            }

            if (this._isIfaceLoopbackOrDown(iface, net))
                continue;

            const rx = Number(net.bytes_in ?? 0);
            const tx = Number(net.bytes_out ?? 0);

            const prev = this._netPrev.get(iface);
            this._netPrev.set(iface, {rx, tx, tsMs});

            if (!prev)
                continue;

            const dt = tsMs - prev.tsMs;

            if (!(dt > 0))
                continue;

            const drx = rx - prev.rx;
            const dtx = tx - prev.tx;

            // Convert bytes/ms -> bytes/s
            const rxRate = (drx > 0 ? drx : 0) * (1000 / dt);
            const txRate = (dtx > 0 ? dtx : 0) * (1000 / dt);

            rxBps += rxRate;
            txBps += txRate;
       }

        // Cleanup: remove interfaces that disappeared from the system
        // (bounded state; keeps Map small)
        if (Array.isArray(ifaces) && ifaces.length) {
            const live = new Set(ifaces.filter(s => typeof s === 'string'));
            for (const key of this._netPrev.keys()) {
                if (!live.has(key))
                    this._netPrev.delete(key);
           }
       }

        return {rxBps, txBps};
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
        if (x < MIN_PERIOD_MS) x = MIN_PERIOD_MS;
        if (x > MAX_PERIOD_MS) x = MAX_PERIOD_MS;
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

// If running as main module, start the backend loop.
if (import.meta.main) {
    runBackend(MetricsBackendApp);
}
