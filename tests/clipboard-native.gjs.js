/* SPDX-License-Identifier: GPL-3.0-or-later */
/* eslint-disable no-await-in-loop -- Exercise each clipboard variant. */
import {Gtk, Gdk, Gio, GLib, GObject} from '../dependencies/gi.js';
import {Enums, Thumbnails, FileUtils, DesktopIconsUtil}
    from '../dependencies/localFiles.js';
import {ClipboardManager} from '../app/clipboardManager.js';

Gtk.init();
// Register the same asynchronous APIs used by the application.
for (const method of [
    'create_async', 'delete_async', 'load_bytes_async', 'query_info_async',
])
    Gio._promisify(Gio.File.prototype, method);
Gio._promisify(Gio.OutputStream.prototype, 'write_bytes_async');
Gio._promisify(Gio.OutputStream.prototype, 'close_async');
Gio._promisify(Gdk.Clipboard.prototype, 'read_async');
Gio._promisify(Gdk.Clipboard.prototype, 'read_value_async');
Gio._promisify(Gio.BufferedInputStream.prototype, 'fill_async');
Gio._promisify(Gio.InputStream.prototype, 'close_async');

const assert = (condition, message) => {
    if (!condition)
        throw new Error(message);
};
const equal = (actual, expected) => {
    assert(JSON.stringify(actual) === JSON.stringify(expected),
        `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};
const provider = (mime, text) => Gdk.ContentProvider.new_for_bytes(
    mime, new TextEncoder().encode(text)
);
// Wayland clipboard ownership requires a focused surface.
const window = new Gtk.Window({title: 'Clipboard test'});
const remoteCall = (objectPath, iface, method, args = null) =>
    Gio.DBus.session.call_sync(
        'org.gnome.Mutter.RemoteDesktop', objectPath, iface, method,
        args, null, Gio.DBusCallFlags.NONE, 5000, null
    );
// A headless compositor needs a virtual keyboard to deliver focus.
const remoteInterface = 'org.gnome.Mutter.RemoteDesktop';
const [inputSession] = remoteCall('/org/gnome/Mutter/RemoteDesktop',
    remoteInterface, 'CreateSession').deep_unpack();
remoteCall(inputSession, `${remoteInterface}.Session`, 'Start');
for (const pressed of [true, false]) {
    remoteCall(inputSession, `${remoteInterface}.Session`,
        'NotifyKeyboardKeysym',
        new GLib.Variant('(ub)', [Gdk.KEY_Shift_L, pressed]));
}
await new Promise(resolve => {
    const signal = window.connect('notify::is-active', () => {
        if (!window.is_active)
            return;
        window.disconnect(signal);
        resolve();
    });
    window.present();
});
const clipboard = Gdk.Display.get_default().get_clipboard();
let received;
const operations = [];
let selectedFiles = [];
const destination = Gio.File.new_for_path(GLib.getenv('XDG_DATA_HOME'))
    .get_child('desktop');
destination.make_directory(null);
const desktopUtils = new DesktopIconsUtil.DesktopIconsUtil({
    Enums, mainApp: {get_application_id: () => 'com.desktop.ding.test'},
}, {FileUtils});
const linkAction = {
    enabled: false,
    set_enabled(enabled) {
        this.enabled = enabled;
    },
};
const manager = new ClipboardManager({
    _clickX: 0,
    _clickY: 0,
    Enums,
    mainApp: {
        lookup_action: name =>
            name === 'doPasteAsLink' ? linkAction : {set_enabled: () => {}},
    },
    desktopDir: destination,
    getCurrentSelection: () => selectedFiles.map(file => ({file})),
    ThumbnailLoader: new Thumbnails.ThumbnailLoader(FileUtils),
    DBusUtils: {
        RemoteFileOperations: {
            CopyURIsRemote: (...args) => operations.push(['copy', ...args]),
            MoveURIsRemote: (...args) => operations.push(['move', ...args]),
        },
    },
    dropOperations: {
        desktopPositionForDrop: position => position,
        writeTransferContent: (contents, position) => {
            received = contents;
            equal(position, [0, 0]);
            return true;
        },
        fileURIsFromReferences: refs => GLib.Uri.list_extract_uris(refs),
        prepareIncomingFilePlacement: () => {},
        createSymbolicLinks: (files, uri, position) => {
            equal(position, [0, 0]);
            return desktopUtils.createSymbolicLinks(
                Gio.File.new_for_uri(uri), files
            );
        },
    },
});
const paste = async contentProvider => {
    received = null;
    operations.length = 0;
    assert(clipboard.set_content(contentProvider), 'Clipboard set failed');
    assert(await manager.paste(), 'Clipboard paste failed');
};

try {
    await paste(Gdk.ContentProvider.new_for_value('Native clipboard text'));
    equal(received, {type: 'text', text: 'Native clipboard text'});

    const texture = Gdk.MemoryTexture.new(
        1, 1, Gdk.MemoryFormat.R8G8B8A8,
        new GLib.Bytes(new Uint8Array([255, 0, 0, 255])), 4
    );
    const textureValue = new GObject.Value();
    textureValue.init(Gdk.Texture.$gtype);
    textureValue.set_object(texture);
    await paste(Gdk.ContentProvider.new_for_value(textureValue));
    equal(received.type, 'file-content');
    equal(received.name, 'Image.png');
    equal(Array.from(received.bytes.get_data()),
        Array.from(texture.save_to_png_bytes().get_data()));

    await paste(provider('text/plain', 'https://example.com/'));
    equal(received.type, 'web-links');
    equal(received.links, [{url: 'https://example.com/', title: ''}]);
    equal(received.customIcon, null);

    for (const urlProvider of [
        provider('text/uri-list', 'http://example.com/'),
        provider('text/x-moz-url', 'https://example.com/\nExample'),
    ]) {
        await paste(Gdk.ContentProvider.new_union([
            urlProvider,
            Gdk.ContentProvider.new_for_value(textureValue),
        ]));
        equal(received.type, 'web-links');
        assert(received.links[0].url.includes('example.com'),
            'URL did not survive clipboard read');
        assert(received.customIcon?.get_width() > 0,
            'URL image did not become a custom icon');
    }

    const files = ['file:///one', 'file:///two'];
    await paste(provider('text/uri-list', files.join('\r\n')));
    equal(operations, [['copy', files, destination.get_uri()]]);

    const fileList = Gdk.FileList.new_from_array(
        files.map(uri => Gio.File.new_for_uri(uri))
    );
    await paste(Gdk.ContentProvider.new_for_value(fileList));
    equal(operations, [['copy', files, destination.get_uri()]]);

    for (const action of ['copy', 'cut']) {
        await paste(Gdk.ContentProvider.new_union([
            provider('x-special/gnome-copied-files',
                `${action}\n${files.join('\n')}`),
            provider('text/plain', 'Ignored fallback text'),
        ]));
        const operation = action === 'cut' ? 'move' : 'copy';
        equal(operations, [[operation, files, destination.get_uri()]]);

        await paste(provider('text/plain',
            `x-special/nautilus-clipboard\n${action}\n${files.join('\n')}`));
        equal(operations, [[operation, files, destination.get_uri()]]);
    }

    for (const contents of [
        provider('text/plain', 'Ordinary clipboard text'),
        provider('text/plain', 'http://example.com/'),
        Gdk.ContentProvider.new_for_value(textureValue),
        provider('x-special/gnome-copied-files', 'cut\nfile:///one'),
        provider('text/uri-list', 'sftp://host/file'),
    ]) {
        clipboard.set_content(contents);
        await manager.updatePasteAsLink();
        equal(linkAction.enabled, false);
        equal(await manager.paste(true), false);
    }
    const source = destination.get_parent().get_child('source.txt');
    source.replace_contents('Source file', null, false,
        Gio.FileCreateFlags.NONE, null);
    for (const contents of [
        provider('x-special/gnome-copied-files', `copy\n${source.get_uri()}`),
        provider('text/uri-list', source.get_uri()),
        provider('text/plain',
            `x-special/nautilus-clipboard\ncopy\n${source.get_uri()}`),
    ]) {
        clipboard.set_content(contents);
        await manager.updatePasteAsLink();
        equal(linkAction.enabled, true);
        equal(await manager.paste(true), true);
    }
    const links = destination.enumerate_children(
        'standard::is-symlink,standard::symlink-target',
        Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null
    );
    let linkCount = 0;
    for (let info = links.next_file(null); info; info = links.next_file(null)) {
        assert(info.get_is_symlink(), 'Paste as Link must create a symlink');
        equal(info.get_symlink_target(), source.get_path());
        linkCount++;
    }
    links.close(null);
    equal(linkCount, 3);

    selectedFiles = [source];
    for (const copy of [true, false]) {
        operations.length = 0;
        manager.copyOrCutSelection(copy);
        assert(clipboard.get_formats().contain_gtype(Gdk.FileList.$gtype),
            'Copy/cut must offer a typed file list');
        const typedFiles = await clipboard.read_value_async(
            Gdk.FileList.$gtype, GLib.PRIORITY_DEFAULT, null
        );
        equal(typedFiles.get_files().map(file => file.get_uri()),
            [source.get_uri()]);
        equal(await manager.paste(), true);
        equal(operations, [[copy ? 'copy' : 'move',
            [source.get_uri()], destination.get_uri()]]);
    }
} finally {
    manager.destroy();
    clipboard.set_content(null);
    window.destroy();
    remoteCall(inputSession, 'org.gnome.Mutter.RemoteDesktop.Session',
        'Stop');
}
print('native clipboard checks passed');
