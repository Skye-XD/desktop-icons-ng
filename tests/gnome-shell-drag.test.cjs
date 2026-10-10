/* eslint-env node */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');

const source = fs.readFileSync(
    path.join(__dirname, '../app/gnomeShellDragDrop.js'),
    'utf8'
).replace(/^import .*;\n/gm, '').replace(/^export \{.*\};\n/gm, '');

const removedSources = [];
const GLib = {
    PRIORITY_DEFAULT: 0,
    SOURCE_REMOVE: false,
    SOURCE_CONTINUE: true,
    SpawnFlags: {SEARCH_PATH: 1},
    Source: {remove: id => removedSources.push(id)},
    build_filenamev: parts => parts.join('/'),
    get_monotonic_time: () => 0,
    timeout_add() {
        return 42;
    },
};
const Gdk = {
    CURRENT_TIME: 0,
    Display: {
        get_default: () => ({get_app_launch_context: () => ({})}),
    },
};
const Gio = {AppInfo: {launch_default_for_uri() {}}};
const DesktopAppInfo = {new_from_filename: () => null};
const GnomeShellDrag = vm.runInNewContext(
    `${source}\nGnomeShellDrag`,
    {
        Gdk,
        Gio,
        GLib,
        DesktopAppInfo,
        _: text => text,
        console: {log() {}, error() {}},
    }
);

const deferred = () => {
    let resolve;
    const promise = new Promise(done => {
        resolve = done;
    });
    return {promise, resolve};
};

function fixture({coordinates, target} = {}) {
    const cursors = [];
    const copies = [];
    const remote = {
        isAvailable: true,
        getDropTargetCoordinates: () =>
            coordinates?.promise ?? Promise.resolve([100, 100]),
        getDropTargetAppInfoDesktopFile: () =>
            target?.promise ?? Promise.resolve(null),
        setDragCursor: cursor => cursors.push(cursor),
    };
    const manager = {
        DBusUtils: {RemoteExtensionControl: remote},
        DesktopIconsUtil: {},
        Enums: {
            DND_SHELL_HOVER_POLL: 200,
            DND_HOVER_TIMEOUT: 500,
            ShellDropCursor: {
                DEFAULT: 'default',
                NODROP: 'no-drop',
                COPY: 'copy',
                MOVE: 'move',
            },
        },
        Prefs: {},
        dragManager: {dragItem: {}},
        getCurrentSelection: () => [{attributeContentType: 'text/plain'}],
        getCurrentSelectionAsUri: () => ['file:///source'],
        dropOperations: {
            copyOrMoveUris: (...args) => {
                copies.push(args);
                return Promise.resolve();
            },
        },
        mainApp: {activate_action() {}},
    };

    return {
        shellDrag: new GnomeShellDrag(manager),
        cursors,
        copies,
    };
}

test('destroy leaves the native cursor untouched when Shell did not own it', () => {
    const {shellDrag, cursors} = fixture();
    shellDrag._dockUriSpringTimerID = 0;

    shellDrag.destroy();

    assert.deepEqual(cursors, []);
});

test('destroy restores a cursor previously set for a Shell target', () => {
    const {shellDrag, cursors} = fixture();
    shellDrag._dockUriSpringTimerID = 0;
    shellDrag._currentDesktopFileAppPath = 'file:///destination';
    shellDrag._setShellDropCursor();

    shellDrag.destroy();

    assert.deepEqual(cursors, ['move', 'default']);
});

test('a late shell-target reply cannot change the cursor after destroy', async () => {
    const target = deferred();
    const {shellDrag, cursors} = fixture({target});
    const poll = shellDrag._dockUriSpringTimerFunction();

    await Promise.resolve();
    shellDrag.destroy();
    target.resolve('file:///destination');
    await poll;

    assert.deepEqual(cursors, []);
    assert.equal(shellDrag._currentDesktopFileAppPath, null);
});

test('no Shell target leaves native GTK cursor negotiation untouched', async () => {
    const {shellDrag, cursors} = fixture();

    await shellDrag._lookOffLeftEdgeForDrop([100, 100]);

    assert.deepEqual(cursors, []);
    assert.equal(shellDrag._currentDesktopFileAppPath, null);
});

test('the DBus null sentinel does not claim the Shell cursor', async () => {
    const target = {promise: Promise.resolve('null')};
    const {shellDrag, cursors} = fixture({target});

    await shellDrag._lookOffLeftEdgeForDrop([100, 100]);

    assert.deepEqual(cursors, []);
    assert.equal(shellDrag._currentDesktopFileAppPath, null);
});

test('leaving a recognized Shell target releases its cursor once', () => {
    const {shellDrag, cursors} = fixture();
    shellDrag._currentDesktopFileAppPath = 'file:///destination';
    shellDrag._setShellDropCursor();
    shellDrag._currentDesktopFileAppPath = null;

    shellDrag._setShellDropCursor();
    shellDrag._setShellDropCursor();

    assert.deepEqual(cursors, ['move', 'default']);
});

test('a recognized shell drop returns true synchronously and resets its cursor', () => {
    const {shellDrag, cursors, copies} = fixture();
    shellDrag._currentDesktopFileAppPath = 'file:///destination';
    shellDrag._setShellDropCursor();

    const handled = shellDrag.completeGnomeShellDrop();

    assert.equal(handled, true);
    assert.equal(handled instanceof Promise, false);
    assert.deepEqual(cursors, ['move', 'default']);
    assert.equal(copies.length, 1);
    assert.equal(copies[0][1], 'file:///destination');
});

