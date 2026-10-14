/* eslint-env node */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');

const source = fs.readFileSync(
    path.join(__dirname, '../app/symLinkIcon.js'),
    'utf8'
).replace(/^import .*;\n/gm, '').replace(/^export \{.*\};\n/gm, '');

const missingFile = () => ({
    matches: (_domain, code) => code === 'not-found',
});
const monitor = {
    set_rate_limit() {},
    connect() {
        return 1;
    },
};
const Gio = {
    FILE_ATTRIBUTE_STANDARD_IS_SYMLINK: 'standard::is-symlink',
    File: {
        new_for_path: () => ({monitor: () => monitor}),
    },
    FileMonitorFlags: {WATCH_MOVES: 1},
    FileQueryInfoFlags: {NOFOLLOW_SYMLINKS: 1},
    FileType: {SYMBOLIC_LINK: 3},
    IOErrorEnum: {NOT_FOUND: 'not-found'},
};
const GLib = {PRIORITY_DEFAULT: 0};
const SymLinkIcon = vm.runInNewContext(`${source}\nSymLinkIcon`, {
    Gio,
    GLib,
    _: text => text,
});

class BaseIcon {
    constructor(_manager, file, fileInfo) {
        this._file = file;
        this._fileInfo = fileInfo;
        this._fileType = 0;
        this.Enums = {DEFAULT_ATTRIBUTES: 'metadata::*,standard::*'};
    }

    _queryFileInfoForRefresh() {
        return Promise.reject(this.followedQueryError);
    }
}

function fixture() {
    const fileInfo = {
        get_attribute_boolean: () => true,
        get_symlink_target: () => '/missing-target',
    };
    const file = {query_info_async() {}};
    const icon = new SymLinkIcon(BaseIcon, {}, file, fileInfo, 0, null);
    icon.followedQueryError = missingFile();
    return {file, icon};
}

test('a missing symlink target refreshes from the link itself', async () => {
    const {file, icon} = fixture();
    const linkInfo = {};
    const calls = [];
    file.query_info_async = (...args) => {
        calls.push(args);
        return Promise.resolve(linkInfo);
    };

    assert.equal(await icon._queryFileInfoForRefresh(null), linkInfo);
    assert.equal(calls.length, 1);
    assert.equal(calls[0][1], Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS);
});

test('a symlink that also disappeared ends its refresh quietly', async () => {
    const {file, icon} = fixture();
    file.query_info_async = () => Promise.reject(missingFile());

    assert.equal(await icon._queryFileInfoForRefresh(null), null);
});

test('unexpected symlink query failures are preserved', async () => {
    const {file, icon} = fixture();
    const failure = {matches: () => false};
    icon.followedQueryError = failure;
    let queriedLink = false;
    file.query_info_async = () => {
        queriedLink = true;
    };

    await assert.rejects(
        icon._queryFileInfoForRefresh(null),
        error => error === failure
    );
    assert.equal(queriedLink, false);
});
