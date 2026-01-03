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


// backEndApp.js
//
// Generic BackendApp base for HtmlWidgetHostWithBackend. Can be subclassed
//
// Wire protocol (newline-delimited JSON on stdin/stdout),
// per htmlWidgetHostWithBackend.js:
//  Inbound:
//   - hello:    {type:'hello', instanceId, widgetId, mode, config}
//   - request:  {type:'request', id, method, params}
//   - event:    {type:'event', name, payload}
//   - shutdown: {type:'shutdown'}
//  Outbound:
//   - response: {type:'response', id, ok, result, error}
//   - event:    {type:'event', name, payload}
//   - log:      {type:'log', level, message}

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';

export const BackendApp = GObject.registerClass(
class BackendApp extends Gio.Application {
    _init(params = {}) {
        super._init({
            application_id: params.applicationId ?? null,
            flags: Gio.ApplicationFlags.NON_UNIQUE,
        });

        this._decoder = new TextDecoder('utf-8');

        // Streams
        this._in = null;   // Gio.DataInputStream (stdin)
        this._out = null;  // Gio.DataOutputStream (stdout)
        this._reading = false;

        // Context from hello
        this._ctx = null; // {instanceId, widgetId, mode, config}

        // Method registry: method -> async (params, ctx) => result
        this._methods = new Map();

        // Signal sources
        this._sigtermSource = 0;
        this._sigintSource = 0;

        // Shutdown guard
        this._shuttingDown = false;
    }

    // -----------------------------------------------------------------
    // Public API for subclasses
    // -----------------------------------------------------------------

    get context() {
        return this._ctx;
    }

    registerMethod(method, handler) {
        if (typeof method !== 'string' || !method)
            throw new Error(
                'BackendApp.registerMethod: method must be a non-empty string'
            );

        if (typeof handler !== 'function')
            throw new Error(
                `BackendApp.registerMethod(${method}): handler must be a
                function`
            );

        this._methods.set(method, handler);
    }

    sendEvent(name, payload = {}) {
        this._send({
            type: 'event',
            name,
            payload: payload || {},
        });
    }

    // level: 'log'|'warn'|'error'|'debug' 
    // (host accepts arbitrary, but keep to these)
    sendLog(level, message) {
        this._send({
            type: 'log',
            level: level || 'log',
            message: String(message ?? ''),
        });
    }

    // Convenience
    log(...args) {
        this.sendLog('log', args.map(a => String(a)).join(' '));
    }

    warn(...args) {
        this.sendLog('warn', args.map(a => String(a)).join(' '));
    }

    error(...args) {
        this.sendLog('error', args.map(a => String(a)).join(' '));
    }

    debug(...args) {
        this.sendLog('debug', args.map(a => String(a)).join(' '));
    }

    // Hook points (override in subclasses)
    // Called after hello is received and context stored.
    // eslint-disable-next-line no-unused-vars
    async onHello(ctx) {}

    // Called for inbound host->backend events (type:'event')
    // eslint-disable-next-line no-unused-vars
    async onHostEvent(name, payload) {}

    // Called when shutdown is requested (message or SIGTERM/SIGINT)
    async onShutdown() {}

    // -----------------------------------------------------------------
    // Gio.Application lifecycle
    // -----------------------------------------------------------------

    vfunc_startup() {
        super.vfunc_startup();

        // stdin (fd 0)
        const stdin = new Gio.UnixInputStream({ fd: 0, close_fd: false });
        this._in = new Gio.DataInputStream({ base_stream: stdin });
       
        // stdout (fd 1)
        const stdout = new Gio.UnixOutputStream({ fd: 1, close_fd: false });
        this._out = new Gio.DataOutputStream({ base_stream: stdout });

        this._installUnixSignalHandlers();

        this._reading = true;

        // Keep process alive even before activation fires.
        this.hold();

        this._readLoop().catch(e => {
            // If parsing/IO blows up, try to log and exit.
            try {
                this.error('backend read loop failed:', e?.message ?? e);
            } catch {}

            this._requestShutdown('readLoopError');
        });
    }

    vfunc_activate() {
        // Keep process alive; IO loop was started in startup().
        this.hold();
        // Headless. Just run the IO loop.
    }

    vfunc_shutdown() {
        // Ensure we stop reading and release streams.
        this._reading = false;

        this._removeUnixSignalHandlers();

        try {
            this._in?.close?.(null);
        } catch {}

        try {
            this._out?.flush?.(null);
        } catch {}

        try {
            this._out?.close?.(null);
        } catch {}

        this._in = null;
        this._out = null;

        super.vfunc_shutdown();
    }

    // -----------------------------------------------------------------
    // Internal: signals + shutdown
    // -----------------------------------------------------------------

    _installUnixSignalHandlers() {
        // Host sends SIGTERM (15) after sending shutdown message,
        // then forcekills.
        // We must handle SIGTERM as a fallback path.
        try {
            this._sigtermSource = GLib.unix_signal_add(
                GLib.PRIORITY_DEFAULT,
                15,
                () => {
                    this._requestShutdown('SIGTERM');
                    return GLib.SOURCE_REMOVE;
                }
            );
        } catch {}

        // Nice-to-have: SIGINT during dev runs.
        try {
            this._sigintSource = GLib.unix_signal_add(
                GLib.PRIORITY_DEFAULT,
                2,
                () => {
                    this._requestShutdown('SIGINT');
                    return GLib.SOURCE_REMOVE;
                }
            );
        } catch {}
    }

    _removeUnixSignalHandlers() {
        if (this._sigtermSource) {
            try { GLib.Source.remove(this._sigtermSource); } catch {}
            this._sigtermSource = 0;
        }
        if (this._sigintSource) {
            try { GLib.Source.remove(this._sigintSource); } catch {}
            this._sigintSource = 0;
        }
    }

    _requestShutdown(reason) {
        if (this._shuttingDown)
            return;
        this._shuttingDown = true;

        // Best effort: run subclass shutdown hook, then quit.
        (async () => {
            try {
                await this.onShutdown();
            } catch (e) {
                try {
                    this.error('onShutdown error:', e?.message ?? e);
                } catch {}
            } finally {
                try {
                    this.quit();
                } catch {}
            }
        })()
        .catch(() => {
            try {
                this.quit();
            } catch {}
        });
    }

    // -----------------------------------------------------------------
    // Internal: JSONL read/write
    // -----------------------------------------------------------------

    async _readLoop() {
        while (this._reading && this._in) {
            let bytes;
            try {
                [bytes] =
                    await this._in.read_line_async(GLib.PRIORITY_DEFAULT, null);
            } catch (e) {
                break;
            }

            if (!bytes)
                break;

            let line;
            try {
                line = this._decoder.decode(bytes);
            } catch {
                continue;
            }

            let msg;
            try {
                msg = JSON.parse(line);
            } catch {
                continue;
            }

            await this._handleMessage(msg);
        }

        // stdin closed or read failed => exit cleanly
        this._requestShutdown('stdinClosed');
    }

    _send(obj) {
        if (!this._out)
            return;

        try {
            this._out.put_string(JSON.stringify(obj) + '\n', null);
            this._out.flush(null);
        } catch {
            // If stdout write fails, we should exit quickly.
            this._requestShutdown('stdoutWriteFailed');
        }
    }

    _sendResponse(id, ok, result, error) {
        const msg = {
            type: 'response',
            id,
            ok: !!ok,
        };

        if (ok) {
            msg.result = result;
        } else {
            msg.error = error ?? { message: 'request failed' };
        }

        this._send(msg);
    }

    // -----------------------------------------------------------------
    // Internal: message dispatch (exact protocol)
    // -----------------------------------------------------------------

    async _handleMessage(msg) {
        if (!msg || typeof msg !== 'object')
            return;

        switch (msg.type) {
        case 'hello': {
            // {type, instanceId, widgetId, mode, config}
            this._ctx = {
                instanceId: msg.instanceId ?? null,
                widgetId: msg.widgetId ?? null,
                mode: msg.mode ?? null,
                config: (msg.config && typeof msg.config === 'object')
                    ? msg.config
                    : {},
            };

            try {
                await this.onHello(this._ctx);
            } catch (e) {
                // No special error channel for hello; log only.
                this.error('onHello error:', e?.message ?? e);
            }
            break;
        }

        case 'shutdown': {
            this._requestShutdown('shutdownMessage');
            break;
        }

        case 'event': {
            // {type:'event', name, payload}
            const name = msg.name;
            const payload = (msg.payload && typeof msg.payload === 'object') 
                ? msg.payload
                : {};

            try {
                await this.onHostEvent(name, payload);
            } catch (e) {
                this.error('onHostEvent error:', e?.message ?? e);
            }

            break;
        }

        case 'request': {
            // {type:'request', id, method, params}
            const id = msg.id;
            const method = msg.method;

            if (id === undefined || id === null)
                break;

            const params = (msg.params && typeof msg.params === 'object')
                ? msg.params
                : {};

            const handler = this._methods.get(method);
            
            if (!handler) {
                this._sendResponse(id, false, null,
                    { message: `Unknown method: ${String(method)}` }
                );
                break;
            }

            try {
                const result = await handler(params, this._ctx);
                this._sendResponse(id, true, result ?? {}, null);
            } catch (e) {
                this._sendResponse(
                    id,
                    false,
                    null,
                    { message: e?.message ? String(e.message) : String(e) }
                );
            }
            break;
        }

        default:
            // Ignore unknown types
            break;
        }
    }
});

// Convenience runner for concrete backends.
// A subclass can do:
//
//   class MyBackend extends BackendApp { ... }
//   runBackend(MyBackend);
//
// This keeps all backends consistent.
export function runBackend(AppClass, argv = ARGV) {
    const app = new AppClass();
    return app.run(argv ?? []);
}