function shellCursorFixture() {
    const managerSource = fs.readFileSync(
        path.join(__dirname, '../dingManager.js'),
        'utf8'
    );
    const setCursorMethod = managerSource.slice(
        managerSource.indexOf('    setDragCursor(cursor) {'),
        managerSource.indexOf('    getShellGlobalCoordinates()')
    );
    const cursorTypes = {
        DEFAULT: 'default',
        MOVE: 'move',
        COPY: 'copy',
        NO_DROP: 'no-drop',
    };
    let currentGrabActor;
    const main = {modalCount: 0};
    const stage = {
        get_grab_actor: () => currentGrabActor,
        set_cursor_type() {
            assert.fail('must not change the Shell stage cursor');
        },
    };
    const CursorService = vm.runInNewContext(
        `(class {${setCursorMethod}})`,
        {
            Clutter: {CursorType: cursorTypes},
            Main: main,
            global: {stage, get_stage: () => stage},
        }
    );
    const service = new CursorService();
    service._shellDragCursorActorRef = null;

    function createActor() {
        const cursorChanges = [];
        let destroyed = false;
        return {
            cursorChanges,
            set_cursor_type(cursor) {
                assert.equal(destroyed, false, 'must not access a disposed actor');
                cursorChanges.push(cursor);
            },
            destroy() {
                destroyed = true;
            },
        };
    }

    return {
        service,
        createActor,
        stage,
        main,
        setGrab(actor) {
            currentGrabActor = actor;
        },
    };
}

test('a reset after drag teardown does not access the destroyed actor', () => {
    const {service, createActor, setGrab} = shellCursorFixture();
    const actor = createActor();
    setGrab(actor);
    service.setDragCursor('dndMoveCursor');
    actor.destroy();
    setGrab(null);
    service.setDragCursor('default');

    assert.deepEqual(actor.cursorChanges, ['move']);
    assert.equal(service._shellDragCursorActorRef, null);
});

test('a delayed reset ignores a destroyed drag actor and an unrelated grab', () => {
    const {service, createActor, setGrab} = shellCursorFixture();
    const actor = createActor();
    setGrab(actor);
    service.setDragCursor('dndCopyCursor');
    actor.destroy();
    const unrelatedActor = createActor();
    setGrab(unrelatedActor);
    service.setDragCursor('default');
    service.setDragCursor('default');

    assert.deepEqual(actor.cursorChanges, ['copy']);
    assert.deepEqual(unrelatedActor.cursorChanges, []);
    assert.equal(service._shellDragCursorActorRef, null);
});

test('changing grabs never resets the previous actor', () => {
    const {service, createActor, setGrab} = shellCursorFixture();
    const first = createActor();
    const second = createActor();
    setGrab(first);
    service.setDragCursor('dndMoveCursor');
    service.setDragCursor('dndCopyCursor');
    setGrab(second);
    service.setDragCursor('dndNoDropCursor');
    first.destroy();
    assert.equal(service._shellDragCursorActorRef.deref(), second);
    service.setDragCursor('default');
    second.destroy();

    assert.deepEqual(first.cursorChanges, ['move', 'copy']);
    assert.deepEqual(second.cursorChanges, ['no-drop', 'default']);
});

test('leaving a Shell target resets the owned live grab only once', () => {
    const {service, createActor, setGrab} = shellCursorFixture();
    const actor = createActor();
    setGrab(actor);
    service.setDragCursor('dndCopyCursor');
    service.setDragCursor('default');
    service.setDragCursor('default');

    assert.deepEqual(actor.cursorChanges, ['copy', 'default']);
    assert.equal(service._shellDragCursorActorRef, null);
});

test('reset without an owned override leaves the current grab untouched', () => {
    const {service, createActor, setGrab} = shellCursorFixture();
    const actor = createActor();
    setGrab(actor);
    service.setDragCursor('default');

    assert.deepEqual(actor.cursorChanges, []);
});

test('a missing grab ignores cursor overrides', () => {
    const {service, setGrab} = shellCursorFixture();
    setGrab(null);
    service.setDragCursor('dndCopyCursor');
    service.setDragCursor('default');

    assert.equal(service._shellDragCursorActorRef, null);
});

for (const cursor of ['dndCopyCursor', 'dndNoDropCursor']) {
    test(`workspace switch cannot put ${cursor} on the Shell stage`, () => {
        const {service, createActor, setGrab, stage, main} = shellCursorFixture();
        const dragActor = createActor();
        setGrab(dragActor);
        service.setDragCursor(cursor);

        main.modalCount = 1;
        setGrab(stage);
        service.setDragCursor(cursor);
        assert.equal(service._shellDragCursorActorRef.deref(), dragActor);

        main.modalCount = 0;
        setGrab(dragActor);
        service.setDragCursor('default');
        assert.deepEqual(dragActor.cursorChanges, [
            cursor === 'dndCopyCursor' ? 'copy' : 'no-drop', 'default',
        ]);
    });
}

test('the stage is excluded even without a Shell modal count', () => {
    const {service, setGrab, stage} = shellCursorFixture();
    setGrab(stage);
    service.setDragCursor('dndCopyCursor');
    service.setDragCursor('default');
    assert.equal(service._shellDragCursorActorRef, null);
});

test('a late cursor request cannot modify a Shell modal actor', () => {
    const {service, createActor, setGrab, main} = shellCursorFixture();
    const modalActor = createActor();
    main.modalCount = 1;
    setGrab(modalActor);
    service.setDragCursor('dndNoDropCursor');
    service.setDragCursor('default');
    assert.deepEqual(modalActor.cursorChanges, []);
    assert.equal(service._shellDragCursorActorRef, null);
});
