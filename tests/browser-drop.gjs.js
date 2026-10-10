/* SPDX-License-Identifier: GPL-3.0-or-later */
/* eslint-disable no-await-in-loop -- Exercise each clipboard variant. */
import {Gio, GLib, Gdk, GdkPixbuf} from '../dependencies/gi.js';
import {WebUtils, DesktopIconsUtil, FileUtils, Enums, Thumbnails} from '../dependencies/localFiles.js';
import {DropSession} from '../app/dropSession.js';

const {decodeText, linkHTML, parseHTMLLink, parseURLTitle, webURL} = WebUtils;
const thumbnailLoader = new Thumbnails.ThumbnailLoader(FileUtils);
const desktopManager = {
    selectionCanBeRepositioned: () => true,
    ThumbnailLoader: thumbnailLoader,
};
const testAppId = 'com.desktop.ding.test';
const mainApp = {get_application_id: () => testAppId};
const customIconWrites = [];
const desktopUtils = new DesktopIconsUtil.DesktopIconsUtil(
    {Enums, mainApp},
    {
        FileUtils: {
            ...FileUtils,
            // GVfs metadata needs a desktop session, which shell runners may lack.
            // Record the metadata request while keeping file and icon writes real.
            setStringAttribute(file, attribute, value) {
                customIconWrites.push({file, attribute, value});
                return Promise.resolve();
            },
        },
        ThumbnailLoader: thumbnailLoader,
    }
);
const linkBasename = desktopUtils.linkBasename.bind(desktopUtils);
const createLinkFile = desktopUtils.createLinkFile.bind(desktopUtils);

