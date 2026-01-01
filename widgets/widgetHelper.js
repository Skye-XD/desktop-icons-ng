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

        if (typeof this._ding.onMessage !== 'function')
            throw new Error('DingClient: window.ding.onMessage is required');

        this._mode = mode;
        this._timeoutMs = timeoutMs;

        this._nextId = 1;
        this._pending = new Map(); // requestId -> { resolve, reject, timeout }

        this._hostStateHandlers = new Set();
        this._configHandlers = new Set();
        this._backendEventHandlers = new Set();

        this._unsubscribe = this._ding.onMessage(this._onMessage.bind(this));
    }

    destroy() {
        if (this._unsubscribe) {
            try { this._unsubscribe(); } catch (e) {}
            this._unsubscribe = null;
        }

        for (const [, p] of this._pending) {
            clearTimeout(p.timeout);
            try { p.reject(new Error('DingClient destroyed')); } catch (e) {}
        }
        this._pending.clear();

        this._hostStateHandlers.clear();
        this._configHandlers.clear();
        this._backendEventHandlers.clear();
    }

    // -----------------------------------------------------------------
    // Subscriptions
    // -----------------------------------------------------------------

    onHostState(cb) {
        this._hostStateHandlers.add(cb);
        return () => this._hostStateHandlers.delete(cb);
    }

    onConfigChanged(cb) {
        this._configHandlers.add(cb);
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
        return this._request('getConfig', {}, opts);
    }

    setConfig(config, opts = {}) {
        return this._request('setConfig', { config }, opts);
    }

    async patchConfig(patch, opts = {}) {
        const base = (await this.getConfig(opts)) ?? {};
        const next = this._deepMerge(base, patch);
        await this.setConfig(next, opts);
        return next;
    }

    // -----------------------------------------------------------------
    // Backend IPC
    // -----------------------------------------------------------------

    backendRequest(name, payload, opts = {}) {
        return this._request('backendRequest', { name, payload }, opts);
    }

    backendSend(name, payload) {
        this._send('backendSend', { name, payload });
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
            try { this._ding.log(level, ...args); return; } catch (e) {}
        }

        if (typeof this._ding.postMessage === 'function' || typeof this._ding._postMessage === 'function') {
            try {
                this._send('log', { level, args: args.map(v => String(v)) });
                return;
            } catch (e) {}
        }

        // eslint-disable-next-line no-console
        (level === 'warn' ? console.warn : level === 'error' ? console.error : console.log)(...args);
    }

    // -----------------------------------------------------------------
    // Internals
    // -----------------------------------------------------------------

    _mkRequestId() {
        return String(this._nextId++);
    }

    _send(type, payload) {
        const msg = { type, ...(payload ?? {}) };

        // Instance routing is implicit in the host; do not require authors to pass it.
        // If the host exposes it for debugging, include it when present.
        if (this._ding.instanceId != null && msg.instanceId == null)
            msg.instanceId = this._ding.instanceId;

        if (this._mode != null && msg.mode == null)
            msg.mode = this._mode;

        if (typeof this._ding.postMessage === 'function') {
            this._ding.postMessage(msg);
            return;
        }

        if (typeof this._ding._postMessage === 'function') {
            this._ding._postMessage(msg);
            return;
        }

        throw new Error('DingClient: window.ding has no postMessage/_postMessage');
    }

    _request(type, payload, { timeoutMs = null } = {}) {
        const requestId = this._mkRequestId();
        const ms = timeoutMs ?? this._timeoutMs;

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this._pending.delete(requestId);
                reject(new Error(`${type} timed out after ${ms}ms`));
            }, ms);

            this._pending.set(requestId, { resolve, reject, timeout });
            this._send(type, { ...(payload ?? {}), requestId });
        });
    }

    _onMessage(payload) {
        if (!payload || typeof payload !== 'object')
            return;

        const { type } = payload;

        if (type === 'backendEvent') {
            const { name, payload: evPayload } = payload;
            for (const h of this._backendEventHandlers) {
                try { h(name, evPayload); } catch (e) {}
            }
            return;
        }

        if (type === 'hostState') {
            const state = payload.state ?? payload.hostState ?? null;
            for (const h of this._hostStateHandlers) {
                try { h(state, payload.meta ?? null); } catch (e) {}
            }
            return;
        }

        if (type === 'configChanged') {
            const cfg = payload.config ?? payload.value ?? null;
            for (const h of this._configHandlers) {
                try { h(cfg, payload.meta ?? null); } catch (e) {}
            }
            return;
        }

        if (payload.requestId != null)
            this._resolveRequest(payload);
    }

    _resolveRequest(payload) {
        const { requestId } = payload;
        const p = this._pending.get(requestId);
        if (!p)
            return;

        clearTimeout(p.timeout);
        this._pending.delete(requestId);

        if (payload.ok === false || payload.error) {
            const err = new Error(payload.error?.message ?? payload.error ?? 'request failed');
            err.code = payload.error?.code ?? payload.code;
            p.reject(err);
            return;
        }

        p.resolve(payload.result ?? payload.value ?? payload);
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
