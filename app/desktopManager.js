/* DING: Desktop Icons New Generation for GNOME Shell
 *
 * Gtk4 Port Copyright (C) 2022-25 Sundeep Mediratta (smedius@gmail.com)
 * Copyright (C) 2019 Sergio Costas (rastersoft@gmail.com)
 * Based on code original (C) Carlos Soriano
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
import {
    AskRenamePopup,
    DesktopMonitor,
    DesktopActions,
    ShowErrorPopup,
    TemplatesScriptsManager,
    FileItemMenu,
    AutoAr,
    AppChooser,
    GnomeShellDragDrop,
    StackItem,
    WindowManager
} from '../dependencies/localFiles.js';

import {Adw, Gtk, Gdk, Gio, GLib, GLibUnix} from '../dependencies/gi.js';
import {_} from '../dependencies/gettext.js';

export {DesktopManager};

const DesktopManager = class {
    constructor(Data, Utils, desktopList, codePath, asDesktop, primaryIndex) {
        // Inherit
        this.mainApp = Data.dingApp;
        this._codePath = codePath;
        this._asDesktop = asDesktop;
        if (asDesktop) {
            this.mainApp.hold(); // Don't close the application if there are no desktops
            this._hold_active = true;
        }

        this.GnomeShellVersion = Data.gnomeversion;

        this.uuid = Data.uuid;

        // Init and import Scripts and classes
        this.DesktopIconsUtil = Utils.DesktopIconsUtil;
        this.FileUtils = Utils.FileUtils;
        this.Enums = Data.Enums;
        this.DBusUtils = Utils.DBusUtils;
        this.dbusManager = Utils.DBusUtils.dbusManagerObject;
        this.Prefs = Utils.Preferences;
        this.showErrorPopup = ShowErrorPopup;
        this.templatesScriptsManager = TemplatesScriptsManager;
        this.autoAr = new AutoAr.AutoAr(this);
        this.appChooser = AppChooser;
        this.fileItemMenu = new FileItemMenu.FileItemMenu(this);
        this.ThumbnailLoader = Utils.ThumbnailLoader;
        this.windowManager = new WindowManager.WindowManager(this,
            desktopList,
            asDesktop,
            primaryIndex
        );
        this.desktopMonitor = new DesktopMonitor.DesktopMonitor(this);

        // Init Variables
        this._selectedFiles = null;
        this._clickX = null;
        this._clickY = null;
        this.pointerX = 0;
        this.pointerY = 0;
        this._dragList = null;
        this.dragItem = null;
        this.rubberBand = false;
        this.localDragOffset = [0, 0];
        this._compositeStackList = null;
        this._displayList = [];
        this._scriptsList = [];
        this._pendingDropFiles = {};
        this._pendingSelfCopyFiles = {};
        this.ignoreKeys = this.Enums.IgnoreKeys.map(_k => Gdk._k);

        // init methods

        this.desktopActions = new DesktopActions.DesktopActions(this);
        this.Prefs.init(this);

        // setup gracefull termination
        if (this._asDesktop) {
            this._sigtermID = GLibUnix.signal_add_full(
                GLib.PRIORITY_DEFAULT,
                15,
                () => {
                    GLib.source_remove(this._sigtermID);
                    this.terminateProgram();
                    if (this._hold_active) {
                        this.mainApp.release();
                        this._hold_active = false;
                    }
                    return false;
                }
            );
        }
        this._syncStartupDesktop().catch(e => logError(e));
    }

    async _syncStartupDesktop() {
        // startup in a particular order
        // First create and make sure windows are created
        const windowscreated = new Promise(resolve => {
            this.windowsPromiseResolve = resolve;
            this.windowManager.createGridWindows();
            // If this desktop List is null, ask for a new one
            this.windowManager.requestGeometryUpdate();
        });

        // Monitor is attached, windows are created with proper geometry
        await windowscreated.catch(e => logError(e));

        // Now we can actually display errors, so check for them
        // Check and make sure that there is a 'Desktop' folder set and it exists
        // Check if Gnome Files is available and executable, otherwise give warning
        // Check and make sure Gnome Files is registered with
        // xdg-utils to handle inode/directory
        this._performSanityChecks().catch(e => logError(e));

        // The initialRead parameter insures tha grid positions are recalculated
        // and recaculated postions of all fileItems will be re-written to
        // disk with write mode 'OVERWRITE'
        const initialRead = true;

        // prior fileList, even if triggered through desktopdir changes
        // will not be displayed as windows were not there.
        const fileList = await this.desktopMonitor.getFileList();

        // This is no longer needed, if true it blocks _drawDesktop and all updates.
        this.windowsPromiseResolve = null;

        await this._drawDesktop(fileList, {initialRead}).catch(e => logError(e));
        // First intitiation complete, valid file read from
        // desktopdir, even if a prior fileList was read, the
        // forced new read will recalculate and resave new
        // normalized coordinates and monitor information.
    }

    async _performSanityChecks() {
        // show error if monitor frame buffer scaling is not enabled first as windows may be awry
        if (this.windowManager.differentZooms &&
            !this.Prefs.usingX11 &&
            !this.fractionalScaling &&
            !this._framebufferWarningDone) {
            const header = _('Monitor Frame Buffer Scaling is not enabled');
            const text = _('Multiple monitors with different zoom settings, recommend per monitor framebuffer scaling.\n\nPlease enable in Mutter Dconf Settings');
            // show notification as well as error dialog as windows may not be postioned correctly
            this.dbusManager.doNotify(header, text);
            this._framebufferWarningDone = true;

            const window = this.mainApp.get_active_window();
            const dialog = new Adw.AlertDialog();
            dialog.set_body_use_markup(true);
            dialog.set_heading_use_markup(true);
            dialog.set_heading(header);
            const secondaryText = _('Multiple monitors with different zoom settings.\n\nEnable per monitor framebuffer scaling in Mutter Dconf Settings?');
            dialog.set_body(secondaryText);
            dialog.add_response('cancel', _('Cancel'));
            dialog.add_response('enable', _('Enable'));
            dialog.set_close_response('cancel');
            dialog.set_default_response('enable');
            dialog.set_response_appearance('enable', Adw.ResponseAppearance.SUGGESTED);
            dialog.set_response_appearance('cancel', Adw.ResponseAppearance.DEFAULT);
            dialog.set_prefer_wide_layout(true);
            const runDialog = new Promise(resolve => {
                dialog.choose(window, null, (actor, asyncResult) => {
                    const response = actor.choose_finish(asyncResult);
                    if (response === 'enable')
                        this.Prefs.fractionalScaling = true;
                    dialog.close();
                    resolve(response);
                });
            });
            await runDialog;
        }

        const isFolder = this._desktopDir.query_file_type(
            Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS,
            null) === Gio.FileType.DIRECTORY;
        if (!isFolder) {
            const errorDialog = this.showError(
                _('Can Not Show the Desktop'),
                _(`The Desktop folder ${this._desktopDir.get_path()} does not exist, or is not a Directory\n\nCheck your xdg-utils installation and set the correct Desktop Folder`)
            );
            await errorDialog.run();
            this._desktops.forEach(d => d.setErrorState());
        }

        const inodeHandlers = Gio.AppInfo.get_all_for_type('inode/directory');
        if (!GLib.find_program_in_path('nautilus')) {
            const errorDialog = this.showError(
                _('GNOME Files not found'),
                _('The GNOME Files application is required by Gtk4 Desktop Icons NG.')
            );
            await errorDialog.run();
        }

        if (!inodeHandlers.length) {
            const helpURL = 'https://gitlab.com/smedius/desktop-icons-ng/-/issues/73';
            const errorDialog = this.showError(
                _('There is no default File Manager'),
                _('There is no application that handles mimetype "inode/directory"'),
                helpURL
            );
            await errorDialog.run();
        }

        if (!inodeHandlers.map(a => a.get_id()).includes('org.gnome.Nautilus.desktop')) {
            const helpURL = 'https://gitlab.com/smedius/desktop-icons-ng/-/issues/73';
            const errorDialog = this.showError(
                _('Gnome Files is not registered as a File Manager'),
                _('The Gnome Files application is not programmed to open Folders!\nCheck your xdg-utils installation\nCheck Gnome Files .desktop File installation'),
                helpURL
            );
            await errorDialog.run();
        }
    }

    showError(text, secondaryText, helpURL = null, timeout = 0) {
        const errorDialog = new ShowErrorPopup.ShowErrorPopup(
            text,
            secondaryText,
            this.DesktopIconsUtil.waitDelayMs,
            helpURL
        );

        if (timeout)
            errorDialog.runAutoClose(timeout);

        return errorDialog;
    }

    terminateProgram() {
        this.desktopMonitor.stopMonitoring();

        if (this._dbusGeometryIface)
            this._dbusGeometryIface.unexport();

        if (this._compositeStackList && this._compositeStackList.length) {
            this._displayList.forEach(f => {
                if (f.isStackMarker)
                    f.onDestroy();
            });
            this._compositeStackList.forEach(f => f.onDestroy());
        } else {
            this._displayList.forEach(f => f.onDestroy());
        }

        this.windowManager.destroyDesktops();

        this.fileItemMenu.destroy();
    }


    // Drag and Drop

    saveCurrentFileCoordinatesForUndo() {
        if (this.Prefs.keepArranged || this.Prefs.keepStacked)
            return;

        this._pendingDropFiles = {};
        this._pendingSelfCopyFiles = {};

        this.getCurrentSelection()?.forEach(f => {
            this._pendingSelfCopyFiles[f.fileName] = f.savedCoordinates;
        });
    }

    async clearFileCoordinates(fileList, dropCoordinates, opts = {doCopy: false}) {
        if (this.Prefs.keepArranged || this.Prefs.keepStacked)
            return;

        this._pendingDropFiles = {};
        this._pendingSelfCopyFiles = {};

        await Promise.all(fileList.map(async element => {
            let file = Gio.File.new_for_uri(element);

            if (!file.is_native()) {
                this._setPendingDropCoordinates(file, dropCoordinates);
                return;
            }

            let info = new Gio.FileInfo();
            info.set_attribute_string('metadata::desktop-icon-position', '');
            if (dropCoordinates !== null) {
                if (!opts.doCopy) {
                    info.set_attribute_string('metadata::nautilus-drop-position', `${dropCoordinates[0]},${dropCoordinates[1]}`);
                } else {
                    this._setPendingDropCoordinates(file, dropCoordinates);
                    return;
                }
            }

            try {
                await file.set_attributes_async(info,
                    Gio.FileQueryInfoFlags.NONE,
                    GLib.PRIORITY_LOW,
                    null);
            } catch (e) {
                if (e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
                    this._setPendingDropCoordinates(file, dropCoordinates);
            }
        }));
    }

    doMoveWithDragAndDrop(xOrigin, yOrigin, xDestination, yDestination) {
        const keepArranged = this.Prefs.keepArranged || this.Prefs.keepStacked;
        if (this.Prefs.sortSpecialFolders && keepArranged)
            return;

        let deltaX;
        let deltaY;

        if (!this.Prefs.freePositionIcons) {
            deltaX = xDestination - xOrigin;
            deltaY = yDestination - yOrigin;
        } else {
            deltaX = xDestination - xOrigin - this.localDragOffset[0] * 2;
            deltaY = yDestination - yOrigin - this.localDragOffset[1];
        }

        const fileItems = [];
        this._displayList.filter(item => item.isSelected).forEach(item => {
            if (!keepArranged || item.isSpecial) {
                fileItems.push(item);
                item.removeFromGrid({callOnDestroy: false});
                let [x, y] = item.getCoordinates().slice(0, 3);
                item.temporarySavedPosition = [x + deltaX, y + deltaY];
            }
        });

        // force to store the new coordinates
        this._addFilesToDesktop(fileItems, this.Enums.StoredCoordinates.OVERWRITE);
        if (keepArranged) {
            this.redrawDesktop().catch(e => {
                console.log(`Exception while doing move with drag and drop and "Keep arranged…": ${e.message}\n${e.stack}`);
            });
        }
    }

    onDragBegin(item) {
        this.saveCurrentFileCoordinatesForUndo();
        this.dragItem = item;
        this._stopGnomeShellDrag();
    }

    onDragMotion(X, Y) {
        if (this.dragItem === null) {
            for (let desktop of this._desktops)
                desktop.refreshDrag([[0, 0]], X, Y);

            return;
        }
        if (this._dragList === null) {
            const itemList = this.getCurrentSelection();
            if (!itemList)
                return;

            let [x1, y1] = this.dragItem.getCoordinates().slice(0, 3);
            let oX = x1;
            let oY = y1;
            this._dragList = [];
            for (let item of itemList) {
                [x1, y1] = item.getCoordinates().slice(0, 3);
                this._dragList.push([x1 - oX, y1 - oY]);
            }
        }
        for (let desktop of this._desktops)
            desktop.refreshDrag(this._dragList, X, Y);
        this._stopGnomeShellDrag();
        this.dragItem.setHighLighted();
    }

    onDragLeave() {
        this._dragList = null;
        for (let desktop of this._desktops)
            desktop.refreshDrag(null, 0, 0);
        // Synthesise, extrapolate drag motion on a shell actor
        this._startGnomeShellDrag();
    }

    onDragEnd() {
        this.dragItem = null;
        this._stopGnomeShellDrag();
    }

    makeFileListFromSelection(dropData, acceptFormat) {
        if (!dropData)
            return null;
        if (acceptFormat === this.Enums.DndTargetInfo.TEXT_PLAIN)
            return null;

        let fileList;

        if (acceptFormat === this.Enums.DndTargetInfo.GNOME_ICON_LIST) {
            fileList = GLib.Uri.list_extract_uris(dropData);
        } else if (acceptFormat === this.Enums.DndTargetInfo.DING_ICON_LIST) {
            fileList = dropData.get_files().map(f => f.get_uri());
        } else {
            fileList = dropData.split('\n').map(f => {
                if (GLib.Uri.peek_scheme(f))
                    return f;
                else
                    return GLib.filename_to_uri(f, null);
            });
        }

        // filename_to_uri can return null
        fileList = fileList.filter(f => {
            if (!f)
                return false;
            return true;
        });

        if (fileList && fileList.length)
            return fileList;
        else
            return null;
    }

    async onDragDataReceived(xGlobalDestination, yGlobalDestination, xlocalDestination, ylocalDestination, dropData, acceptFormat, gdkDropAction, localDrop, event, dragItem) {
        this.onDragLeave();

        let dropCoordinates;
        let xOrigin;
        let yOrigin;
        const forceCopy = gdkDropAction === Gdk.DragAction.COPY;
        const fileList = this.makeFileListFromSelection(dropData, acceptFormat);

        if (!this.Prefs.freePositionIcons)
            [xGlobalDestination, yGlobalDestination] = this._positiveOffsetGridAim(xGlobalDestination, yGlobalDestination);

        let returnAction;
        switch (acceptFormat) {
        case this.Enums.DndTargetInfo.DING_ICON_LIST:
            [xOrigin, yOrigin] = dragItem.getCoordinates().slice(0, 3);
            if (gdkDropAction === Gdk.DragAction.MOVE) {
                this.doMoveWithDragAndDrop(xOrigin, yOrigin, xGlobalDestination, yGlobalDestination);
                returnAction = Gdk.DragAction.MOVE;
                break;
            }
        // eslint-disable-next-line no-fallthrough
        case this.Enums.DndTargetInfo.GNOME_ICON_LIST:
        case this.Enums.DndTargetInfo.URI_LIST:
            if (!fileList)
                return;
            if (gdkDropAction === Gdk.DragAction.MOVE || gdkDropAction === Gdk.DragAction.COPY) {
                try {
                    if (!localDrop)
                        await this.clearFileCoordinates(fileList, [xGlobalDestination, yGlobalDestination], {doCopy: forceCopy});
                    returnAction = await this.copyOrMoveUris(fileList,
                        this._desktopDir.get_uri(), event, {forceCopy});
                } catch (e) {
                    console.error(e);
                }
            } else {
                if (gdkDropAction >= Gdk.DragAction.LINK)
                    returnAction = Gdk.DragAction.LINK;
                else
                    returnAction = Gdk.DragAction.COPY;
                this.askWhatToDoWithFiles(fileList, this._desktopDir.get_uri(),
                    xGlobalDestination, yGlobalDestination, xlocalDestination, ylocalDestination, event).catch(e => {
                    logError(e);
                });
            }
            break;
        case this.Enums.DndTargetInfo.TEXT_PLAIN:
            returnAction = Gdk.DragAction.COPY;
            dropCoordinates = [xGlobalDestination, yGlobalDestination];
            this.detectURLorText(dropData, dropCoordinates);
            break;
        default:
            returnAction = Gdk.DragAction.COPY;
        }
        // eslint-disable-next-line consistent-return
        return returnAction;
    }

    onTextDrop(dropData, [xGlobalDestination, yGlobalDestination]) {
        this.detectURLorText(dropData, [xGlobalDestination, yGlobalDestination]);
    }

    async askWhatToDoWithFiles(fileList, destinationuri, X, Y, x, y, event, opts = {desktopactions: true}) {
        const window = this.mainApp.get_active_window();
        this.textEntryAccelsTurnOff();
        const chooser = new Gtk.AlertDialog();
        chooser.set_message(_('Choose Action for Files'));
        chooser.buttons = [_('Move'), _('Copy'), _('Link'), _('Cancel')];
        chooser.set_modal(false);
        chooser.set_cancel_button(3);
        chooser.set_default_button(3);
        const cancellable = Gio.Cancellable.new();
        if (this.dialogCancellable)
            this.dialogCancellable.cancel();
        this.dialogCancellable = cancellable;
        const showdialog = new Promise(resolve => {
            chooser.choose(window, cancellable, async (actor, choice) => {
                let retval = Gtk.ResponseType.CANCEL;
                try {
                    const buttonpress = actor.choose_finish(choice);
                    switch (buttonpress) {
                    case 0:
                        retval = Gdk.DragAction.MOVE;
                        try {
                            if (opts.desktopactions)
                                await this.clearFileCoordinates(fileList, [X, Y]);

                            let forceCopy = false;
                            await this.copyOrMoveUris(fileList,
                                destinationuri, event, {forceCopy});
                        } catch {
                            console.error('Error moving files');
                        }
                        break;
                    case 1:
                        retval = Gdk.DragAction.COPY;
                        try {
                            if (opts.desktopactions)
                                await this.clearFileCoordinates(fileList, [X, Y], {dopCopy: true});

                            let forceCopy = true;
                            await this.copyOrMoveUris(fileList,
                                destinationuri, event, {forceCopy});
                        } catch {
                            console.error('Error copying files');
                        }
                        break;
                    case 2:
                        retval = Gdk.DragAction.LINK;
                        try {
                            if (opts.desktopactions)
                                await this.makeLinks(fileList, destinationuri, X, Y);
                            else
                                this.makeFileSystemLinks(fileList, destinationuri);
                        } catch {
                            console.error('Error making links');
                        }
                        break;
                    default:
                        retval = Gtk.ResponseType.CANCEL;
                    }
                    resolve(retval);
                } catch (e) {
                    if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                        console.error(e, `Error asking choosing what to do with Files ${e.message}`);
                    resolve(retval);
                }
            });
        });
        const retval = await showdialog.catch(e => logError(e));
        this.dialogCancellable = null;
        this.textEntryAccelsTurnOn();
        return retval;
    }

    makeFileSystemLinks(fileList, destination) {
        let gioDestination = Gio.File.new_for_uri(destination);
        fileList.forEach(file => {
            const fileGio = Gio.File.new_for_uri(file);
            const baseNameParts = this.DesktopIconsUtil.getFileExtensionOffset(fileGio.get_basename());
            let i = 0;
            let newSymlinkName = fileGio.get_basename();
            let checkSymlinkGio;
            do {
                checkSymlinkGio = Gio.File.new_for_commandline_arg(GLib.build_filenamev([gioDestination.get_path(), newSymlinkName]));
                try {
                    checkSymlinkGio.make_symbolic_link(GLib.build_filenamev([fileGio.get_path()]), null);
                    break;
                } catch (e) {
                    if (e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.EXISTS)) {
                        i += 1;
                        newSymlinkName = `${baseNameParts.basename} ${i}${baseNameParts.extension}`;
                    } else {
                        console.error(e, 'Error making file-system links');
                        const header = _('Making SymLink Failed');
                        const text = _('Could not create symbolic link');
                        this.dbusManager.doNotify(header, text);
                        break;
                    }
                }
            } while (true);
        });
    }

    async makeLinks(fileList, destination, X, Y) {
        let gioDestination = Gio.File.new_for_uri(destination);
        await Promise.all(fileList.map(async file => {
            const fileGio = Gio.File.new_for_uri(file);
            const newSymlinkName = this.desktopMonitor.getDesktopUniqueFileName(fileGio.get_basename());
            const symlinkGio = Gio.File.new_for_commandline_arg(GLib.build_filenamev([gioDestination.get_path(), newSymlinkName]));
            try {
                if (symlinkGio.make_symbolic_link(GLib.build_filenamev([fileGio.get_path()]), null)) {
                    let info = new Gio.FileInfo();
                    info.set_attribute_string('metadata::nautilus-drop-position', `${X},${Y}`);
                    info.set_attribute_string('metadata::desktop-icon-position', '');
                    try {
                        await symlinkGio.set_attributes_async(info,
                            Gio.FileQueryInfoFlags.NONE,
                            GLib.PRIORITY_LOW,
                            null);
                    } catch (e) {
                        console.error(e, 'Error setting link FileInfo');
                    }
                }
            } catch {
                console.error('Error making desktop links');
                const header = _('Making SymLink Failed');
                const text = _('Could not create symbolic link');
                this.dbusManager.doNotify(header, text);
            }
        }));
    }

    async desktopFsId() {
        if (this._desktopFsId === undefined)
            this._desktopFsId = await this._getFsId(this._desktopDir);

        return this._desktopFsId;
    }

    async fileIsOnDesktopFileSystem(file) {
        /**
         * Checks to see if file is on the same filesystem as the Desktop Folder
         * Consider trash:// URI to be in the same folder as the Desktop
         * This forces a move from Trash instead of copy
         *
         * @param {file} Gio.File
         * @returns {boolean} if the file is on the same filesystem as Desktop
         * @returns {null} if the file does not exist
         */
        const fileSystemID = await this._getFsId(file);
        if (fileSystemID == null)
            return null;
        if (fileSystemID.startsWith('trash'))
            return true;
        const desktopFileSystemID = await this.desktopFsId();
        if (fileSystemID === desktopFileSystemID)
            return true;
        return false;
    }

    async copyOrMoveUris(uriList, destinationUri, event, params = {}) {
        if (params.forceCopy) {
            this.DBusUtils.RemoteFileOperations.pushEvent(event);
            this.DBusUtils.RemoteFileOperations.CopyURIsRemote(uriList, destinationUri);
            return Gdk.DragAction.COPY;
        }

        const moveFiles = [];
        const copyFiles = [];
        await Promise.all(uriList.map(async uri => {
            const f = Gio.File.new_for_uri(uri);
            const localFile = await this.fileIsOnDesktopFileSystem(f);
            // localFile is null if it does not exist, false if on different
            // fileystem, true if on the same filesystem as the Desktop Folder
            if (localFile == null) {
                console.error(`Cannot Copy/Move, ${uri} does not exist`);
                const header = _('Copy/Move Failed');
                const text = _('{0} Does not exist').replace('{0}', uri);
                this.dbusManager.doNotify(header, text);
                return;
            }
            if (localFile)
                moveFiles.push(uri);
            else
                copyFiles.push(uri);
        }));

        if (moveFiles.length) {
            this.DBusUtils.RemoteFileOperations.pushEvent(event);
            this.DBusUtils.RemoteFileOperations.MoveURIsRemote(moveFiles, destinationUri);
        }

        if (copyFiles.length) {
            this.DBusUtils.RemoteFileOperations.pushEvent(event);
            this.DBusUtils.RemoteFileOperations.CopyURIsRemote(copyFiles, destinationUri);
        }

        return moveFiles.length ? Gdk.DragAction.MOVE : Gdk.DragAction.COPY;
    }

    async detectURLorText(dropData, dropCoordinates) {
        /**
         * Checks to see if a string is a URL
         *
         * @param {string} str A text URL
         * @returns {boolean} if the string is a URL
         */
        function isValidURL(str) {
            var pattern = new RegExp('^(https|http|ftp|rtsp|mms)?:\\/\\/?' +
            '((([a-z\\d]([a-z\\d-]*[a-z\\d])*)\\.)+[a-z]{2,}|' +
            '((\\d{1,3}\\.){3}\\d{1,3}))' +
            '(\\:\\d+)?(\\/[-a-z\\d%_.~+]*)*' +
            '(\\?[;&a-z\\d%_.~+=-]*)?' +
            '(\\#[-a-z\\d_]*)?$', 'i');
            return !!pattern.test(str);
        }
        let text = dropData.toString();
        if (text === '')
            return;
        if (isValidURL(text)) {
            await this.writeURLlinktoDesktop(text, dropCoordinates);
        } else {
            let filename = 'Dragged Text';
            let now = Date().valueOf().split(' ').join('').replace(/:/g, '-');
            filename = `${filename}-${now}`;
            await this.DesktopIconsUtil.writeTextFileToPath(text, this._desktopDir,
                filename, dropCoordinates);
        }
    }

    async writeURLlinktoDesktop(link, dropCoordinates) {
        let filename = link.split('?')[0];
        filename = filename.split('//')[1];
        filename = filename.split('/')[0];
        let now = Date().valueOf().split(' ').join('').replace(/:/g, '-');
        filename = `${filename}-${now}`;
        await this.writeHTMLTypeLink(filename, link, dropCoordinates);
    }


    async writeHTMLTypeLink(filename, link, dropCoordinates) {
        filename += '.html';
        let body = ['<html>', '<head>', `<meta http-equiv="refresh" content="0; url=${link}" />`, '</head>', '<body>', '</body>', '</html>'];
        body = body.join('\n');
        await this.DesktopIconsUtil.writeTextFileToPath(body, this._desktopDir,
            filename, dropCoordinates);
    }

    fillDragDataGet(target) {
        const fileList = this.getCurrentSelection();
        if (!fileList)
            return null;

        let uriList = '';
        let pathList = '';

        switch (target) {
        case this.Enums.DndTargetInfo.GNOME_ICON_LIST:
            for (let fileItem of fileList) {
                uriList += fileItem.uri;
                const coordinates = fileItem.getCoordinates();
                if (coordinates !== null) {
                    uriList += `\r
                        ${coordinates[0]}:
                        ${coordinates[1]}:
                        ${coordinates[2] - coordinates[0] + 1}:
                        ${coordinates[3] - coordinates[1] + 1}`;
                }
                uriList += '\r\n';
            }
            return uriList;
        case this.Enums.DndTargetInfo.DING_ICON_LIST:
        case this.Enums.DndTargetInfo.TEXT_URI_LIST:
            uriList = fileList.map(f => f.uri).join('\r\n');
            uriList += '\r\n';
            return uriList;
        case this.Enums.DndTargetInfo.TEXT_PLAIN:
            pathList = fileList.map(f => f.path).join('n');
            pathList += '\n';
            return pathList;
        }
        return null;
    }


    _setPendingDropCoordinates(file, dropCoordinates) {
        if (!dropCoordinates)
            return;
        const basename = file.get_basename();

        let selfCopy = false;
        this.currentWorkingList.forEach(fileItem => {
            if (fileItem.fileName === basename) {
                this._pendingDropFiles[`${basename}COPYEXPECTED`] = dropCoordinates;
                this._pendingSelfCopyFiles[basename] = fileItem.savedCoordinates;
                selfCopy = true;
            }
        });

        if (!selfCopy)
            this._pendingDropFiles[basename] = dropCoordinates;
    }

    _startGnomeShellDrag() {
        if (!this._localDrag() && this.dragItem && !this.gnomeShellDrag)
            this.gnomeShellDrag = new GnomeShellDragDrop.GnomeShellDrag(this);
    }

    _stopGnomeShellDrag() {
        this.gnomeShellDrag?.destroy();
        this.gnomeShellDrag = null;
    }

    _localDrag() {
        let localDrag = false;
        this._desktops.forEach(d => {
            if (d.localDrag)
                localDrag = true;
        });
        return localDrag;
    }

    _positiveOffsetGridAim(xGlobalDestination, yGlobalDestination) {
        // Find the grid where the destination lies and aim towards the positive side, middle of grid to ensure drop in the grid
        let xbias = 0;
        let ybias = 0;
        for (let desktop of this._desktops) {
            if (desktop.coordinatesBelongToThisGrid(xGlobalDestination, yGlobalDestination)) {
                xbias = desktop._elementWidth / 2;
                ybias = desktop._elementHeight / 2;
                break;
            }
        }
        return [xGlobalDestination + xbias, yGlobalDestination + ybias];
    }

    async _getFsId(file) {
        /**
         * Returns filesystem id of file or null if file does not exist
         *
         * @param {file} Gio.File
         * @returns {str} filesystem ID of file or null
         */
        const info = await file.query_info_async('id::filesystem',
            Gio.FileQueryInfoFlags.NONE, GLib.PRIORITY_DEFAULT, null).catch(
            e => {
                if (e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
                    return null;
                throw e;
            }
        );
        if (info == null)
            return null;
        return info.get_attribute_string('id::filesystem');
    }

    // Drag and Drop

    drawSelectionRectangles() {
        for (let grid of this._desktops)
            grid.drawRubberBand();
    }

    onMotion(X, Y) {
        this.pointerX = X;
        this.pointerY = Y;
        if (this.rubberBand) {
            this.x1 = Math.min(X, this.rubberBandInitX);
            this.x2 = Math.max(X, this.rubberBandInitX);
            this.y1 = Math.min(Y, this.rubberBandInitY);
            this.y2 = Math.max(Y, this.rubberBandInitY);
            this.selectionRectangle = new Gdk.Rectangle({'x': this.x1, 'y': this.y1, 'width': this.x2 - this.x1, 'height': this.y2 - this.y1});
            this.drawSelectionRectangles();
            for (let item of this._displayList) {
                let labelintersect = item.labelRectangle.intersect(this.selectionRectangle)[0];
                let iconintersect = item.iconRectangle.intersect(this.selectionRectangle)[0];
                if (labelintersect || iconintersect) {
                    item.setSelected();
                    item.touchedByRubberband = true;
                } else if (item.touchedByRubberband) {
                    item.unsetSelected();
                }
            }
        }
    }

    onReleaseButton() {
        if (this.rubberBand) {
            this.rubberBand = false;
            this.selectionRectangle = null;
        }
        for (let grid of this._desktops)
            grid.drawRubberBand();

        return false;
    }

    _startRubberband(X, Y) {
        this.rubberBandInitX = X;
        this.rubberBandInitY = Y;
        this.rubberBand = true;
        for (let item of this._displayList)
            item.touchedByRubberband = false;
    }

    unHighLightDropTarget() {
        this._displayList.forEach(item => item.unHighLightDropTarget());
    }

    selected(fileItem, action) {
        switch (action) {
        case this.Enums.Selection.ALONE:
            if (!fileItem.isSelected) {
                for (let item of this._displayList) {
                    if (item === fileItem)
                        item.setSelected();
                    else
                        item.unsetSelected();
                }
            }
            break;
        case this.Enums.Selection.WITH_SHIFT:
            fileItem.toggleSelected();
            break;
        case this.Enums.Selection.RIGHT_BUTTON:
            if (!fileItem.isSelected) {
                for (let item of this._displayList) {
                    if (item === fileItem)
                        item.setSelected();
                    else
                        item.unsetSelected();
                }
            }
            break;
        case this.Enums.Selection.ENTER:
            if (this.rubberBand)
                fileItem.setSelected();

            break;
        case this.Enums.Selection.RELEASE:
            for (let item of this._displayList) {
                if (item === fileItem) {
                    if (item.isSelected)
                        item.setSelected();
                    else
                        item.unsetSelected();
                }
            }
            break;
        }
    }

    // Keyboard and Mouse Events

    async onPressButton(X, Y, x, y, button, shiftPressed, controlPressed, grid) {
        this._clickX = Math.floor(X);
        this._clickY = Math.floor(Y);

        if (button === 1) {
            if (!shiftPressed && !controlPressed) {
                // clear selection
                this.unselectAll();
            }
            this._startRubberband(X, Y);
        }

        if (button === 3) {
            await this.desktopActions.updateClipboard();
            this._createDesktopBackgroundGioMenu();
            this.popupmenu = Gtk.PopoverMenu.new_from_model(this.desktopBackgroundGioMenu);
            this.popupmenu.set_parent(grid._container);
            const menuLocation = new Gdk.Rectangle({x, y, width: 1, height: 1});
            this.popupmenu.set_pointing_to(menuLocation);
            const menuGtkPosition = grid.getIntelligentPosition(menuLocation);
            if (menuGtkPosition)
                this.popupmenu.set_position(menuGtkPosition);

            this.popupmenu.set_has_arrow(false);
            this.popupmenu.popup();
            this.popupmenu.connect('closed', async () => {
                await this.DesktopIconsUtil.waitDelayMs(50);
                this.popupmenu.unparent();
                this.popupmenu = null;
                if (this.popupmenuclosed)
                    this.popupmenuclosed(true);
            });
        }
    }

    onKeyPress(keyval, keycode, state, grid) {
        this.keyEventGrid = grid;
        if (this.popupmenu || this.fileItemMenu.popupmenu)
            return true;

        if (this.ignoreKeys.includes(keyval))
            return true;

        let key = String.fromCharCode(Gdk.keyval_to_unicode(keyval));
        if (this.keypressTimeoutID && this.searchString)
            this.searchString = this.searchString.concat(key);
        else
            this.searchString = key;

        if (this.searchString !== '') {
            let found = this._scanForFiles(this.searchString, false);
            if (found) {
                if ((this.getNumberOfSelectedItems() >= 1) && !this.keypressTimeoutID) {
                    const secondaryText = null;
                    const helpURL = null;
                    const timeoutClose = 2000; // In ms
                    this.showError(
                        _('Clear current selection before new search'),
                        secondaryText,
                        helpURL,
                        timeoutClose
                    );
                    return true;
                }
                this.searchEventTime = GLib.get_monotonic_time();
                if (!this.keypressTimeoutID) {
                    this.keypressTimeoutID = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
                        if (GLib.get_monotonic_time() - this.searchEventTime < 1500000)
                            return true;

                        this.searchString = null;
                        this.keypressTimeoutID = null;
                        if (this._findFileWindow)
                            this._findFileWindow.response(Gtk.ResponseType.OK);

                        return false;
                    });
                }
                this.findFiles(this.searchString);
            }
            return true;
        } else {
            return false;
        }
    }

    closePopUps() {
        if (this._renameWindow) {
            this._renameWindow.close();
            return true;
        }
        if (this.dialogCancellable) {
            this.dialogCancellable.cancel();
            this.dialogCancellable = null;
            return true;
        }
        return false;
    }

    // Create the desktop background menu
    /* ************************************************************************************************************** */

    _createDesktopBackgroundGioMenu() {
        this.sortingRadioMenu = Gio.Menu.new();
        this.sortingRadioMenu.append(_('Name'), 'app.arrangeaction::NAME');
        this.sortingRadioMenu.append(_('Name Z-A'), 'app.arrangeaction::DESCENDINGNAME');
        this.sortingRadioMenu.append(_('Modified Time'), 'app.arrangeaction::MODIFIEDTIME');
        this.sortingRadioMenu.append(_('Type'), 'app.arrangeaction::KIND');
        this.sortingRadioMenu.append(_('Size'), 'app.arrangeaction::SIZE');


        this.sortingSubMenu = Gio.Menu.new();
        this.keepArrangedMenuItem = Gio.MenuItem.new(_('Keep Arranged…'), 'app.keep-arranged');
        if (!this.Prefs.keepStacked)
            this.sortingSubMenu.append_item(this.keepArrangedMenuItem);

        this.sortingSubMenu.append(_('Keep Stacked by Type…'), 'app.keep-stacked');
        this.sortingSubMenu.append(_('Sort Home/Drives/Trash…'), 'app.sort-special-folders');
        this.sortingSubMenu.append_section(null, this.sortingRadioMenu);

        this.settingSubMenu = Gio.Menu.new();
        this.settingSubMenu.append(_('Change Desktop'), 'app.changeDesktop');
        if (!this.isDefaultDesktopFolder)
            this.settingSubMenu.append(_('Restore Default Desktop'), 'app.restoreDefaultDesktop');
        this.settingSubMenu.append(_('Desktop Icon Settings'), 'app.changeDesktopIconSettings');

        this.desktopBackgroundGioMenu = Gio.Menu.new();

        this.desktopBackgroundGioMenu.append(_('New Folder'), 'app.doNewFolder');

        let templates = this.templatesMonitor.getGioMenu();
        if (!(templates === null))
            this.desktopBackgroundGioMenu.append_submenu(_('New Document'), templates);


        this.pasteUndoRedoMenu = Gio.Menu.new();
        this.pasteUndoRedoMenu.append(_('Paste'), 'app.doPaste');
        this.pasteUndoRedoMenu.append(_('Undo'), 'app.doUndo');
        this.pasteUndoRedoMenu.append(_('Redo'), 'app.doRedo');

        this.desktopBackgroundGioMenu.append_section(null, this.pasteUndoRedoMenu);

        this.selectAllMenu = Gio.Menu.new();
        this.selectAllMenu.append(_('Select All'), 'app.selectAll');

        this.desktopBackgroundGioMenu.append_section(null, this.selectAllMenu);

        this.sortingMenu = Gio.Menu.new();
        this.cleanUpMenuItem = Gio.MenuItem.new(_('Arrange Icons'), 'app.cleanUpIcons');
        if (!this.Prefs.keepStacked)
            this.sortingMenu.append_item(this.cleanUpMenuItem);

        this.arrangeSubMenuItem = Gio.MenuItem.new_submenu(_('Arrange By…'), this.sortingSubMenu);
        this.sortingMenu.append_item(this.arrangeSubMenuItem);
        this.desktopBackgroundGioMenu.append_section(null, this.sortingMenu);

        this.desktopTerminalMenu = Gio.Menu.new();
        const nautilusName = this.Prefs.NautilusName;
        this.desktopTerminalMenu.append(_('Show Desktop In {0}').replace('{0}', nautilusName),
            'app.showDesktopInFiles');
        const terminalString = this.Prefs.TerminalName;
        this.desktopTerminalMenu.append(_('Open In {0}').replace('{0}', terminalString),
            'app.openInTerminal');

        this.desktopBackgroundGioMenu.append_section(null, this.desktopTerminalMenu);

        this.settingsMenu = Gio.Menu.new();
        this.settingSubMenuItem = Gio.MenuItem.new_submenu(_('Settings'), this.settingSubMenu);
        this.settingsMenu.append_item(this.settingSubMenuItem);

        this.desktopBackgroundGioMenu.append_section(null, this.settingsMenu);

        this.backgroundMenu = Gio.Menu.new();
        this.backgroundMenu.append(_('Shell Menu…'), 'app.displayShellBackgroundMenu');
        // Following deprectiated, Shell Menu has these options anyway
        // this.backgroundMenu.append(_('Change Background…'), 'app.changeBackGround');
        // this.backgroundMenu.append(_('Display Settings'), 'app.changeDisplaySettings');

        this.desktopBackgroundGioMenu.append_section(null, this.backgroundMenu);
    }

    menuclosed = () => {
        return new Promise(resolve => {
            this.popupmenuclosed = resolve;
        });
    };

    // Clipboard management
    // ************************************************************************ */
    /*
     * Before Gnome Shell 40, St API couldn't access binary data in the clipboard, only text data. Also, the
     * original Desktop Icons was a pure extension, so it was limited to what Clutter and St offered. That was
     * the reason why Nautilus accepted a text format for CUT and COPY operations in the form
     *
     *     x-special/nautilus-clipboard
     *     OPERATION
     *     FILE_URI
     *     [FILE_URI]
     *     [...]
     *
     * In Gnome Shell 40, St was enhanced and now it supports binary data; that's why Nautilus migrated to a
     * binary format identified by the atom 'x-special/gnome-copied-files', where the CUT or COPY operation is
     * shared.
     *
     * To maintain compatibility, in the past, we checked the current Gnome Shell version and, based on that,
     * set the binary or the text clipboards.
     *
     * With the newer versions of gtk4-ding, we only set the binary version and add other composite providers for
     * the plain text versions like the newer Nautilus/Files.
     */

    _manageCutCopy(action) {
        const uriList = this.fillDragDataGet(this.Enums.DndTargetInfo.TEXT_URI_LIST);
        if (!uriList?.length)
            return;
        const pathList = this.fillDragDataGet(this.Enums.DndTargetInfo.TEXT_PLAIN);

        let clipboard = Gdk.Display.get_default().get_clipboard();
        const textCoder = new TextEncoder();

        let content = action ? 'copy\n' : 'cut\n';
        content += uriList?.replaceAll('\r', '').trim();
        const encodedUriList = textCoder.encode(uriList);
        const encodedPathList = textCoder.encode(pathList);

        const gnomeContentProvider = Gdk.ContentProvider.new_for_bytes('x-special/gnome-copied-files',
            textCoder.encode(content));
        const textUriListContentProvider = Gdk.ContentProvider.new_for_bytes(this.Enums.DndTargetInfo.URI_LIST,
            encodedUriList);
        const textListContentProvider = Gdk.ContentProvider.new_for_bytes(this.Enums.DndTargetInfo.TEXT_PLAIN,
            encodedPathList);
        const textUtf8ListContentProvider = Gdk.ContentProvider.new_for_bytes(this.Enums.DndTargetInfo.TEXT_PLAIN_UTF8,
            encodedPathList);

        const clipboardContentProvider = Gdk.ContentProvider.new_union([
            gnomeContentProvider,
            textUriListContentProvider,
            textListContentProvider,
            textUtf8ListContentProvider,
        ]);
        clipboard.set_content(clipboardContentProvider);
    }

    doCopy() {
        const copy = true;
        this._manageCutCopy(copy);
    }

    doCut() {
        const cut = false;
        this._manageCutCopy(cut);
    }

    // Destktop Icon Placement and Display
    // ********************************************************************************************************** */

    _removeAllFilesFromGrids() {
        for (let fileItem of this._displayList)
            fileItem.removeFromGrid({callOnDestroy: true});

        this._displayList = [];
    }

    _clearAllFilesFromGrids() {
        for (let fileItem of this._displayList)
            fileItem.removeFromGrid({callOnDestroy: false});

        this._displayList = [];
    }

    async _drawDesktop(fileList, opts = {initialRead: false}) {
        if (this.windowsPromiseResolve || !fileList)
            return;
        const selectedFiles = this.getCurrentSelectionAsUri();

        //* Update the Icon before placing on Desktop to prevent flickering Icons *//
        const updateUI = fileList.map(async fileItem => {
            await fileItem.updateIcon();
            if (selectedFiles) {
                if (selectedFiles.includes(fileItem.uri))
                    fileItem.setSelected();
            }
        });
        await Promise.all([...updateUI]);

        //* Remove all files from the grids just before placing new files to
        // prevent flickering icons *//
        if (opts.initialRead)
            this._removeAllFilesFromGrids();
        else
            this._clearAllFilesFromGrids();
        this._displayList = fileList;

        this._placeAllFilesOnGrids(opts);

        //* Detect all Icon sizes are allocated and Icons are now shown and placed on Grid *//
        //* Desktop draw/paint is now complete *//
        const drawComplete = this._displayList.map(async fileItem => {
            await fileItem.iconPlaced;
        });
        await Promise.all([...drawComplete]);

        //* Reposition open Menus, renameFileItem pop up's **//
        //* Any task after complete desktop draw can now be done *//
        this._refreshMenus();
    }

    _refreshMenus() {
        if ((this.newItemDoRename && this.newItemDoRename.size) || this.fileItemMenu.popupmenu || this.activeFileItem) {
            let activeItem = false;
            let newItemDoRename = false;
            this._displayList.forEach(f => {
                if (this.activeFileItem && (f.fileName === this.activeFileItem.fileName))
                    this.fileItemMenu.activeFileItem = this.activeFileItem = activeItem = f;

                if (this.newItemDoRename && this.newItemDoRename.has(f.fileName))
                    newItemDoRename = f;
            });
            if (this._renameWindow)
                this._renameWindow.close();
            if (newItemDoRename) {
                newItemDoRename.setSelected();
                const allowReturnOnSameName = true;
                this.doRename(newItemDoRename, allowReturnOnSameName).catch(e => logError(e));
            }
            if (this.fileItemMenu.popupmenu) {
                if (!activeItem)
                    this.fileItemMenu.popupmenu.popdown();
            }
            if (!activeItem)
                this.fileItemMenu.activeFileItem = null;
        }
    }

    _placeAllFilesOnGrids(opts = {redisplay: false}) {
        if (this.Prefs.keepStacked) {
            this.doStacks(opts);
            return;
        }
        if (this.Prefs.keepArranged) {
            this.doSorts(opts);
            return;
        }
        let storeMode = this.Enums.StoredCoordinates.PRESERVE;
        if (opts.redisplay ||
            opts.initialRead) {
            // write the new recomputed positions to metadata when assigned
            storeMode = this.Enums.StoredCoordinates.OVERWRITE;
            this._sortByCurrentPosition();
            this._recomputeWindowPositions();
        }
        if (opts.gridschanged && !this.Prefs.freePositionIcons) {
            // if snap to grid, recompute column, row for fileItems
            // so they end up in the same relative grid, otherwise they keep
            // shifting postions. This keeps them in the same relative grid
            // position.
            // for snap to grid this will apply the new  global x,y of
            // the grid assigned
            this._recomputeGridPositions();
        }
        this._addFilesToDesktop(this._displayList, storeMode);
    }

    _recomputeGridPositions(fileList) {
        if (!fileList)
            fileList = this._displayList;

        fileList.forEach(fileItem => {
            if (fileItem.savedCoordinates === null)
                return;

            if (fileItem._monitorIndex == null)
                return;

            const column = fileItem.column;
            const row = fileItem.row;

            if (column == null || row == null)
                return;

            const index = fileItem._monitorIndex;
            const [desktop] = this._desktops.filter(d => {
                return d.monitorIndex === index;
            });

            if (!desktop)
                return;

            const [newGlobalX, newGlobalY] =
                desktop.recomputeGridPosition(column, row);

            fileItem.temporarySavedPosition = [newGlobalX + 2, newGlobalY + 2];
        });
    }

    _recomputeWindowPositions(fileList) {
        if (!fileList)
            fileList = this._displayList;

        if (!this._desktops.length)
            return;

        fileList.forEach(fileItem => {
            if (fileItem.savedCoordinates == null)
                return;
            if (fileItem._normalCoordinates == null) {
                fileItem.savedCoordinates = null;
                return;
            }
            if (fileItem._monitorIndex == null)
                return;

            const itemMonitorIndex = fileItem._monitorIndex;
            let desktop;

            // reassign to monitors
            // if on primary monitor, reassign to new primary
            if (itemMonitorIndex === this._priorPrimaryMonitorIndex &&
                this._primaryMonitorIndex != null) {
                if (!this.Prefs.showOnSecondaryMonitor) {
                    [desktop] = this._desktops.filter(d => {
                        return d.monitorIndex === this._primaryMonitorIndex;
                    });
                } else {
                    desktop = this.preferredDisplayDesktop;
                }
            }

            // reassign not on primary monitor to prior monitor if
            // if the prior monitor is still in index
            if (!desktop) {
                [desktop] = this._desktops.filter(d => {
                    return d.monitorIndex === itemMonitorIndex;
                });
            }

            // reassingn to new monitor, prior monitor not available
            if (!desktop)
                desktop = this.preferredDisplayDesktop;

            // if any error, leave unmapped to new monitor, placement algorithm
            //  will find placement from the old global position
            if (!desktop)
                return;

            fileItem.temporaryMonitorIndex = desktop.monitorIndex;

            // recompute coordinates for the new monitor
            const x = fileItem._normalCoordinates[0];
            const y = fileItem._normalCoordinates[1];
            const [newlocalX, newlocalY] =
                desktop.setNormalizedCoordinates(x, y);
            const [newGlobalX, newGlobalY] =
                desktop.coordinatesLocalToGlobal(newlocalX, newlocalY);
            fileItem.temporarySavedPosition = [newGlobalX, newGlobalY];
        });
    }

    _addFilesToDesktop(fileList, storeMode) {
        let preferredDesktop = this.preferredDisplayDesktop;
        if (!preferredDesktop)
            return;
        let outOfDesktops = [];
        let notAssignedYet = [];
        let droppedFiles = [];

        // First, add those icons that have saved coordinates and fit in the current desktops
        for (let fileItem of fileList) {
            if (fileItem.savedCoordinates === null) {
                if (fileItem.dropCoordinates !== null)
                    droppedFiles.push(fileItem);
                else
                    notAssignedYet.push(fileItem);
                continue;
            }
            if (fileItem.dropCoordinates !== null)
                fileItem.dropCoordinates = null;

            let [itemX, itemY] = fileItem.savedCoordinates;
            let addedToDesktop = false;
            for (let desktop of this._desktops) {
                if (desktop.coordinatesBelongToThisGridWindow(itemX, itemY) &&
                        desktop.isAvailable()) {
                    addedToDesktop = true;
                    desktop.addFileItemCloseTo(fileItem, itemX, itemY, storeMode);
                    break;
                }
            }

            if (!addedToDesktop)
                outOfDesktops.push(fileItem);
        }

        // Now, assign icons that have landed in changed margins, belong to monitor
        // and the window, however no longer fit on the grid as they overlap margins.

        if (outOfDesktops.length)
            this._addFilesCloseToAssignedDesktop(outOfDesktops, storeMode, preferredDesktop);

        outOfDesktops = [];

        // Now assign those icons that have dropped coordinates
        for (let fileItem of droppedFiles) {
            let [x, y] = fileItem.dropCoordinates;
            storeMode = this.Enums.StoredCoordinates.OVERWRITE;
            let addedToDesktop = false;

            for (let desktop of this._desktops) {
                if (desktop.coordinatesBelongToThisGrid(x, y) && desktop.isAvailable()) {
                    fileItem.dropCoordinates = null;
                    desktop.addFileItemCloseTo(fileItem, x, y, storeMode);
                    addedToDesktop = true;
                    break;
                }
            }

            if (!addedToDesktop)
                outOfDesktops.push(fileItem);
        }

        // Now, try again assign those icons that had dropped coordinates and
        // did not fit on dropped desktop, to the preferred or closest desktop
        if (outOfDesktops.length) {
            this._addFilesCloseToAssignedDesktop(outOfDesktops, storeMode, preferredDesktop);
            outOfDesktops = [];
        }

        // Finally, assign coordinates of preferred desktop to those new icons
        // that still don't have coordinates and place on preferred desktop or the next closest one
        for (let fileItem of notAssignedYet) {
            let x = preferredDesktop.gridGlobalRectangle.x;
            let y = preferredDesktop.gridGlobalRectangle.y;
            storeMode = this.Enums.StoredCoordinates.ASSIGN;

            // try first in the designated desktop
            let assigned = false;
            if (preferredDesktop.coordinatesBelongToThisGrid(x, y) && preferredDesktop.isAvailable()) {
                preferredDesktop.addFileItemCloseTo(fileItem, x, y, storeMode);
                assigned = true;
            }

            if (!assigned)
                outOfDesktops.push(fileItem);
        }

        // if there was no space in the preferred desktop, place on the desktop closest to preferred
        if (outOfDesktops.length)
            this._addFilesCloseToAssignedDesktop(outOfDesktops, storeMode, preferredDesktop);
    }

    _addFilesCloseToAssignedDesktop(fileList, storeMode, preferredDesktop) {
        for (let fileItem of fileList) {
            let desktopX;
            let x = desktopX = preferredDesktop.gridGlobalRectangle.x;
            let desktopY = preferredDesktop.gridGlobalRectangle.y;
            if (fileItem.savedCoordinates) {
                x = fileItem.savedCoordinates[0];
                storeMode = this.Enums.StoredCoordinates.ASSIGN;
            } else if (fileItem.droppedCoordinates) {
                x = fileItem.droppedCoordinates[0];
                storeMode = this.Enums.StoredCoordinates.OVERWRITE;
            }

            // Find the closest desktop to given position, is null if not available
            const newDesktop = this.windowManager.getClosestDesktop(x);

            if (newDesktop) {
                desktopX = newDesktop.gridGlobalRectangle.x;
                desktopY = newDesktop.gridGlobalRectangle.y;
                if (fileItem.droppedCoordinates)
                    fileItem.droppedCoordinates = null;
                newDesktop.addFileItemCloseTo(fileItem, desktopX, desktopY, storeMode);
            } else {
                console.log('Not enough space to add icons');
            }
        }
    }

    _unstack() {
        if (this.stackInitialCoordinates && this._compositeStackList) {
            this._displayList.forEach(f => {
                f.removeFromGrid();
                if (f.isStackMarker)
                    f.onDestroy();
            });
            this._restoreStackInitialCoordinates();
            this._displayList = this._compositeStackList;
            this._compositeStackList = null;
            if (this.sortingSubMenu && this.sortingMenu) {
                this.sortingSubMenu.prepend_item(this.keepArrangedMenuItem);
                this.sortingMenu.prepend_item(this.cleanUpMenuItem);
            }
            if (this.Prefs.keepArranged)
                this.doSorts();
            else
                this._addFilesToDesktop(this._displayList, this.Enums.StoredCoordinates.OVERWRITE);
        }
    }

    _saveStackInitialCoordinates() {
        this.stackInitialCoordinates = [];
        for (let fileItem of this._displayList) {
            this.stackInitialCoordinates.push({
                fileName: fileItem.fileName,
                savedCoordinates: fileItem.savedCoordinates,
                _normalCoordinates: fileItem._normalCoordinates,
                _monitorIndex: fileItem._monitorIndex,
            });
        }
    }

    _transformSavedStackInitialCoordinates() {
        if (!this.stackInitialCoordinates && this.stackInitialCoordinates.length)
            return;

        this._recomputeWindowPositions(this.stackInitialCoordinates);
        this.stackInitialCoordinates.forEach(o =>
            (o.savedCoordinates = o.temporarySavedPosition));
    }

    _restoreStackInitialCoordinates() {
        if (this.stackInitialCoordinates && this.stackInitialCoordinates.length) {
            this._compositeStackList.forEach(fileItem => {
                this.stackInitialCoordinates.forEach(savedItem => {
                    if (savedItem.fileName === fileItem.fileName) {
                        fileItem.savedCoordinates = savedItem.savedCoordinates;
                        fileItem._normalCoordinates = savedItem._normalCoordinates;
                        fileItem._monitorIndex = savedItem._monitorIndex;
                    }
                });
            });
        }
        this.stackInitialCoordinates = null;
    }

    _makeStackTopMarkerFolder(type, list) {
        let stackAttribute = type.split('/')[1];
        let fileItem = new StackItem.StackItem(
            this,
            stackAttribute,
            type,
            this.Enums.FileType.STACK_TOP
        );
        list.push(fileItem);
    }

    _sortAllFilesFromGridsByKindStacked(opts = {redisplay: false}) {
        /**
         * Looks through the generated fileItems
         */
        function determineStackTopSizeOrTime() {
            for (let item of otherFiles) {
                if (item.isStackMarker) {
                    for (let unstackitem of stackedFiles) {
                        if (item.attributeContentType === unstackitem.attributeContentType) {
                            item.size = unstackitem.fileSize;
                            item.time = unstackitem.modifiedTime;
                            break;
                        }
                    }
                }
            }
        }

        /**
         * Sorts fileItems by file size
         *
         * @param {integer} a the first file size
         * @param {integer} b the secondfile size
         */
        function bySize(a, b) {
            return  a.fileSize - b.fileSize;
        }

        /**
         * Sorts fileItems by time
         *
         * @param {integer} a the first file timestamp
         * @param {integer} b the second file timestamp
         */
        function byTime(a, b) {
            return  a._modifiedTime - b._modifiedTime;
        }

        let specialFiles = [];
        let directoryFiles = [];
        let validDesktopFiles = [];
        let otherFiles = [];
        let stackedFiles = [];
        let newFileList = [];
        let stackTopMarkerFolderList = [];
        let unstackList = this.Prefs.UnstackList;
        if (this._compositeStackList && opts.redisplay) {
            this._displayList.forEach(f => {
                if (f.isStackMarker)
                    f.onDestroy();
            });
            this._displayList = this._compositeStackList;
        }
        this._sortByName(this._displayList);
        for (let fileItem of this._displayList) {
            if (fileItem.isSpecial) {
                specialFiles.push(fileItem);
                continue;
            }
            if (fileItem.isDirectory) {
                directoryFiles.push(fileItem);
                continue;
            }
            if (fileItem._isValidDesktopFile) {
                validDesktopFiles.push(fileItem);
                continue;
            } else {
                let type = fileItem.attributeContentType;
                let stacked = false;
                for (let item of otherFiles) {
                    if (type === item.attributeContentType) {
                        stackedFiles.push(fileItem);
                        stacked = true;
                    }
                }
                if (!stacked) {
                    fileItem.isStackTop = true;
                    otherFiles.push(fileItem);
                }
                continue;
            }
        }
        for (let a of otherFiles) {
            let instack = false;
            for (let c of stackedFiles) {
                if (c.attributeContentType === a.attributeContentType) {
                    instack = true;
                    break;
                }
            }
            if (!instack)
                a.stackUnique = true;

            continue;
        }
        for (let item of otherFiles) {
            if (!item.stackUnique) {
                this._makeStackTopMarkerFolder(item.attributeContentType, stackTopMarkerFolderList);
                item.isStackTop = false;
                stackedFiles.push(item);
            }
            if (item.stackUnique)
                stackTopMarkerFolderList.push(item);

            item.updateIcon().catch(e => console.error(e, 'Error loading stackMarker icon'));
        }
        otherFiles = [];
        this._sortByName(specialFiles);
        this._sortByName(directoryFiles);
        this._sortByName(validDesktopFiles);
        this._sortByKindByName(stackedFiles);
        this._sortByKindByName(stackTopMarkerFolderList);
        otherFiles.push(...specialFiles);
        otherFiles.push(...validDesktopFiles);
        otherFiles.push(...directoryFiles);
        otherFiles.push(...stackTopMarkerFolderList);

        switch (this.Prefs.sortOrder) {
        case this.Enums.SortOrder.NAME:
            this._sortByName(otherFiles);
            break;
        case this.Enums.SortOrder.DESCENDINGNAME:
            this._sortByName(otherFiles);
            otherFiles.reverse();
            this._sortByName(stackedFiles);
            stackedFiles.reverse();
            break;
        case this.Enums.SortOrder.MODIFIEDTIME:
            stackedFiles.sort(byTime);
            determineStackTopSizeOrTime();
            otherFiles.sort(byTime);
            break;
        case this.Enums.SortOrder.KIND:
            break;
        case this.Enums.SortOrder.SIZE:
            stackedFiles.sort(bySize);
            determineStackTopSizeOrTime();
            otherFiles.sort(bySize);
            break;
        default:
            break;
        }
        for (let item of otherFiles) {
            newFileList.push(item);
            let itemtype = item.attributeContentType;
            for (let unstackitem of stackedFiles) {
                if (unstackList.includes(unstackitem.attributeContentType) && (unstackitem.attributeContentType === itemtype))
                    newFileList.push(unstackitem);
            }
        }
        if (this._compositeStackList)
            this._compositeStackList = this._displayList;

        this._displayList = newFileList;
    }

    _sortByName(fileList) {
        /**
         * @param {string} a fileItem filename for A
         * @param {string} b fileItem filename for B
         */
        function byName(a, b) {
            // sort by label name instead of the the fileName or displayName so that the "Home" folder is sorted in the correct order
            // alphabetical sort taking into account accent characters & locale, natural language sort for numbers, ie 10.etc before 2.etc
            // other options for locale are best fit, or by specifying directly in function below for translators
            return a._label.get_text().localeCompare(b._label.get_text(), {sensitivity: 'accent', numeric: 'true', localeMatcher: 'lookup'});
        }
        fileList.sort(byName);
    }

    _sortByKindByName(fileList) {
        /**
         * Sort by Kind, then by name
         *
         * @param {string} a fileItem
         * @param {string} b fileItem
         */
        function byKindByName(a, b) {
            return a.attributeContentType.localeCompare(b.attributeContentType) ||
             a._label.get_text().localeCompare(b._label.get_text(), {sensitivity: 'accent', numeric: 'true', localeMatcher: 'lookup'});
        }
        fileList.sort(byKindByName);
    }

    _sortAllFilesFromGridsByName(order) {
        this._sortByName(this._displayList);
        if (order === this.Enums.SortOrder.DESCENDINGNAME)
            this._displayList.reverse();

        this._reassignFilesToDesktop();
    }

    _sortByOriginalPosition() {
        let cornerInversion = this.Prefs.StartCorner;
        if (!cornerInversion[0] && !cornerInversion[1]) {
            this._displayList.sort((a, b) =>   {
                if (a.X < b.X)
                    return -1;
                if (a.X > b.X)
                    return 1;
                if (a.Y < b.Y)
                    return -1;
                if (a.Y > b.Y)
                    return 1;
                return 0;
            });
        }
        if (cornerInversion[0] && cornerInversion[1]) {
            this._displayList.sort((a, b) =>   {
                if (a.X < b.X)
                    return 1;
                if (a.X > b.X)
                    return -1;
                if (a.Y < b.Y)
                    return 1;
                if (a.Y > b.Y)
                    return -1;
                return 0;
            });
        }
        if (cornerInversion[0] && !cornerInversion[1]) {
            this._displayList.sort((a, b) =>   {
                if (a.X < b.X)
                    return 1;
                if (a.X > b.X)
                    return -1;
                if (a.Y < b.Y)
                    return -1;
                if (a.Y > b.Y)
                    return 1;
                return 0;
            });
        }
        if (!cornerInversion[0] && cornerInversion[1]) {
            this._displayList.sort((a, b) =>   {
                if (a.X < b.X)
                    return -1;
                if (a.X > b.X)
                    return 1;
                if (a.Y < b.Y)
                    return 1;
                if (a.Y > b.Y)
                    return -1;
                return 0;
            });
        }
    }

    _sortByCurrentPosition() {
        let cornerInversion = this.Prefs.StartCorner;
        if (!cornerInversion[0] && !cornerInversion[1]) {
            this._displayList.sort((a, b) =>   {
                if (a.x < b.x)
                    return -1;
                if (a.x > b.x)
                    return 1;
                if (a.y < b.y)
                    return -1;
                if (a.y > b.y)
                    return 1;
                return 0;
            });
        }
        if (cornerInversion[0] && cornerInversion[1]) {
            this._displayList.sort((a, b) =>   {
                if (a.x < b.x)
                    return 1;
                if (a.x > b.x)
                    return -1;
                if (a.y < b.y)
                    return 1;
                if (a.y > b.y)
                    return -1;
                return 0;
            });
        }
        if (cornerInversion[0] && !cornerInversion[1]) {
            this._displayList.sort((a, b) =>   {
                if (a.x < b.x)
                    return 1;
                if (a.x > b.x)
                    return -1;
                if (a.y < b.y)
                    return -1;
                if (a.y > b.y)
                    return 1;
                return 0;
            });
        }
        if (!cornerInversion[0] && cornerInversion[1]) {
            this._displayList.sort((a, b) =>   {
                if (a.x < b.x)
                    return -1;
                if (a.x > b.x)
                    return 1;
                if (a.y < b.y)
                    return 1;
                if (a.y > b.y)
                    return -1;
                return 0;
            });
        }
    }

    _reassignFilesToDesktop() {
        if (!this.Prefs.sortSpecialFolders) {
            this._reassignFilesToDesktopPreserveSpecialFiles();
            return;
        }
        for (let fileItem of this._displayList) {
            fileItem.temporarySavedPosition = null;
            fileItem.dropCoordinates = null;
        }
        this._addFilesToDesktop(this._displayList, this.Enums.StoredCoordinates.ASSIGN);
    }

    _reassignFilesToDesktopPreserveSpecialFiles() {
        let specialFiles = [];
        let otherFiles = [];
        let newFileList = [];
        for (let fileItem of this._displayList) {
            if (fileItem._isSpecial) {
                specialFiles.push(fileItem);
                continue;
            }
            if (!fileItem._isSpecial) {
                otherFiles.push(fileItem);
                fileItem.temporarySavedPosition = null;
                fileItem.dropCoordinates = null;
                continue;
            }
        }
        newFileList.push(...specialFiles);
        newFileList.push(...otherFiles);
        if (this._displayList.length === newFileList.length)
            this._displayList = newFileList;

        this._addFilesToDesktop(this._displayList, this.Enums.StoredCoordinates.PRESERVE);
    }

    // Desktop Manager Main methods
    // ********************************************************************************************************* */


    findFiles(text) {
        const activeWindow = this.mainApp.get_active_window();
        this._findFileWindow = new Gtk.Dialog({
            use_header_bar: true,
            resizable: false,
        });
        this._findFileButton = this._findFileWindow.add_button(_('OK'), Gtk.ResponseType.OK);
        this._findFileButton.sensitive = false;
        this._findFileWindow.add_button(_('Cancel'), Gtk.ResponseType.CANCEL);
        this._findFileWindow.set_modal(true);
        this._findFileWindow.set_title(_('Find Files on Desktop'));
        const modal = true;
        this.DesktopIconsUtil.windowHidePagerTaskbarModal(this._findFileWindow, modal);
        this._findFileWindow.set_transient_for(activeWindow);
        let contentArea = this._findFileWindow.get_content_area();
        this._findFileTextArea = new Gtk.Entry();
        this._findFileTextArea.set_margin_top(5);
        this._findFileTextArea.set_margin_bottom(5);
        this._findFileTextArea.set_margin_start(5);
        this._findFileTextArea.set_margin_end(5);
        contentArea.append(this._findFileTextArea);
        contentArea.set_homogeneous(true);
        contentArea.set_baseline_position(Gtk.BaselinePosition.CENTER);
        this._findFileTextArea.connect('activate', () => {
            if (this._findFileButton.sensitive)
                this._findFileWindow.response(Gtk.ResponseType.OK);
        });
        this._findFileTextArea.connect('changed', () => {
            let context = this._findFileTextArea.get_style_context();
            if (this._scanForFiles(this._findFileTextArea.text, true)) {
                this._findFileButton.sensitive = true;
                if (context.has_class('not-found'))
                    context.remove_class('not-found');
            } else {
                this._findFileButton.sensitive = false;
                this._findFileTextArea.error_bell();
                if (!context.has_class('not-found'))
                    context.add_class('not-found');
            }
            this.searchEventTime = GLib.get_monotonic_time();
        });
        this._findFileTextArea.grab_focus_without_selecting();
        if (text) {
            this._findFileTextArea.set_text(text);
            this._findFileTextArea.set_position(text.length);
        } else {
            this._scanForFiles(null);
        }
        this._findFileWindow.show();
        this.desktopActions.textEntryAccelsTurnOff();
        this._findFileWindow.connect('close', () => {
            this._findFileWindow.response(Gtk.ResponseType.CANCEL);
        });
        this._findFileWindow.connect('response', (actor, retval) => {
            if (retval === Gtk.ResponseType.CANCEL)
                this.unselectAll();

            this.desktopActions.textEntryAccelsTurnOn();
            this._findFileWindow.destroy();
            this._findFileWindow = null;
        });
    }

    _scanForFiles(text, setselected) {
        let found = [];
        if (text && (text !== ''))
            found = this._displayList.filter(f => f.fileName.toLowerCase().includes(text.toLowerCase()) || f._label.get_text().toLowerCase().includes(text.toLowerCase()));

        if (found.length !== 0) {
            if (setselected) {
                this.unselectAll();
                found.map(f => f.setSelected());
            }
            return true;
        } else {
            return false;
        }
    }

    sortAllFilesFromGridsByPosition() {
        if (this.Prefs.keepArranged)
            return;
        this._displayList.map(f => f.removeFromGrid({callOnDestroy: false}));
        this._sortByCurrentPosition();
        this._reassignFilesToDesktop();
    }

    _sortAllFilesFromGridsByModifiedTime() {
        /**
         * @param {integer} a fileItem file modified time
         * @param {integer} b fileItem file modified time
         */
        function byTime(a, b) {
            return  a._modifiedTime - b._modifiedTime;
        }
        this._displayList.sort(byTime);
        this._reassignFilesToDesktop();
    }

    _sortAllFilesFromGridsBySize() {
        /**
         * @param {integer} a fileItem fileSize
         * @param {integer} b fileItem fileSize
         */
        function bySize(a, b) {
            return  a.fileSize - b.fileSize;
        }
        this._displayList.sort(bySize);
        this._reassignFilesToDesktop();
    }

    _sortAllFilesFromGridsByKind() {
        let specialFiles = [];
        let directoryFiles = [];
        let validDesktopFiles = [];
        let otherFiles = [];
        let newFileList = [];
        for (let fileItem of this._displayList) {
            if (fileItem._isSpecial) {
                specialFiles.push(fileItem);
                continue;
            }
            if (fileItem._isDirectory) {
                directoryFiles.push(fileItem);
                continue;
            }
            if (fileItem._isValidDesktopFile) {
                validDesktopFiles.push(fileItem);
                continue;
            } else {
                otherFiles.push(fileItem);
                continue;
            }
        }
        this._sortByName(specialFiles);
        this._sortByName(directoryFiles);
        this._sortByName(validDesktopFiles);
        this._sortByKindByName(otherFiles);
        newFileList.push(...specialFiles);
        newFileList.push(...validDesktopFiles);
        newFileList.push(...directoryFiles);
        newFileList.push(...otherFiles);
        if (this._displayList.length === newFileList.length)
            this._displayList = newFileList;

        this._reassignFilesToDesktop();
    }

    onToggleStackUnstackThisTypeClicked(type, typeInList = null, unstackList = null) {
        if (!unstackList) {
            unstackList = this.Prefs.UnstackList;
            typeInList = unstackList.includes(type);
        }
        if (typeInList) {
            let index = unstackList.indexOf(type);
            unstackList.splice(index, 1);
        } else {
            unstackList.push(type);
        }
        this.Prefs.UnstackList = unstackList;
    }

    doSorts(opts = {redisplay: false}) {
        if (opts.redisplay)
            this._displayList.map(f => f.removeFromGrid());

        switch (this.Prefs.sortOrder) {
        case this.Enums.SortOrder.NAME:
            this._sortAllFilesFromGridsByName();
            break;
        case this.Enums.SortOrder.DESCENDINGNAME:
            this._sortAllFilesFromGridsByName(this.Enums.SortOrder.DESCENDINGNAME);
            break;
        case this.Enums.SortOrder.MODIFIEDTIME:
            this._sortAllFilesFromGridsByModifiedTime();
            break;
        case this.Enums.SortOrder.KIND:
            this._sortAllFilesFromGridsByKind();
            break;
        case this.Enums.SortOrder.SIZE:
            this._sortAllFilesFromGridsBySize();
            break;
        default:
            this._addFilesToDesktop(this._displayList, this.Enums.StoredCoordinates.PRESERVE);
            break;
        }
    }

    doStacks(opts = {redisplay: false}) {
        if (opts.redisplay) {
            for (let fileItem of this._displayList)
                fileItem.removeFromGrid();
        }

        if (!this.stackInitialCoordinates && !this._compositeStackList) {
            this._compositeStackList = [];
            this._saveStackInitialCoordinates();
            if (this.sortingSubMenu && this.sortingMenu) {
                this.sortingSubMenu.remove(0);
                this.sortingMenu.remove(0);
            }
            opts.redisplay = false;
        }

        if ((opts.monitorschanged ||
            opts.initialRead) &&
            this.stackInitialCoordinates)
            this._transformSavedStackInitialCoordinates();


        this._sortAllFilesFromGridsByKindStacked(opts);

        this._reassignFilesToDesktop();
    }

    unselectAll() {
        this._displayList.map(f => f.unsetSelected());
        this.fileItemMenu.activeFileItem = null;
    }

    getCurrentSelection() {
        const selectedList = this._displayList.filter(f => f.isSelected);

        if (selectedList.length)
            return selectedList;

        return null;
    }

    getCurrentSelectionAsUri() {
        return this.getCurrentSelection()?.map(f => f.uri);
    }

    getNumberOfSelectedItems() {
        const count = this.getCurrentSelection();

        if (count)
            return count.length;

        return 0;
    }

    checkIfSpecialFilesAreSelected() {
        for (let item of this._displayList) {
            if (item.isSelected && item.isSpecial)
                return true;
        }
        return false;
    }

    checkIfDirectoryIsSelected() {
        for (let item of this._displayList) {
            if (item.isSelected && item.isDirectory)
                return true;
        }
        return false;
    }

    async doRename(fileItem, allowReturnOnSameName = false) {
        const selection = this.getCurrentSelection();
        if (!(selection && (selection.length === 1)))
            return;

        if (fileItem === null) {
            fileItem = selection[0];
            allowReturnOnSameName = false;
        }
        if (!fileItem.canRename)
            return;

        if (!this._renameWindow) {
            this.textEntryAccelsTurnOff();
            if (!this.newItemDoRename)
                this.newItemDoRename = new Set();

            this.newItemDoRename.add(fileItem.fileName);
            if (this.popupmenu || this.fileItemMenu.popupmenu)
                await this.menuclosed().catch(e => logError(e));
            this._renameWindow = new AskRenamePopup.AskRenamePopup(
                fileItem,
                allowReturnOnSameName,
                () => {
                    this.mainApp.get_active_window().grab_focus();
                    this.textEntryAccelsTurnOn();
                    if (this.newItemDoRename)
                        this.newItemDoRename.delete(fileItem.fileName);
                    this._renameWindow = null;
                },
                this._setPendingDropCoordinates.bind(this),
                {
                    FileUtils: this.FileUtils,
                    DesktopIconsUtil: this.DesktopIconsUtil,
                    DBusUtils: this.DBusUtils,
                }
            );
        }
    }

    doTrash(localDrag = false, event = null) {
        const selectionItems = this._displayList.filter(i => i.isSelected && !i.isSpecial);

        if (!selectionItems.length)
            return;

        const selectionURIs = [];
        if (!localDrag) {
            this._pendingDropFiles = {};
            this._pendingSelfCopyFiles = {};
        }

        selectionItems.forEach(f => {
            selectionURIs.push(f.file.get_uri());
            if (!localDrag)
                this._pendingSelfCopyFiles[f.fileName] = f.savedCoordinates;
        });
        if (event)
            this.DBusUtils.RemoteFileOperations.pushEvent(event);
        this.DBusUtils.RemoteFileOperations.TrashURIsRemote(selectionURIs);
    }

    doDeletePermanently() {
        const toDelete = this._displayList.filter(i => i.isSelected && !i.isSpecial).map(i =>
            i.file.get_uri());

        if (!toDelete.length) {
            if (this._displayList.some(i => i.isSelected && i.isTrash))
                this.doEmptyTrash();
            return;
        }

        this.DBusUtils.RemoteFileOperations.DeleteURIsRemote(toDelete);
    }

    doEmptyTrash(askConfirmation = true) {
        this.DBusUtils.RemoteFileOperations.EmptyTrashRemote(askConfirmation);
    }

    async doNewFolder(position = null, suggestedName = null, opts = {rename: true}) {
        this.unselectAll();

        if (!position)
            position = [this._clickX, this._clickY];


        const baseName = suggestedName ? suggestedName :  _('New Folder');
        let newName = this.desktopMonitor.getDesktopUniqueFileName(baseName);

        if (newName) {
            const dir = this._desktopDir.get_child(newName);
            try {
                await dir.make_directory_async(GLib.PRIORITY_DEFAULT, null);

                const info = new Gio.FileInfo();
                info.set_attribute_string('metadata::nautilus-drop-position', `${position.join(',')}`);
                info.set_attribute_string('metadata::desktop-icon-position', '');
                info.set_attribute_uint32(Gio.FILE_ATTRIBUTE_UNIX_MODE, 0o700);

                try {
                    await dir.set_attributes_async(info,
                        Gio.FileQueryInfoFlags.NONE,
                        GLib.PRIORITY_LOW,
                        null);
                } catch (e) {
                    console.error(e, `Failed to set attributes to ${dir.get_path()}`);
                }
            } catch (e) {
                if (e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
                    this._performSanityChecks();
                else
                    console.error(e, `Failed to create folder ${e.message}`);
                const header = _('Folder Creation Failed');
                const text = _('Could not create folder');
                this.dbusManager.doNotify(header, text);
                if (position || suggestedName)
                    return null;

                return null;
            }

            if (opts.rename) {
                if (!this.newItemDoRename)
                    this.newItemDoRename = new Set();

                this.newItemDoRename.add(newName);
            }
            if (position || suggestedName)
                return dir.get_uri();
        }
        return null;
    }

    async redrawDesktop() {
        // fileList is not changed, we just need to render the desktop again
        // with changes in icon color, emblem, appearance, theme change etc.
        const opts = {initialRead: false, redisplay: true};
        const fileList = this.desktopMonitor.fileList;
        await this._drawDesktop(fileList, opts).catch(e => {
            console.error(`Error while redrawing desktop: ${e.message}\n${e.stack}`);
        });
    }

    async reLoadDesktop() {
        await this.desktopMonitor.reLoadFileList();
    }

    async refreshDesktop() {
        // fileList is changed, we need to render the desktop again
        // with latest fileList from the desktopMonitor. The position of the
        // icons is also recomputed from the normalized coordinates.
        const opts = {initialRead: true};
        const fileList = this.desktopMonitor.fileList;
        await this._drawDesktop(fileList, opts).catch(e => {
            console.error(`Error while refreshing desktop: ${e.message}`);
        });
    }

    async reFrameDesktop(opts) {
        // fileList is not changed, grids changed, monitor added, removed,
        // monitor geometry, zoom, or index changed.
        // We need to recompute the position of the icons
        // from the normalized coordinates and redraw the desktop and reassign
        // the icons to the correct grid and monitors
        const fileList = this.desktopMonitor.fileList;
        await this._drawDesktop(fileList, opts).catch(e => {
            console.error(`Error while reframing desktop: ${e.message}`);
        });
    }

    onMutterSettingsChanged() {
        this.windowManager.requestGeometryUpdate();
    }

    async onGtkSettingsChanged() {
        await this.desktopMonitor.getFileList();
        await this.reLoadDesktop().catch(e => {
            console.log(`Exception while updating desktop after the hidden settings changed: ${e.message}\n${e.stack}`);
        });
        this.templatesMonitor.updateEntries();
    }

    onKeepArrangedChanged() {
        if (this.Prefs.keepArranged)
            this.doSorts({redisplay: true});
    }

    onUnstackedTypesChanged() {
        if (this.Prefs.keepStacked)
            this.doStacks({redisplay: true});
    }

    onkeepStackedChanged() {
        if (!this.Prefs.keepStacked)
            this._unstack();
        else
            this.doStacks({redisplay: true});
    }

    onSortOrderChanged() {
        if (this.Prefs.keepStacked)
            this.doStacks({redisplay: true});
        else
            this.doSorts({redisplay: true});
    }

    onIconSizeChanged() {
        this._displayList.forEach(x => x.removeFromGrid());
        for (let desktop of this._desktops)
            desktop.resizeGrid();
        this.reLoadDesktop().catch(e => {
            console.log(`Exception while reloading desktop after icon size change: ${e.message}\n${e.stack}`);
        });
    }

    // Getters and Setters

    get _desktopDir() {
        return this.desktopMonitor.desktopDir;
    }

    get fractionalScaling() {
        return this.Prefs.fractionalScaling;
    }

    set fractionalScaling(boolean) {
        this.Prefs.fractionalScaling = boolean;
    }

    get _desktops() {
        return this.windowManager.desktops;
    }

    get _primaryMonitorIndex() {
        return this.windowManager.primaryMonitorIndex;
    }

    get _priorPrimaryMonitorIndex() {
        return this.windowManager.priorPrimaryMonitorIndex;
    }

    get preferredDisplayDesktop() {
        return this.windowManager.preferredDisplayDesktop;
    }

    get templatesMonitor() {
        return this.desktopActions.templatesMonitor;
    }

    get currentWorkingList() {
        let currentCompleteList;
        if (this._compositeStackList && (this._compositeStackList.length > 0))
            currentCompleteList = this._compositeStackList;
        else
            currentCompleteList = this._displayList;

        return currentCompleteList;
    }

    get isDefaultDesktopFolder() {
        return this.desktopActions.isDefaultDesktopFolder;
    }

    get activeFileItem() {
        return this.fileItemMenu.activeFileItem;
    }

    set activeFileItem(fileItem) {
        this.fileItemMenu.activeFileItem = fileItem;
    }
};
