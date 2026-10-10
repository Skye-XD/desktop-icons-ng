/* DING: Desktop Icons New Generation for GNOME Shell
 *
 * Adw/Gtk4 Port Copyright (C) 2026 Sundeep Mediratta (smedius@gmail.com)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, version 3 of the License.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

import {Gtk, Gdk, Gio, GLib} from '../dependencies/gi.js';
import {_} from '../dependencies/gettext.js';

export {DesktopDropOperations};

/**
 * Performs the desktop and filesystem effects selected for an accepted drop.
 * DropSession owns negotiation; DragManager owns active local-drag movement.
 */
const DesktopDropOperations = class {
    constructor(desktopManager) {
        this._desktopManager = desktopManager;
        this._mainApp = desktopManager.mainApp;
        this._DesktopIconsUtil = desktopManager.DesktopIconsUtil;
        this._DBusUtils = desktopManager.DBusUtils;
        this._Prefs = desktopManager.Prefs;
        this._Enums = desktopManager.Enums;
        this._dbusManager = desktopManager.dbusManager;
        this._resetPendingFilePositions();
    }

    // Public methods

    destroy() {
        this.dialogCancellable?.cancel();
        this.dialogCancellable = null;
    }

    desktopPositionForDrop([X, Y]) {
        return this._Prefs.freePositionIcons
            ? [X, Y]
            : this._gridCellCenterForDrop(X, Y);
    }

    async createDroppedContent(dropContents, destination) {
        const dropPosition = this.desktopPositionForDrop(
            destination.globalPosition
        );
        const contentWasWritten = await this.writeTransferContent(
            dropContents,
            dropPosition
        );

        return contentWasWritten
            ? Gdk.DragAction.COPY
            : Gdk.DragAction.NONE ?? 0;
    }

    writeTransferContent(dropContents, dropPosition) {
        const pendingPlacement =
            this._createFilePlacementCallbacks(dropPosition);
        return this._DesktopIconsUtil.writeTransferContentToDesktop(
            this._desktopDir,
            dropContents,
            pendingPlacement
        );
    }

    isPlacementManagedFor(basename) {
        return Object.hasOwn(this._positionsForExistingFiles, basename) ||
            this._findNewFilePositionKey(basename) !== null;
    }

    rememberSelectedFilePositionsForUndo(fileList = null) {
        if (this._Prefs.keepArranged || this._Prefs.keepStacked)
            return;

        this._resetPendingFilePositions();
        fileList = fileList ?? this.currentSelection;
        if (!fileList)
            return;

        for (const fileItem of fileList) {
            this._positionsForExistingFiles[fileItem.fileName] = [
                ...fileItem.savedCoordinates,
                ...fileItem.normalCoordinates,
                fileItem.monitorIndex,
            ];
        }
    }

    // Normalize the representations accepted by file drop routes.
    fileURIsFromReferences(fileReferences, referenceFormat) {
        if (!fileReferences)
            return null;

        let fileList;
        if (referenceFormat === this._Enums.DndTargetInfo.GNOME_ICON_LIST) {
            fileList = GLib.Uri.list_extract_uris(fileReferences);
        } else if (referenceFormat ===
            this._Enums.DndTargetInfo.DING_ICON_LIST) {
            fileList = fileReferences.get_files().map(file => file.get_uri());
        } else if (referenceFormat === this._Enums.DndTargetInfo.URI_LIST) {
            fileList = GLib.Uri.list_extract_uris(fileReferences);
        } else {
            fileList = fileReferences.split('\n').map(reference => {
                if (GLib.Uri.peek_scheme(reference))
                    return reference;
                return GLib.filename_to_uri(reference, null);
            });
        }

        fileList = fileList.filter(Boolean);
        return fileList.length ? fileList : null;
    }

    async prepareIncomingFilePlacement(
        fileList,
        dropCoordinates,
        {filesWillBeCopied = false} = {}
    ) {
        if (this._Prefs.keepArranged || this._Prefs.keepStacked)
            return;

        this._resetPendingFilePositions();
        this._preserveExistingFilePositions();
        await Promise.all(fileList.map(async reference => {
            const file = Gio.File.new_for_uri(reference);

            if (!file.is_native()) {
                this._registerIncomingFilePosition(file, dropCoordinates);
                return;
            }

            const info = new Gio.FileInfo();
            info.set_attribute_string('metadata::desktop-icon-position', '');

            if (dropCoordinates !== null) {
                if (filesWillBeCopied) {
                    this._registerIncomingFilePosition(
                        file,
                        dropCoordinates
                    );
                    return;
                }

                info.set_attribute_string(
                    'metadata::nautilus-drop-position',
                    `${dropCoordinates[0]},${dropCoordinates[1]}`
                );
            }

            try {
                await file.set_attributes_async(
                    info,
                    Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS,
                    GLib.PRIORITY_LOW,
                    null
                );
            } catch (error) {
                if (error.matches(
                    Gio.IOErrorEnum,
                    Gio.IOErrorEnum.NOT_FOUND
                )) {
                    this._registerIncomingFilePosition(
                        file,
                        dropCoordinates
                    );
                }
            }
        }));
    }

    setPendingFilePosition(file, dropCoordinates) {
        this._resetPendingFilePositions();
        this._preserveExistingFilePositions();
        this._registerIncomingFilePosition(file, dropCoordinates);
    }

    async handleFileDrop(
        globalPosition,
        fileReferences,
        referenceFormat,
        selectedAction,
        isInAppDrag,
        event
    ) {
        const forceCopy = selectedAction === Gdk.DragAction.COPY;
        const fileList = this.fileURIsFromReferences(
            fileReferences,
            referenceFormat
        );
        const [X, Y] = this.desktopPositionForDrop(globalPosition);

        if (!fileList)
            return undefined;

        if (selectedAction === Gdk.DragAction.MOVE || forceCopy) {
            if (!isInAppDrag || forceCopy) {
                await this.prepareIncomingFilePlacement(
                    fileList,
                    [X, Y],
                    {filesWillBeCopied: forceCopy}
                );
            }

            return this.copyOrMoveUris(
                fileList,
                this._desktopDir.get_uri(),
                event,
                {forceCopy}
            );
        }

        return this.askWhatToDoWithFiles(
            fileList,
            this._desktopDir.get_uri(),
            X,
            Y,
            event
        );
    }

    async copyOrMoveUris(uriList, destinationUri, event, {forceCopy = false} = {}) {
        if (forceCopy) {
            this._DBusUtils.RemoteFileOperations.CopyURIsRemote(
                uriList,
                destinationUri,
                event
            );
            return Gdk.DragAction.COPY;
        }

        const moveFiles = [];
        const copyFiles = [];
        await Promise.all(uriList.map(async uri => {
            const file = Gio.File.new_for_uri(uri);
            const onDesktopFileSystem =
                await this._fileIsOnDesktopFileSystem(file);

            if (onDesktopFileSystem === null) {
                console.error(`Cannot Copy/Move, ${uri} does not exist`);
                const header = _('Copy/Move Failed');
                const text = _('{0} Does not exist').replace('{0}', uri);
                this._dbusManager.doNotify(header, text);
            } else if (onDesktopFileSystem) {
                moveFiles.push(uri);
            } else {
                copyFiles.push(uri);
            }
        }));

        if (moveFiles.length) {
            this._DBusUtils.RemoteFileOperations.MoveURIsRemote(
                moveFiles,
                destinationUri,
                event
            );
        }

        if (copyFiles.length) {
            this._DBusUtils.RemoteFileOperations.CopyURIsRemote(
                copyFiles,
                destinationUri,
                event
            );
        }

        return moveFiles.length ? Gdk.DragAction.MOVE : Gdk.DragAction.COPY;
    }

    async askWhatToDoWithFiles(
        fileList,
        destinationUri,
        X,
        Y,
        event,
        {desktopActions = true} = {}
    ) {
        const window = this._desktopManager.getDialogParentWindow();
        this._mainApp.activate_action('textEntryAccelsTurnOff', null);
        const chooser = new Gtk.AlertDialog();
        chooser.set_message(_('Choose Action for Files'));
        chooser.buttons = [_('Move'), _('Copy'), _('Link'), _('Cancel')];
        chooser.set_modal(false);
        chooser.set_cancel_button(3);
        chooser.set_default_button(3);

        const cancellable = Gio.Cancellable.new();
        this.dialogCancellable?.cancel();
        this.dialogCancellable = cancellable;

        const selectedAction = await new Promise(resolve => {
            chooser.choose(window, cancellable, async (actor, result) => {
                let action = Gtk.ResponseType.CANCEL;
                try {
                    const selectedButton = actor.choose_finish(result);
                    if (cancellable.is_cancelled()) {
                        resolve(Gdk.DragAction.NONE);
                        return;
                    }

                    if (selectedButton === 0) {
                        action = Gdk.DragAction.MOVE;
                        if (desktopActions) {
                            await this.prepareIncomingFilePlacement(
                                fileList,
                                [X, Y]
                            );
                        }
                        if (cancellable.is_cancelled()) {
                            resolve(Gdk.DragAction.NONE);
                            return;
                        }
                        await this.copyOrMoveUris(
                            fileList,
                            destinationUri,
                            event
                        );
                    } else if (selectedButton === 1) {
                        action = Gdk.DragAction.COPY;
                        if (desktopActions) {
                            await this.prepareIncomingFilePlacement(
                                fileList,
                                [X, Y],
                                {filesWillBeCopied: true}
                            );
                        }
                        if (cancellable.is_cancelled()) {
                            resolve(Gdk.DragAction.NONE);
                            return;
                        }
                        await this.copyOrMoveUris(
                            fileList,
                            destinationUri,
                            event,
                            {forceCopy: true}
                        );
                    } else if (selectedButton === 2) {
                        action = Gdk.DragAction.LINK;
                        await this.createSymbolicLinks(
                            fileList,
                            destinationUri,
                            desktopActions ? [X, Y] : null
                        );
                    }
                } catch (error) {
                    if (!error.matches(
                        Gio.IOErrorEnum,
                        Gio.IOErrorEnum.CANCELLED
                    )) {
                        console.error(
                            error,
                            'Error choosing what to do with dropped files'
                        );
                    }
                }
                resolve(cancellable.is_cancelled() ? Gdk.DragAction.NONE : action);
            });
        });

        if (this.dialogCancellable === cancellable)
            this.dialogCancellable = null;

        this._mainApp.activate_action('textEntryAccelsTurnOn', null);

        return selectedAction;
    }

    async createSymbolicLinks(fileList, destinationUri, dropPosition = null) {
        const destination = Gio.File.new_for_uri(destinationUri);
        const pendingPlacement = dropPosition
            ? this._createFilePlacementCallbacks(dropPosition)
            : null;

        try {
            await this._DesktopIconsUtil.createSymbolicLinks(
                destination,
                fileList,
                pendingPlacement
            );
        } catch (error) {
            console.error(error, 'Error making symbolic links');
            const header = _('Making SymLink Failed');
            const text = _('Could not create symbolic link');
            this._dbusManager.doNotify(header, text);
        }
    }

    // Private methods

    _resetPendingFilePositions() {
        // A null prototype keeps every valid basename safe as a lookup key.
        this._positionsForNewFiles = Object.create(null);
        this._positionsForExistingFiles = Object.create(null);
    }

    _gridCellCenterForDrop(xGlobalDestination, yGlobalDestination) {
        for (const desktop of this._desktops) {
            if (!desktop.coordinatesBelongToThisGrid(
                xGlobalDestination,
                yGlobalDestination
            ))
                continue;

            const [X, Y] = desktop.getCoordinatesOfGridContaining(
                xGlobalDestination,
                yGlobalDestination,
                true
            );
            return [
                X + desktop._elementWidth / 2,
                Y + desktop._elementHeight / 2,
            ];
        }

        return [xGlobalDestination, yGlobalDestination];
    }

    _createFilePlacementCallbacks(dropPosition) {
        this._resetPendingFilePositions();
        this._preserveExistingFilePositions();

        // Register each candidate before creation so the folder monitor can
        // place it. A failed attempt removes only the entry that it registered.
        return {
            beforeCreate: this._registerNewFilePosition.bind(
                this,
                [...dropPosition]
            ),
            creationFailed: this._removeNewFilePosition.bind(this),
        };
    }

    _preserveExistingFilePositions() {
        for (const fileItem of this.currentWorkingList) {
            if (fileItem.savedCoordinates === null) {
                this._positionsForExistingFiles[fileItem.fileName] = null;
                continue;
            }

            this._positionsForExistingFiles[fileItem.fileName] = [
                ...fileItem.savedCoordinates,
                ...fileItem.normalCoordinates,
                fileItem.monitorIndex,
            ];
        }
    }

    _registerNewFilePosition(dropPosition, file) {
        if (this._Prefs.keepArranged || this._Prefs.keepStacked)
            return false;

        const basename = file.get_basename();
        if (Object.hasOwn(this._positionsForNewFiles, basename))
            return false;

        this._positionsForNewFiles[basename] = dropPosition;
        return true;
    }

    _removeNewFilePosition(file, wasRegistered) {
        if (wasRegistered)
            delete this._positionsForNewFiles[file.get_basename()];
    }

    _findNewFilePositionKey(basename) {
        // DING registers placement before starting copy, move, or link work.
        // Exact names cover known destinations; COPYEXPECTED covers collision
        // names that Nautilus chooses while copying.
        if (Object.hasOwn(this._positionsForNewFiles, basename))
            return basename;

        const basenameBeforeCopySuffix = this._DesktopIconsUtil
            .getBasenameBeforeCopySuffix(basename);
        if (basenameBeforeCopySuffix === null)
            return null;

        return Object.keys(this._positionsForNewFiles).find(fileName =>
            fileName.endsWith('COPYEXPECTED') &&
            fileName.startsWith(basenameBeforeCopySuffix)
        ) ?? null;
    }

    _registerIncomingFilePosition(file, dropCoordinates) {
        if (!dropCoordinates)
            return;

        const basename = file.get_basename();
        let selfCopy = false;
        for (const fileItem of this.currentWorkingList) {
            if (fileItem.fileName !== basename)
                continue;

            this._positionsForNewFiles[`${basename}COPYEXPECTED`] =
                dropCoordinates;
            selfCopy = true;
        }

        if (!selfCopy)
            this._positionsForNewFiles[basename] = dropCoordinates;
    }

    async _fileIsOnDesktopFileSystem(file) {
        const [fileFsId, desktopFsId] = await Promise.all([
            this._getFsId(file),
            this._desktopFsId(),
        ]);

        if (fileFsId === null)
            return null;
        if (fileFsId.startsWith('trash'))
            return true;
        return fileFsId === desktopFsId;
    }

    async _getFsId(file) {
        const info = await file.query_info_async(
            'id::filesystem',
            Gio.FileQueryInfoFlags.NONE,
            GLib.PRIORITY_DEFAULT,
            null
        ).catch(error => {
            if (error.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
                return null;
            throw error;
        });

        return info?.get_attribute_string('id::filesystem') ?? null;
    }

    _desktopFsId() {
        return this._getFsId(this._desktopDir);
    }

    // Getters

    get positionsForNewFiles() {
        return this._positionsForNewFiles;
    }

    get positionsForExistingFiles() {
        return this._positionsForExistingFiles;
    }

    get currentSelection() {
        return this._desktopManager.getCurrentSelection();
    }

    get currentWorkingList() {
        return this._desktopManager.currentWorkingList;
    }

    get _desktops() {
        return this._desktopManager._desktops;
    }

    get _desktopDir() {
        return this._desktopManager.desktopDir;
    }
};
