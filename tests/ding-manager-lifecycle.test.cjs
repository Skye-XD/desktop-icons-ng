/* eslint-env node */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');

function fixture(startingUp = false) {
    let nextId = 1;
    const sources = new Map();
    const signals = new Map();
    const events = [];
    const clients = [];
    let launchCalls = 0;
    let resolveCleanup;
    const cleanup = new Promise(resolve => {
        resolveCleanup = resolve;
    });
    const finishCleanup = async () => {
        resolveCleanup();
        // Let enable()'s catch/finally chain finish before driving GLib sources.
        await new Promise(resolve => setImmediate(resolve));
    };
    const runSource = id => {
        const callback = sources.get(id);
        assert.equal(typeof callback, 'function', 'run a live GLib source');
        const keep = callback();
        assert.equal(typeof keep, 'boolean', 'return a GLib source disposition');
        if (!keep)
            sources.delete(id);
    };
    const connect = (_name, callback) => {
        const id = nextId++;
        signals.set(id, callback);
        return id;
    };
    const disconnect = id => {
        assert.ok(signals.delete(id), 'disconnect a live signal');
    };
    class Resource {
        enable() {
            this.enableCount = (this.enableCount ?? 0) + 1;
        }
        disable() {
            assert.equal(sources.size, 0);
            assert.equal(signals.size, 0);
            assert.equal(this.disabled, undefined, 'disable each resource once');
            this.disabled = true;
            events.push('disabled');
        }

        connect(...args) {
            return connect(...args);
        }

        disconnect(id) {
            assert.equal(this.disabled, undefined);
            disconnect(id);
        }

        set_wayland_client() {}
        setRemoteActionGroup() {}
    }
    const source = fs.readFileSync(path.join(__dirname, '..', 'dingManager.js'), 'utf8');
    const code = source.slice(source.indexOf('const DingManager = class'), source.indexOf('var LaunchSubprocess'));
    const layoutManager = {_startingUp: startingUp, connect, disconnect};
    const Manager = vm.runInNewContext(`${code}\nDingManager`, {
        LaunchSubprocess: class {
            constructor() {
                clients.push(this);
                this.cancelCount = 0;
                this.sentSignals = [];
                this.cancellable = {cancel: () => this.cancelCount++};
                this.subprocess = {
                    send_signal: signal => this.sentSignals.push(signal),
                    get_if_exited: () => true,
                    get_exit_status: () => 0,
                };
                this.promise = new Promise((resolve, reject) => {
                    this.resolve = () => resolve(this.subprocess);
                    this.reject = () => {
                        const error = new Error('failed');
                        error.matches = () => false;
                        reject(error);
                    };
                });
            }

            set_cwd() {}
            spawnv() {
                return this.promise;
            }
        },
        GnomeShellVersion: 51, appID: 'test', appPath: '/test',
        Main: {layoutManager},
        Meta: {is_wayland_compositor: () => true},
        GLib: {
            SOURCE_CONTINUE: true,
            SOURCE_REMOVE: false,
            build_filenamev: parts => parts.join('/'),
            get_home_dir: () => '/tmp',
            get_monotonic_time: () => 0,
            timeout_add: (_priority, _delay, callback) => {
                const id = nextId++;
                sources.set(id, callback);
                return id;
            },
            idle_add: (_priority, callback) => {
                const id = nextId++;
                sources.set(id, callback);
                return id;
            },
            source_remove: id => assert.ok(sources.delete(id)),
        },
        Gio: {
            IOErrorEnum: {CANCELLED: 1},
            DBus: {session: {
                signal_subscribe: (...args) => connect(args[2], args[6]),
                signal_unsubscribe: disconnect,
            }},
            DBusSignalFlags: {NONE: 0},
            DBusActionGroup: {get: () => ({})},
        },
        St: {ThemeContext: {get_for_stage: () => ({connect, disconnect})}},
        global: {display: {connect, disconnect}},
        GnomeShellOverride: {GnomeShellOverride: Resource},
        WindowTypeManager: {WindowTypeManager: Resource},
        VisibleArea: {VisibleArea: Resource},
        ShortcutManager: Resource,
        console: {log() {}, error() {}},
    });
    const manager = new Manager({getSettings: () => ({}), metadata: {}, path: ''});
    manager._doKillAllOldDesktopProcesses = () => cleanup;
    manager._launchDesktop = () => {
        launchCalls++;
        return Promise.resolve();
    };
    manager._acquireDBusName = () => 0;
    return {
        manager, sources, signals, events, layoutManager, clients,
        finishCleanup, runSource,
        get launchCalls() {
            return launchCalls;
        },
    };
}

async function startActiveManager() {
    const f = fixture();
    delete f.manager._launchDesktop;
    f.manager.enable();
    await f.finishCleanup();
    f.runSource(f.manager.startupProcessKillWaitId);
    return f;
}

async function settleClient(client, outcome = 'resolve') {
    client[outcome]();
    await new Promise(resolve => setImmediate(resolve));
}

