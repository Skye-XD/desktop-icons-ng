/* eslint-env node */
/* eslint-disable no-await-in-loop -- Each fixture is exercised independently. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');

const readSource = file => fs.readFileSync(path.join(__dirname, '../app', file), 'utf8')
    .replace(/^import .*;\n/gm, '').replace(/^export \{.*\};\n/gm, '').replace(/^export /gm, '');
const Enums = vm.runInNewContext(
    `${readSource('enums.js')}\n({FileType, DndTargetInfo, DndOfferRoute, DropContentsType, DND_DATA_TRANSFER_TIMEOUT})`);
const WebUtils = vm.runInNewContext(
    `${readSource('utils/webutils.js')}\n({htmlFormats, imageFormats, contentName})`, {Enums});
const actions = {COPY: 1, MOVE: 2, LINK: 4, ASK: 8, is_unique: value => value && !(value & value - 1)};
class Formats {
    constructor(mimes = [], types = []) {
        this.mimes = mimes;
        this.types = types;
    }

    get_mime_types() {
        return this.mimes;
    }

    get_gtypes() {
        return this.types;
    }

    contain_gtype(type) {
        return this.types.includes(type);
    }

    match(other) {
        return this.mimes.some(mime => other.mimes.includes(mime)) || this.types.some(type => other.types.includes(type));
    }
}
class Controller {
    constructor() {
        this.signals = {};
        this.actionUpdates = 0;
    }

    connect(name, callback) {
        this.signals[name] = callback;
    }

    set_actions(value) {
        this.actions = value;
        this.actionUpdates++;
    }

    set_formats() {}

    reject_drop(drop) {
        this.rejectedDrop = drop;
    }
}
const Gdk = {
    DragAction: actions,
    FileList: {
        $gtype: 'GdkFileList',
        new_from_array: files => ({files}),
    },
    ContentProvider: {
        new_for_bytes: (mime, bytes) => ({kind: 'bytes', mime, bytes}),
        new_for_value: value => ({kind: 'value', value}),
        new_union: providers => ({kind: 'union', providers}),
    },
    ContentFormats: {new: mimes => new Formats(mimes)},
    ContentFormatsBuilder: class extends Formats {
        add_mime_type(mime) {
            this.mimes.push(mime);
        }

        add_gtype(type) {
            this.types.push(type);
        }

        to_formats() {
            return this;
        }
    },
};
const Gio = {
    File: {$gtype: 'GFile'},
    Cancellable: class {
        constructor() {
            this.handlers = new Map();
            this.nextHandlerId = 1;
        }

        connect(callback) {
            const id = this.nextHandlerId++;
            this.handlers.set(id, callback);
            return id;
        }

        disconnect(id) {
            this.handlers.delete(id);
        }

        cancel() {
            this.cancelled = true;
            for (const callback of this.handlers.values())
                callback();
        }

        is_cancelled() {
            return !!this.cancelled;
        }
    },
};
const ContentReader = vm.runInNewContext(
    `${readSource('contentReader.js')}\nContentReader`, {
        Enums, WebUtils, Gdk, Gio,
        GLib: {}, GdkPixbuf: {},
        console: {log() {}, error() {}},
    });
const DropSession = vm.runInNewContext(
    `${readSource('dropSession.js')}\nDropSession`, {
        ContentReader, Enums, WebUtils, Gdk, Gio,
        GLib: {}, GdkPixbuf: {},
        console: {log() {}, error() {}},
    });
const DragManager = vm.runInNewContext(
    `${readSource('dragManager.js')}\nDragManager`, {
        Gdk, Gio, TextEncoder,
        console: {log() {}, error() {}},
    });
const DesktopDropOperations = vm.runInNewContext(
    `${readSource('desktopDropOperations.js')}\nDesktopDropOperations`, {
        Gdk, Gio, GLib: {}, Gtk: {},
        _: text => text,
        console: {log() {}, error() {}},
    });
const dragManager = new DragManager({Enums});
const dropOperations = new DesktopDropOperations({Enums});
const gridSource = readSource('desktopGrid.js');
const controlSource = gridSource.slice(gridSource.indexOf('const ControlGrid ='), gridSource.indexOf('const OffsetPicture ='));
const Grid = vm.runInNewContext(`${controlSource}\nControlGrid`, {
    DrawGrid: class {},
    console: {log() {}, error() {}},
    Gio, TextEncoder,
    Gdk: {
        ...Gdk,
        Rectangle: class {
            intersect() {
                return [true];
            }
        },
    },
    Gtk: {DropTargetAsync: Controller, DropControllerMotion: Controller},
});
const settle = () => new Promise(resolve => setImmediate(resolve));

test('movable file selections advertise every supported source action', () => {
    const manager = new DragManager({
        Enums,
        getCurrentSelection: () => [
            {isSpecial: false, canDelete: true},
            {isSpecial: false, canDelete: true},
        ],
    });

    assert.equal(
        manager._sourceActionsForCurrentSelection,
        actions.COPY | actions.MOVE | actions.LINK | actions.ASK
    );
});

test('a non-deletable file removes MOVE from the source actions', () => {
    const manager = new DragManager({
        Enums,
        getCurrentSelection: () => [
            {isSpecial: false, canDelete: true},
            {isSpecial: false, canDelete: false},
        ],
    });

    assert.equal(
        manager._sourceActionsForCurrentSelection,
        actions.COPY | actions.LINK | actions.ASK
    );
});

test('special icon selections retain internal repositioning', () => {
    const manager = new DragManager({
        Enums,
        getCurrentSelection: () => [
            {isSpecial: true, canDelete: false},
        ],
    });

    assert.equal(
        manager._sourceActionsForCurrentSelection,
        actions.MOVE
    );
});

test('ordinary outgoing drags offer a typed file list first', () => {
    const files = [{uri: 'file:///one'}, {uri: 'file:///two'}];
    const manager = new DragManager({
        Enums,
        checkIfSpecialFilesAreSelected: () => false,
        getCurrentSelection: () => files.map(file => ({file})),
    });
    manager.getSelectionData = target => target === Enums.DndTargetInfo.TEXT_PLAIN
        ? '/one\n/two\n'
        : 'file:///one\r\nfile:///two\r\n';

    const contentProvider = manager._createDragContentProvider();

    assert.equal(contentProvider.kind, 'union');
    assert.equal(contentProvider.providers[0].kind, 'value');
    assert.deepEqual(contentProvider.providers[0].value.files, files);
});

function fixture(mimes, logical, sourceActions = actions.COPY | actions.MOVE) {
    const grid = Object.create(Grid.prototype);
    const results = [];
    let availableActions = sourceActions;
    grid.Enums = {
        DndOfferRoute: Enums.DndOfferRoute,
        DropContentsType: Enums.DropContentsType,
        DndTargetInfo: {
            ...Enums.DndTargetInfo,
            DING_ICON_LIST: 'x-special/ding-icon-list', GNOME_ICON_LIST: 'x-special/gnome-icon-list', URI_LIST: 'text/uri-list',
        },
        FileType: Enums.FileType,
    };
    grid.Prefs = {freePositionIcons: false};
    grid._elementWidth = 100;
    grid._elementHeight = 100;
    grid._fileAt = () => null;
    grid.coordinatesBelongToThisGrid = () => true;
    grid.coordinatesLocalToGlobal = (x, y) => [x, y];
    grid.getCoordinatesOfGridContaining = (X, Y) => [
        grid._elementWidth * Math.floor(X / grid._elementWidth),
        grid._elementHeight * Math.floor(Y / grid._elementHeight),
    ];
    grid.receiveMotion = () => {};
    grid.receiveLeave = () => results.push('cleanup');
    grid._desktopManager = {
        DropSession,
        selectionCanBeRepositioned: () => true,
        desktopDir: {},
        _desktops: [grid],
        currentWorkingList: [],
    };
    grid.DesktopIconsUtil = {
        getBasenameBeforeCopySuffix(basename) {
            const suffixPosition = basename.search(/\(.*\)[^()]*$/);
            return suffixPosition > 1
                ? basename.slice(0, suffixPosition - 1)
                : null;
        },
        writeTransferContentToDesktop: (_directory, contents) => {
            const event = {
                'file-content': 'content-created',
                'web-links': 'url-created',
                text: 'text-created',
            }[contents.type];
            if (!event)
                return Promise.resolve(false);
            results.push(event);
            return Promise.resolve(true);
        },
    };
    grid._dragManager = Object.assign(Object.create(dragManager), {
        _desktopManager: grid._desktopManager,
        _Prefs: grid.Prefs,
        dragItem: {getCoordinates: () => [0, 0, 0]},
        doMoveWithDragAndDrop: () => results.push('reposition'),
    });
    grid._dropOperations = Object.assign(Object.create(dropOperations), {
        _desktopManager: grid._desktopManager,
        _DesktopIconsUtil: grid.DesktopIconsUtil,
        _Prefs: grid.Prefs,
    });
    grid._desktopManager.dragManager = grid._dragManager;
    grid._desktopManager.dropOperations = grid._dropOperations;
    grid._routeFileReferences = (_drop, _references, destination, action) => {
        results.push({
            operation: 'files',
            action,
            ontoItem: !!destination.fileItem,
        });
        return Promise.resolve(action);
    };
    grid._setDropDestination({add_controller() {}});
    grid._dropSession._createContentsReader = () => ({
        readAndClassifyURIList: () => Promise.resolve(logical),
        readContents: () => Promise.resolve(logical),
    });
    const drop = {
        logical,
        get_formats: () => new Formats(mimes),
        get_actions: () => availableActions,
        status: (allowed, preferred) => results.push({allowed, preferred}),
        finish: action => results.push({finish: action}),
    };
    const emit = (signal, ...args) => grid.gridDropController.signals[signal](grid.gridDropController, drop, ...args);
    const setSourceActions = value => {
        availableActions = value;
    };
    return {grid, drop, emit, results, setSourceActions};
}

function replacementDrop(mimes, sourceActions = actions.COPY | actions.MOVE) {
    return {
        finishes: [],
        get_formats: () => new Formats(mimes),
        get_actions: () => sourceActions,
        status() {},
        finish(action) {
            this.finishes.push(action);
        },
    };
}

function emitForDrop(grid, signal, drop, ...args) {
    return grid.gridDropController.signals[signal](
        grid.gridDropController,
        drop,
        ...args
    );
}

test('browser URL negotiates COPY and finishes once after creation', async () => {
    const f = fixture(['text/x-moz-url', 'text/uri-list'], {
        type: 'web-links', links: [], customIcon: null,
    });
    assert.equal(f.emit('accept'), true);
    assert.equal(f.emit('drag-enter'), actions.COPY);
    assert.equal(f.grid.gridDropController.actions,
        actions.COPY | actions.MOVE | actions.LINK | actions.ASK);
    assert.equal(f.emit('drag-motion', 10, 20), actions.COPY);
    assert.equal(f.grid.gridDropController.actionUpdates, 1);
    let release;
    f.grid.DesktopIconsUtil.writeTransferContentToDesktop = () =>
        new Promise(resolve => {
            release = () => resolve(true);
        });
    assert.equal(f.emit('drop', 10, 20), true);
    await settle();
    assert.equal(f.results.some(entry => entry.finish !== undefined), false);
    release();
    await settle();
    assert.deepEqual(f.results.slice(-2), [{finish: actions.COPY}, 'cleanup']);
});

test('URI-only offers resolve into web COPY or file actions during hover', async () => {
    for (const type of ['web-links', 'file-references']) {
        const logical = type === 'web-links'
            ? {type, links: [], customIcon: null}
            : {type, references: 'file:///tmp/a', format: 'text/uri-list'};
        const f = fixture(['text/uri-list'], logical);
        f.emit('accept');
        assert.equal(f.emit('drag-enter'), 0);
        await settle();
        assert.equal(f.emit('drag-motion', 10, 20),
            type === 'file-references' ? actions.MOVE : actions.COPY);
    }
});

test('URI resolution rejects an invalid offer through the drop target', async () => {
    const f = fixture(['text/uri-list'], {type: 'unsupported'});
    assert.equal(f.emit('accept'), true);
    f.emit('drag-enter');
    await settle();

    assert.equal(f.grid.gridDropController.rejectedDrop, f.drop);
    assert.equal(f.grid._dropSession.drop, null);
});

test('file COPY/MOVE and directory destinations retain the existing completion route', async () => {
    for (const action of [actions.COPY, actions.MOVE]) {
        const f = fixture(['text/uri-list'], {
            type: 'file-references',
            references: 'file:///tmp/a\r\nfile:///tmp/b',
            format: 'text/uri-list',
        }, action);
        f.grid._fileAt = () => ({dropCapable: true});
        f.emit('accept');
        await settle();
        assert.equal(f.emit('drop', 10, 20), true);
        await settle();
        assert.deepEqual(f.results, [{operation: 'files', action, ontoItem: true}, {finish: action}, 'cleanup']);
    }
});

test('the session applies file-destination action policy', () => {
    const blocked = fixture(['x-special/gnome-icon-list'], {
        type: 'file-references', references: '', format: 'x-special/gnome-icon-list',
    });
    blocked.grid._fileAt = () => ({dropCapable: false});
    assert.equal(blocked.emit('drag-motion', 10, 20), 0);

    const externalDrive = fixture(['x-special/gnome-icon-list'], {
        type: 'file-references', references: '', format: 'x-special/gnome-icon-list',
    });
    externalDrive.grid._fileAt = () => ({
        dropCapable: true,
        _fileExtra: Enums.FileType.EXTERNAL_DRIVE,
    });
    assert.equal(externalDrive.emit('drag-motion', 10, 20), actions.COPY);
});

test('internal repositioning does not read browser representations', () => {
    const f = fixture(['x-special/ding-icon-list'], {
        type: 'file-references', references: {}, format: 'x-special/ding-icon-list',
    }, actions.MOVE);
    let movedTo;
    f.grid._dragManager.doMoveWithDragAndDrop =
    (_xOrigin, _yOrigin, X, Y) => {
        movedTo = [X, Y];
        f.results.push('reposition');
    };
    assert.equal(f.emit('drop', 10, 20), true);
    assert.deepEqual(movedTo, [50, 50]);
    assert.deepEqual(f.results, ['reposition', {finish: actions.MOVE}, 'cleanup']);
});

test('the session routes internal item targets back to the desktop', () => {
    const f = fixture(['x-special/ding-icon-list'], {
        type: 'file-references', references: {}, format: 'x-special/ding-icon-list',
    }, actions.MOVE);
    const fileItem = {
        dropCapable: true,
        _hasToRouteDragToGrid: () => true,
    };
    f.grid._fileAt = () => fileItem;

    const pointerDestination = f.grid._findDropDestination(10, 20);
    assert.equal(pointerDestination.fileItem, fileItem);
    assert.equal(f.emit('drop', 10, 20), true);
    assert.deepEqual(f.results,
        ['reposition', {finish: actions.MOVE}, 'cleanup']);
});

test('drop context snapshots destination coordinates and selected action', () => {
    const f = fixture(['x-special/gnome-icon-list'], {
        type: 'file-references', references: '', format: 'x-special/gnome-icon-list',
    });
    const fileItem = {dropCapable: true};
    f.grid._fileAt = () => fileItem;
    f.emit('drag-motion', 10, 20);

    const context = f.grid._dropSession.dropContext;
    f.setSourceActions(actions.MOVE);
    f.emit('drag-motion', 30, 40);

    assert.equal(context.effectiveDestination.fileItem, fileItem);
    assert.deepEqual(
        Array.from(context.effectiveDestination.localPosition),
        [10, 20]
    );
    assert.deepEqual(
        Array.from(context.effectiveDestination.globalPosition),
        [10, 20]
    );
    assert.equal(context.selectedAction, actions.COPY | actions.MOVE);
    assert.equal(Reflect.set(
        context.effectiveDestination.localPosition,
        0,
        99
    ), false);
    assert.deepEqual(
        Array.from(context.effectiveDestination.localPosition),
        [10, 20]
    );
});

test('a replacement drop cancels an older read without receiving its completion', async () => {
    const f = fixture(['text/x-moz-url'], {
        type: 'web-links', links: [], customIcon: null,
    });
    let finishReading;
    f.grid._dropSession._createContentsReader = () => ({
        readContents: () => new Promise(resolve => {
            finishReading = resolve;
        }),
    });

    assert.equal(f.emit('drop', 10, 20), true);
    const newerDrop = replacementDrop(['text/x-moz-url']);
    assert.equal(emitForDrop(
        f.grid,
        'accept',
        newerDrop
    ), true);
    emitForDrop(f.grid, 'drag-enter', newerDrop);

    finishReading(f.drop.logical);
    await settle();
    await settle();

    assert.deepEqual(f.results, [{finish: 0}]);
    assert.deepEqual(newerDrop.finishes, []);
    assert.equal(f.grid._dropSession.drop, newerDrop);
});

for (const outcome of ['success', 'failure']) {
    test(`stale action ${outcome} finishes only its original drop`, async () => {
        const f = fixture(['text/x-moz-url'], {
            type: 'web-links', links: [], customIcon: null,
        });
        let settleAction;
        f.grid.DesktopIconsUtil.writeTransferContentToDesktop = () =>
            new Promise((resolve, reject) => {
                settleAction = outcome === 'success'
                    ? () => resolve(true)
                    : reject;
            });

        assert.equal(f.emit('drop', 10, 20), true);
        await settle();

        const newerDrop = replacementDrop(['text/x-moz-url']);
        emitForDrop(f.grid, 'accept', newerDrop);
        emitForDrop(f.grid, 'drag-enter', newerDrop);
        const cleanupCount = f.results.filter(value =>
            value === 'cleanup').length;

        settleAction(outcome === 'success'
            ? undefined
            : new Error('Simulated action failure'));
        await settle();
        await settle();

        assert.deepEqual(f.results.filter(value => value?.finish !== undefined),
            [{finish: outcome === 'success' ? actions.COPY : 0}]);
        assert.equal(f.results.filter(value =>
            value === 'cleanup').length, cleanupCount);
        assert.deepEqual(newerDrop.finishes, []);
        assert.equal(f.grid._dropSession.drop, newerDrop);
    });
}

test('typed file lists remain file drops even when plain text is also offered', async () => {
    const f = fixture(['text/plain'], {
        type: 'file-references', references: 'file:///tmp/a', format: 'text/uri-list',
    }, actions.COPY);
    f.drop.get_formats = () => new Formats(['text/plain'], ['GdkFileList']);
    assert.equal(f.emit('accept'), true);
    assert.equal(f.emit('drop', 10, 20), true);
    await settle();
    assert.deepEqual(f.results, [
        {operation: 'files', action: actions.COPY, ontoItem: false},
        {finish: actions.COPY}, 'cleanup',
    ]);
});

test('text completion is awaited; failed creation finishes with zero', async () => {
    const f = fixture(['text/plain'], {type: 'text', text: 'paragraph'});
    f.grid.DesktopIconsUtil.writeTransferContentToDesktop = () =>
        Promise.reject(new Error('Write failed'));
    assert.equal(f.emit('drop', 10, 20), true);
    await settle();
    assert.deepEqual(f.results, [{finish: 0}, 'cleanup']);
});

test('all files created by one drop share its policy-adjusted anchor', async () => {
    for (const [freePositionIcons, expectedPosition] of [
        [false, [150, 250]],
        [true, [149, 249]],
    ]) {
        const f = fixture(['text/plain'], {type: 'text', text: 'paragraph'});
        f.grid.Prefs.freePositionIcons = freePositionIcons;
        const createdFiles = [
            {get_basename: () => 'First'},
            {get_basename: () => 'Second'},
            {get_basename: () => 'Failed'},
        ];
        f.grid.DesktopIconsUtil.writeTransferContentToDesktop =
        (_directory, _contents, pendingPlacement) => {
            let failedRegistration;
            for (const file of createdFiles)
                failedRegistration = pendingPlacement.beforeCreate(file);
            pendingPlacement.creationFailed(
                createdFiles[2],
                failedRegistration
            );
            return Promise.resolve(true);
        };

        assert.equal(f.emit('drop', 149, 249), true);
        await settle();
        assert.deepEqual(
            Array.from(f.grid._dropOperations.positionsForNewFiles.First),
            expectedPosition
        );
        assert.deepEqual(
            Array.from(f.grid._dropOperations.positionsForNewFiles.Second),
            expectedPosition
        );
        assert.equal('Failed' in f.grid._dropOperations.positionsForNewFiles, false);
    }
});

test('pending creation protects every filename that already exists', () => {
    const f = fixture(['text/plain'], {type: 'text', text: 'paragraph'});
    f.grid._desktopManager.currentWorkingList = [
        {
            fileName: 'Example',
            savedCoordinates: [10, 20],
            normalCoordinates: [10, 20],
            monitorIndex: 0,
        },
        {
            fileName: 'Example (copy)',
            savedCoordinates: [30, 40],
            normalCoordinates: [30, 40],
            monitorIndex: 0,
        },
    ];

    const pendingPlacement =
        f.grid._dropOperations._createFilePlacementCallbacks([120, 240]);
    pendingPlacement.beforeCreate({get_basename: () => 'Example 1'});

    assert.deepEqual(Array.from(
        f.grid._dropOperations.positionsForExistingFiles.Example
    ), [10, 20, 10, 20, 0]);
    assert.deepEqual(Array.from(
        f.grid._dropOperations.positionsForExistingFiles['Example (copy)']
    ), [30, 40, 30, 40, 0]);
    assert.deepEqual(Array.from(
        f.grid._dropOperations.positionsForNewFiles['Example 1']
    ), [120, 240]);
    assert.equal(
        f.grid._dropOperations.isPlacementManagedFor('Example'),
        true
    );
    assert.equal(
        f.grid._dropOperations.isPlacementManagedFor('Example 1'),
        true
    );
});

test('Nautilus collision names are recognized as managed placement', () => {
    const f = fixture(['text/uri-list'], {
        type: 'file-references',
        references: 'file:///tmp/Example.txt',
        format: 'text/uri-list',
    });
    f.grid._dropOperations._resetPendingFilePositions();
    f.grid._dropOperations.positionsForNewFiles[
        'Example.txtCOPYEXPECTED'
    ] = [120, 240];

    assert.equal(
        f.grid._dropOperations.isPlacementManagedFor('Example (copy).txt'),
        true
    );
    assert.equal(
        f.grid._dropOperations.isPlacementManagedFor('Unrelated (copy).txt'),
        false
    );
});

test('external file batches retain the shared anchor for every basename', () => {
    const f = fixture(['text/uri-list'], {
        type: 'file-references',
        references: 'file:///tmp/First\nfile:///tmp/Second',
        format: 'text/uri-list',
    });
    const dropPosition = [120, 240];
    f.grid._desktopManager.currentWorkingList = [];
    f.grid._dropOperations._resetPendingFilePositions();

    for (const basename of ['First', 'Second']) {
        f.grid._dropOperations._registerIncomingFilePosition(
            {get_basename: () => basename},
            dropPosition
        );
    }

    assert.deepEqual(
        Array.from(f.grid._dropOperations.positionsForNewFiles.First),
        dropPosition
    );
    assert.deepEqual(
        Array.from(f.grid._dropOperations.positionsForNewFiles.Second),
        dropPosition
    );
});

test('internal copies prepare pending placement but internal moves do not', async () => {
    const operations = Object.create(dropOperations);
    const prepared = [];
    operations._desktopManager = {
        desktopDir: {get_uri: () => 'file:///desktop'},
    };
    operations.fileURIsFromReferences = () => ['file:///desktop/Example'];
    operations.desktopPositionForDrop = position => position;
    operations.prepareIncomingFilePlacement = (...args) => {
        prepared.push(args);
        return Promise.resolve();
    };
    operations.copyOrMoveUris = () => Promise.resolve();

    await operations.handleFileDrop(
        [120, 240], null, null, actions.COPY, true, null
    );
    assert.equal(prepared.length, 1);
    assert.deepEqual(Array.from(prepared[0][0]), [
        'file:///desktop/Example',
    ]);
    assert.deepEqual(Array.from(prepared[0][1]), [120, 240]);
    assert.equal(prepared[0][2].filesWillBeCopied, true);

    prepared.length = 0;
    await operations.handleFileDrop(
        [120, 240], null, null, actions.MOVE, true, null
    );
    assert.deepEqual(prepared, []);
});

test('ASK waits for and returns the action performed by the chooser', async () => {
    const operations = Object.create(dropOperations);
    operations._desktopManager = {
        desktopDir: {get_uri: () => 'file:///desktop'},
    };
    operations.fileURIsFromReferences = () => ['file:///desktop/Example'];
    operations.desktopPositionForDrop = position => position;
    let choose;
    operations.askWhatToDoWithFiles = () => new Promise(resolve => {
        choose = resolve;
    });

    let completed = false;
    const drop = operations.handleFileDrop(
        [120, 240], null, null, actions.ASK, true, null
    ).then(action => {
        completed = true;
        return action;
    });
    await settle();
    assert.equal(completed, false);

    choose(actions.COPY);
    assert.equal(await drop, actions.COPY);
});

test('browser links reject item targets and sources that cannot COPY', () => {
    const f = fixture(['text/x-moz-url'], {type: 'web-links', links: []});
    f.grid._fileAt = () => ({dropCapable: true});
    assert.equal(f.emit('drag-motion', 10, 20), 0);
    assert.equal(f.emit('drop', 10, 20), false);
    assert.equal(f.results.some(entry => entry.finish !== undefined), false);
    const moveOnly = fixture(['text/x-moz-url'], {
        type: 'web-links', links: [],
    }, actions.MOVE);
    assert.equal(moveOnly.emit('drag-enter'), 0);
    assert.equal(moveOnly.emit('drop', 10, 20), false);
});

test('action negotiation reads the current actions from Gdk.Drop', () => {
    const f = fixture(['text/x-moz-url'], {type: 'web-links', links: []});
    assert.equal(f.emit('drag-enter'), actions.COPY);

    f.setSourceActions(actions.MOVE);
    assert.equal(f.emit('drag-motion', 10, 20), 0);
    assert.equal(f.emit('drop', 10, 20), false);
});

test('leaving a browser drag clears its session without changing controller actions', async () => {
    const f = fixture(['text/uri-list'], {type: 'web-links', links: []});
    f.emit('accept');
    f.emit('drag-enter');
    assert.equal(f.grid.dragIsOverGrid, true);
    const cancellable = f.grid._dropSession._cancellable;
    f.emit('drag-leave');
    assert.equal(f.grid.dragIsOverGrid, false);
    assert.equal(f.grid._dropSession.drop, null);
    assert.equal(cancellable.is_cancelled(), true);
    await settle();
    assert.equal(f.grid.gridDropController.actions,
        actions.COPY | actions.MOVE | actions.LINK | actions.ASK);
    assert.equal(f.grid.gridDropController.actionUpdates, 1);
    assert.deepEqual(f.results, [{allowed: 0, preferred: 0}, 'cleanup']);
});

test('cancelling drop I/O rejects and releases the current drop', () => {
    const f = fixture(['text/x-moz-url'], {
        type: 'web-links', links: [], customIcon: null,
    });
    f.emit('accept');
    const session = f.grid._dropSession;
    const cancellable = session._cancellable;

    cancellable.cancel();

    assert.equal(session.drop, null);
    assert.equal(session._cancellable, null);
    assert.deepEqual(f.results, [{allowed: 0, preferred: 0}]);
});

test('cancelled drop data is never routed to content creation', async () => {
    const f = fixture(['text/x-moz-url'], {
        type: 'web-links', links: [], customIcon: null,
    });
    f.grid._dropSession._createContentsReader = () => ({
        readContents: () => {
            f.grid._dropSession._cancellable.cancel();
            return Promise.resolve(f.drop.logical);
        },
    });

    assert.equal(f.emit('drop', 10, 20), true);
    await settle();

    assert.deepEqual(f.results, [
        {allowed: 0, preferred: 0},
        {finish: 0},
        'cleanup',
    ]);
});

test('leaving during accepted processing defers release until completion', () => {
    const f = fixture(['text/x-moz-url'], {type: 'web-links', links: []});
    f.emit('accept');
    const session = f.grid._dropSession;
    const context = session.dropContext;
    void session.readDropContents(context).catch(() => {});
    const cancellable = session._cancellable;

    session.leave(f.drop);
    assert.equal(session.drop, f.drop);
    assert.equal(cancellable.is_cancelled(), false);

    session.release(f.drop);
    assert.equal(session.drop, null);
    assert.equal(cancellable.is_cancelled(), true);
});

test('parameterized HTML, named file bytes and standalone pictures are accepted as COPY', async () => {
    for (const mime of ['text/html; charset="UTF-8"', 'application/octet-stream;name="photo.jpg"', 'image/png']) {
        const f = fixture([mime], {type: 'file-content'});
        assert.equal(f.emit('accept'), true);
        assert.equal(f.emit('drag-enter'), actions.COPY);
        let resolveCreation;
        f.grid.DesktopIconsUtil.writeTransferContentToDesktop = () =>
            new Promise(resolve => {
                resolveCreation = () => resolve(true);
            });
        assert.equal(f.emit('drop', 10, 20), true);
        await settle();
        assert.equal(f.results.some(entry => entry.finish !== undefined), false);
        resolveCreation();
        await settle();
        assert.deepEqual(f.results.slice(-2), [{finish: actions.COPY}, 'cleanup']);
    }
});

test('picture/file creation rejects item destinations, MOVE-only offers and unknown formats', () => {
    for (const mime of ['image/png', 'application/octet-stream;name="a.txt"']) {
        const f = fixture([mime], {type: 'file-content'});
        f.grid._fileAt = () => ({dropCapable: true});
        assert.equal(f.emit('drop', 10, 20), false);
        const move = fixture([mime], {type: 'file-content'}, actions.MOVE);
        assert.equal(move.emit('drop', 10, 20), false);
    }
    assert.equal(fixture(['application/unknown'], {type: 'unsupported'}).emit('accept'), false);
    assert.equal(fixture(['application/octet-stream'], {type: 'unsupported'}).emit('accept'), false);
});
