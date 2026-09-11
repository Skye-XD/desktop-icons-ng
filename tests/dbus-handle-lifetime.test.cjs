/* eslint-env node */
/* eslint-disable no-await-in-loop */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');

class Surface {
    constructor() {
        this.handles = [];
        this.dropped = [];
    }

    export_handle(callback) {
        const handle = `handle-${this.handles.length}`;
        this.handles.push(handle);
        callback(this, handle);
        return true;
    }

    drop_exported_handle(handle) {
        this.dropped.push(handle);
    }
}
const source = fs.readFileSync(path.join(__dirname, '../app/utils/dbusUtils.js'), 'utf8')
.replace(/^import .*;\n/gm, '').replace(/^export .*;\n/gm, '');
const Manager = vm.runInNewContext(`${source}\nRemoteFileOperationsManager`, {
    imports: {signals: {addSignalMethods() {}}},
    GdkWayland: {WaylandToplevel: Surface},
    Gdk: {CURRENT_TIME: 0},
    GLib: {Variant: class {}},
    console: {log() {}, error() {}},
});

function fixture() {
    const surface = new Surface();
    const signals = {};
    const shutdown = {};
    const calls = [];
    const proxy = {
        g_name_owner: ':1.42',
        Visible: false,
        ParentHandle: '',
        ShowFileRemote: (...args) => calls.push(args),
    };
    const preview = {
        proxy,
        connectToProxy: (name, cb) => {
            signals[name] = cb;
        },
        connect: (name, cb) => {
            signals[name] = cb;
        },
    };
    const fileOperations = {proxy: {}};
    const manager = new Manager(fileOperations, {}, {...preview}, {connect() {}}, {
        getDialogParentWindow: () => ({get_surface: () => surface}),
        connect: (name, cb) => {
            shutdown[name] = cb;
        },
    });
    function reply(index = calls.length - 1, error = null) {
        proxy.Visible = !error;
        proxy.ParentHandle = calls[index][1];
        signals['g-properties-changed'](proxy);
        calls[index][4](null, error);
    }
    return {manager, surface, signals, shutdown, proxy, calls, reply, fileOperations};
}

test('shared export is released exactly once by the last user', async () => {
    const f = fixture();
    const a = await f.manager.createPlatformData();
    const b = await f.manager.createPlatformData();
    assert.equal(a.parentHandle, b.parentHandle);
    b.freePlatformData();
    b.freePlatformData();
    assert.deepEqual(f.surface.dropped, []);
    a.freePlatformData();
    a.freePlatformData();
    assert.deepEqual(f.surface.dropped, ['handle-0']);
});

test('failed exports and missing parent windows produce harmless cleanup', async () => {
    const f = fixture();
    f.surface.export_handle = callback => {
        queueMicrotask(() => callback(f.surface, null));
        return true;
    };
    const a = await f.manager.createPlatformData();
    assert.equal(a.parentHandle, '');
    a.freePlatformData();
    f.manager.mainApp.getDialogParentWindow = () => null;
    const b = await f.manager.createPlatformData();
    assert.equal(b.parentHandle, '');
    b.freePlatformData();
    assert.deepEqual(f.surface.dropped, []);
});

test('preview retains export after reply and releases on close, foreign parent, owner loss, or shutdown', async () => {
    for (const event of ['close', 'foreign', 'owner', 'shutdown']) {
        const f = fixture();
        await f.manager.ShowFileRemote('file:///a', '', true);
        f.reply();
        assert.deepEqual(f.surface.dropped, []);
        if (event === 'shutdown') {
            f.shutdown.shutdown();
        } else if (event === 'owner') {
            f.proxy.g_name_owner = null;
            f.signals['notify::g-name-owner'](f.proxy);
        } else {
            if (event === 'close')
                f.proxy.Visible = false;
            else
                f.proxy.ParentHandle = 'wayland:nautilus';
            f.signals['g-properties-changed'](f.proxy);
        }
        assert.deepEqual(f.surface.dropped, ['handle-0']);
        assert.equal(f.manager.previewParentHandle, null);
    }
});

