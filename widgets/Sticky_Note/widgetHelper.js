/* eslint-disable no-restricted-globals */
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
 *
 * Common widget-author conveniences exposed here include:
 *  - host state accessors: getHostState(), isPinned(), isPinnable(),
 *    isSelected(), isEditMode(), isWidgetEditMode()
 *  - draggable regions: setDraggable(target, options), clearDraggable()
 *  - pinned-window helpers: beginPinnedWindowMove(event),
 *    attachPinnedMoveHandle(element, options),
 *    bindPinnedHoverChrome(element, options)
 *  - host actions: createWidget(widgetId, options), removeWidget()
 *
 * createWidget(widgetId) inherits pinned state from the source instance
 * by default. Pass {inheritPinned: false} or {initialPinned: ...} to
 * override that behavior.
 *
 * Reload safety:
 *  - Widgets can be recreated when the host reparents them between layers.
 *  - Do not keep important UI state only in JS memory.
 *  - Persist any state that must survive reload in config or other durable
 *    storage, then rebuild local UI from host state + config after load.
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
            typeof this._ding.onHostStateChanged === 'function'
                ? this._ding.onHostStateChanged(this._onHostState.bind(this))
                : null;

        this._unsubConfig =
            typeof this._ding.onConfigChanged === 'function'
                ? this._ding.onConfigChanged(this._onConfigChanged.bind(this))
                : null;

        this._unsubBackend =
            typeof this._ding.onBackendEvent === 'function'
                ? this._ding.onBackendEvent(this._onBackendEvent.bind(this))
                : null;

        // If the widget has a backend, send a small hello once ready so
        // lazy backend processes can spin up on first contact.
        this._sendBackendHello();
    }

    destroy() {
        // Host-side cleanup already clears regions on reload/destroy.
        // This is an extra best-effort precaution during widget teardown.
        try {
            this.clearDraggable();
        } catch (e) {}

        if (this._unsubHostState) {
            try {
                this._unsubHostState();
            } catch (e) {}
            this._unsubHostState = null;
        }
        if (this._unsubConfig)    {
            try {
                this._unsubConfig();
            } catch (e) {}
            this._unsubConfig = null;
        }
        if (this._unsubBackend)   {
            try {
                this._unsubBackend();
            } catch (e) {}
            this._unsubBackend = null;
        }

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
            try {
                cb(this._lastHostState, null);
            } catch (e) {}
        }

        return () => this._hostStateHandlers.delete(cb);
    }

    // Snapshot of the latest merged host state, or null if none has arrived
    // yet. This is the authoritative host view for the current instance.
    getHostState() {
        return this._lastHostState ? {...this._lastHostState} : null;
    }

    // Convenience booleans for commonly queried host state.
    // Note: isEditMode() means the host widget layer is raised. It does not
    // mean your widget's own editor or local edit UI is open.
    isPinned() {
        return !!this._lastHostState?.pinned;
    }

    isPinnable() {
        return !!this._lastHostState?.pinnable;
    }

    isSelected() {
        return !!this._lastHostState?.selected;
    }

    isEditMode() {
        return !!this._lastHostState?.editMode;
    }

    isWidgetEditMode() {
        return !!this._lastHostState?.widgetEditMode;
    }

    onConfigChanged(cb) {
        this._configHandlers.add(cb);
        if (this._lastConfig !== undefined) {
            try {
                cb(this._lastConfig, this._lastConfigMeta ?? null);
            } catch (e) {}
        }

        return () => this._configHandlers.delete(cb);
    }

    onBackendEvent(cb) {
        this._backendEventHandlers.add(cb);
        return () => this._backendEventHandlers.delete(cb);
    }

    onVisibilityChange(cb) {
        const doc = this._win?.document ?? null;
        if (!doc)
            return () => {};

        const handler = () => {
            try {
                cb(!doc.hidden);
            } catch (e) {}
        };

        doc.addEventListener('visibilitychange', handler);
        return () => doc.removeEventListener('visibilitychange', handler);
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

    setConfig(config, _opts = {}) {
        if (typeof this._ding.saveConfig !== 'function')
            return Promise.resolve(null);
        // saveConfig is fire-and-forget; keep signature for callers.
        try {
            this._ding.saveConfig(config || {});
        } catch (e) {}
        return Promise.resolve(config || {});
    }

    async patchConfig(patch, opts = {}) {
        const base = await this.getConfig(opts) ?? {};
        const next = DingClient._deepMerge(base, patch);
        await this.setConfig(next, opts);
        return next;
    }

    setPinned(pinned) {
        if (typeof this._ding.setPinned !== 'function')
            return;

        try {
            // Pinning can move an HTML widget between host containers. Persist
            // meaningful state outside transient page memory. The host still
            // validates whether the current instance is actually pinnable.
            this._ding.setPinned(!!pinned);
        } catch (e) {}
    }

    beginPinnedEdit(editing = true) {
        if (typeof this._ding.beginPinnedEdit !== 'function')
            return;

        try {
            this._ding.beginPinnedEdit(!!editing);
        } catch (e) {}
    }

    beginPinnedWindowMove(event = null) {
        if (typeof this._ding.beginPinnedWindowMove !== 'function')
            return;

        try {
            this._ding.beginPinnedWindowMove({
                x: Number(event?.clientX) || 0,
                y: Number(event?.clientY) || 0,
                button: Number(event?.button) + 1 || 1,
                timestamp: Math.round(Number(event?.timeStamp) || 0),
            });
        } catch (e) {}
    }

    // Publish draggable regions for the current widget instance.
    //
    // Inputs:
    //  - selector string
    //  - Element
    //  - array-like or iterable collection of Elements or rect-like objects
    //  - rect-like object: {x, y, width, height}
    //
    // The helper computes the current regions once and pushes a full
    // replacement list to the host. Call it again only when the region set
    // actually changes.
    //
    // Preferred forms:
    //  - best: pass an Element directly
    //  - next best: a narrow #id selector
    //  - avoid broad descendant selectors unless necessary because they
    //    scan more of the DOM and can match more nodes than needed
    setDraggable(target, options = {}) {
        const regions = this._collectDraggableRegions(target);
        const excluded = this._collectDraggableRegions(options.exclude);
        const draggableRegions = this._subtractDraggableRegions(
            regions,
            excluded
        );
        this._postDraggableRegions(draggableRegions);
    }

    clearDraggable() {
        this._postDraggableRegions([]);
    }

    // Makes an element act as a pinned-window drag handle.
    // By default it is active only while the widget is pinned.
    // Use this when your widget suppresses host move chrome and needs to own
    // its own temporary drag affordance.
    attachPinnedMoveHandle(element, opts = {}) {
        if (!element?.addEventListener)
            return () => {};

        const allowWhen = typeof opts.allowWhen === 'function'
            ? opts.allowWhen
            : () => this.isPinned();
        const ignoreSelector = typeof opts.ignoreSelector === 'string'
            ? opts.ignoreSelector
            : '';
        const eventName = opts.eventName || 'mousedown';

        const handler = event => {
            if (!allowWhen(event))
                return;

            if (ignoreSelector && event.target?.closest?.(ignoreSelector))
                return;

            event.preventDefault();
            this.beginPinnedWindowMove(event);
        };

        element.addEventListener(eventName, handler);
        return () => element.removeEventListener(eventName, handler);
    }

    // Adds/removes a hover class with a small hide delay for pinned chrome.
    // This is useful for widgets that manage their own pinned controls.
    bindPinnedHoverChrome(element, {
        hoverClass = 'widget-hovered',
        hideDelayMs = 600,
        onlyWhen = () => this.isPinned(),
    } = {}) {
        if (!element?.addEventListener)
            return () => {};

        let hideTimer = 0;

        const clearHideTimer = () => {
            if (!hideTimer)
                return;

            clearTimeout(hideTimer);
            hideTimer = 0;
        };

        const show = () => {
            clearHideTimer();
            element.classList.add(hoverClass);
        };

        const hide = () => {
            clearHideTimer();
            hideTimer = setTimeout(() => {
                hideTimer = 0;
                if (!onlyWhen())
                    return;
                element.classList.remove(hoverClass);
            }, hideDelayMs);
        };

        const resetIfInactive = () => {
            if (onlyWhen())
                return;
            clearHideTimer();
            element.classList.remove(hoverClass);
        };

        element.addEventListener('mouseenter', show);
        element.addEventListener('mouseleave', hide);
        const unsubscribeHost = this.onHostState(resetIfInactive);

        return () => {
            clearHideTimer();
            element.removeEventListener('mouseenter', show);
            element.removeEventListener('mouseleave', hide);
            unsubscribeHost?.();
        };
    }

    // Creates another instance of the same widget type or a compatible
    // widget ID, inheriting pinned state unless overridden.
    createWidget(widgetId, opts = {}) {
        return this._postHostMessage('createWidget', {
            widgetId,
            inheritPinned:
                typeof opts.inheritPinned === 'boolean'
                    ? opts.inheritPinned
                    : true,
            initialPinned: opts.initialPinned,
        });
    }

    // Removes the current widget instance through the host.
    removeWidget() {
        return this._postHostMessage('removeWidget');
    }

    // -----------------------------------------------------------------
    // Backend IPC
    // -----------------------------------------------------------------

    backendRequest(name, payload, opts = {}) {
        if (typeof this._ding.backendRequest !== 'function')
            return Promise.reject(new Error('No backendRequest()'));
        // Injected API is backendRequest(method, paramsObject)
        return this._withTimeout(this._ding.backendRequest(name, payload || {}), opts);
    }

    backendSend(name, payload) {
        if (typeof this._ding.backendSend !== 'function')
            return;
        try {
            this._ding.backendSend(name, payload || {});
        } catch (e) {}
    }

    // -----------------------------------------------------------------
    // Logging
    // -----------------------------------------------------------------

    // Prefer host logging if present; otherwise fall back to console.
    log(...args) {
        this._log('log', args);
    }

    warn(...args) {
        this._log('warn', args);
    }

    error(...args) {
        this._log('error', args);
    }

    _log(level, args) {
        if (typeof this._ding.log === 'function') {
            try {
                this._ding.log(`[${level}] ${args.map(v => String(v)).join(' ')}`);
                return;
            } catch (e) {}
        }

        // eslint-disable-next-line no-console
        const logFn = {
            warn: console.warn,
            error: console.error,
        }[level] || console.log;
        logFn(...args);
    }

    _withTimeout(promise, {timeoutMs = null} = {}) {
        const ms = timeoutMs ?? this._timeoutMs;
        if (!ms || ms <= 0)
            return promise;

        const p = Promise.resolve(promise);
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
            p.then(
                val => {
                    clearTimeout(timer);
                    resolve(val);
                },
                err => {
                    clearTimeout(timer);
                    reject(err);
                }
            );
        });
    }

    _onHostState(state) {
        this._lastHostState = state;
        for (const h of this._hostStateHandlers) {
            try {
                h(state, null);
            } catch (e) {}
        }
    }

    _onConfigChanged(cfg, meta) {
        this._lastConfig = cfg;
        this._lastConfigMeta = meta ?? null;
        for (const h of this._configHandlers) {
            try {
                h(cfg, meta ?? null);
            } catch (e) {}
        }
    }

    _onBackendEvent(name, evPayload) {
        for (const h of this._backendEventHandlers) {
            try {
                h(name, evPayload);
            } catch (e) {}
        }
    }

    _sendBackendHello() {
        if (this._backendHelloSent)
            return;
        this._backendHelloSent = true;
        if (typeof this._ding?.backendSend !== 'function')
            return;
        try {
            this._ding.backendSend('hello', {reason: 'widget-ready'});
        } catch (e) {}
    }

    _normalizeRectLike(value) {
        if (!value || typeof value !== 'object')
            return null;

        const x = Number(value.x);
        const y = Number(value.y);
        const width = Number(value.width);
        const height = Number(value.height);

        if (!Number.isFinite(x) ||
            !Number.isFinite(y) ||
            !Number.isFinite(width) ||
            !Number.isFinite(height) ||
            width <= 0 ||
            height <= 0)
            return null;

        return {x, y, width, height};
    }

    _collectDraggableRegions(target) {
        if (target === null || target === undefined || target === false)
            return [];

        const doc = this._win?.document ?? null;
        const regions = [];
        const seen = new Set();
        this._visitDraggableTarget(target, doc, regions, seen);
        return regions;
    }

    _subtractDraggableRegions(regions, excluded) {
        let remaining = regions.map(region => ({...region}));

        for (const cut of excluded) {
            const next = [];
            for (const region of remaining) {
                const left = Math.max(region.x, cut.x);
                const top = Math.max(region.y, cut.y);
                const right = Math.min(
                    region.x + region.width,
                    cut.x + cut.width
                );
                const bottom = Math.min(
                    region.y + region.height,
                    cut.y + cut.height
                );

                if (left >= right || top >= bottom) {
                    next.push(region);
                    continue;
                }

                if (top > region.y) {
                    next.push({
                        x: region.x,
                        y: region.y,
                        width: region.width,
                        height: top - region.y,
                    });
                }
                if (bottom < region.y + region.height) {
                    next.push({
                        x: region.x,
                        y: bottom,
                        width: region.width,
                        height: region.y + region.height - bottom,
                    });
                }
                if (left > region.x) {
                    next.push({
                        x: region.x,
                        y: top,
                        width: left - region.x,
                        height: bottom - top,
                    });
                }
                if (right < region.x + region.width) {
                    next.push({
                        x: right,
                        y: top,
                        width: region.x + region.width - right,
                        height: bottom - top,
                    });
                }
            }
            remaining = next;
        }

        return remaining;
    }

    _visitDraggableTarget(value, doc, regions, seen) {
        // Ignore empty inputs.
        if (value === null || value === undefined || value === false)
            return;

        // CSS selector string: resolve matching elements.
        if (typeof value === 'string') {
            const selector = value.trim();
            if (!selector || !doc)
                return;

            try {
                for (const element of doc.querySelectorAll(selector))
                    this._collectElementRegions(element, regions, seen);
            } catch (_e) {}
            return;
        }

        const normalized = this._normalizeRectLike(value);
        // Rect-like object: use it directly.
        if (normalized) {
            this._appendDraggableRegion(regions, seen, normalized);
            return;
        }

        // DOM element: measure its rendered client rects.
        if (value?.nodeType === 1 &&
            typeof value.getClientRects === 'function') {
            this._collectElementRegions(value, regions, seen);
            return;
        }

        // Array-like collection: recurse into each entry.
        if (typeof value?.length === 'number' && typeof value !== 'function') {
            for (const item of Array.from(value))
                this._visitDraggableTarget(item, doc, regions, seen);
            return;
        }

        // Iterable collection: recurse into each entry.
        if (typeof value?.[Symbol.iterator] === 'function' &&
            typeof value !== 'string') {
            for (const item of value)
                this._visitDraggableTarget(item, doc, regions, seen);
        }
    }

    _collectElementRegions(element, regions, seen) {
        if (!element)
            return;

        // Rect-like object already passed through as an element-like value.
        const normalized = this._normalizeRectLike(element);
        if (normalized) {
            this._appendDraggableRegion(regions, seen, normalized);
            return;
        }

        // DOM element: use rendered client rects.
        if (element?.nodeType !== 1 ||
            typeof element.getClientRects !== 'function')
            return;

        let rects = [];
        try {
            rects = Array.from(element.getClientRects?.() ?? []);
        } catch (_e) {}

        if (!rects.length) {
            try {
                rects = [element.getBoundingClientRect?.()];
            } catch (_e) {
                rects = [];
            }
        }

        for (const rect of rects)
            this._appendDraggableRegion(regions, seen, rect);
    }

    _appendDraggableRegion(regions, seen, normalized) {
        normalized = this._normalizeRectLike(normalized);
        if (!normalized)
            return;

        const key =
            `${normalized.x}|${normalized.y}|${normalized.width}|${normalized.height}`;
        if (seen.has(key))
            return;

        seen.add(key);
        regions.push(normalized);
    }

    _postDraggableRegions(regions) {
        const api = this._ding;
        if (!api || typeof api.setDraggableRegions !== 'function')
            return;

        try {
            api.setDraggableRegions(Array.isArray(regions) ? regions : []);
        } catch (e) {
            this.warn('Draggable regions update failed', e?.message ?? e);
        }
    }

    _postHostMessage(type, extra = {}) {
        const api = this._ding;
        if (!api || typeof api.post !== 'function')
            return false;

        const instanceId =
            typeof api.getInstanceId === 'function'
                ? api.getInstanceId()
                : api.instanceId;

        try {
            api.post({
                type,
                instanceId,
                ...extra,
            });
            return true;
        } catch (e) {
            this.warn('Host message failed', type, e?.message ?? e);
            return false;
        }
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

        const out = base && typeof base === 'object' && !Array.isArray(base) ? {...base} : {};
        for (const k of Object.keys(patch))
            out[k] = DingClient._deepMerge(out[k], patch[k]);

        return out;
    }
}

// Convenience factory.
/**
 *
 * @param {object} opts Options passed to DingClient constructor
 * @returns {DingClient}
 */
export function dingClient(opts = {}) {
    return new DingClient(opts);
}
