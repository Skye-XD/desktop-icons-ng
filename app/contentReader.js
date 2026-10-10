/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright (C) 2026 Sundeep Mediratta (smedius@gmail.com) */
/* eslint-disable no-await-in-loop -- Representations are read sequentially. */
import {Gdk, Gio, GLib, GdkPixbuf} from '../dependencies/gi.js';
import {Enums, WebUtils} from '../dependencies/localFiles.js';

export {ContentReader};

/**
 * Clipboard reads always add isCut: true for Cut, false for Copy.
 * Drop reads omit it and use the negotiated Gdk.DragAction instead.
 *
 * references and format describe the same representation:
 * - text/uri-list: a string of newline-separated file URIs.
 * - x-special/gnome-icon-list: a string of URIs with icon coordinates.
 * - x-special/ding-icon-list: a Gdk.FileList for internal desktop drags.
 * format uses the corresponding Enums.DndTargetInfo value.
 *
 * @typedef {{
 *   type: 'file-references',
 *   references: string | Gdk.FileList,
 *   format: 'text/uri-list' | 'x-special/gnome-icon-list' |
 *     'x-special/ding-icon-list',
 *   isCut?: boolean
 * }} FileReferenceContents
 *
 * @typedef {{
 *   type: 'web-links',
 *   links: Array<{url: string, title: string}>,
 *   customIcon: ?GdkPixbuf.Pixbuf
 * }} WebLinkContents
 *
 * @typedef {{type: 'text', text: string}} TextContents
 *
 * @typedef {{
 *   type: 'file-content',
 *   name: string,
 *   bytes: GLib.Bytes
 * }} NewFileContents
 *
 * @typedef {{type: 'unsupported', reason: string}} UnsupportedDropContents
 *
 * @typedef {FileReferenceContents|WebLinkContents|TextContents|
 *   NewFileContents|UnsupportedDropContents} DropContents
 */

/**
 * Read the minimum representations needed for one content transfer.
 *
 * File routes read typed or textual file references. Browser text routes
 * prefer explicit URL metadata, then matching descriptions and HTML, then
 * URI-list and plain-text fallbacks. Standalone image or named binary
 * representations become file contents.
 *
 * After web links are identified, an offered image may separately provide
 * their optional custom icon.
 */
