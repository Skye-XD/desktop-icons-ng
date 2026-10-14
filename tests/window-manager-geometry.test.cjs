/* eslint-env node */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');

class Variant {
    constructor(value) {
        this.value = value;
        this.unpackCount = 0;
    }

    equal(other) {
        return this.value === other.value;
    }

    recursiveUnpack() {
        this.unpackCount++;
        return [this.value];
    }
}

function fixture() {
    const source = fs.readFileSync(path.join(__dirname, '..', 'app/windowManager.js'), 'utf8');
    const Manager = vm.runInNewContext(`${source.slice(source.indexOf('const WindowManager = class'))}\nWindowManager`, {
        GLib: {Variant},
    });
    const manager = Object.create(Manager.prototype);
    manager._pendingGridWindowsUpdate = null;
    manager._gridWindowsUpdatePromise = null;
    manager._lastAppliedGeometry = null;
    manager._desktopManager = {runSerializedDesktopMutation: callback => Promise.resolve().then(callback)};
    const applied = [];
    manager._applyGridWindowsUpdate = data => Promise.resolve(applied.push(...data));
    return {manager, applied};
}

test('equal received variants skip unpacking and applying', async () => {
    const {manager, applied} = fixture();
    await manager.updateGridWindows(new Variant('A'));
    const duplicate = new Variant('A');
    await manager.updateGridWindows(duplicate);
    assert.equal(duplicate.unpackCount, 0);
    assert.deepEqual(applied, ['A']);
});

test('a return to the prior geometry while another update runs is applied', async () => {
    const {manager, applied} = fixture();
    await manager.updateGridWindows(new Variant('A'));
    let finish;
    let started;
    const running = new Promise(resolve => {
        started = resolve;
    });
    manager._applyGridWindowsUpdate = async data => {
        applied.push(...data);
        if (data[0] === 'B') {
            started();
            await new Promise(resolve => {
                finish = resolve;
            });
        }
    };
    const b = manager.updateGridWindows(new Variant('B'));
    await running;
    const a = manager.updateGridWindows(new Variant('A'));
    finish();
    await Promise.all([a, b]);
    assert.deepEqual(applied, ['A', 'B', 'A']);
});

test('failed updates clear cached geometry and can be retried', async () => {
    const {manager, applied} = fixture();
    await manager.updateGridWindows(new Variant('A'));
    manager._applyGridWindowsUpdate = () => Promise.reject(new Error('apply failed'));
    await assert.rejects(manager.updateGridWindows(new Variant('B')), /apply failed/);
    assert.equal(manager._lastAppliedGeometry, null);
    manager._applyGridWindowsUpdate = data => Promise.resolve(applied.push(...data));
    await manager.updateGridWindows(new Variant('A'));
    assert.deepEqual(applied, ['A', 'A']);
});

test('different variants are applied and replace the cached geometry', async () => {
    const {manager, applied} = fixture();
    await manager.updateGridWindows(new Variant('A'));
    const b = new Variant('B');
    await manager.updateGridWindows(b);
    assert.equal(manager._lastAppliedGeometry, b);
    assert.equal(b.unpackCount, 1);
    await manager.updateGridWindows(new Variant('A'));
    assert.deepEqual(applied, ['A', 'B', 'A']);
});
