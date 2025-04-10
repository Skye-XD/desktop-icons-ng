/* DING: Desktop Icons New Generation for GNOME Shell
 *
 * Gtk4 Port Copyright (C) 2022 - 2025 Sundeep Mediratta (smedius@gmail.com)
 * Copyright (C) 2019 Sergio Costas (rastersoft@gmail.com)
 * Based on code original (C) Carlos Soriano
 * SwitcherooControl code based on code original from Marsch84
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

import {Gtk, Gdk, Gio} from '../dependencies/gi.js';
import * as FileItem from '../dependencies/localFiles.js';

import {_} from '../dependencies/gettext.js';

export {SpecialFolderIcon};
export {VolumeIcon};
export {SymLinkIcon};

const SpecialFolderIcon = class extends FileItem {
    constructor(desktopMnager, file, fileInfo, fileExtra, custom) {
        super(desktopMnager, file, fileInfo, fileExtra, custom);

        this._isTrash =
            this._fileExtra === this.Enums.FileType.USER_DIRECTORY_TRASH;

        if (this.isTrash) {
            // if this icon is the trash, monitor the state of the
            //  directory to update the icon
            this._monitorTrash();
        } else {
            this._monitorTrashId = 0;
        }
    }

    _destroy() {
        super._destroy();
        /* Trash */
        if (this._monitorTrashId) {
            this._monitorTrashDir.disconnect(this._monitorTrashId);
            this._monitorTrashDir.cancel();
            this._monitorTrashId = 0;
        }
    }

    _setFileName(text) {
        if (this._fileExtra === this.Enums.FileType.USER_DIRECTORY_HOME) {
            // TRANSLATORS: "Home" is the text that will be shown in
            //  the user's personal folder
            text = _('Home');
        }
        super._setLabelName(text);
    }

    _setAccesibilityName() {
        const trashName = _('Trash');

        switch (this._fileExtra) {
        case  this.Enums.FileType.USER_DIRECTORY_HOME:
            this.container.update_property(
                [Gtk.AccessibleProperty.LABEL],
                [_('Home')]
            );
            break;

        case this.Enums.FileType.USER_DIRECTORY_TRASH:
            /** TRANSLATORS: when using a screen reader,this is the text read
             *  when the trash folder is selected. */
            this.container.update_property(
                [Gtk.AccessibleProperty.LABEL],
                [`${trashName}`]
            );
            break;
        }
    }

    async _updateMetadataFromFileInfo(fileInfo) {
        await super._updateMetadataFromFileInfo(fileInfo);

        this._isTrash =
            this._fileExtra === this.Enums.FileType.USER_DIRECTORY_TRASH;
    }

    _monitorTrash() {
        this._monitorTrashDir =
            this._file.monitor_directory(
                Gio.FileMonitorFlags.WATCH_MOVES,
                null
            );

        this._monitorTrashDir.set_rate_limit(1000);

        this._monitorTrashId =
            this._monitorTrashDir.connect(
                'changed',
                (_obj, _file, _otherFile, eventType) => {
                    this._refreshTrashIcon(eventType);
                }
            );
    }

    async _refreshTrashIcon(eventType) {
        switch (eventType) {
        case Gio.FileMonitorEvent.DELETED:
        case Gio.FileMonitorEvent.MOVED_OUT:
        case Gio.FileMonitorEvent.CREATED:
        case Gio.FileMonitorEvent.MOVED_IN:
            await this._reloadIcon().catch(e => {
                if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED)) {
                    console.error(
                        e,
                        `Exception while updating ${
                            this._getVisibleName()
                                ? this._getVisibleName()
                                : 'Trash icon'
                        }: ${e.message}`);
                }
            });

            break;
        }

        return false;
    }

    async _handleDroppedUris(
        X, Y,
        x, y,
        fileList,
        gdkDropAction,
        localDrop,
        event
    ) {
        const forceCopy = gdkDropAction === Gdk.DragAction.COPY;

        if (this._fileExtra === this.Enums.FileType.USER_DIRECTORY_TRASH) {
            if (localDrop) {
                this._desktopManager.doTrash(localDrop, event);
            } else {
                this.DBusUtils.RemoteFileOperations.pushEvent(event);
                this.DBusUtils.RemoteFileOperations.TrashURIsRemote(fileList);
            }
            if (forceCopy)
                return Gdk.DragAction.COPY;
            else
                return Gdk.DragAction.MOVE;
        }

        const returnaction = await super._handleDroppedUris(
            X, Y,
            x, y,
            fileList,
            gdkDropAction,
            localDrop,
            event
        );

        return returnaction;
    }

    get isTrash() {
        return this._isTrash;
    }
};