test('method replies before queued properties retain the handle for preview navigation', async () => {
    const f = fixture();
    for (const uri of ['file:///a', 'file:///b']) {
        await f.manager.ShowFileRemote(uri, '', true);
        const call = f.calls.at(-1);
        const dropped = [...f.surface.dropped];
        // GDBusExportedObject batches property changes after returning the reply.
        call[4](null, null);
        assert.deepEqual(f.surface.dropped, dropped);
        assert.equal(f.manager.previewParentHandle, call[1]);
        f.proxy.Visible = true;
        f.proxy.ParentHandle = call[1];
        f.signals['g-properties-changed'](f.proxy);
        assert.deepEqual(f.surface.dropped, dropped);
        assert.equal(f.manager.previewParentHandle, f.proxy.ParentHandle);
    }
    f.proxy.Visible = false;
    f.signals['g-properties-changed'](f.proxy);
    assert.deepEqual(f.surface.dropped, ['handle-0']);
});

test('replacement and late failed replies do not release the current preview', async () => {
    const f = fixture();
    await f.manager.ShowFileRemote('file:///a', '', true);
    await f.manager.ShowFileRemote('file:///b', '', true);
    f.reply(1);
    f.calls[0][4](null, new Error('old failure'));
    assert.deepEqual(f.surface.dropped, []);
    assert.equal(f.manager.previewParentHandle, 'wayland:handle-0');
});

test('preview errors release exports, including synchronous errors', async () => {
    const f = fixture();
    await f.manager.ShowFileRemote('file:///a', '', true);
    f.reply(0, new Error('failed'));
    f.proxy.ShowFileRemote = () => {
        throw new Error('synchronous');
    };
    await assert.rejects(f.manager.ShowFileRemote('file:///b', '', true), /synchronous/);
    assert.deepEqual(f.surface.dropped, ['handle-0', 'handle-1']);
});

test('pending export is shared; superseded requests and shutdown release their claims', async () => {
    for (const shutdown of [false, true]) {
        const f = fixture();
        const exports = [];
        f.surface.export_handle = callback => {
            exports.push(callback);
            return true;
        };
        const first = f.manager.ShowFileRemote('file:///a', '', true);
        const second = f.manager.ShowFileRemote('file:///b', '', true);
        assert.equal(exports.length, 1);
        if (shutdown)
            f.shutdown.shutdown();
        exports[0](f.surface, 'shared');
        await Promise.all([first, second]);
        assert.deepEqual(f.surface.dropped, shutdown ? ['shared'] : []);
        assert.equal(f.calls.length, shutdown ? 0 : 1);
        if (!shutdown) {
            f.reply();
            f.shutdown.shutdown();
            assert.deepEqual(f.surface.dropped, ['shared']);
        }
    }
});

test('all file operations release exports on replies and synchronous errors', async () => {
    const methods = {
        MoveURIsRemote: [[], 'file:///destination'],
        CopyURIsRemote: [[], 'file:///destination'],
        RenameURIRemote: ['file:///a', 'b'],
        TrashURIsRemote: [[]],
        DeleteURIsRemote: [[]],
        EmptyTrashRemote: [true],
        UndoRemote: [],
        RedoRemote: [],
    };
    for (const [method, args] of Object.entries(methods)) {
        for (const outcome of ['success', 'error', 'throw']) {
            const f = fixture();
            f.fileOperations.proxy[method] = (...params) => {
                if (outcome === 'throw')
                    throw new Error('synchronous');
                params.at(-1)(null, outcome === 'error' ? new Error('failed') : null);
            };
            await f.manager[method](...args);
            assert.deepEqual(f.surface.dropped, ['handle-0'], `${method}: ${outcome}`);
        }
    }
});

