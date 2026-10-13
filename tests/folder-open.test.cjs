/* eslint-env node */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');

function source(file) {
    return fs.readFileSync(path.join(__dirname, '../app', file), 'utf8')
    .replace(/^import .*;\n/gm, '').replace(/^export .*;\n/gm, '');
}

for (const mode of ['success', 'missing-proxy', 'async-error', 'throw', 'file']) {
    test(`opening an item: ${mode}`, async () => {
        const calls = [];
        const Operations = vm.runInNewContext(`${source('utils/dbusUtils.js')}\nDbusOperationsManager`, {
            imports: {signals: {addSignalMethods() {}}},
            GLib: {PRIORITY_LOW: 0, idle_add: (_priority, callback) => queueMicrotask(callback)},
            console: {log() {}},
        });
        const operations = Object.create(Operations.prototype);
        operations._getStartupId = () => '';
        operations.freeDesktopFileManager = {
            proxy: mode === 'missing-proxy' ? null : {
                ShowFoldersRemote(uris, _startup, callback) {
                    calls.push(['dbus', ...uris]);
                    if (mode === 'throw')
                        throw new Error('unavailable');
                    queueMicrotask(() => callback(null, mode === 'async-error' ? new Error('failed') : null));
                },
            },
        };
        const Icon = vm.runInNewContext(`${source('fileItemIcon.js')}\nFileItemIcon`, {
            DesktopIconItem: class {},
            Gdk: {CURRENT_TIME: 0},
            Gio: {AppInfo: {launch_default_for_uri_async: (...args) => Promise.resolve(calls.push(['gio', ...args]))}},
        });
        const context = {};
        await Icon.prototype._doOpenContext.call({
            isDirectory: mode !== 'file',
            DBusUtils: {GnomeArchiveManager: {isAvailable: true}, RemoteFileOperations: operations},
            file: {get_uri: () => 'file:///tmp/folder'},
        }, context, []);
        assert.equal(calls.filter(call => call[0] === 'gio').length, mode === 'success' ? 0 : 1);
        if (mode !== 'missing-proxy' && mode !== 'file')
            assert.deepEqual(calls[0], ['dbus', 'file:///tmp/folder']);
        if (mode !== 'success')
            assert.deepEqual(calls.at(-1), ['gio', 'file:///tmp/folder', context, null]);
    });
}

test('folder startup notification accepts a nonzero timestamp and a URI array', () => {
    const context = {
        set_timestamp(value) {
            assert.equal(value, 123);
        },
        get_startup_notify_id(_handler, files) {
            assert.deepEqual(Array.from(files), ['file:///tmp/folder']);
            return 'startup-token';
        },
    };
    const Operations = vm.runInNewContext(`${source('utils/dbusUtils.js')}\nDbusOperationsManager`, {
        imports: {signals: {addSignalMethods() {}}},
        Gdk: {Display: {get_default: () => ({get_app_launch_context: () => context})}},
        Gio: {File: {new_for_uri: uri => uri}},
    });
    const operations = Object.create(Operations.prototype);
    operations._fileManager = {};
    let called = false;
    operations.freeDesktopFileManager = {
        proxy: {
            ShowFoldersRemote(uris, startup, callback) {
                assert.deepEqual(Array.from(uris), ['file:///tmp/folder']);
                assert.equal(startup, 'startup-token');
                callback('ok', null);
            },
        },
    };
    operations.ShowFolderRemote('file:///tmp/folder', 123, result => {
        assert.equal(result, 'ok');
        called = true;
    });
    assert.equal(called, true);
});
