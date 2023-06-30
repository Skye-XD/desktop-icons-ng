/* DING: Desktop Icons New Generation for GNOME Shell
 *
 * Gtk4 Port Copyright (C) 2022 Sundeep Mediratta (smedius@gmail.com)
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

imports.gi.versions.Gdk = '4.0';
imports.gi.versions.Gtk = '4.0';

const { Gdk, GLib, Gio } = imports.gi;
const Gettext = imports.gettext.domain('gtk4-ding');

const _ = Gettext.gettext;

var GnomeShellDrop = class {
    constructor(desktopManager) {
        this.desktopManager = desktopManager;
        this.dragItem = desktopManager.dragItem;
        this.DesktopIconsUtil = desktopManager.DesktopIconsUtil;
        this.DBusUtils = desktopManager.DBusUtils;
        this.Enums = desktopManager.Enums;
        this.Prefs = desktopManager.Prefs;
        this._selectedFiles = desktopManager.getCurrentSelection();
        let Uris = true;
        this._selectedFilesURI = desktopManager.getCurrentSelection(Uris);
        this._dockSpringOpenFile = null;
        this._currentDesktopFileAppPath = null;
        this._dockSpringOpenTime = GLib.get_monotonic_time();
        this._dockSpringOpenComplete = false;
        this._startMonitoringDockUriNavigation();
    }

    destroy() {
        this._stopMonitoringDockUriNavigation();
    }

    _startMonitoringDockUriNavigation() {
        // Careful, we have to and are calling an async function in the timer, which will always return true,
        // therefore the function has to kill itself if not killed by drag end...
        this._dockUriSpringTimerID =  GLib.timeout_add(GLib.PRIORITY_DEFAULT, this.Enums.DND_SHELL_HOVER_POLL,
            async () => {
                try {
                    await this._dockUriSpringTimerFunction();
                } catch (e) {
                    logError(e);
                    return GLib.SOURCE_REMOVE;
                }
            }
        );
    }

    async _dockUriSpringTimerFunction() {
        // Failsafe kill the function - remove the timer if going on for too long, default 30 seconds
        if (!this.dragItem || (GLib.get_monotonic_time() - this._dockSpringOpenTime) > this.Enums.DND_SHELL_HOVER_POLL * 150000) {
            let stopID = this._dockUriSpringTimerID;
            this._dockUriSpringTimerID = 0;
            this._setShellDropCursor(this.Enums.ShellDropCursor.DEFAULT);
            if (stopID)
                GLib.Source.remove(stopID);
            return GLib.SOURCE_REMOVE;
        }

        let shellDropCoordinates = await this.DBusUtils.RemoteExtensionControl.getDropTargetCoordinates().catch(e => logError(e));
        let [a, b] = this.dragItem.dragSourceOffset;
        let leftEdge = [shellDropCoordinates[0] - a, shellDropCoordinates[1] - b + this.dragItem.iconRectangle.height / 2];
        this._currentDesktopFileAppPath = await this.DBusUtils.RemoteExtensionControl.getDropTargetAppInfoDesktopFile(leftEdge).catch(e => logError(e));
        this._setShellDropCursor();
        if (!this._currentDesktopFileAppPath ||
                !(this._currentDesktopFileAppPath.endsWith('Nautilus.desktop') ||
                this._currentDesktopFileAppPath.startsWith('file://') ||
                this._currentDesktopFileAppPath.startsWith('davs://')))
            return GLib.SOURCE_CONTINUE;


        // On a URI, start hover timing and reset timer
        if (!this._dockSpringOpenFile) {
            this._dockSpringOpenFile = this._currentDesktopFileAppPath;
            this._dockSpringOpenTime = GLib.get_monotonic_time();
            return GLib.SOURCE_CONTINUE;
        }

        // Open the URI, got here after hover timing started
        if (this._dockSpringOpenFile === this._currentDesktopFileAppPath && !this._dockSpringOpenComplete &&
              ((GLib.get_monotonic_time() - this._dockSpringOpenTime) > this.Enums.DND_HOVER_TIMEOUT * 1000)) {
            const context = Gdk.Display.get_default().get_app_launch_context();
            context.set_timestamp(Gdk.CURRENT_TIME);
            let uri;
            try {
                if (this._dockSpringOpenFile.endsWith('Nautilus.desktop'))
                    uri = this.desktopManager._desktopDir.get_uri();
                else
                    uri = this._dockSpringOpenFile;
                if (this.Prefs.openFolderOnDndHover)
                    Gio.AppInfo.launch_default_for_uri(uri, context);
                this._dockSpringOpenComplete = true;
            } catch (e) {
                logError(e, `Error opening ${uri} in GNOME Files: ${e.message}`);
            }
            return GLib.SOURCE_CONTINUE;
        }

        // URI is the same, window is opened, do nothing
        if (this._dockSpringOpenFile === this._currentDesktopFileAppPath && this._dockSpringOpenComplete)
            return GLib.SOURCE_CONTINUE;

        // If still alive, window is opened and uri is changed, reset
        if (this._dockSpringOpenFile !== this._currentDesktopFileAppPath && this._dockSpringOpenComplete) {
            this._dockSpringOpenFile = null;
            this._dockSpringOpenComplete = false;
            return GLib.SOURCE_CONTINUE;
        }
    }

    _stopMonitoringDockUriNavigation() {
        if (this._dockUriSpringTimerID) {
            GLib.Source.remove(this._dockUriSpringTimerID);
            this._currentDesktopFileAppPath = null;
            this._setShellDropCursor(this.Enums.ShellDropCursor.DEFAULT);
        }
        this._dockUriSpringTimerID = 0;
    }

    _setShellDropCursor(cursor = null) {
        if (cursor) {
            this.DBusUtils.RemoteExtensionControl.setDragCursor(cursor);
            return;
        }
        if (!this._currentDesktopFileAppPath) {
            this.DBusUtils.RemoteExtensionControl.setDragCursor(this.Enums.ShellDropCursor.NODROP);
            return;
        }
        try {
            if (this._currentDesktopFileAppPath.endsWith('.desktop')) {
                let desktopFile = Gio.DesktopAppInfo.new_from_filename(GLib.build_filenamev([this._currentDesktopFileAppPath]));
                if (!desktopFile) {
                    log('Could not parse desktopFile as a desktop file, cannot set shell cursor');
                    this.DBusUtils.RemoteExtensionControl.setDragCursor(this.Enums.ShellDropCursor.NODROP);
                    return;
                }
                let object = this.DesktopIconsUtil.checkAppOpensFileType(desktopFile, null, this._selectedFiles[0].attributeContentType);
                if (object.canopenFile) {
                    this.DBusUtils.RemoteExtensionControl.setDragCursor(this.Enums.ShellDropCursor.COPY);
                    return;
                } else if (this._currentDesktopFileAppPath.endsWith('Nautilus.desktop') && this.Prefs.openFolderOnDndHover) {
                    this.DBusUtils.RemoteExtensionControl.setDragCursor(this.Enums.ShellDropCursor.MOVE);
                    return;
                } else {
                    this.DBusUtils.RemoteExtensionControl.setDragCursor(this.Enums.ShellDropCursor.NODROP);
                }
            } else if (this._currentDesktopFileAppPath.startsWith('file://') ||
                this._currentDesktopFileAppPath.startsWith('davs://') ||
                this._currentDesktopFileAppPath.startsWith('trash://')) {
                this.DBusUtils.RemoteExtensionControl.setDragCursor(this.Enums.ShellDropCursor.MOVE);
                return;
            } else {
                this.DBusUtils.RemoteExtensionControl.setDragCursor(this.Enums.ShellDropCursor.NODROP);
                return;
            }
        } catch (e) {
            logError(e, 'Error reading desktop file. Cannot set shell Cursor');
        }
        this.DBusUtils.RemoteExtensionControl.setDragCursor(this.Enums.ShellDropCursor.NODROP);
    }

    async completeGnomeShellDrop() {
        if  (!this._currentDesktopFileAppPath)
            return false;
        if (this._currentDesktopFileAppPath.endsWith('.desktop')) {
            try {
                let desktopFile = Gio.DesktopAppInfo.new_from_filename(GLib.build_filenamev([this._currentDesktopFileAppPath]));
                if (!desktopFile) {
                    log('Could not parse desktopFile as a desktop file');
                    return false;
                }
                let object = this.DesktopIconsUtil.checkAppOpensFileType(desktopFile, null, this._selectedFiles[0].attributeContentType);
                if (object.canopenFile) {
                    const context = Gdk.Display.get_default().get_app_launch_context();
                    context.set_timestamp(Gdk.CURRENT_TIME);
                    desktopFile.launch_uris_as_manager(this._selectedFilesURI, context, GLib.SpawnFlags.SEARCH_PATH, null, null);
                    return true;
                } else {
                    this._showAppCannotOpenError(object.Appname);
                    return false;
                }
            } catch (e) {
                logError(e, 'Error reading desktop file. Cannot launch application.');
                return false;
            }
        }
        if (this._currentDesktopFileAppPath === 'trash:///') {
            this.desktopManager.doTrash();
            return true;
        }
        if (this._currentDesktopFileAppPath.startsWith('file:///') || this._currentDesktopFileAppPath.startsWith('davs://')) {
            await this.desktopManager.copyOrMoveUris(this._selectedFilesURI, this._currentDesktopFileAppPath, {}, {}).catch(e => logError(e));
            return true;
        }
        return false;
    }

    _textEntryAccelsTurnOff() {
        this.desktopManager.textEntryAccelsTurnOff();
    }

    _textEntryAccelsTurnOn() {
        this.desktopManager.textEntryAccelsTurnOn();
    }

    _showAppCannotOpenError(Appname) {
        let modal = true;
        let windowError = new this.desktopManager.showErrorPopup.ShowErrorPopup(
            _('Could not open File'),
            _('${appName} can not open files of this Type!').replace('${appName}', Appname),
            modal,
            this._textEntryAccelsTurnOff.bind(this),
            this._textEntryAccelsTurnOn.bind(this),
            this.DesktopIconsUtil
        );
        windowError.timeoutClose(3000);
        return false;
    }
};
