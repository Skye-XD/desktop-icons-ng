/* eslint-env node */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');

// Run the actual controllers with a synchronous, layer-aware compositor mock.
// This checks convergence and lifecycle; real GNOME input needs manual testing.
function loadClass(file, name, globals = {}) {
    const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8')
    .replace(/^import .*;\n/gm, '')
    .replace(/^export .*;\n/gm, '');
    return vm.runInNewContext(`${source}\n${name}`, globals);
}

function fixture() {
    let nextId = 1;
    let stack = [];
    let lowerCount = 0;
    const listeners = new Map();
    const types = {DESKTOP: 0, NORMAL: 1, DOCK: 2};
    const display = {
        connect: (_signal, callback) => {
            const id = nextId++;
            listeners.set(id, callback);
            return id;
        },
        disconnect: id => listeners.delete(id),
        sort_windows_by_stacking: windows => windows,
    };
    const Manager = loadClass('windowTypeManager.js', 'ManageWindow', {
        GLib: {build_filenamev: parts => parts.join('/')},
        Meta: {WindowType: types},
        global: {
            display,
            workspace_manager: {
                get_active_workspace: () => ({list_windows: () => [...stack]}),
            },
        },
    });
    function restack(windows) {
        stack = windows;
        for (const callback of [...listeners.values()])
            callback();
    }
    function makeWindow(name, title = '', type = types.NORMAL) {
        const signals = new Map();
        const window = {
            name,
            title,
            type,
            above: false,
            on_all_workspaces: false,
            connect: (signal, callback) => {
                const id = nextId++;
                signals.set(id, {signal, callback});
                return id;
            },
            disconnect: id => signals.delete(id),
            get_title: () => window.title,
            get_window_type: () => window.type,
            set_type: value => {
                window.type = value;
            },
            get_layer: () => {
                if (window.above || window.type === types.DOCK)
                    return 4;
                return window.type === types.DESKTOP ? 0 : 2;
            },
            get_frame_rect: () => ({x: 0, y: 0}),
            stick: () => {
                window.on_all_workspaces = true;
            },
            unstick: () => {
                window.on_all_workspaces = false;
            },
            make_above: () => {
                window.above = true;
            },
            unmake_above: () => {
                window.above = false;
            },
            raise: () => restack([...stack.filter(w => w !== window), window]),
            lower: () => {
                assert.ok(++lowerCount < 50, 'restacking must converge');
                const others = stack.filter(w => w !== window);
                const index = others.findIndex(w => w.get_layer() >= window.get_layer());
                others.splice(index < 0 ? others.length : index, 0, window);
                restack(others);
            },
            emit: signal => {
                for (const entry of [...signals.values()]) {
                    if (entry.signal === signal)
                        entry.callback();
                }
            },
        };
        stack.push(window);
        if (title)
            window.customJS_ding = new Manager(window, null, null, () => {});
        return window;
    }
    return {makeWindow, restack, types, listeners, order: () => stack.map(w => w.name)};
}

test('pinned title selects the desktop policy, editing retains the top policy', () => {
    const WidgetWindow = loadClass('app/widgetWindow.js', 'WidgetWindow');
    const host = Object.create(WidgetWindow.prototype);
    host._instanceId = 'widget-id';
    host._widgetManager = {keepPinnedWidgetsBelowApps: false};
    assert.equal(host.buildPinnedTitle({x: 3, y: 4}), '@!3,4;KH;I=widget-id');
    assert.equal(host.buildPinnedTitle({x: 3, y: 4}, true), '@!3,4;TH;I=widget-id');
    host._widgetManager.keepPinnedWidgetsBelowApps = true;
    assert.equal(host.buildPinnedTitle({x: 3, y: 4}), '@!3,4;PDH;I=widget-id');
    assert.equal(host.buildPinnedTitle({x: 3, y: 4}, true), '@!3,4;TH;I=widget-id');
});

test('pinned windows stay above icons and below apps on mapping, focus and app lowering', () => {
    const f = fixture();
    const desktop = f.makeWindow('desktop', '', f.types.DESKTOP);
    const app = f.makeWindow('app');
    const first = f.makeWindow('first', '@!0,0;PDH;I=first');
    const second = f.makeWindow('second', '@!0,0;PDH;I=second');
    assert.equal(f.order()[0], 'desktop');
    assert.equal(f.order().at(-1), 'app');
    first.raise();
    assert.deepEqual(f.order(), ['desktop', 'first', 'second', 'app']);
    app.lower();
    assert.equal(f.order()[0], 'desktop');
    assert.equal(f.order().at(-1), 'app');
    f.restack([desktop, app, second, first]);
    assert.equal(f.order()[0], 'desktop');
    assert.equal(f.order().at(-1), 'app');
    assert.equal(first.on_all_workspaces, true);
    assert.equal(first.customJS_ding.desktopWindow, false);
});

test('widgets do not lower each other or fight windows in other compositor layers', () => {
    const f = fixture();
    const desktop = f.makeWindow('desktop', '', f.types.DESKTOP);
    const first = f.makeWindow('first', '@!0,0;PDH;I=first');
    const second = f.makeWindow('second', '@!0,0;PDH;I=second');
    first.raise();
    assert.deepEqual(f.order(), ['desktop', 'second', 'first']);
    const below = f.makeWindow('below');
    below.get_layer = () => 1;
    f.restack([desktop, below, second, first]);
    assert.deepEqual(f.order(), ['desktop', 'below', 'second', 'first']);
});

test('editing, returning to pinned mode, refresh and cleanup replace controllers', () => {
    const f = fixture();
    f.makeWindow('desktop', '', f.types.DESKTOP);
    f.makeWindow('app');
    const widget = f.makeWindow('widget', '@!0,0;PDH;I=widget');
    widget.title = '@!0,0;TH;I=widget';
    widget.emit('notify::title');
    assert.equal(widget.above, true);
    assert.equal(f.order().at(-1), 'widget');
    assert.equal(f.listeners.size, 1);
    widget.title = '@!0,0;PDH;I=widget';
    widget.emit('notify::title');
    assert.equal(widget.above, false);
    assert.deepEqual(f.order(), ['desktop', 'widget', 'app']);
    widget.customJS_ding.refreshProperties(true);
    assert.equal(f.listeners.size, 1);
    widget.above = true;
    widget.emit('notify::above');
    assert.equal(widget.above, false);
    widget.customJS_ding.disconnect();
    assert.equal(f.listeners.size, 0);
});

test('changing the preference switches an existing window between dock and desktop policies', () => {
    const f = fixture();
    f.makeWindow('desktop', '', f.types.DESKTOP);
    f.makeWindow('app');
    const widget = f.makeWindow('widget', '@!0,0;KH;I=widget');
    assert.equal(widget.type, f.types.DOCK);
    assert.equal(f.listeners.size, 0);
    widget.title = '@!0,0;PDH;I=widget';
    widget.emit('notify::title');
    assert.equal(widget.type, f.types.NORMAL);
    assert.deepEqual(f.order(), ['desktop', 'widget', 'app']);
    assert.equal(f.listeners.size, 1);
    widget.title = '@!0,0;KH;I=widget';
    widget.emit('notify::title');
    assert.equal(widget.type, f.types.DOCK);
    assert.equal(widget.on_all_workspaces, false);
    assert.equal(f.listeners.size, 0);
});
