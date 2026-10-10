/* eslint-env node */
/* eslint-disable no-await-in-loop -- Exercise each clipboard variant. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');

const source = fs.readFileSync(
    path.join(__dirname, '../app/clipboardManager.js'), 'utf8'
).replace(/^import .*;\n/gm, '').replace(/^export \{.*\};\n/gm, '');

const Enums = vm.runInNewContext(`${fs.readFileSync(
    path.join(__dirname, '../app/enums.js'), 'utf8'
).replace(/^export /gm, '')}\n({DndTargetInfo, DndOfferRoute, DropContentsType})`);
const WebUtils = vm.runInNewContext(`${fs.readFileSync(
    path.join(__dirname, '../app/utils/webutils.js'), 'utf8'
).replace(/^import .*;\n/gm, '').replace(/^export /gm, '')}
({contentName, imageFormats, htmlFormats})`, {Enums});

function fixture(mime, contents, gtypes = []) {
    const operations = [];
    const reads = [];
    const clipboard = {
        mimes: mime ? mime.split(',') : [],
        get_formats() {
            return {
                get_mime_types: () => this.mimes,
                contain_gtype: type => gtypes.includes(type),
            };
        },
        connect(_signal, callback) {
            this.changed = callback;
            return 1;
        },
        disconnect(id) {
            assert.equal(id, 1);
            this.changed = null;
        },
        set_content(provider) {
            this.provider = provider;
        },
    };
    const ClipboardManager = vm.runInNewContext(`${source}\nClipboardManager`, {
        Gdk: {
            FileList: {
                $gtype: 'file-list',
                new_from_array: files => ({files}),
            },
            Display: {get_default: () => ({get_clipboard: () => clipboard})},
            ContentProvider: {
                new_for_value: value => ({value}),
                new_for_bytes: (type, bytes) => ({type, bytes}),
                new_union: providers => providers,
            },
        },
        Gio: {
            File: {
                $gtype: 'file',
                new_for_uri: uri => ({
                    get_path: () => uri.startsWith('file:') ? '/file' : null,
                }),
            },
            Cancellable: class {
                cancel() {
                    this.cancelled = true;
                }

                is_cancelled() {
                    return !!this.cancelled;
                }
            },
        },
        ContentReader: class {
            constructor(sourceClipboard, context) {
                assert.equal(sourceClipboard, clipboard);
                reads.push(context);
            }

            readClipboardContents() {
                return typeof contents === 'function' ? contents() : contents;
            }
        },
        WebUtils, TextEncoder, console,
    });
    const desktopManager = {
        _clickX: 100,
        _clickY: 200,
        mainApp: {
            lookup_action: name => ({
                set_enabled: enabled => {
                    clipboard[name === 'doPaste'
                        ? 'pasteEnabled'
                        : 'linkEnabled'] = enabled;
                },
            }),
        },
        desktopDir: {get_uri: () => 'file:///desktop'},
        getCurrentSelection: () => [{
            file: {
                get_uri: () => 'file:///one', get_path: () => '/one',
            },
        }],
        Enums,
        DBusUtils: {
            RemoteFileOperations: {
                CopyURIsRemote: (...args) => operations.push(['copy', ...args]),
                MoveURIsRemote: (...args) => operations.push(['move', ...args]),
            },
        },
        dropOperations: {
            fileURIsFromReferences: refs => refs.split('\r\n'),
            createSymbolicLinks: (...args) => {
                operations.push(['link', ...args]);
                return Promise.resolve();
            },
            desktopPositionForDrop: position => position,
            writeTransferContent: (...args) => {
                operations.push(['write', ...args]);
                return Promise.resolve(true);
            },
            prepareIncomingFilePlacement: (...args) =>
                operations.push(['placement', ...args]),
        },
    };
    const manager = new ClipboardManager(desktopManager);
    manager.updateClipboard();
    return {manager, desktopManager, clipboard, operations, reads};
}

const fileContents = isCut => ({
    type: 'file-references', references: 'file:///one',
    format: 'text/uri-list', isCut,
});
const plainText = {type: 'text', text: 'ordinary text'};
const serialize = value => JSON.parse(JSON.stringify(value));

test('clipboard copy retains pending placement and file operations', async () => {
    const {manager, operations} = fixture(
        'x-special/gnome-copied-files', fileContents(false)
    );
    assert.equal(manager.canPaste, true);
    await manager.paste();
    assert.deepEqual(serialize(operations), [
        ['placement', ['file:///one'], [100, 200], {filesWillBeCopied: true}],
        ['copy', ['file:///one'], 'file:///desktop'],
    ]);
});

test('paste reads current contents and preserves zero coordinates', async () => {
    let finishRead;
    const {manager, desktopManager, operations, reads} = fixture(
        'text/plain', () => new Promise(resolve => {
            finishRead = resolve;
        })
    );
    desktopManager._clickX = 0;
    desktopManager._clickY = 0;
    assert.equal(manager.canPaste, true);
    assert.equal(reads.length, 0);
    const pending = manager.paste();
    desktopManager._clickX = 500;
    finishRead(plainText);
    assert.equal(await pending, true);
    assert.deepEqual(serialize(operations), [['write', plainText, [0, 0]]]);
});

test('clipboard changes cancel pending reads and update paste availability', async () => {
    let finishRead;
    const {manager, clipboard, operations, reads} = fixture(
        'text/plain', () => new Promise(resolve => {
            finishRead = resolve;
        })
    );
    const pending = manager.paste();
    clipboard.mimes = [];
    clipboard.changed();
    assert.equal(reads[0].cancellable.is_cancelled(), true);
    assert.equal(clipboard.pasteEnabled, false);
    finishRead(plainText);
    assert.equal(await pending, false);
    assert.deepEqual(operations, []);
});

test('destroy disconnects the clipboard and cancels pending paste', async () => {
    let finishRead;
    const {manager, clipboard, reads, operations} = fixture(
        'text/plain', () => new Promise(resolve => {
            finishRead = resolve;
        })
    );
    const pending = manager.paste();
    manager.destroy();
    assert.equal(reads[0].cancellable.is_cancelled(), true);
    assert.equal(clipboard.changed, null);
    finishRead(plainText);
    assert.equal(await pending, false);
    assert.deepEqual(operations, []);
});

test('copy and cut offer typed files with GNOME and text providers', () => {
    const {manager, desktopManager, clipboard} = fixture('', null);
    const files = [
        {get_uri: () => 'file:///one', get_path: () => '/one'},
        {get_uri: () => 'file:///two%20files', get_path: () => '/two files'},
    ];
    desktopManager.getCurrentSelection = () => files.map(file => ({file}));
    for (const copy of [true, false]) {
        manager.copyOrCutSelection(copy);
        const providers = clipboard.provider;
        assert.equal(providers.length, 5);
        assert.equal(providers[0].type, 'x-special/gnome-copied-files');
        assert.equal(new TextDecoder().decode(providers[0].bytes),
            `${copy ? 'copy' : 'cut'}\nfile:///one\nfile:///two%20files`);
        assert.deepEqual(serialize(providers[1].value.files.map(file =>
            file.get_uri())), ['file:///one', 'file:///two%20files']);
        assert.equal(new TextDecoder().decode(providers[2].bytes),
            'file:///one\r\nfile:///two%20files\r\n');
        for (const provider of providers.slice(3)) {
            assert.equal(new TextDecoder().decode(provider.bytes),
                '/one\n/two files\n');
        }
    }
});
