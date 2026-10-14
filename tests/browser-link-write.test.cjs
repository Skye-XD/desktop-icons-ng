/* eslint-env node */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../utils/fileUtils.js'), 'utf8')
    .replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
class Bytes {
    constructor(data) {
        this.data = Uint8Array.from(data);
    }

    get_size() {
        return this.data.length;
    }

    static new_from_bytes(bytes, offset, length) {
        return new Bytes(bytes.data.slice(offset, offset + length));
    }
}
const {writeExclusive, recursivelyMakeDir, collisionName, getFileExtensionOffset} = vm.runInNewContext(
    `${source}\n({writeExclusive, recursivelyMakeDir, collisionName, getFileExtensionOffset})`, {
        Gio: {FileCreateFlags: {PRIVATE: 1}, IOErrorEnum: {EXISTS: 'exists', NOT_FOUND: 'missing'}},
        GLib: {Bytes, PRIORITY_DEFAULT: 0},
        console,
    });

function fixture(chunkSize) {
    const chunks = [];
    const events = [];
    const stream = {
        async write_bytes_async(bytes) {
            assert.ok(bytes instanceof Bytes);
            const chunk = bytes.data.slice(0, chunkSize);
            chunks.push(...chunk);
            await new Promise(resolve => setImmediate(resolve));
            return chunk.length;
        },
        close_async() {
            events.push('close');
            return Promise.resolve(true);
        },
    };
    const file = {
        create_async() {
            return Promise.resolve(stream);
        },
        delete_async() {
            events.push('delete');
            return Promise.resolve(true);
        },
    };
    return {file, chunks, events};
}

test('reference-counted byte writes continue from the correct offset after partial writes', async () => {
    const f = fixture(3);
    const payload = [137, 80, 78, 71, 13, 10, 26, 10, 0, 1, 2];
    await writeExclusive(f.file, new Bytes(payload));
    assert.deepEqual(f.chunks, payload);
    assert.deepEqual(f.events, ['close']);
});

test('zero-progress writes fail and remove the incomplete file', async () => {
    const f = fixture(0);
    await assert.rejects(writeExclusive(f.file, new Bytes([1, 2, 3])), /Incomplete file write/);
    assert.deepEqual(f.events, ['close', 'delete']);
});

test('shared filename policy preserves compound extensions and directory names', () => {
    assert.equal(collisionName('archive.tar.gz', 1), 'archive 1.tar.gz');
    assert.equal(collisionName('archive.tar.xz', 2), 'archive 2.tar.xz');
    assert.equal(collisionName('picture.png', 0), 'picture.png');
    assert.equal(collisionName('notes', 1), 'notes 1');
    assert.equal(collisionName('.hidden', 1), '.hidden 1');
    assert.equal(getFileExtensionOffset('folder.tar.gz', {isDirectory: true}).extension, '');
});

function directoryFixture(failure = null) {
    const existing = new Set(['/']);
    const completed = [];
    const error = code => Object.assign(new Error(code), {matches: (_domain, value) => value === code});
    const directory = name => ({
        get_parent: () => name === '/' ? null : directory(path.dirname(name)),
        async make_directory_async() {
            await new Promise(resolve => setImmediate(resolve));
            if (failure && name === '/a')
                throw error(failure);
            if (existing.has(name))
                throw error('exists');
            if (!existing.has(path.dirname(name)))
                throw error('missing');
            existing.add(name);
            completed.push(name);
        },
    });
    return {directory, completed, existing};
}

test('recursive creation awaits each missing parent and the final child', async () => {
    const f = directoryFixture();
    await recursivelyMakeDir(f.directory('/a/b/c'));
    assert.deepEqual(f.completed, ['/a', '/a/b', '/a/b/c']);
    await assert.rejects(recursivelyMakeDir(f.directory('/a/b/c')), /exists/);
});

test('recursive creation propagates parent failure and does not create children', async () => {
    const f = directoryFixture('permission denied');
    await assert.rejects(recursivelyMakeDir(f.directory('/a/b/c')), /permission denied/);
    assert.deepEqual(f.completed, []);
});

test('failed exclusive create leaves the existing file untouched', async () => {
    const f = fixture(3);
    f.file.create_async = () => Promise.reject(new Error('exists'));
    await assert.rejects(writeExclusive(f.file, new Bytes([1])), /exists/);
    assert.deepEqual(f.events, []);
    assert.deepEqual(f.chunks, []);
});

test('write and close failures remove partial files and preserve the original error', async () => {
    for (const failedMethod of ['write_bytes_async', 'close_async']) {
        const f = fixture(3);
        // eslint-disable-next-line no-await-in-loop
        const stream = await f.file.create_async();
        stream[failedMethod] = () => Promise.reject(new Error('disk failure'));
        // eslint-disable-next-line no-await-in-loop
        await assert.rejects(writeExclusive(f.file, new Bytes([1])), /disk failure/);
        assert.equal(f.events.at(-1), 'delete');
    }
});
