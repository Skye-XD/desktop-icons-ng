/* eslint-env node */
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {test} = require('node:test');

test('browser drops with real GJS, Gio streams, parsers, and exclusive file creation', t => {
    const available = spawnSync('gjs', ['--version']);
    if (available.error?.code === 'ENOENT') {
        t.skip('GJS is not installed');
        return;
    }
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ding-browser-drop-'));
    try {
        const result = spawnSync('gjs', ['-m', path.join(__dirname, 'browser-drop.gjs.js'), directory], {
            encoding: 'utf8', timeout: 30000,
            env: {
                ...process.env,
                XDG_DATA_HOME: directory,
                XDG_CACHE_HOME: directory,
            },
        });
        assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}\n${result.error ?? ''}`);
        assert.match(result.stdout, /browser-drop checks passed/);
    } finally {
        fs.rmSync(directory, {recursive: true, force: true});
    }
});
