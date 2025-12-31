/* DING: Desktop Icons New Generation for GNOME Shell
 *
 * Gtk4 Port Copyright (C) 2022 - 2025 Sundeep Mediratta (smedius@gmail.com)
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

import {Gio, GLib} from '../dependencies/gi.js';
import {HtmlWidgetHost} from '../dependencies/localFiles.js';

export {HtmlWidgetHostWithBackend};

const HtmlWidgetHostWithBackend = class extends HtmlWidgetHost {
    constructor(params) {
        super(params);
        this._backendProc = null;
        this._backendIn = null;
        this._backendOut = null;
        this._backendReading = false;
        this._backendPending = new Map();
        this._decoder = new TextDecoder('utf-8');
        this._pendingBackendRequests = [];
        this._pendingBackendEvents = [];
        this._backendEnsurePromise = null;
    }

    async _ensureBackend(inst) {
        if (!inst || this._destroyed)
            return false;

        if (this._backendProc)
            return true;

        if (this._backendEnsurePromise)
            return this._backendEnsurePromise;

        const ensurePromise = this._startBackend(inst);

        this._backendEnsurePromise = ensurePromise;

        let result;
        try {
            result = await ensurePromise;
        } finally {
            if (this._backendEnsurePromise === ensurePromise)
                this._backendEnsurePromise = null;
        }

        if (result?.ok) {
            this._flushPendingBackendRequests();
            this._flushPendingBackendEvents();
            return true;
        }

        this._failPendingBackendRequests(
            inst,
            result?.error ?? {
                code: 'E_NO_BACKEND',
                message: 'No backend configured',
            }
        );
        return false;
    }

    async _buildBackendSpec(inst) {
        if (!inst)
            return null;

        if (inst.backendSpec)
            return inst.backendSpec;

        if (!this._widgetRegistry)
            return null;

        let desc = null;
        try {
            desc = await this._widgetRegistry.getDescriptor(inst.widgetId);
        } catch (e) {
            console.error(
                'HtmlWidgetHostWithBackend: failed to fetch descriptor:',
                e
            );
            return null;
        }

        if (!desc)
            return null;

        const spec =
            this._widgetRegistry.normalizeBackendSpec(desc, inst);

        inst.backendSpec = spec || null;
        return spec;
    }

    async _startBackend(inst) {
        let spec = inst?.backendSpec;
        if (!spec)
            spec = await this._buildBackendSpec(inst);

        if (!spec?.argv?.length) {
            return {
                ok: false,
                error: {code: 'E_NO_BACKEND', message: 'No backend configured'},
            };
        }

        try {
            const launcher = new Gio.SubprocessLauncher({
                flags: Gio.SubprocessFlags.STDIN_PIPE |
                    Gio.SubprocessFlags.STDOUT_PIPE |
                    Gio.SubprocessFlags.STDERR_PIPE,
            });

            if (spec.cwd)
                launcher.set_cwd(spec.cwd);

            if (spec.env) {
                for (const [key, value] of Object.entries(spec.env)) {
                    if (typeof key !== 'string')
                        continue;
                    launcher.setenv(key, String(value ?? ''), true);
                }
            }

            this._backendProc = launcher.spawnv(spec.argv);

            this._backendIn = new Gio.DataOutputStream({
                base_stream: this._backendProc.get_stdin_pipe(),
            });

            this._backendOut = new Gio.DataInputStream({
                base_stream: this._backendProc.get_stdout_pipe(),
            });

            this._backendReading = true;
            this._readBackendLoop(inst);

            this._sendBackend({
                type: 'hello',
                instanceId: inst.instanceId,
                widgetId: inst.widgetId,
                mode: 'widget',
                config: inst.config || {},
            });

            return {ok: true};
        } catch (e) {
            console.error(
                'HtmlWidgetHostWithBackend: failed to start backend:', e
            );

            this._handleBackendExit(inst, {
                code: 'E_BACKEND_START',
                message: e?.message ?? 'Failed to start backend',
            });

            return {
                ok: false,
                error: {
                    code: 'E_BACKEND_START',
                    message: e?.message ?? 'Failed to start backend',
                },
            };
        }
    }

    // Backend expects newline-delimited JSON objects. Known outbound shapes:
    //  - hello:  {type, instanceId, widgetId, mode, config}
    //  - request {type, id, method, params}
    _sendBackend(obj) {
        if (!this._backendIn)
            return;

        try {
            this._backendIn.put_string(JSON.stringify(obj) + '\n', null);
            this._backendIn.flush(null);
        } catch (e) {
            console.error(
                'HtmlWidgetHostWithBackend: write backend failed:', e
            );
        }
    }

    async _readBackendLoop(inst) {
        // Monitor backend lifetime via stdout: when the pipe closes (crash or
        // normal exit), read_line_async will break and we can clean up +
        // fail inflight requests immediately without wiring a second
        // Gio.Subprocess child watch. This keeps behavior simple and matches
        // common Gio subprocess patterns; we can add a child watch later if we
        // need the exact exit status.
        while (this._backendReading && this._backendOut) {
            let line;

            try {
                const [bytes] = await this._backendOut.read_line_async(
                    GLib.PRIORITY_DEFAULT,
                    null
                );
                
                if (!bytes)
                    break;

                line = this._decoder.decode(bytes);
            } catch (e) {
                break;
            }

            let msg;
            try {
                msg = JSON.parse(line);
            } catch (e) {
                continue;
            }

            this._handleBackendMessage(inst, msg);
        }

        this._backendReading = false;
        this._handleBackendExit(inst, {
            code: 'E_BACKEND_EXIT',
            message: 'Backend process exited',
        });
    }

    _flushPendingBackendRequests() {
        if (!this._pendingBackendRequests.length)
            return;

        for (const entry of this._pendingBackendRequests)
            this._dispatchBackendRequest(entry.payload);

        this._pendingBackendRequests.length = 0;
    }

    _flushPendingBackendEvents() {
        if (!this._pendingBackendEvents.length)
            return;

        for (const entry of this._pendingBackendEvents) {
            this._sendBackend({
                type: 'event',
                name: entry.name,
                payload: entry.payload || {},
            });
        }

        this._pendingBackendEvents.length = 0;
    }

    _handleBackendExit(inst, error) {
        this._backendReading = false;

        this._backendProc = null;
        this._backendIn = null;
        this._backendOut = null;

        if (this._destroyed)
            return;

        this._failInFlightBackendRequests(inst, error);
    }

    _failPendingBackendRequests(inst, error) {
        if (!this._pendingBackendRequests.length || this._destroyed) {
            this._pendingBackendRequests.length = 0;
            return;
        }

        const err = error || {
            code: 'E_BACKEND_FAILURE',
            message: 'Backend unavailable',
        };

        for (const entry of this._pendingBackendRequests) {
            const instanceId = entry.instanceId ?? inst?.instanceId;
            const requestId = entry.payload?.requestId;
            if (!instanceId || !requestId)
                continue;

            this.postMessage({
                _dingInternal: true,
                type: 'backendReply',
                instanceId,
                requestId,
                ok: false,
                error: err,
            });
        }

        this._pendingBackendRequests.length = 0;
    }

    _failInFlightBackendRequests(inst, error) {
        if (!this._backendPending.size || this._destroyed) {
            this._backendPending.clear();
            return;
        }

        const err = error || {
            code: 'E_BACKEND_FAILURE',
            message: 'Backend unavailable',
        };

        const instanceId = inst?.instanceId;
        if (!instanceId) {
            this._backendPending.clear();
            return;
        }

        for (const requestId of this._backendPending.keys()) {
            this.postMessage({
                _dingInternal: true,
                type: 'backendReply',
                instanceId,
                requestId,
                ok: false,
                error: err,
            });
        }

        this._backendPending.clear();
    }

    _dispatchBackendRequest(payload) {
        if (!payload || !this._backendProc || this._destroyed)
            return;

        const { requestId, method, params } = payload;
        if (!requestId)
            return;

        this._backendPending.set(requestId, {method});

        this._sendBackend({
            type: 'request',
            id: requestId,
            method,
            params: params || {},
        });
    }

    // Inbound JSON objects are expected to be of type response, event or log.
    //  - response: {type, id, ok, result, error}
    //  - event:    {type, name, payload}
    //  - log:      {type, level, message}
    // with author-defined 'name' and custom JSON 'payload'

    _handleBackendMessage(inst, msg) {
        if (!msg || typeof msg !== 'object')
            return;

        switch (msg.type) {
        case 'response': {
            const requestId = msg.id;
            this._backendPending.delete(requestId);

            this.postMessage({
                _dingInternal: true,
                type: 'backendReply',
                instanceId: inst.instanceId,
                requestId,
                ok: !!msg.ok,
                result: msg.result,
                error: msg.error,
            });
            break;
        }

        case 'event': {
            this.postMessage({
                _dingInternal: true,
                type: 'backendEvent',
                instanceId: inst.instanceId,
                name: msg.name,
                payload: msg.payload,
            });
            break;
        }

        case 'log': {
            const level = msg.level || 'log';
            const text = msg.message || '';
            console.log(`HtmlWidget backend ${level}:`, inst.instanceId, text);
            break;
        }

        default:
            break;
        }
    }

    async backendRequest(inst, payload) {
        if (!inst || !payload || this._destroyed)
            return;

        if (this._backendProc) {
            this._dispatchBackendRequest(payload);
            return;
        }

        this._pendingBackendRequests.push({
            instanceId: inst.instanceId,
            payload,
        });

        await this._ensureBackend(inst);
    }

    backendSend(inst, payload) {
        if (!inst || !payload || this._destroyed)
            return;

        const { name, payload: data } = payload || {};
        if (this._backendProc) {
            this._sendBackend({
                type: 'event',
                name,
                payload: data || {},
            });
            return;
        }

        this._pendingBackendEvents.push({
            name,
            payload: data || {},
        });

        this._ensureBackend(inst);
    }

    destroy() {
        try {
            if (this._backendIn) {
                this._sendBackend({ type: 'shutdown' });
            }
        } catch {}

        this._backendReading = false;

        try {
            this._backendProc?.send_signal?.(15);
        } catch {}

        try {
            this._backendProc?.force_exit();
        } catch {}

        this._backendProc = null;
        this._backendIn = null;
        this._backendOut = null;
        this._pendingBackendRequests.length = 0;
        this._pendingBackendEvents.length = 0;
        this._backendEnsurePromise = null;

        super.destroy();
    }
};