for (const startingUp of [true, false]) {
    test(`disable during ${startingUp ? 'startup signal' : 'process cleanup'} wait`, async () => {
        const f = fixture(startingUp);
        f.manager.enable();
        assert.equal(f.manager.ShortcutManager, null);
        assert.equal(f.sources.size + f.signals.size, 1);
        f.manager.disable();
        assert.equal(f.sources.size + f.signals.size, 0);
        assert.equal(f.manager.visibleArea, null);
        assert.equal(f.manager.windowTypeManager, null);
        f.manager.disable();
        assert.equal(f.events.length, 3);
        await f.finishCleanup();
        assert.equal(f.manager.killingProcess, false);
        assert.equal(f.sources.size + f.signals.size, 0);
        assert.equal(f.launchCalls, 0);
        assert.equal(f.manager.ShortcutManager, null);
        assert.equal(f.manager.windowTypeManager, null);
    });

    test(`cleanup completion activates once ${startingUp ? 'after startup signal' : 'without startup wait'}`, async () => {
        const f = fixture(startingUp);
        f.manager.enable();
        const startupId = f.manager.startupPreparedId;
        if (startingUp)
            f.signals.get(startupId)();

        const idleId = f.manager.startupProcessKillWaitId;
        f.runSource(idleId);
        assert.ok(f.sources.has(idleId), 'keep waiting while cleanup is pending');
        assert.equal(f.launchCalls, 0);
        assert.equal(f.manager.windowTypeManager.enableCount, undefined);
        assert.equal(f.manager.ShortcutManager, null);

        await f.finishCleanup();
        f.runSource(idleId);
        assert.equal(f.sources.size, 0);
        assert.equal(f.manager.startupProcessKillWaitId, 0);
        assert.ok(!f.signals.has(startupId));
        assert.equal(f.launchCalls, 1);
        assert.equal(f.manager.windowTypeManager.enableCount, 1);
        assert.ok(f.manager.ShortcutManager);
        f.manager.disable();
        assert.equal(f.signals.size, 0);
    });
}

test('disable after startup completes while cleanup is pending prevents late activation', async () => {
    const f = fixture(true);
    f.manager.enable();
    f.signals.get(f.manager.startupPreparedId)();
    assert.equal(f.sources.size, 1);
    f.manager.disable();
    await f.finishCleanup();
    assert.equal(f.sources.size + f.signals.size, 0);
    assert.equal(f.launchCalls, 0);
    assert.equal(f.manager.ShortcutManager, null);
    assert.equal(f.manager.windowTypeManager, null);
});

test('disable cancels and terminates the current process exactly once', async () => {
    const f = await startActiveManager();
    const client = f.clients[0];
    f.manager.disable();
    assert.equal(client.cancelCount, 1);
    assert.deepEqual(client.sentSignals, [15]);
    assert.equal(f.manager.waylandClient, null);
    f.manager.disable();
    assert.equal(client.cancelCount, 1);
    assert.deepEqual(client.sentSignals, [15]);
    await settleClient(client);
    assert.equal(f.sources.size, 0);
});

test('completed activation disconnects startup and releases managers before re-enable', () => {
    const f = fixture(true);
    f.manager.enable();
    f.manager.killingProcess = false;
    const startupId = f.manager.startupPreparedId;
    f.signals.get(startupId)();
    assert.ok(!f.signals.has(startupId));
    const shortcuts = f.manager.ShortcutManager;
    const area = f.manager.visibleArea;
    f.manager.disable();
    assert.equal(f.events.length, 4);
    assert.equal(f.manager.ShortcutManager, null);
    f.manager.disable();
    f.manager.enable();
    f.manager.killingProcess = false;
    f.signals.get(f.manager.startupPreparedId)();
    assert.notEqual(f.manager.ShortcutManager, shortcuts);
    assert.notEqual(f.manager.visibleArea, area);
    f.manager.disable();
});

test('disable before initialization and late relaunch cleanup tolerate absent managers', () => {
    const {manager} = fixture();
    manager.disable();
    manager._doRelaunch(1000);
    assert.equal(manager.launchDesktop, 0);
});


for (const outcome of ['resolve', 'reject']) {
    for (const replaced of [false, true]) {
        test(`late process ${outcome} after ${replaced ? 'replacement' : 'disable'} cannot relaunch`, async () => {
            const f = await startActiveManager();
            const old = f.clients[0];
            let replacement;
            if (replaced)
                replacement = f.manager._launchDesktop();
            else
                f.manager.disable();

            await settleClient(old, outcome);
            assert.equal(f.sources.size, 0);
            assert.equal(f.manager.waylandClient, replaced ? f.clients[1] : null);
            if (replaced) {
                f.manager.disable();
                f.clients[1].resolve();
                await replacement;
            }
        });
    }

    test(`current process ${outcome} queues a relaunch that disable cancels`, async () => {
        const f = await startActiveManager();
        await settleClient(f.clients[0], outcome);
        assert.equal(f.sources.size, 1);
        assert.equal(f.manager.waylandClient, null);
        f.manager.disable();
        assert.equal(f.sources.size, 0);
        assert.equal(f.manager.launchDesktop, 0);
    });

    test(`current process ${outcome} relaunches a new client when the timeout runs`, async () => {
        const f = await startActiveManager();
        assert.equal(f.clients.length, 1);
        const old = f.clients[0];

        await settleClient(old, outcome);
        assert.equal(f.sources.size, 1);
        f.runSource(f.manager.launchDesktop);
        assert.equal(f.sources.size, 0);
        assert.equal(f.manager.launchDesktop, 0);
        assert.equal(f.clients.length, 2);
        assert.notEqual(f.clients[1], old);
        assert.equal(f.manager.waylandClient, f.clients[1]);

        f.manager.disable();
        await settleClient(f.clients[1]);
        assert.equal(f.sources.size + f.signals.size, 0);
    });
}