const VolumeIcon = class extends FileItem {
    constructor(desktopManager, file, fileInfo, fileExtra, custom) {
        super(desktopManager, file, fileInfo, fileExtra, custom);

        if (this._custom) {
            /* gjs doesn't handle some virtual implementations well*/
            Gio._promisify(this._custom.constructor.prototype,
                'eject_with_operation');
            Gio._promisify(this._custom.constructor.prototype,
                'unmount_with_operation');
        }
    }

    _destroy() {
        super._destroy();

        if (this._umountCancellable)
            this._umountCancellable.cancel();

        if (this._ejectCancellable)
            this._ejectCancellable.cancel();
    }

    _getVisibleName() {
        if (this._fileExtra === this.Enums.FileType.EXTERNAL_DRIVE)
            return this._custom.get_name();

        return super._getVisibleName();
    }

    _setAccesibilityName() {
        const visibleName = this._getVisibleName();
        const driveName = _('Drive');

        if (this._fileExtra === this.Enums.FileType.EXTERNAL_DRIVE) {
        /** TRANSLATORS: when using a screen reader, this is the text
         * read when an external drive is selected.
         * Example: if a USB stick named "my_portable"
         * is selected, it will say "my_portable Drive" */
            this.container.update_property(
                [Gtk.AccessibleProperty.LABEL],
                [`${visibleName} ${driveName}`]
            );
        }
    }

    async eject(atWidget) {
        if (!this._custom || this._ejectCancellable)
            return;

        const parentWidget =  atWidget ?? this._grid._window;
        const mountOp = new Gtk.MountOperation();
        mountOp.set_parent(parentWidget);
        this._ejectCancellable = new Gio.Cancellable();

        try {
            await this._custom.eject_with_operation(
                Gio.MountUnmountFlags.NONE,
                mountOp,
                this._ejectCancellable
            );
        } finally {
            this._ejectCancellable = null;
        }
    }

    async unmount(atWidget) {
        if (!this._custom || this._umountCancellable)
            return;

        const parentWidget = atWidget ?? this._grid._window;
        const mountOp = new Gtk.MountOperation();
        mountOp.set_parent(parentWidget);
        this._umountCancellable = new Gio.Cancellable();

        try {
            await this._custom.unmount_with_operation(
                Gio.MountUnmountFlags.NONE,
                mountOp,
                this._umountCancellable
            );
        } catch (e) {
            if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED)) {
                console.error(
                    e,
                    `Exception unmounting Volume ${
                        this._getVisibleName()
                            ? this._getVisibleName()
                            : 'Volume icon'
                    }: ${e.message}`
                );
            }
        } finally {
            this._umountCancellable = null;
        }
    }

    get canEject() {
        if (this._custom)
            return this._custom.can_eject();
        else
            return false;
    }

    get canUnmount() {
        if (this._custom)
            return this._custom.can_unmount();
        else
            return false;
    }
};