test('preview and file operations share exports on both GTK cleanup APIs', async () => {
    for (const legacy of [false, true]) {
        for (const previewFinishesFirst of [false, true]) {
            const f = fixture();
            if (legacy) {
                f.surface.drop_exported_handle = undefined;
                f.surface.unexport_handle = () => f.surface.dropped.push('legacy');
            }
            await f.manager.ShowFileRemote('file:///a', '', true);
            f.reply();
            let finishCopy;
            f.fileOperations.proxy.CopyURIsRemote = (...args) => {
                finishCopy = args.at(-1);
            };
            await f.manager.CopyURIsRemote([], 'file:///destination');
            assert.equal(f.surface.handles.length, 1);
            const finishPreview = () => {
                f.proxy.Visible = false;
                f.signals['g-properties-changed'](f.proxy);
            };
            if (previewFinishesFirst)
                finishPreview();
            else
                finishCopy(null, null);
            assert.deepEqual(f.surface.dropped, []);
            if (previewFinishesFirst)
                finishCopy(null, null);
            else
                finishPreview();
            finishCopy(null, null);
            finishPreview();
            assert.deepEqual(f.surface.dropped, [legacy ? 'legacy' : 'handle-0']);
            const next = await f.manager.createPlatformData();
            assert.equal(f.surface.handles.length, 2);
            next.freePlatformData();
            assert.equal(f.surface.dropped.length, 2);
        }
    }
});

test('concurrent failed exports release all claims and allow a fresh attempt', async () => {
    for (const throws of [false, true]) {
        const f = fixture();
        let attempts = 0;
        f.surface.export_handle = callback => {
            attempts++;
            if (throws)
                throw new Error('export failed');
            queueMicrotask(() => callback(f.surface, null));
            return true;
        };
        const failed = await Promise.all([f.manager.createPlatformData(), f.manager.createPlatformData()]);
        assert.equal(attempts, 1);
        for (const data of failed) {
            assert.equal(data.parentHandle, '');
            data.freePlatformData();
        }
        assert.deepEqual(f.surface.dropped, []);
        f.surface.export_handle = Surface.prototype.export_handle;
        const next = await f.manager.createPlatformData();
        assert.equal(next.parentHandle, 'wayland:handle-0');
        next.freePlatformData();
        assert.deepEqual(f.surface.dropped, ['handle-0']);
    }
});

test('different surfaces have independent exports and reference counts', async () => {
    const a = fixture();
    const b = fixture();
    const first = await a.manager.createPlatformData();
    const second = await b.manager.createPlatformData();
    first.freePlatformData();
    assert.deepEqual(a.surface.dropped, ['handle-0']);
    assert.deepEqual(b.surface.dropped, []);
    second.freePlatformData();
    assert.deepEqual(b.surface.dropped, ['handle-0']);
});

test('overlapping operations keep their own event even when exports complete in reverse order', async () => {
    const f = fixture();
    const pending = [];
    const received = [];
    f.manager._platformDataManager.acquire = (parentWindow, timestamp) =>
        new Promise(resolve => pending.push({parentWindow, timestamp, resolve}));
    f.fileOperations.proxy.CopyURIsRemote = (files, uri, data, callback) => {
        received.push({uri, data});
        callback(null, null);
    };
    const a = {parentWindow: {}, timestamp: 123};
    const b = {parentWindow: {}, timestamp: 456};
    const first = f.manager.CopyURIsRemote([], 'file:///a', a);
    const second = f.manager.CopyURIsRemote([], 'file:///b', b);
    assert.equal(pending[0].parentWindow, a.parentWindow);
    assert.equal(pending[1].parentWindow, b.parentWindow);
    for (const i of [1, 0]) {
        pending[i].resolve({data: pending[i].timestamp, freePlatformData() {}});
        await (i === 0 ? first : second);
    }
    assert.deepEqual(received, [
        {uri: 'file:///b', data: 456},
        {uri: 'file:///a', data: 123},
    ]);
});

test('unavailable operation cannot leave its event for the next request', async () => {
    const f = fixture();
    const received = [];
    f.manager._sendNoProxyError = () => {};
    f.fileOperations.proxy = null;
    await f.manager.CopyURIsRemote([], 'file:///a',
        {parentWindow: {}, timestamp: 123});
    f.manager._platformDataManager.acquire = (parentWindow, timestamp) => {
        received.push({parentWindow, timestamp});
        return Promise.resolve({data: {}, freePlatformData() {}});
    };
    f.fileOperations.proxy = {CopyURIsRemote: (...args) => args.at(-1)(null, null)};
    await f.manager.CopyURIsRemote([], 'file:///b');
    assert.equal(received.length, 1);
    assert.equal(received[0].timestamp, 0);
    assert.equal(received[0].parentWindow.get_surface(), f.surface);
});
