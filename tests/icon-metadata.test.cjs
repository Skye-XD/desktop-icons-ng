/* eslint-env node */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../app/fileItemIcon.js'), 'utf8');
const methods = source.slice(source.indexOf('    async _storeCoordinates('), source.indexOf('    async isFileEncrypted('));
class Cancellable {
    cancel() {
        this.cancelled = true;
    }

    is_cancelled() {
        return !!this.cancelled;
    }
}
class GioError extends Error {
    constructor(_domain, code, message) {
        super(message);
        this.code = code;
    }
}
const Icon = vm.runInNewContext(`(class {${methods}})`, {
    Gio: {
        Cancellable,
        IOErrorEnum: {CANCELLED: 'cancelled'},
        FileQueryInfoFlags: {NOFOLLOW_SYMLINKS: 1},
    },
    GLib: {PRIORITY_LOW: 300, Error: GioError},
    console: {error() {}},
});
const settle = () => new Promise(resolve => setImmediate(resolve));

function fixture() {
    const icon = new Icon();
    const calls = [];
    icon._file = {};
    icon.FileUtils = {
        setStringAttribute: (...args) => {
            calls.push(args);
            return Promise.resolve();
        },
    };
    icon._savedCoordinates = [1, 2];
    icon._dropCoordinates = [3, 4];
    icon._parseSavedCoordinates = value => {
        icon._savedCoordinates = value;
    };
    icon._parseDropCoordinates = value => {
        icon._dropCoordinates = value;
    };
    icon._isCancellationError = error => error.code === 'cancelled';
    return {icon, calls};
}

test('icon coordinates reuse the string writer, preserving clearing and low priority', async () => {
    const {icon, calls} = fixture();
    const cancel = new Cancellable();
    await icon._storeCoordinates('desktop-icon-position', [0, 25], cancel);
    await icon._storeCoordinates('nautilus-drop-position', null, cancel);
    assert.deepEqual(calls, [
        [icon._file, 'metadata::desktop-icon-position', '0,25', cancel, 300, 1],
        [icon._file, 'metadata::nautilus-drop-position', '', cancel, 300, 1],
    ]);
});

test('coordinate writes retain the post-write cancellation check', async () => {
    const {icon} = fixture();
    const cancel = new Cancellable();
    icon.FileUtils.setStringAttribute = () => {
        cancel.cancel();
        return Promise.resolve();
    };
    await assert.rejects(icon._storeCoordinates('desktop-icon-position', [1, 2], cancel),
        error => error.code === 'cancelled');
});

test('failed metadata writes restore cached saved and dropped coordinates', async () => {
    const {icon} = fixture();
    icon.FileUtils.setStringAttribute = () => Promise.reject(new Error('Metadata unavailable'));
    icon.writeSavedCoordinates([10, 20]);
    icon.writeDroppedCoordinates([30, 40]);
    await settle();
    assert.deepEqual(icon._savedCoordinates, [1, 2]);
    assert.deepEqual(icon._dropCoordinates, [3, 4]);
    assert.equal(icon._savedCoordinatesCancellable, null);
    assert.equal(icon._dropCoordinatesCancellable, null);
});

test('a superseded coordinate write does not roll back the newer position', async () => {
    const {icon, calls} = fixture();
    icon.writeSavedCoordinates([10, 20]);
    icon.writeSavedCoordinates([30, 40]);
    assert.equal(calls[0][3].is_cancelled(), true);
    await settle();
    assert.deepEqual(icon._savedCoordinates, [30, 40]);
    assert.equal(icon._savedCoordinatesCancellable, null);
});
