/* eslint-env node */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../app/desktopMenu.js'), 'utf8')
.replace(/^import .*;\n/gm, '')
.replace(/^export .*;\n/gm, '');
const Actions = vm.runInNewContext(`${source}\nDesktopActions`, {
    Gtk: {DirectionType: {UP: 2, DOWN: 3, LEFT: 4, RIGHT: 5}},
    Gdk: {KEY_Up: 65362, KEY_Down: 65364, KEY_Left: 65361, KEY_Right: 65363},
});

function fixture() {
    const actions = Object.create(Actions.prototype);
    const moves = [];
    const previews = [];
    actions._fileItemMenu = {};
    actions._DBusUtils = {RemoteFileOperations: {previewParentHandle: 'wayland:desktop'}};
    actions.activeFileItem = {uri: 'file:///next.png'};
    actions._selectFileItemInDirection = key => {
        moves.push(key);
        return true;
    };
    const proxy = {
        Visible: true,
        ParentHandle: 'wayland:desktop',
        ShowFileRemote: (...args) => previews.push(args.slice(0, 4)),
    };
    function emit(signature = '(u)', direction = 5, signal = 'SelectionEvent') {
        actions._onPreviewSignal(proxy, ':1.42', signal, {
            get_type_string: () => signature,
            deep_unpack: () => [direction],
        });
    }
    return {actions, proxy, moves, previews, emit};
}

test('both Sushi direction signatures navigate and refresh without toggling or activation', () => {
    for (const signature of ['(q)', '(u)']) {
        const f = fixture();
        for (const direction of [2, 3, 4, 5])
            f.emit(signature, direction);
        assert.deepEqual(f.moves, [65362, 65364, 65361, 65363]);
        assert.equal(f.previews.length, 4);
        assert.deepEqual(f.previews[0], ['file:///next.png', 'wayland:desktop', false, '']);
    }
});

test('foreign, closed, and unowned previews do not change desktop selection', () => {
    for (const change of [
        f => {
            f.proxy.ParentHandle = 'wayland:nautilus';
        },
        f => {
            f.proxy.Visible = false;
        },
        f => {
            f.actions._DBusUtils.RemoteFileOperations.previewParentHandle = '';
        },
    ]) {
        const f = fixture();
        change(f);
        f.emit();
        assert.deepEqual(f.moves, []);
        assert.deepEqual(f.previews, []);
    }
});

test('unrelated signals, malformed directions, and failed navigation do not refresh', () => {
    const f = fixture();
    f.emit('(s)');
    f.emit('(u)', 99);
    f.emit('(u)', 5, 'OtherSignal');
    assert.deepEqual(f.moves, []);
    f.actions._selectFileItemInDirection = () => false;
    f.emit();
    assert.deepEqual(f.previews, []);
});
