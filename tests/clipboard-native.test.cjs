/* eslint-env node */
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {test} = require('node:test');

test('native GTK clipboard round trips on Wayland', t => {
    for (const command of ['gjs', 'mutter', 'dbus-run-session']) {
        const available = spawnSync(command, ['--help']);
        if (available.error?.code === 'ENOENT') {
            t.skip(`${command} is not installed`);
            return;
        }
    }
    const directory = fs.mkdtempSync(
        path.join(os.tmpdir(), 'ding-clipboard-')
    );
    try {
        const script = path.join(__dirname, 'clipboard-native.gjs.js');
        const result = spawnSync('dbus-run-session', [
            '--', 'mutter', '--wayland', '--no-x11', '--headless',
            '--virtual-monitor', '800x600',
            '--wayland-display', 'ding-test', '--', 'gjs', '-m', script,
        ], {
            encoding: 'utf8', timeout: 30000,
            env: {
                ...process.env,
                GDK_BACKEND: 'wayland',
                GIO_USE_VFS: 'local',
                GSETTINGS_BACKEND: 'memory',
                GTK_A11Y: 'none',
                LIBGL_ALWAYS_SOFTWARE: '1',
                XDG_RUNTIME_DIR: directory,
                XDG_DATA_HOME: directory,
                XDG_CACHE_HOME: directory,
            },
        });
        assert.equal(result.status, 0,
            `${result.stdout}\n${result.stderr}\n${result.error ?? ''}`);
        assert.match(result.stdout, /native clipboard checks passed/);
    } finally {
        fs.rmSync(directory, {recursive: true, force: true});
    }
});
