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
    }

    async _ensureBackend(inst) {
        if (this._backendProc)
            return true;

        const spec = inst?.backendSpec;
        if (!spec?.argv?.length)
            return false;

        try {
            this._backendProc = Gio.Subprocess.new(
                spec.argv,
                Gio.SubprocessFlags.STDIN_PIPE |
                Gio.SubprocessFlags.STDOUT_PIPE |
                Gio.SubprocessFlags.STDERR_PIPE
            );

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

            return true;
        } catch (e) {
            console.error(
                'HtmlWidgetHostWithBackend: failed to start backend:', e
            );

            this._backendProc = null;
            this._backendIn = null;
            this._backendOut = null;
            return false;
        }
    }

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
    }

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
        const { requestId, method, params } = payload || {};

        if (!await this._ensureBackend(inst)) {
            this.postMessage({
                _dingInternal: true,
                type: 'backendReply',
                instanceId: inst.instanceId,
                requestId,
                ok: false,
                error: {code: 'E_NO_BACKEND', message: 'No backend configured'},
            });
            return;
        }

        this._backendPending.set(requestId, { /* mode if you want */ });

        this._sendBackend({
            type: 'request',
            id: requestId,
            method,
            params: params || {},
        });
    }

    backendSend(inst, payload) {
        const { name, payload: data } = payload || {};
        const inst = this._inst;

        this._ensureBackend(inst).then(ok => {
            if (!ok) return;

            this._sendBackend({
                type: 'event',
                name,
                payload: data || {},
            });
        });
    }

    destroy() {
        try {
            if (this._backendIn) {
                // graceful
                this._sendBackend({ type: 'shutdown' });
            }
        } catch {}

        this._backendReading = false;

        try {
            this._backendProc?.force_exit();
        } catch {}

        this._backendProc = null;
        this._backendIn = null;
        this._backendOut = null;

        super.destroy();
    }
};
