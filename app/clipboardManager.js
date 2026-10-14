/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright (C) 2026 Sundeep Mediratta (smedius@gmail.com) */
import {Gdk, Gio} from '../dependencies/gi.js';
import {ContentReader, WebUtils} from '../dependencies/localFiles.js';

export {ClipboardManager};

const ClipboardManager = class {
    constructor(desktopManager) {
        this._desktopManager = desktopManager;
        this._DBusUtils = desktopManager.DBusUtils;
        this._dropOperations = desktopManager.dropOperations;
        this._Enums = desktopManager.Enums;
        this._canPaste = false;
        this._pasteCancellable = null;
        this._linkCancellable = null;
        this._clipboard = Gdk.Display.get_default().get_clipboard();

        this._clipboardChangedId = this._clipboard.connect(
            'changed', this._onClipboardChanged.bind(this)
        );
    }

    // Public methods

    updateClipboard() {
        const formats = this._clipboard.get_formats();

        this._canPaste = this._routeForFormats(formats) !==
            this._Enums.DndOfferRoute.UNSUPPORTED;

        this._desktopManager.mainApp.lookup_action('doPaste')
            .set_enabled(this._canPaste);

        this._desktopManager.mainApp.lookup_action('doPasteAsLink')
            .set_enabled(false);
    }

    async updatePasteAsLink() {
        if (this._linkCancellable)
            this._linkCancellable.cancel();

        const cancellable = new Gio.Cancellable();
        this._linkCancellable = cancellable;

        try {
            const formats = this._clipboard.get_formats();
            const targets = this._Enums.DndTargetInfo;
            const mimes = formats.get_mime_types();

            if (!mimes.includes('x-special/gnome-copied-files') &&
                !mimes.includes(targets.URI_LIST) &&
                !formats.contain_gtype(Gdk.FileList.$gtype) &&
                !formats.contain_gtype(Gio.File.$gtype) &&
                !targets.TEXT_FORMATS.some(mime => mimes.includes(mime)))
                return;

            const contents = await this._readClipboardContents(cancellable);

            if (!cancellable.is_cancelled()) {
                this._desktopManager.mainApp.lookup_action('doPasteAsLink')
                    .set_enabled(!!this._getLinkableFileURIs(contents));
            }
        } catch (e) {
            if (!cancellable.is_cancelled())
                console.error(e, 'Error checking clipboard files for links');
        } finally {
            if (this._linkCancellable === cancellable)
                this._linkCancellable = null;
        }
    }

    // Clipboard management
    // ******************************************************************** */
    /*
     * Before Gnome Shell 40, St API couldn't access binary data in the
     * clipboard, only text data. Also, the original Desktop Icons was a pure
     * extension, so it was limited to what Clutter and St offered. That was
     * the reason why Nautilus accepted a text format for CUT and COPY
     * operations in the form:
     *
     *     x-special/nautilus-clipboard
     *     OPERATION
     *     FILE_URI
     *     [FILE_URI]
     *     [...]
     *
     * In Gnome Shell 40, St was enhanced and now it supports binary data;
     * that's why Nautilus migrated to a binary format identified by the atom
     * 'x-special/gnome-copied-files', where the CUT or COPY operation is
     * shared.
     *
     * To maintain compatibility, in the past, we checked the current Gnome
     * Shell version and, based on that, set the binary or the text clipboards.
     *
     * With the newer versions of gtk4-ding, we only set the binary version
     * and add other composite providers for the plain text versions like
     * the newer Nautilus/Files.
     */

    /*
     * Publish one Gdk.ContentProvider union with these representations:
     *
     * x-special/gnome-copied-files: 'copy\nURI\n...' or 'cut\nURI\n...'
     * Gdk.FileList:                selected Gio.File objects
     * text/uri-list:               'URI\r\n...'
     * text/plain:                  '/path\n...'
     * text/plain;charset=utf-8:    '/path\n...'
     *
     * Text representations contain UTF-8 bytes for the same selection.
     */
    copyOrCutSelection(action) {
        const selection = this._desktopManager.getCurrentSelection();

        if (!selection?.length)
            return;

        const selectedFiles = selection.map(fileItem => fileItem.file);
        const uris = selectedFiles.map(file => file.get_uri());
        const uriList = `${uris.join('\r\n')}\r\n`;

        const pathList =
            `${selectedFiles.map(file => file.get_path()).join('\n')}\n`;

        const fileList = Gdk.FileList.new_from_array(selectedFiles);

        const fileListContentProvider =
            Gdk.ContentProvider.new_for_value(fileList);

        const clipboard = Gdk.Display.get_default().get_clipboard();
        const textCoder = new TextEncoder();

        let content = action ? 'copy\n' : 'cut\n';
        content += uris.join('\n');

        const encodedUriList = textCoder.encode(uriList);
        const encodedPathList = textCoder.encode(pathList);

        const gnomeContentProvider =
            Gdk.ContentProvider
            .new_for_bytes(
                'x-special/gnome-copied-files',
                textCoder.encode(content)
            );

        const textUriListContentProvider =
            Gdk.ContentProvider
            .new_for_bytes(
                this._Enums.DndTargetInfo.URI_LIST,
                encodedUriList
            );

        const textListContentProvider =
            Gdk.ContentProvider
            .new_for_bytes(
                this._Enums.DndTargetInfo.TEXT_PLAIN,
                encodedPathList
            );

        const textUtf8ListContentProvider =
            Gdk.ContentProvider
            .new_for_bytes(
                this._Enums.DndTargetInfo.TEXT_PLAIN_UTF8,
                encodedPathList
            );

        const clipboardContentProvider =
            Gdk.ContentProvider.new_union([
                gnomeContentProvider,
                fileListContentProvider,
                textUriListContentProvider,
                textListContentProvider,
                textUtf8ListContentProvider,
            ]);

        clipboard.set_content(clipboardContentProvider);
    }

    async paste(asLink = false) {
        // Capture the desktop anchor [globalX, globalY] before reading.
        const position = [
            this._desktopManager._clickX,
            this._desktopManager._clickY,
        ];

        if (position.some(coordinate => coordinate === null ||
            coordinate === undefined))
            return false;

        const pastePosition =
            this._dropOperations.desktopPositionForDrop(position);

        if (this._pasteCancellable)
            this._pasteCancellable.cancel();

        const cancellable = new Gio.Cancellable();
        this._pasteCancellable = cancellable;

        try {
            if (!this._canPaste)
                return false;

            const contents = await this._readClipboardContents(cancellable);

            if (cancellable.is_cancelled())
                return false;

            if (asLink) {
                const files = this._getLinkableFileURIs(contents);

                if (!files)
                    return false;

                await this._dropOperations.createSymbolicLinks(
                    files,
                    this._desktopManager.desktopDir.get_uri(),
                    pastePosition
                );

                return true;
            }

            const types = this._Enums.DropContentsType;

            if (contents.type === types.UNSUPPORTED)
                return false;

            if (contents.type === types.FILE_REFERENCES)
                return this._pasteFiles(contents, position);

            return await this._dropOperations.writeTransferContent(
                contents,
                pastePosition
            );
        } catch (e) {
            if (cancellable.is_cancelled())
                return false;

            throw e;
        } finally {
            if (this._pasteCancellable === cancellable)
                this._pasteCancellable = null;
        }
    }

    destroy() {
        this._pasteCancellable?.cancel();
        this._linkCancellable?.cancel();
        this._pasteCancellable = null;
        this._linkCancellable = null;

        if (this._clipboardChangedId) {
            this._clipboard.disconnect(this._clipboardChangedId);
            this._clipboardChangedId = 0;
        }
    }

    // Private methods

    _onClipboardChanged() {
        this._pasteCancellable?.cancel();
        this._linkCancellable?.cancel();
        this.updateClipboard();
    }

    _routeForFormats(formats) {
        const routes = this._Enums.DndOfferRoute;
        const targets = this._Enums.DndTargetInfo;
        const mimes = formats.get_mime_types();

        if (mimes.includes('x-special/gnome-copied-files'))
            return routes.READ_TEXT_OR_WEB_LINK;

        if (targets.URL_FORMATS.some(mime => mimes.includes(mime)))
            return routes.READ_TEXT_OR_WEB_LINK;

        if (mimes.includes(targets.URI_LIST))
            return routes.INSPECT_URI_LIST;

        if (formats.contain_gtype(Gdk.FileList.$gtype) ||
            formats.contain_gtype(Gio.File.$gtype))
            return routes.FILE_OPERATION;

        if (WebUtils.htmlFormats(mimes).length ||
            targets.TEXT_FORMATS.some(mime => mimes.includes(mime)))
            return routes.READ_TEXT_OR_WEB_LINK;

        if (mimes.some(mime => WebUtils.contentName(mime)) ||
            WebUtils.imageFormats(mimes).length)
            return routes.READ_FILE_CONTENT;

        return routes.UNSUPPORTED;
    }

    /*
     * Returns the content reader's promise; callers must await it.
     *
     * context = {
     *     formats: Gdk.ContentFormats,
     *     mimeTypes: string[],
     *     route: Enums.DndOfferRoute value,
     *     cancellable: Gio.Cancellable,
     * }
     *
     * Resolved contents use one of the shared ContentReader shapes:
     *
     * {type: 'file-references', references: URI-list string, format: MIME}
     * readClipboardContents() adds an isCut boolean to this shared shape:
     * true for explicit Cut, false for Copy or absent operation metadata.
     * Drop reads leave the shared shape unchanged.
     *
     * {type: 'web-links', links: [{url: string, title: string}],
     *  customIcon: GdkPixbuf.Pixbuf | null}
     *
     * {type: 'text', text: string}
     *
     * {type: 'file-content', name: string, bytes: GLib.Bytes}
     *
     * {type: 'unsupported', reason: string}
     */
    _readClipboardContents(cancellable) {
        const formats = this._clipboard.get_formats();

        const context = {
            formats,
            mimeTypes: formats.get_mime_types(),
            route: this._routeForFormats(formats),
            cancellable,
        };

        const reader = new ContentReader(
            this._clipboard, context, this._desktopManager.ThumbnailLoader
        );

        return reader.readClipboardContents();
    }

    // Returns ['file:///path', ...] for copied local files, otherwise null.
    _getLinkableFileURIs(contents) {
        if (contents.type !== this._Enums.DropContentsType.FILE_REFERENCES ||
            contents.isCut)
            return null;

        const files = this._dropOperations.fileURIsFromReferences(
            contents.references, contents.format
        );

        return files?.length && files.every(uri =>
            Gio.File.new_for_uri(uri).get_path() !== null)
            ? files
            : null;
    }

    _pasteFiles(contents, position) {
        const files = this._dropOperations.fileURIsFromReferences(
            contents.references,
            contents.format
        );

        if (!files?.length)
            return false;

        const desktopDir = this._desktopManager.desktopDir.get_uri();
        const remoteOperations = this._DBusUtils.RemoteFileOperations;

        if (contents.isCut) {
            remoteOperations.MoveURIsRemote(files, desktopDir);
        } else {
            this._dropOperations.prepareIncomingFilePlacement(
                files,
                position,
                {filesWillBeCopied: true}
            );

            remoteOperations.CopyURIsRemote(files, desktopDir);
        }

        return true;
    }

    // Getters

    get canPaste() {
        return this._canPaste;
    }
};