const assert = (condition, message) => {
    if (!condition)
        throw new Error(message);
};
const equal = (actual, expected) => assert(JSON.stringify(actual) === JSON.stringify(expected),
    `Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
const encode = text => new TextEncoder().encode(text);
equal(
    desktopUtils.getBasenameBeforeCopySuffix('Example (copy).txt'),
    'Example'
);
equal(desktopUtils.getBasenameBeforeCopySuffix('Example.txt'), null);
// Standalone test entry point: register the same APIs as adw-ding.js.
Gio._promisify(Gio.File.prototype, 'make_directory_async');
Gio._promisify(Gio.File.prototype, 'set_attributes_async');
Gio._promisify(Gio.File.prototype, 'create_async');
Gio._promisify(Gio.File.prototype, 'delete_async');
Gio._promisify(Gio.File.prototype, 'load_bytes_async');
Gio._promisify(Gio.File.prototype, 'query_info_async');
Gio._promisify(Gio.File.prototype, 'replace_contents_bytes_async', 'replace_contents_finish');
Gio._promisify(Gio.BufferedInputStream.prototype, 'fill_async');
Gio._promisify(Gio.InputStream.prototype, 'read_bytes_async');
Gio._promisify(Gio.InputStream.prototype, 'close_async');
Gio._promisify(Gio.OutputStream.prototype, 'write_bytes_async');
Gio._promisify(Gio.OutputStream.prototype, 'close_async');
Gio._promisify(Gdk.Drop.prototype, 'read_async');
Gio._promisify(Gdk.Drop.prototype, 'read_value_async');
const metadataCalls = [];
const metadataFile = {
    set_attributes_async(info, flags, priority, cancellable) {
        metadataCalls.push({info, flags, priority, cancellable});
        info.set_attribute_status('metadata::nautilus-drop-position', Gio.FileAttributeStatus.SET);
        return Promise.resolve([info]);
    },
};
const metadataCancel = new Gio.Cancellable();
await FileUtils.setDropPosition(metadataFile, null);
equal(metadataCalls.length, 0);
await FileUtils.setDropPosition(metadataFile, [0, 25], metadataCancel, GLib.PRIORITY_LOW);
equal(metadataCalls[0].info.get_attribute_string('metadata::nautilus-drop-position'), '0,25');
equal(metadataCalls[0].priority, GLib.PRIORITY_LOW);
assert(metadataCalls[0].cancellable === metadataCancel, 'Metadata preserves cancellation');
metadataFile.set_attributes_async = info => Promise.resolve([info]);
let metadataFailed = false;
try {
    await FileUtils.setDropPosition(metadataFile, [1, 2]);
} catch (_e) {
    metadataFailed = true;
}
assert(metadataFailed, 'Unset attribute status must not be reported as success');
const fakeDrop = representations => ({
    reads: [],
    formatReads: 0,
    get_formats() {
        this.formatReads++;
        return {
            get_mime_types: () => Object.keys(representations),
            contain_gtype: () => false,
        };
    },
    get_actions() {
        return Gdk.DragAction.COPY;
    },
    async read_async(mimes) {
        this.reads.push(mimes[0]);
        await new Promise(resolve => GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            resolve();
            return GLib.SOURCE_REMOVE;
        }));
        const mime = mimes[0];
        const value = representations[mime];
        if (value instanceof Error)
            throw value;
        const bytes = typeof value === 'string' ? encode(value) : value;
        return [Gio.MemoryInputStream.new_from_bytes(new GLib.Bytes(bytes)), mime];
    },
    finish() {},
    status() {},
});

const startSession = drop => {
    const session = new DropSession({reject_drop() {}}, desktopManager);
    session.accept(drop);
    return session;
};

const offerRoute = mimes => {
    const drop = fakeDrop(Object.fromEntries(mimes.map(mime => [mime, ''])));
    const session = startSession(drop);
    const {route} = session;
    session.release(drop);
    return route;
};

const uriListParserSession = startSession(fakeDrop({'text/plain': ''}));
const createDropContentsFromURIList = text =>
    uriListParserSession._createContentsReader()._classifyURIListText(text);

const readExternalDropContents = async drop => {
    const session = new DropSession({reject_drop() {}}, desktopManager);
    // This helper tests the reader directly, without the session's concurrent
    // hover-time URI-list inspection reading the same representation first.
    session._classifyURIListForRouting = () => {};
    session.accept(drop);
    try {
        return await session._createContentsReader()
            ._readExternalDropContents();
    } finally {
        session.release(drop);
    }
};

const readOptionalWebLinkIcon = async drop => {
    const session = startSession(drop);
    try {
        return await session._createContentsReader()
            .readOptionalWebLinkIcon();
    } finally {
        session.release(drop);
    }
};

const url = 'https://aur.archlinux.org/';
const title = 'AUR (en) - Home';
const payload = `${url}\n${title}`;
const utf16 = new Uint8Array(payload.length * 2);
for (let i = 0; i < payload.length; i++) {
    utf16[2 * i] = payload.charCodeAt(i) & 255;
    utf16[2 * i + 1] = payload.charCodeAt(i) >> 8;
}
equal(decodeText(utf16).text, payload);
equal(decodeText(encode(payload)).text, payload);
equal(parseURLTitle(payload), {url, title});
equal(parseURLTitle(''), null);
equal(parseURLTitle(url), {url, title: ''});
equal(webURL('/relative/path'), null);
equal(webURL(''), null);
equal(parseURLTitle(`${payload}\nhttps://example.com/\nOther`), null);
equal(webURL('javascript:alert(1)'), null);
equal(webURL('file:///tmp/a'), null);
equal(webURL('https://example.com/ some text'), null);
equal(webURL('HTTPS://example.com/path?q=a&b=2'), 'HTTPS://example.com/path?q=a&b=2');
equal(offerRoute(['text/x-moz-url', 'text/uri-list']), 'read-text-or-web-link');
equal(offerRoute(['x-special/ding-icon-list', 'text/x-moz-url']), 'internal-desktop-items');
equal(offerRoute(['x-special/gnome-icon-list', 'text/plain']), 'file-operation');
equal(offerRoute(['text/uri-list', 'image/png']), 'inspect-uri-list');
equal(offerRoute(['image/png']), 'read-file-content');
equal(offerRoute(['image/heic']), 'read-file-content');
equal(offerRoute(['image/svg+xml']), 'read-file-content');
equal(offerRoute(['text/plain']), 'read-text-or-web-link');
equal(createDropContentsFromURIList('# comment\r\nfile:///tmp/a%20b\r\nfile:///tmp/c\r\n'),
    {type: 'file-references', references: 'file:///tmp/a%20b\r\nfile:///tmp/c', format: 'text/uri-list'});
equal(createDropContentsFromURIList(`${url}\nfile:///tmp/a`).type, 'unsupported');
equal(createDropContentsFromURIList('javascript:alert(1)').type, 'unsupported');
equal(createDropContentsFromURIList('data:text/plain,hello').type, 'unsupported');
equal(createDropContentsFromURIList('this is not a URI'), null);
equal(createDropContentsFromURIList(`${url}\r\nhttps://example.com/\r\n`).links.length, 2);
equal(parseHTMLLink('<a title="Fallback" href="https://example.com/?a=1&amp;b=2"><b>A &amp; B</b></a>'),
    {url: 'https://example.com/?a=1&b=2', title: 'A & B'});
equal(parseHTMLLink('<script>"<a href="https://bad.test/">bad</a>"</script>'), null);
equal(parseHTMLLink('<a href="javascript:alert(1)">No</a>'), null);
equal(parseHTMLLink('<a href="/relative">No</a>'), null);
equal(parseHTMLLink(`<a href="${url}">One</a><a href="${url}">Two</a>`), null);
equal(parseHTMLLink(`<a href="${url}" title="x > y">&#x4e16;&#30028;</a>`).title, '\u4e16\u754c');
equal(linkBasename(' ../a/b\\c:*?"<>|\u0000 ', url), 'a b c');
equal(linkBasename('CON', url), '_CON');
equal(linkBasename('...', url), 'aur.archlinux.org');
equal(linkBasename('Cafe\u0301', url), 'Caf\u00e9');
assert(encode(linkBasename('\u4e16'.repeat(500), url)).length <= 200, 'UTF-8 name limit');
const assetURL = 'https://cdn.adguardcdn.com/website/adguard.com/agnar/agnar_stands.svg?cache=1#preview';
equal(WebUtils.filenameFromURL(assetURL), 'agnar_stands.svg');
equal(linkBasename(assetURL, assetURL), 'agnar_stands.svg');
equal(linkBasename('', 'https://example.com/My%20icon.svg'), 'My icon.svg');
equal(linkBasename('', 'https://example.com/folder/'), 'example.com');
equal(linkBasename('A descriptive title', assetURL), 'A descriptive title');
const html = linkHTML('https://example.com/?x="<&y=2', '<script>alert(1)</script>');
assert(!html.includes('<script>'), 'HTML must escape title');
assert(html.includes('&quot;&lt;&amp;y=2'), 'HTML must escape URL');

const firefox = fakeDrop({'text/x-moz-url': utf16, 'text/uri-list': '', 'text/plain': ''});
equal((await readExternalDropContents(firefox)).links, [{url, title}]);
equal(firefox.formatReads, 1);
equal(firefox.reads, ['text/x-moz-url']);
const chrome = fakeDrop({'text/x-moz-url': payload, 'text/html': `<a href="${url}">Other</a>`, 'text/plain': url});
equal((await readExternalDropContents(chrome)).links, [{url, title}]);
const fallback = fakeDrop({'text/x-moz-url': new Error('Unavailable'), 'text/uri-list': '', 'text/plain': url});
equal((await readExternalDropContents(fallback)).links[0].url, url);
const rich = fakeDrop({'text/x-moz-url-data': url, 'text/x-moz-url-desc': title, 'text/plain': url});
equal((await readExternalDropContents(rich)).links, [{url, title}]);
const htmlOnly = fakeDrop({'text/html': `<a href="${url}">${title}</a>`});
equal((await readExternalDropContents(htmlOnly)).links, [{url, title}]);
const htmlVariant = 'text/html; charset="UTF-8"';
equal(offerRoute([htmlVariant]), 'read-text-or-web-link');
const variantDrop = fakeDrop({[htmlVariant]: `<a href="${url}">${title}</a>`});
equal((await readExternalDropContents(variantDrop)).links, [{url, title}]);
equal(variantDrop.reads, [htmlVariant]);
// Rejected offers are released by accept(), clearing their route.
equal(offerRoute(['text/html;charset=iso-8859-1']), null);
equal(WebUtils.contentName('application/octet-stream;name="a\\"b.txt"'), 'a"b.txt');
equal(WebUtils.contentName('application/octet-stream;name="a;b.txt"'), 'a;b.txt');
equal(WebUtils.contentName('application/octet-stream;name="a";name="b"'), null);
equal(WebUtils.contentName('application/octet-stream'), null);
equal(WebUtils.contentName('application/octet-stream;name="unterminated'), null);
const fileMime = 'application/octet-stream;name="../../sample.bin"';
const binary = new Uint8Array([0, 255, 1, 128]);
const rawFile = await readExternalDropContents(fakeDrop({[fileMime]: binary, 'text/plain': url}));
equal(rawFile.type, 'file-content');
equal(Array.from(rawFile.bytes.get_data()), Array.from(binary));
const textOnly = fakeDrop({'text/plain; charset=utf-8': 'Selected paragraph\nsecond line'});
equal((await readExternalDropContents(textOnly)).type, 'text');
const files = fakeDrop({'text/uri-list': '# Comment\r\nfile:///tmp/a\r\nfile:///tmp/b\r\n', 'text/plain': 'a\nb'});
equal((await readExternalDropContents(files)).references, 'file:///tmp/a\r\nfile:///tmp/b');
equal(files.reads, ['text/uri-list']);
const uriOnly = fakeDrop({'text/uri-list': `${url}\r\n`});
equal((await readExternalDropContents(uriOnly)).type, 'web-links');
let oversized = false;
try {
    const oversizedDrop = fakeDrop({'text/plain': '12345'});
    await startSession(oversizedDrop)
        ._createContentsReader()._readBytes('text/plain', 4);
} catch (_e) {
    oversized = true;
}
assert(oversized, 'Oversized representation must fail');
let suppliedCancellable = null;
const failedRead = {
    get_formats() {
        return {
            get_mime_types: () => ['text/plain'],
            contain_gtype: () => false,
        };
    },
    read_async(_mimes, _priority, readCancellable) {
        suppliedCancellable = readCancellable;
        readCancellable.cancel();
        return Promise.reject(new Error('Simulated representation cancellation'));
    },
    status() {},
};
const failedReadSession = startSession(failedRead);
const sessionCancellable = failedReadSession._cancellable;
try {
    await failedReadSession._createContentsReader()
        ._readBytes('text/plain', 1024);
} catch (_e) {}
assert(suppliedCancellable === sessionCancellable,
    'Representation reads must use the session cancellable');
assert(sessionCancellable.is_cancelled(),
    'Cancelling a representation must cancel the entire drop session');

const cancelledFallback = {
    reads: [],
    get_formats() {
        return {
            get_mime_types: () => ['text/x-moz-url', 'text/plain'],
            contain_gtype: () => false,
        };
    },
    read_async(mimes, _priority, cancellable) {
        this.reads.push(mimes[0]);
        cancellable.cancel();
        return Promise.reject(new Error('Simulated drop cancellation'));
    },
    status() {},
};
let dropCancellationPropagated = false;
try {
    await readExternalDropContents(cancelledFallback);
} catch (_e) {
    dropCancellationPropagated = true;
}
assert(dropCancellationPropagated,
    'Drop cancellation must propagate instead of becoming empty data');
equal(cancelledFallback.reads, ['text/x-moz-url']);

const pixbuf = GdkPixbuf.Pixbuf.new(GdkPixbuf.Colorspace.RGB, true, 8, 16, 16);
pixbuf.fill(0x22aa55ff);
const png = Gdk.Texture.new_for_pixbuf(pixbuf).save_to_png_bytes();
const linkWithIcon = fakeDrop({
    'text/x-moz-url': payload,
    'image/png': png.get_data(),
});
const extractedLink = await startSession(linkWithIcon)
    ._createContentsReader().readContents();
equal(extractedLink.type, 'web-links');
assert(extractedLink.customIcon?.get_width() > 0,
    'A web link must retain its generated custom icon');
const picture = await readExternalDropContents(fakeDrop({'image/png': png.get_data()}));
equal(picture.name, 'Image.png');
assert(picture.bytes.equal(png), 'Standalone image retains original bytes');
const wide = GdkPixbuf.Pixbuf.new(GdkPixbuf.Colorspace.RGB, true, 8, 1024, 32);
wide.fill(0x22aa55ff);
const widePNG = Gdk.Texture.new_for_pixbuf(wide).save_to_png_bytes();
assert((await readExternalDropContents(fakeDrop({'image/png': widePNG.get_data()}))).bytes.equal(widePNG),
    'Standalone pictures are not constrained by icon dimensions');
assert(await readOptionalWebLinkIcon(
    fakeDrop({'image/png': widePNG.get_data()})),
'The thumbnail factory decides whether a wide preview is usable');
const pictureFallback = fakeDrop({[fileMime]: new Error('Unavailable'), 'image/png': png.get_data()});
equal((await readExternalDropContents(pictureFallback)).name, 'Image.png');
equal(pictureFallback.reads, [fileMime, 'image/png']);
let invalidPicture = false;
try {
    await readExternalDropContents(fakeDrop({'image/png': encode('invalid')}));
} catch (_e) {
    invalidPicture = true;
}
assert(invalidPicture, 'Invalid picture cannot be created');
const tooWide = GdkPixbuf.Pixbuf.new(GdkPixbuf.Colorspace.RGB, true, 8, 20000, 1);
tooWide.fill(0x22aa55ff);
let oversizedPicture = false;
try {
    await readExternalDropContents(fakeDrop({'image/png': Gdk.Texture.new_for_pixbuf(tooWide).save_to_png_bytes().get_data()}));
} catch (_e) {
    oversizedPicture = true;
}
assert(oversizedPicture, 'Oversized decoded dimensions must be rejected');
const withCustomIcon = fakeDrop({
    'text/x-moz-url': payload,
    'image/png': png.get_data(),
});
const withCustomIconSession = startSession(withCustomIcon);
await withCustomIconSession._createContentsReader()
    ._readExternalDropContents();
const customIcon = await withCustomIconSession._createContentsReader()
    .readOptionalWebLinkIcon();
assert(customIcon?.get_width() > 0,
    'Second representation should yield a usable custom icon');
equal(withCustomIcon.reads, ['text/x-moz-url', 'image/png']);
const chromiumImageMime =
    'application/octet-stream;name="screenshot_5263_akO6or4.png"';
const chromiumImage = fakeDrop({
    'text/x-moz-url': assetURL,
    'text/html': `<img src="${assetURL}">`,
    [chromiumImageMime]: png.get_data(),
});
const chromiumImageContents = await startSession(chromiumImage)
    ._createContentsReader().readContents();
assert(chromiumImageContents.customIcon?.get_width() > 0,
    'Chromium named file contents become a custom link icon');
equal(chromiumImage.reads,
    ['text/x-moz-url', 'text/html', chromiumImageMime]);
const browserPreview = GdkPixbuf.Pixbuf.new(
    GdkPixbuf.Colorspace.RGB,
    true,
    8,
    600,
    320
);
browserPreview.fill(0x22aa55ff);
const scaledCustomIcon = await readOptionalWebLinkIcon(fakeDrop({
    'image/png': Gdk.Texture.new_for_pixbuf(browserPreview)
        .save_to_png_bytes().get_data(),
}));
equal(scaledCustomIcon.get_width() <= 256, true);
equal(scaledCustomIcon.get_height() <= 256, true);
equal(await readOptionalWebLinkIcon(chrome), null);
equal(await readOptionalWebLinkIcon(
    fakeDrop({'image/png': encode('invalid image')})), null);

const directory = Gio.File.new_for_path(ARGV[0]);
await desktopUtils.writeTransferContentToDesktop(directory, {
    type: Enums.DropContentsType.WEB_LINKS,
    links: [{url, title: 'Cached preview'}],
    customIcon,
}, null);
const cachedPreview = directory.get_child('Cached preview.html');
equal(customIconWrites.length, 1);
assert(customIconWrites[0].file.equal(cachedPreview),
    'Custom-icon metadata is requested for the created link');
equal(customIconWrites[0].attribute, 'metadata::custom-icon');
const customIconURI = customIconWrites[0].value;
assert(customIconURI?.startsWith(
    Gio.File.new_build_filenamev([
        GLib.get_user_data_dir(),
        testAppId,
        'link-icons',
    ]).get_uri()
), 'The link writer stores custom icons in its XDG data directory');
assert(Gio.File.new_for_uri(customIconURI).query_exists(null),
    'The custom-icon request refers to a persistent generated icon');
await desktopUtils.writeTransferContentToDesktop(directory, {
    type: Enums.DropContentsType.WEB_LINKS,
    links: [{url, title: 'Manager link'}],
    customIcon: null,
}, null);
const [, managerLink] = directory.get_child('Manager link.html').load_contents(null);
equal(new TextDecoder().decode(managerLink), linkHTML(url, 'Manager link'));
equal(customIconWrites.length, 1);
const withoutMetadata = new DesktopIconsUtil.DesktopIconsUtil(
    {Enums, mainApp},
    {
        FileUtils: {
            ...FileUtils,
            setStringAttribute() {
                return Promise.reject(new Error('Metadata service unavailable'));
            },
        },
    }
);
const linkWithoutMetadata = await withoutMetadata.createLinkFile(
    directory, {url, title: 'No metadata service'}, null, customIconURI
);
const [, linkWithoutMetadataContents] = linkWithoutMetadata.load_contents(null);
equal(new TextDecoder().decode(linkWithoutMetadataContents),
    linkHTML(url, 'No metadata service'));
await desktopUtils.writeTransferContentToDesktop(directory, {
    type: Enums.DropContentsType.FILE_CONTENT,
    name: 'Manager file.bin',
    bytes: rawFile.bytes,
}, null);
const [managerBytes] = directory.get_child('Manager file.bin').load_bytes(null);
assert(managerBytes.equal(rawFile.bytes), 'Drop contents are written by desktop utilities');
const droppedText = 'First /unsafe words make this readable filename and more';
await desktopUtils.writeTransferContentToDesktop(directory, {
    type: Enums.DropContentsType.TEXT,
    text: droppedText,
}, null);
await desktopUtils.writeTransferContentToDesktop(directory, {
    type: Enums.DropContentsType.TEXT,
    text: droppedText,
}, null);
const droppedTextFiles = [
    directory.get_child('First unsafe words make this'),
    directory.get_child('First unsafe words make this 1'),
];
for (const file of droppedTextFiles) {
    const [, contents] = file.load_contents(null);
    equal(new TextDecoder().decode(contents), droppedText);
}
const rawCreated = await desktopUtils.createContentFile(directory, rawFile, null);
equal(rawCreated.get_parent().get_path(), directory.get_path());
assert(!rawCreated.get_basename().startsWith('.'), 'Supplied names must be visible');
const [rawBytes] = rawCreated.load_bytes(null);
assert(rawBytes.equal(rawFile.bytes), 'Raw contents survive unchanged');
const imageFiles = await Promise.all([
    desktopUtils.createContentFile(directory, picture, null),
    desktopUtils.createContentFile(directory, picture, null),
]);
equal(imageFiles.map(file => file.get_basename()).sort(), ['Image 1.png', 'Image.png']);
const nested = directory.get_child('nested/parents/files');
const archives = await Promise.all(Array.from({length: 4}, () =>
    FileUtils.createUniqueFile(nested, 'archive.tar.gz', rawFile.bytes)));
equal(archives.map(file => file.get_basename()).sort(),
    ['archive 1.tar.gz', 'archive 2.tar.gz', 'archive 3.tar.gz', 'archive.tar.gz']);
for (const archive of archives) {
    const [archiveBytes] = archive.load_bytes(null);
    assert(archiveBytes.equal(rawFile.bytes), 'Concurrent archive writes must retain their complete contents');
}
const permissions = rawCreated.query_info('unix::mode', Gio.FileQueryInfoFlags.NONE, null);
equal(permissions.get_attribute_uint32('unix::mode') & 0o111, 0);
const symbolicLinksDirectory = directory.get_child('symbolic-links');
await FileUtils.recursivelyMakeDir(symbolicLinksDirectory);
const pendingSymbolicLinks = new Set();
const symbolicLinkPlacement = {
    beforeCreate(file) {
        const basename = file.get_basename();
        if (pendingSymbolicLinks.has(basename))
            return false;
        pendingSymbolicLinks.add(basename);
        return true;
    },
    creationFailed(file, wasRegistered) {
        if (wasRegistered)
            pendingSymbolicLinks.delete(file.get_basename());
    },
};
const symbolicLinks = [
    FileUtils.createUniqueSymbolicLink(
        symbolicLinksDirectory,
        rawCreated,
        null,
        symbolicLinkPlacement
    ),
    FileUtils.createUniqueSymbolicLink(
        symbolicLinksDirectory,
        rawCreated,
        null,
        symbolicLinkPlacement
    ),
];
equal(symbolicLinks.map(file => file.get_basename()), [
    rawCreated.get_basename(),
    FileUtils.collisionName(rawCreated.get_basename(), 1),
]);
equal([...pendingSymbolicLinks].sort(),
    symbolicLinks.map(file => file.get_basename()).sort());
for (const symbolicLink of symbolicLinks) {
    const info = symbolicLink.query_info(
        Gio.FILE_ATTRIBUTE_STANDARD_TYPE,
        Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS,
        null
    );
    equal(info.get_file_type(), Gio.FileType.SYMBOLIC_LINK);
}
const created = await Promise.all([
    createLinkFile(directory, {url, title}, null),
    createLinkFile(directory, {url, title}, null),
]);
equal(created.map(file => file.get_basename()).sort(), [`${title} 1.html`, `${title}.html`]);
const savedCustomIconURI = await thumbnailLoader.saveCustomIcon(
    customIcon,
    desktopUtils.getAppUserDataDir().get_child('link-icons')
);
assert(Gio.File.new_for_uri(savedCustomIconURI).query_exists(null),
    'ThumbnailLoader persists the generated custom icon');
const descriptiveLinks = await Promise.all([
    createLinkFile(directory, {url: assetURL, title: assetURL}, null),
    createLinkFile(directory, {url: assetURL, title: assetURL}, null),
]);
equal(descriptiveLinks.map(file => file.get_basename()).sort(),
    ['agnar_stands.svg 1.html', 'agnar_stands.svg.html']);
const [, contents] = created[0].load_contents(null);
equal(new TextDecoder().decode(contents), linkHTML(url, title));
const creationAttempts = [];
const pendingFiles = new Set();
const pendingPlacement = {
    beforeCreate(file) {
        const basename = file.get_basename();
        creationAttempts.push(basename);
        if (pendingFiles.has(basename))
            return false;
        pendingFiles.add(basename);
        return true;
    },
    creationFailed(file, wasRegistered) {
        if (wasRegistered)
            pendingFiles.delete(file.get_basename());
    },
};
await desktopUtils.writeTransferContentToDesktop(directory, {
    type: Enums.DropContentsType.WEB_LINKS,
    links: [
        {url, title: 'Placed link'},
        {url, title: 'Placed link'},
    ],
    customIcon: null,
}, pendingPlacement);
equal(creationAttempts, [
    'Placed link.html',
    'Placed link.html',
    'Placed link 1.html',
]);
equal([...pendingFiles].sort(), [
    'Placed link 1.html',
    'Placed link.html',
]);

print('browser-drop checks passed');
