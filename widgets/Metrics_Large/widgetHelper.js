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
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/* ding-client.js
 *
 * Thin convenience wrapper for widgets using the injected `window.ding` bridge.
 *
 * This file intentionally hides:
 *  - instanceId plumbing
 *  - requestId generation and reply matching
 *  - async config read-modify-write for partial updates (patchConfig)
 *
 * This file intentionally does not:
 *  - implement alternative transports
 *  - define any UI/framework helpers
 */

export class DingClient {
    constructor({
        mode = null,          // 'widget' or 'prefs' (optional)
        timeoutMs = 10000,
        ding = null,          // override for tests
        windowObj = null,     // override for tests
    } = {}) {
        this._win = windowObj ?? (typeof window !== 'undefined' ? window : null);
        this._ding = ding ?? this._win?.ding ?? null;

        if (!this._ding)
            throw new Error('DingClient: window.ding is not available');

        this._mode = mode;
        this._timeoutMs = timeoutMs;

        this._hostStateHandlers = new Set();
        this._configHandlers = new Set();
        this._backendEventHandlers = new Set();

        this._lastHostState = undefined;
        this._lastConfig = undefined;
        this._lastConfigMeta = undefined;

        // Subscribe via the real injected API.
        this._unsubHostState =
            (typeof this._ding.onHostStateChanged === 'function')
                ? this._ding.onHostStateChanged(this._onHostState.bind(this))
                : null;

        this._unsubConfig =
            (typeof this._ding.onConfigChanged === 'function')
                ? this._ding.onConfigChanged(this._onConfigChanged.bind(this))
                : null;

        this._unsubBackend =
            (typeof this._ding.onBackendEvent === 'function')
                ? this._ding.onBackendEvent(this._onBackendEvent.bind(this))
                : null;

        // If the widget has a backend, send a small hello once ready so
        // lazy backend processes can spin up on first contact.
        this._sendBackendHello();
    }

    destroy() {
        if (this._unsubHostState) { try { this._unsubHostState(); } catch (e) {} this._unsubHostState = null; }
        if (this._unsubConfig)    { try { this._unsubConfig(); } catch (e) {} this._unsubConfig = null; }
        if (this._unsubBackend)   { try { this._unsubBackend(); } catch (e) {} this._unsubBackend = null; }

        this._hostStateHandlers.clear();
        this._configHandlers.clear();
        this._backendEventHandlers.clear();
    }

    // -----------------------------------------------------------------
    // Subscriptions
    // -----------------------------------------------------------------

    onHostState(cb) {
        this._hostStateHandlers.add(cb);
        if (this._lastHostState !== undefined) {
            try { cb(this._lastHostState, null); } catch (e) {}
        }
        return () => this._hostStateHandlers.delete(cb);
    }

    onConfigChanged(cb) {
        this._configHandlers.add(cb);
        if (this._lastConfig !== undefined) {
            try { cb(this._lastConfig, this._lastConfigMeta ?? null); } catch (e) {}
        }
        return () => this._configHandlers.delete(cb);
    }

    onBackendEvent(cb) {
        this._backendEventHandlers.add(cb);
        return () => this._backendEventHandlers.delete(cb);
    }

    // -----------------------------------------------------------------
    // Config
    // -----------------------------------------------------------------

    // getConfig(): Promise<object|null>
    // Config is always retrieved asynchronously.
    getConfig(opts = {}) {
        if (typeof this._ding.getConfig !== 'function')
            return Promise.resolve(null);
        return this._withTimeout(this._ding.getConfig(), opts);
    }

    setConfig(config, opts = {}) {
        if (typeof this._ding.saveConfig !== 'function')
            return Promise.resolve(null);
        // saveConfig is fire-and-forget; keep signature for callers.
        try { this._ding.saveConfig(config || {}); } catch (e) {}
        return Promise.resolve(config || {});
    }

    async patchConfig(patch, opts = {}) {
        const base = (await this.getConfig(opts)) ?? {};
        const next = DingClient._deepMerge(base, patch);
        await this.setConfig(next, opts);
        return next;
    }

    // -----------------------------------------------------------------
    // Backend IPC
    // -----------------------------------------------------------------

    backendRequest(name, payload, opts = {}) {
        if (typeof this._ding.backendRequest !== 'function')
            return Promise.reject(new Error('No backendRequest()'));
        try { console.log('DingClient backendRequest', name, payload); } catch (_e) {}
        // Injected API is backendRequest(method, paramsObject)
        return this._withTimeout(this._ding.backendRequest(name, payload || {}), opts);
    }

    backendSend(name, payload) {
        if (typeof this._ding.backendSend !== 'function')
            return;
        try { this._ding.backendSend(name, payload || {}); } catch (e) {}
    }

    // -----------------------------------------------------------------
    // Logging
    // -----------------------------------------------------------------

    // Prefer host logging if present; otherwise fall back to console.
    log(...args) { this._log('log', args); }
    warn(...args) { this._log('warn', args); }
    error(...args) { this._log('error', args); }

    _log(level, args) {
        if (typeof this._ding.log === 'function') {
            try { this._ding.log(`[${level}] ${args.map(v => String(v)).join(' ')}`); return; } catch (e) {}
        }

        // eslint-disable-next-line no-console
        (level === 'warn' ? console.warn : level === 'error' ? console.error : console.log)(...args);
    }

    _withTimeout(promise, { timeoutMs = null } = {}) {
        const ms = timeoutMs ?? this._timeoutMs;
        if (!ms || ms <= 0)
            return promise;

        const p = Promise.resolve(promise);
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
            p.then(
                (val) => { clearTimeout(timer); resolve(val); },
                (err) => { clearTimeout(timer); reject(err); }
            );
        });
    }

    _onHostState(state) {
        this._lastHostState = state;
        for (const h of this._hostStateHandlers) {
            try { h(state, null); } catch (e) {}
        }
    }

    _onConfigChanged(cfg, meta) {
        this._lastConfig = cfg;
        this._lastConfigMeta = meta ?? null;
        for (const h of this._configHandlers) {
            try { h(cfg, meta ?? null); } catch (e) {}
        }
    }

    _onBackendEvent(name, evPayload) {
        for (const h of this._backendEventHandlers) {
            try { h(name, evPayload); } catch (e) {}
        }
    }

    _sendBackendHello() {
        if (this._backendHelloSent)
            return;
        this._backendHelloSent = true;
        if (typeof this._ding?.backendSend !== 'function')
            return;
        try {
            this._ding.backendSend('hello', { reason: 'widget-ready' });
        } catch (e) {}
    }

    // Merge helper for patchConfig.
    //
    // Rules:
    //  - Plain objects are merged recursively
    //  - Arrays are replaced
    //  - null replaces the destination
    //  - undefined leaves the destination unchanged
    static _deepMerge(base, patch) {
        if (patch === undefined)
            return base;

        if (patch === null)
            return null;

        if (typeof patch !== 'object')
            return patch;

        if (Array.isArray(patch))
            return patch.slice();

        const out = (base && typeof base === 'object' && !Array.isArray(base)) ? { ...base } : {};
        for (const k of Object.keys(patch)) {
            out[k] = DingClient._deepMerge(out[k], patch[k]);
        }
        return out;
    }
}

// Convenience factory.
export function dingClient(opts = {}) {
    return new DingClient(opts);
}