const ContentReader = class {
    constructor(source, context, thumbnailLoader) {
        this._source = source;
        this._context = context;
        this._thumbnailLoader = thumbnailLoader;
        this._textByMimeType = new Map();
    }

    // Public methods

    // Clipboard file references extend the shared shape with an isCut boolean.
    // Copy/cut metadata supplies its value; references without it use false.
    // Drops use readContents() and obtain their action from Gdk.DragAction.
    async readClipboardContents() {
        if (this._offersMime('x-special/gnome-copied-files')) {
            const text = await this._readText('x-special/gnome-copied-files');
            return this._parseCopiedFiles(text);
        }

        const contents = await this.readContents();
        const legacyHeader = 'x-special/nautilus-clipboard\n';

        if (contents.type === Enums.DropContentsType.TEXT &&
            contents.text.startsWith(legacyHeader)) {
            return this._parseCopiedFiles(
                contents.text.slice(legacyHeader.length)
            );
        }

        if (contents.type === Enums.DropContentsType.FILE_REFERENCES)
            return {...contents, isCut: false};

        return contents;
    }

    async readContents() {
        const {
            cancellable,
            formats,
            route,
            classifiedURIListContents,
        } = this._context;
        const targets = Enums.DndTargetInfo;
        const routes = Enums.DndOfferRoute;
        const types = Enums.DropContentsType;

        if (route === routes.INTERNAL_DESKTOP_ITEMS) {
            const data = await this._source.read_value_async(
                Gdk.FileList.$gtype,
                GLib.PRIORITY_DEFAULT,
                cancellable
            );
            return {
                type: types.FILE_REFERENCES,
                references: data,
                format: targets.DING_ICON_LIST,
            };
        }

        if (this._offersMime(targets.GNOME_ICON_LIST)) {
            const bytes = await this._readBytes(
                targets.GNOME_ICON_LIST,
                1024 * 1024
            );
            return {
                type: types.FILE_REFERENCES,
                references: WebUtils.decodeText(bytes).text,
                format: targets.GNOME_ICON_LIST,
            };
        }

        if (route === routes.FILE_OPERATION && !classifiedURIListContents) {
            const type = formats.contain_gtype(Gdk.FileList.$gtype)
                ? Gdk.FileList.$gtype
                : Gio.File.$gtype;
            const value = await this._source.read_value_async(
                type,
                GLib.PRIORITY_DEFAULT,
                cancellable
            );
            const files = type === Gdk.FileList.$gtype
                ? value.get_files()
                : [value];
            return {
                type: types.FILE_REFERENCES,
                references: files.map(file => file.get_uri()).join('\r\n'),
                format: targets.URI_LIST,
            };
        }

        const contents = classifiedURIListContents ??
            await this._readExternalDropContents();
        if (contents.type !== types.WEB_LINKS)
            return contents;

        let customIcon = null;
        try {
            customIcon = await this.readOptionalWebLinkIcon();
        } catch (e) {
            this._rethrowIfCancelled(e);
            // A missing optional icon must not prevent link creation.
        }

        return {...contents, customIcon};
    }

    async readAndClassifyURIList() {
        const text = await this._readText(Enums.DndTargetInfo.URI_LIST);
        return this._classifyURIListText(text);
    }

    async readOptionalWebLinkIcon() {
        const offeredImages = WebUtils.imageFormats(
            this._context.mimeTypes
        );
        const namedContents = this._context.mimeTypes.filter(mime =>
            WebUtils.contentName(mime));

        for (const mime of [...offeredImages, ...namedContents]) {
            try {
                const bytes = await this._readBytes(mime, 4 * 1024 * 1024);
                const contentType = WebUtils.parseMime(mime)?.type ?? null;
                const customIcon = await this._thumbnailLoader
                    .createThumbnailForDroppedBytes(
                        new GLib.Bytes(bytes),
                        WebUtils.contentName(mime),
                        contentType,
                        this._context.cancellable
                    );
                if (customIcon)
                    return customIcon;
            } catch (e) {
                this._rethrowIfCancelled(e);
            }
        }

        return null;
    }

    // Private methods

    _offersMime(mime) {
        return this._context.mimeTypes.includes(mime);
    }

    // Transfer each textual representation at most once for this operation.
    async _readText(mime) {
        if (!this._offersMime(mime))
            return '';

        if (this._textByMimeType.has(mime))
            return this._textByMimeType.get(mime);

        let text = '';
        try {
            const bytes = await this._readBytes(mime, 1024 * 1024);
            text = WebUtils.decodeText(bytes).text;
        } catch (e) {
            this._rethrowIfCancelled(e);
        }

        this._textByMimeType.set(mime, text);
        return text;
    }

    async _readBytes(mime, limit) {
        const {cancellable} = this._context;
        let timedOut = false;
        const timeout = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            Enums.DND_DATA_TRANSFER_TIMEOUT,
            () => {
                timedOut = true;
                cancellable.cancel();
                return GLib.SOURCE_REMOVE;
            }
        );

        let sourceStream;
        let bufferedStream;
        try {
            [sourceStream] = await this._source.read_async(
                [mime],
                GLib.PRIORITY_DEFAULT,
                cancellable
            );

            bufferedStream = Gio.BufferedInputStream.new_sized(
                sourceStream,
                limit + 1
            );
            while (bufferedStream.get_available() <= limit) {
                const bytesRead = await bufferedStream.fill_async(
                    -1,
                    GLib.PRIORITY_DEFAULT,
                    cancellable
                );
                if (bytesRead === 0)
                    break;
            }

            const bytes = bufferedStream.peek_buffer().slice();
            if (bytes.length > limit) {
                throw new Error(
                    `Content representation exceeds ${limit} bytes`
                );
            }

            return bytes;
        } finally {
            if (!timedOut)
                GLib.source_remove(timeout);
            const streamToClose = bufferedStream ?? sourceStream;
            if (streamToClose) {
                await streamToClose.close_async(
                    GLib.PRIORITY_DEFAULT,
                    null
                );
            }
        }
    }

    _rethrowIfCancelled(error) {
        if (this._context.cancellable.is_cancelled())
            throw error;
    }

    _parseCopiedFiles(text) {
        const [action, ...files] = text.trim().split(/\r?\n/u);
        if (!['copy', 'cut'].includes(action) || !files.length ||
            files.some(file => !GLib.Uri.peek_scheme(file)))
            return this._unsupportedContents();
        return {
            type: Enums.DropContentsType.FILE_REFERENCES,
            references: files.join('\r\n'),
            format: Enums.DndTargetInfo.URI_LIST,
            isCut: action === 'cut',
        };
    }

    _unsupportedContents() {
        return {
            type: Enums.DropContentsType.UNSUPPORTED,
            reason: 'No unambiguous web link or usable plain text',
        };
    }

    // Choose the most specific usable contents from the offered formats.
    async _readExternalDropContents() {
        const {route} = this._context;
        const routes = Enums.DndOfferRoute;
        const types = Enums.DropContentsType;

        if (route === routes.READ_FILE_CONTENT)
            return this._readOfferedFileContents();

        let uriListContents = null;
        let uriListInspected = false;

        if (route === routes.INSPECT_URI_LIST) {
            uriListContents = await this.readAndClassifyURIList();
            uriListInspected = true;
            if (uriListContents?.type !== types.WEB_LINKS)
                return uriListContents ?? this._unsupportedContents();
        }

        let links = uriListContents?.links ?? null;
        let link = links?.[0] ?? null;

        if ((!links || links.length === 1) && !link?.title)
            link = await this._readExplicitWebLink(link);

        if (link && !link.title && (!links || links.length === 1))
            link = await this._addMozillaLinkDescription(link);

        if ((!link || !link.title) && (!links || links.length === 1))
            link = await this._readLinkFromHTML(link);

        if (!link) {
            if (!uriListInspected)
                uriListContents = await this.readAndClassifyURIList();

            if (uriListContents?.type === types.FILE_REFERENCES ||
                uriListContents?.type === types.UNSUPPORTED)
                return uriListContents;

            links = uriListContents?.links ?? null;
            link = links?.[0] ?? null;
        }

        const plainText = link ? '' : await this._readFirstPlainText();
        if (!link && plainText) {
            const url = WebUtils.webURL(plainText);
            if (url)
                link = {url, title: ''};
        }

        if (link) {
            return {
                type: types.WEB_LINKS,
                links: links?.length > 1 ? links : [link],
                customIcon: null,
            };
        }

        if (!plainText &&
            WebUtils.imageFormats(this._context.mimeTypes).length)
            return this._readOfferedFileContents();

        return plainText
            ? {type: types.TEXT, text: plainText}
            : this._unsupportedContents();
    }

    async _readOfferedFileContents() {
        const named = this._context.mimeTypes.filter(mime =>
            WebUtils.contentName(mime));
        const images = WebUtils.imageFormats(this._context.mimeTypes);

        for (const mime of [...named, ...images]) {
            try {
                const bytes = await this._readBytes(mime, 32 * 1024 * 1024);
                const name = WebUtils.contentName(mime);
                if (name) {
                    return {
                        type: Enums.DropContentsType.FILE_CONTENT,
                        name,
                        bytes: new GLib.Bytes(bytes),
                    };
                }

                return this._createImageFileContents(mime, bytes);
            } catch (e) {
                this._rethrowIfCancelled(e);
            }
        }

        throw new Error('No usable file-content or image representation');
    }

    _createImageFileContents(mime, bytes) {
        const contentType = WebUtils.parseMime(mime)?.type;
        const loader = GdkPixbuf.PixbufLoader.new_with_mime_type(
            contentType === 'image/jpg' ? 'image/jpeg' : contentType
        );
        let suitable = false;
        loader.connect('size-prepared', (_loader, width, height) => {
            suitable = width > 0 && height > 0 &&
                width <= 16384 && height <= 16384 &&
                width * height <= 16 * 1024 * 1024;
            if (!suitable)
                loader.set_size(1, 1);
        });

        try {
            loader.write(bytes);
        } finally {
            loader.close();
        }

        const format = loader.get_format();
        const extensions = format?.get_extensions() ?? [];
        const subtype = contentType.split('/')[1];
        const preferredExtension = {
            jpeg: 'jpg',
            'svg+xml': 'svg',
        }[subtype] ?? subtype;
        const extension = extensions.includes(preferredExtension)
            ? preferredExtension
            : extensions[0];
        if (!suitable || !extension)
            throw new Error('Unsupported or oversized image');

        return {
            type: Enums.DropContentsType.FILE_CONTENT,
            name: `Image.${extension}`,
            // Preserve the source encoding and animation.
            bytes: new GLib.Bytes(bytes),
        };
    }

    async _readExplicitWebLink(currentLink) {
        const targets = Enums.DndTargetInfo;
        let link = currentLink;

        for (const mime of targets.URL_FORMATS) {
            if (link?.title)
                break;

            const text = await this._readText(mime);
            let candidate = WebUtils.parseURLTitle(text);
            if (mime === targets.MOZ_URL_DATA) {
                const url = WebUtils.webURL(text);
                candidate = url ? {url, title: ''} : null;
            }

            if (candidate && (!link || candidate.url === link.url))
                link = candidate;
        }

        return link;
    }

    async _addMozillaLinkDescription(link) {
        const targets = Enums.DndTargetInfo;
        const description = await this._readText(targets.MOZ_URL_DESC);
        const describedURL = WebUtils.webURL(
            await this._readText(targets.MOZ_URL_DATA)
        );

        return describedURL === link.url
            ? {...link, title: description.trim()}
            : link;
    }

    async _readLinkFromHTML(currentLink) {
        for (const mime of WebUtils.htmlFormats(this._context.mimeTypes)) {
            const html = await this._readText(mime);
            const candidate = WebUtils.parseHTMLLink(html);
            if (candidate &&
                (!currentLink || candidate.url === currentLink.url))
                return candidate;
        }

        return currentLink;
    }

    async _readFirstPlainText() {
        for (const mime of Enums.DndTargetInfo.TEXT_FORMATS) {
            const text = await this._readText(mime);
            if (text)
                return text;
        }

        return '';
    }

    // Classify the decoded representation for routing. Whether a filesystem
    // action can actually be performed is decided by its downstream handler.
    _classifyURIListText(text) {
        const types = Enums.DropContentsType;
        const targets = Enums.DndTargetInfo;
        const uris = text.split(/\r\n|\n|\r/).map(line => line.trim())
            .filter(line => line && !line.startsWith('#'));

        if (!uris.length)
            return null;

        try {
            if (uris.some(uri => !GLib.Uri.is_valid(uri, GLib.UriFlags.NONE)))
                return null;
        } catch (_e) {
            return null;
        }

        const webURLs = uris.filter(uri => WebUtils.webURL(uri));
        if (webURLs.length === uris.length) {
            return {
                type: types.WEB_LINKS,
                links: webURLs.map(url => ({url, title: ''})),
                customIcon: null,
            };
        }

        if (webURLs.length) {
            return {
                type: types.UNSUPPORTED,
                reason: 'Mixed web URLs and file URIs',
            };
        }

        const fileSchemes = Gio.Vfs.get_default().get_supported_uri_schemes();
        const hasUnsupportedScheme = uris.some(uri =>
            !fileSchemes.includes(GLib.Uri.peek_scheme(uri).toLowerCase()));
        if (hasUnsupportedScheme) {
            return {
                type: types.UNSUPPORTED,
                reason: 'URI scheme has no file backend',
            };
        }

        return {
            type: types.FILE_REFERENCES,
            references: uris.join('\r\n'),
            format: targets.URI_LIST,
        };
    }

    _offersAnyMime(mimeTypes) {
        return mimeTypes.some(mime => this._offersMime(mime));
    }
};

