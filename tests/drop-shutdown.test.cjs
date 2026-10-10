/* eslint-env node */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');

function loadClass(file, name, globals = {}) {
    const source = fs.readFileSync(path.join(__dirname, '../app', file), 'utf8')
        .replace(/^import .*;\n/gm, '').replace(/^export \{.*\};\n/gm, '');
    return vm.runInNewContext(`${source}\n${name}`, globals);
}

test('a drop read finishing after shutdown cannot create files or update feedback', async () => {
    const source = fs.readFileSync(path.join(__dirname, '../app/desktopGrid.js'), 'utf8');
    const controlSource = source.slice(source.indexOf('const ControlGrid ='),
        source.indexOf('const OffsetPicture ='));
    const Grid = vm.runInNewContext(`${controlSource}\nControlGrid`, {
        DrawGrid: class {},
        Gdk: {DragAction: {NONE: 0}},
    });
    const grid = Object.create(Grid.prototype);
    grid._stopSpringLoadedTimer = () => {};
    let finishRead;
    const cancellable = {
        cancelled: false,
        is_cancelled() {
            return this.cancelled;
        },
    };
    const session = {};
    grid._dropSession = session;
    session.readDropContents = () => new Promise(resolve => {
        finishRead = resolve;
    });
    session.completeDrop = (_drop, action) => assert.equal(action, 0);
    session.reportDropError = (_context, error) => assert.fail(error);
    session.destroy = () => {
        cancellable.cancelled = true;
    };
    grid._clearDropFeedback = () => assert.fail('feedback after teardown');
    grid._dropOperations = {
        createDroppedContent: () => assert.fail('creation after teardown'),
    };
    const pending = grid._completeAcceptedDrop({cancellable, drop: {}});
    grid.stopDragHandling();
    finishRead({type: 'text', text: 'pending paste'});
    await pending;
});

function dropFixture() {
    let callback;
    const actions = [];
    const cancellables = [];
    const Gdk = {DragAction: {NONE: 0, MOVE: 2, COPY: 1, LINK: 4}};
    const Operations = loadClass('desktopDropOperations.js', 'DesktopDropOperations', {
        Gdk,
        Gtk: {
            ResponseType: {CANCEL: -6},
            AlertDialog: class {
                set_message() {}
                set_modal() {}
                set_cancel_button() {}
                set_default_button() {}
                choose(_window, _cancellable, handler) {
                    callback = handler;
                }
            },
        },
        Gio: {
            Cancellable: {
                new() {
                    const cancellable = {
                        cancelled: false,
                        cancel() {
                            this.cancelled = true;
                        },
                        is_cancelled() {
                            return this.cancelled;
                        },
                    };
                    cancellables.push(cancellable);
                    return cancellable;
                },
            },
        },
        _: text => text,
        console,
    });
    const operations = new Operations({
        mainApp: {activate_action: action => actions.push(action)},
        getDialogParentWindow: () => null,
    });
    return {
        operations, actions, cancellables,
        choose: button => callback({choose_finish: () => button}, {}),
    };
}

test('drop teardown cancels the chooser and ignores a late Link response', async () => {
    const {operations, actions, choose} = dropFixture();
    operations.createSymbolicLinks = () => assert.fail('late link creation');
    const pending = operations.askWhatToDoWithFiles([], 'file:///desktop', 0, 0);
    operations.destroy();
    await choose(2);
    assert.equal(await pending, 0);
    assert.deepEqual(actions, [
        'textEntryAccelsTurnOff', 'textEntryAccelsTurnOn',
    ]);
});

test('shutdown during placement preparation prevents the subsequent file copy', async () => {
    const {operations, actions, choose} = dropFixture();
    let finishPlacement;
    operations.prepareIncomingFilePlacement = () => new Promise(resolve => {
        finishPlacement = resolve;
    });
    operations.copyOrMoveUris = () => assert.fail('copy after shutdown');
    const pending = operations.askWhatToDoWithFiles([], 'file:///desktop', 0, 0);
    const response = choose(1);
    operations.destroy();
    finishPlacement();
    await response;
    assert.equal(await pending, 0);
    assert.deepEqual(actions, [
        'textEntryAccelsTurnOff', 'textEntryAccelsTurnOn',
    ]);
});

test('a cancelled chooser always requests accelerator restoration', async () => {
    const {operations, actions, cancellables, choose} = dropFixture();
    const pending = operations.askWhatToDoWithFiles([], 'file:///desktop', 0, 0);
    cancellables[0].cancel();
    await choose(3);
    assert.equal(await pending, 0);
    assert.deepEqual(actions, [
        'textEntryAccelsTurnOff', 'textEntryAccelsTurnOn',
    ]);
});