const SymLinkIcon = class extends FileItem {
    constructor(desktopManager, file, fileInfo, fileExtra, custom) {
        super(desktopManager, file, fileInfo, fileExtra, custom);

        this._isSymlink = fileInfo.get_attribute_boolean(
            Gio.FILE_ATTRIBUTE_STANDARD_IS_SYMLINK
        );

        /*
         * This is a glib trick to detect broken symlinks. If a file is a
         * symlink, the filetype points to the final file, unless it is broken;
         * thus if the file type is SYMBOLIC_LINK, it must be a broken link.
         * https://developer.gnome.org/gio/stable/GFile.html#g-file-query-info
         */
        this._isBrokenSymlink =
            this._isSymlink &&
            this._fileType === Gio.FileType.SYMBOLIC_LINK;

        if (this._isSymlink && !this._symlinkFileMonitor)
            this._monitorSymlink();
    }

    async _updateMetadataFromFileInfo(fileInfo) {
        this._isSymlink = fileInfo.get_attribute_boolean(
            Gio.FILE_ATTRIBUTE_STANDARD_IS_SYMLINK
        );

        /*
         * This is a glib trick to detect broken symlinks. If a file is a
         * symlink, the filetype points to the final file, unless it is broken;
         * thus if the file type is SYMBOLIC_LINK, it must be a broken link.
         * https://developer.gnome.org/gio/stable/GFile.html#g-file-query-info
         */
        this._isBrokenSymlink =
            this._isSymlink &&
            this._fileType === Gio.FileType.SYMBOLIC_LINK;

        await super._updateMetadataFromFileInfo(fileInfo);
    }

    _destroy() {
        super._destroy();

        if (this._symlinkFileMonitorId) {
            this._symlinkFileMonitor.disconnect(this._symlinkFileMonitorId);
            this._symlinkFileMonitor.cancel();
            this._symlinkFileMonitorId = 0;
        }
    }

    async _doOpenContext(context, fileList) {
        if (!fileList)
            fileList = [];

        if (this._isBrokenSymlink) {
            try {
                console.log(
                    `Error: Can’t open ${this.file.get_uri()}` +
                    ' because it is a broken symlink.'
                );

                const title = _('Broken Link');
                const error =
                    _('Can not open this File because it is a Broken Symlink');

                this._showerrorpopup(title, error);
            } catch (e) {}

            return;
        }

        await super._doOpenContext(context, fileList);
    }

    _monitorSymlink() {
        let symlinkTarget = this._fileInfo.get_symlink_target();
        let symlinkTargetGioFile = Gio.File.new_for_path(symlinkTarget);

        this._symlinkFileMonitor = symlinkTargetGioFile.monitor(
            Gio.FileMonitorFlags.WATCH_MOVES,
            null
        );

        this._symlinkFileMonitor.set_rate_limit(1000);

        this._symlinkFileMonitorId = this._symlinkFileMonitor.connect(
            'changed',
            this._updateSymlinkIcon.bind(this)
        );
    }

    async _updateSymlinkIcon() {
        await this._reloadIcon().catch(e => {
            if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED)) {
                console.error(
                    e,
                    `Exception while updating ${
                        this._getVisibleName()
                            ? this._getVisibleName()
                            : 'symlink icon'
                    }: ${e.message}`);
            }
        });
    }

    _addEmblemsToIconIfNeeded(iconPaintable, position = 0) {
        let emblem = null;
        let newIconPaintable = iconPaintable;

        if (this._isSymlink && this.Prefs.showLinkEmblem) {
            emblem = Gio.ThemedIcon.new('icon-emblem-symbolic-link');

            newIconPaintable =
                this._addEmblem(newIconPaintable, emblem, position);

            position += 1;
        }

        if (this._isBrokenSymlink) {
            emblem = Gio.ThemedIcon.new('icon-emblem-unreadable');

            newIconPaintable =
                this._addEmblem(newIconPaintable, emblem, position);

            position += 1;
        }

        return super._addEmblemsToIconIfNeeded(newIconPaintable, position);
    }
};
