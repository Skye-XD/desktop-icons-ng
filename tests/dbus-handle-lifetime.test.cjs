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

test('each export releases its own raw handle exactly once', async () => {
    const f = fixture();
    const a = await f.manager.platformData();
    const b = await f.manager.platformData();
    assert.notEqual(a.parentHandle, b.parentHandle);
    b.freePlatformData();
    a.freePlatformData();
    a.freePlatformData();
    assert.deepEqual(f.surface.dropped, ['handle-1', 'handle-0']);
});

test('failed exports and missing parent windows produce harmless cleanup', async () => {
    const f = fixture();
    f.surface.export_handle = callback => {
        queueMicrotask(() => callback(f.surface, null));
        return true;
    };
    const a = await f.manager.platformData();
    assert.equal(a.parentHandle, '');
    a.freePlatformData();
    f.manager.mainApp.getDialogParentWindow = () => null;
    const b = await f.manager.platformData();
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
    assert.deepEqual(f.surface.dropped, ['handle-0', 'handle-1']);
});

test('replacement and late failed replies do not release the current preview', async () => {
    const f = fixture();
    await f.manager.ShowFileRemote('file:///a', '', true);
    await f.manager.ShowFileRemote('file:///b', '', true);
    f.reply(1);
    f.calls[0][4](null, new Error('old failure'));
    assert.deepEqual(f.surface.dropped, ['handle-0']);
    assert.equal(f.manager.previewParentHandle, 'wayland:handle-1');
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

test('exports completing after shutdown or a newer request are released without opening a preview', async () => {
    for (const shutdown of [false, true]) {
        const f = fixture();
        const exports = [];
        f.surface.export_handle = callback => {
            exports.push(callback);
            return true;
        };
        const first = f.manager.ShowFileRemote('file:///a', '', true);
        if (shutdown) {
            f.shutdown.shutdown();
        } else {
            const second = f.manager.ShowFileRemote('file:///b', '', true);
            exports[1](f.surface, 'new');
            await second;
            f.reply();
        }
        exports[0](f.surface, 'old');
        await first;
        assert.deepEqual(f.surface.dropped, ['old']);
        assert.equal(f.calls.length, shutdown ? 0 : 1);
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
