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

imports.gi.versions.Gtk = '4.0';
imports.gi.versions.Gdk = '4.0';

const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
const Gtk = imports.gi.Gtk;
const Gdk = imports.gi.Gdk;
const Gio = imports.gi.Gio;
const ByteArray = imports.byteArray;

const FileItem = imports.fileItem;
const stackItem = imports.stackItem;
const DesktopGrid = imports.desktopGrid;
const DesktopIconsUtil = imports.desktopIconsUtil;
const Prefs = imports.preferences;
const Enums = imports.enums;
const DBusUtils = imports.dbusUtils;
const AskRenamePopup = imports.askRenamePopup;
const ShowErrorPopup = imports.showErrorPopup;
const TemplatesScriptsManager = imports.templatesScriptsManager;
const FileItemMenu = imports.fileItemMenu;
const AutoAr = imports.autoAr;

var Thumbnails = null;
try {
     imports.gi.versions.GnomeDesktop = '4.0';
     Thumbnails = imports.thumbnails;
 } catch (e) {}

const Gettext = imports.gettext.domain('ding');

const _ = Gettext.gettext;

var DesktopManager = class {
    constructor(mainApp, dbusManager, desktopList, codePath, asDesktop, primaryIndex, version) {

        this.mainApp = mainApp;
        if (asDesktop) {
            this.mainApp.hold(); // Don't close the application if there are no desktops
            this._hold_active = true;
        }
        this._selectedFiles = null;
        DesktopIconsUtil.setApplicationId(mainApp);
        this._codePath = codePath;
        this._asDesktop = asDesktop;

        this._premultiplied = false;
        try {
            for (let f of Prefs.mutterSettings.get_strv('experimental-features')) {
                if (f == 'scale-monitor-framebuffer') {
                    this._premultiplied = true;
                    break;
                }
            }
        } catch(e) {
        }

        this.dbusManager = dbusManager;
        this.autoAr = new AutoAr.AutoAr(this);

        if (version) {
            this.GnomeShellVersion = version;
        } else {
            this.GnomeShellVersion = 40;
        }
        this._primaryIndex = primaryIndex;
        if (primaryIndex < desktopList.length) {
            this._primaryScreen = desktopList[primaryIndex];
        } else {
            this._primaryScreen = null;
        }
        this._clickX = 0;
        this._clickY = 0;
        this.pointerX = 0;
        this.pointerY = 0;
        this._dragList = null;
        this.dragItem = null;
        this._desktopList = desktopList;
        this._desktops = [];
        this._desktopFilesChanged = false;
        this._readingDesktopFiles = false;
        this._desktopDir = DesktopIconsUtil.getDesktopDir();
        this.desktopFsId = this._desktopDir.query_info('id::filesystem', Gio.FileQueryInfoFlags.NONE, null).get_attribute_string('id::filesystem');
        this._updateWritableByOthers();
        this._monitorDesktopDir = this._desktopDir.monitor_directory(Gio.FileMonitorFlags.WATCH_MOVES, null);
        this._monitorDesktopDir.set_rate_limit(1000);
        this._monitorDesktopDir.connect('changed', (obj, file, otherFile, eventType) => this._updateDesktopIfChanged(file, otherFile, eventType));

        this.fileItemMenu = new FileItemMenu.FileItemMenu(this);
        this.templatesMonitor = new TemplatesScriptsManager.TemplatesScriptsManager(
            DesktopIconsUtil.getTemplatesDir(),
            this._newDocument.bind(this),
            this._templatesDirSelectionFilter.bind(this),
            this.mainApp,
            "templateapp"
        );
        this._showHidden = Prefs.gtkSettings.get_boolean('show-hidden');
        this.showDropPlace = Prefs.desktopSettings.get_boolean('show-drop-place');
        this.useNemo = Prefs.desktopSettings.get_boolean('use-nemo');
        this.showLinkEmblem = Prefs.desktopSettings.get_boolean('show-link-emblem');
        this.darkText = Prefs.desktopSettings.get_boolean('dark-text-in-labels');
        this._settingsId = Prefs.desktopSettings.connect('changed', (obj, key) => {
            if (key == 'dark-text-in-labels')  {
                this.darkText = Prefs.desktopSettings.get_boolean('dark-text-in-labels');
                this._updateDesktop().catch((e) => {
                    print(`Exception while updating Desktop after Dark Text changed: ${e.message}\n${e.stack}`);
                });
                return;
            }
            if (key == 'show-link-emblem') {
                this.showLinkEmblem = Prefs.desktopSettings.get_boolean('show-link-emblem');
                this._updateDesktop().catch((e) => {
                    print(`Exception while updating Desktop after Show Emblems changed: ${e.message}\n${e.stack}`);
                });
                return;
            }
            if (key == 'use-nemo') {
                this.useNemo = Prefs.desktopSettings.get_boolean('use-nemo');
                return;
            }
            if (key == 'icon-size') {
                this._fileList.forEach(x => x.removeFromGrid());
                for (let desktop of this._desktops) {
                    desktop.resizeGrid();
                }
                this._fileList.forEach(x => x.updateIcon());
                this._placeAllFilesOnGrids(true);
                return;
            }
            if (key == Enums.SortOrder.ORDER) {
                if (this.keepStacked) {
                    this.doStacks(true);
                } else {
                    this.doSorts(true);
                }
                return;
            }
            if (key == 'unstackedtypes') {
                if (this.keepStacked) {
                    this.doStacks(true);
                }
                return;
            }
            if (key == 'keep-stacked') {
                this.keepStacked = Prefs.desktopSettings.get_boolean('keep-stacked');
                if ( ! this.keepStacked) {
                    this._unstack();
                } else {
                    this.doStacks(true);
                }
                return;
            }
            if (key == 'keep-arranged') {
                this.keepArranged = Prefs.desktopSettings.get_boolean('keep-arranged');
                if (this.keepArranged) {
                    this.doSorts(true);
                }
                return;
            }
            this.showDropPlace = Prefs.desktopSettings.get_boolean('show-drop-place');
            this._updateDesktop().catch((e) => {
                print(`Exception while updating Desktop after Settings Changed: ${e.message}\n${e.stack}`);
            });
        });
        Prefs.gtkSettings.connect('changed', (obj, key) => {
            if (key == 'show-hidden') {
                this._showHidden = Prefs.gtkSettings.get_boolean('show-hidden');
                this._updateDesktop().catch((e) => {
                    print(`Exception while updating Desktop after Hidden Settings Changed: ${e.message}\n${e.stack}`);
                });
                this.templatesMonitor.updateEntries();
            }
        });
        Prefs.nautilusSettings.connect('changed', (obj, key) => {
            if (key == 'show-image-thumbnails') {
                this._updateDesktop().catch((e) => {
                    print(`Exception while updating Desktop after Nautilus Settings Changed: ${e.message}\n${e.stack}`);
                });
            }
        });
        this._gtkIconTheme = Gtk.IconTheme.get_for_display(Gdk.Display.get_default());
        this._gtkIconTheme.connect('changed', () => {
            this._updateDesktop().catch((e) => {
                    print(`Exception while updating Desktop after Gtk Icon Theme Change: ${e.message}\n${e.stack}`);
                });
        });
        this._volumeMonitor = Gio.VolumeMonitor.get();
        this._volumeMonitor.connect('mount-added', () => { this._updateDesktop().catch((e) => {
                print(`Exception while updating Desktop after mount added: ${e.message}\n${e.stack}`);
            });
        });
        this._volumeMonitor.connect('mount-removed', () => { this._updateDesktop().catch((e) => {
                print(`Exception while updating Desktop after mount removed: ${e.message}\n${e.stack}`);
            });
        });

        this.rubberBand = false;

        let cssProvider = new Gtk.CssProvider();
        cssProvider.load_from_file(Gio.File.new_for_path(GLib.build_filenamev([codePath, "stylesheet.css"])));
        Gtk.StyleContext.add_provider_for_display(Gdk.Display.get_default(), cssProvider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);

        this._configureSelectionColor();
        this._createMenuActionGroup();
        this._createGridWindows();

        DBusUtils.NautilusFileOperations2.connectToProxy('g-properties-changed', this._undoStatusChanged.bind(this));
        this._syncUndoRedo();
        DBusUtils.GtkVfsMetadata.connectSignalToProxy('AttributeChanged', this._metadataChanged.bind(this));
        this._allFileList = null;
        this._fileList = [];
        this._forcedExit = false;

        this._scriptsList = [];

        this.ignoreKeys = [Gdk.KEY_space,Gdk.KEY_Shift_L,Gdk.KEY_Shift_R,Gdk.KEY_Control_L,Gdk.KEY_Control_R,Gdk.KEY_Caps_Lock,Gdk.KEY_Shift_Lock,Gdk.KEY_Meta_L,Gdk.KEY_Meta_R,Gdk.KEY_Alt_L,Gdk.KEY_Alt_R,Gdk.KEY_Super_L,Gdk.KEY_Super_R,Gdk.KEY_ISO_Level3_Shift,Gdk.KEY_ISO_Level5_Shift];

        // Check if Nautilus is available
        try {
            DesktopIconsUtil.trySpawn(null, ["nautilus", "--version"]);
        } catch(e) {
            this._errorWindow = new ShowErrorPopup.ShowErrorPopup(_("Nautilus File Manager not found"),
                                                                  _("The Nautilus File Manager is mandatory to work with Desktop Icons NG."),
                                                                  true,
                                                                  this.textEntryAccelsTurnOff.bind(this),
                                                                  this.textEntryAccelsTurnOn.bind(this));
        }
        this._pendingDropFiles = {};
        if (this._asDesktop) {
            this._sigtermID = GLib.unix_signal_add(GLib.PRIORITY_DEFAULT, 15, () => {
                GLib.source_remove(this._sigtermID);
                let updateFileList;
                if (this._allFileList && (this._allFileList.length > 0)) {
                    updateFileList = this._allFileList;
                } else {
                    updateFileList = this._fileList;
                }
                updateFileList.forEach(f => f.onDestroy());
                for(let desktop of this._desktops) {
                    desktop.destroy();
                }
                this._desktops = [];
                this._forcedExit = true;
                if (this._desktopEnumerateCancellable) {
                    this._desktopEnumerateCancellable.cancel();
                }
                if (this.thumbnailApp) {
                    this.thumbnailApp.send_signal(15);
                }
                if (this._hold_active) {
                    this.mainApp.release();
                    this._hold_active = false;
                }
                return false;
            });
        }
        this._dbusAdvertiseUpdate();
        if (! Thumbnails) {
            this._startThumbnailer();
            this.thumbnailLoader = {};
            this.thumbnailLoader._updateThumbnail = this._getRemoteIconThumbNail.bind(this);
        } else {
            this.thumbnailLoader = new Thumbnails.ThumbnailLoader(codePath);
            this._updateDesktop().catch((e) => {
                print(`Exception while Initiating Desktop: ${e.message}\n${e.stack}`);
            });
        }
    }

    terminateProgram() {
        let updateFileList;
        if (this._allFileList && (this._allFileList.length > 0)) {
            updateFileList = this._allFileList;
        } else {
            updateFileList = this._fileList;
        }
        updateFileList.forEach(f => f.onDestroy());
        for(let desktop of this._desktops) {
            desktop.destroy();
        }
        this._desktops = [];
        this._forcedExit = true;
        if (this._desktopEnumerateCancellable) {
            this._desktopEnumerateCancellable.cancel();
        }
        if (this.thumbnailApp) {
            this.thumbnailApp.send_signal(15);
        }
    }

    async _startThumbnailer() {
        let args = [];
        args.push(GLib.build_filenamev([this._codePath, 'thumbnailapp.js']));
        args.push(this._codePath);
        if (this._asDesktop) {
            args.push('asdesktop');
        }
        this.thumbnailApp = new Gio.Subprocess({argv: args});
        this.thumbnailApp.init(null);
        if (this._asDesktop) {
            this.remoteThumbnailUpdate =  Gio.DBusActionGroup.get(
                Gio.DBus.session,
                'com.rastersoft.dingThumbnailer',
                '/com/rastersoft/dingThumbnailer/actions'
            );
        } else {
                this.remoteThumbnailUpdate =  Gio.DBusActionGroup.get(
                Gio.DBus.session,
                'com.rastersoft.dingTestThumbnailer',
                '/com/rastersoft/dingTestThumbnailer/actions'
            );
        }
        await this._detectThumbnailerConnection(this.remoteThumbnailUpdate);
        this._updateDesktop().catch((e) => {
            print(`Exception while Initiating Desktop: ${e.message}\n${e.stack}`);
        });
    }

    _detectThumbnailerConnection(remotegroup) {
        return new Promise((resolve, reject) => {
            try {
                remotegroup.connect('action-added', (group, action_name) => {
                    if (action_name == 'updateThumbnail') {
                        resolve(true);
                    }
                });
                remotegroup.list_actions();
            } catch (e) {
                reject(e);
            }
        });
    }

    _getRemoteIconThumbNail(fileItem) {
        let thumbnailInfoVariant = new GLib.Variant('as', [fileItem._file.get_uri(), fileItem._file.get_path(), fileItem.attributeContentType, `${fileItem.modifiedTime}`]);
        this.remoteThumbnailUpdate.activate_action('updateThumbnail', thumbnailInfoVariant);
    }

    _metadataChanged(proxy, nameOwner, args) {
        let filepath = GLib.build_filenamev([GLib.get_home_dir(), args[1]]);
        if (this._desktopDir.get_path() === GLib.path_get_dirname(filepath)) {
            let updateFileList;
            if (this._allFileList && (this._allFileList.length > 0)) {
                updateFileList = this._allFileList;
            } else {
                updateFileList = this._fileList;
            }
            for (let fileItem of updateFileList) {
                if (fileItem.path == filepath) {
                    fileItem.updatedMetadata();
                    break;
                }
            }
        }
    }

    _templatesDirSelectionFilter(fileinfo) {
        let name = fileinfo.get_name();
        let offset = DesktopIconsUtil.getFileExtensionOffset(name, false);
        name = name.substring(0, offset);
        let hidden;
        if (this._showHidden) {
            hidden = false;
        } else {
            hidden = (name.substring(0, 1) == '.');
        }
        if (!hidden) {
            return name;
        } else {
            return null;
        }
    }

    _dbusAdvertiseUpdate() {
        let updateGridWindows = new Gio.SimpleAction({
            name: 'updateGridWindows',
            parameter_type: new GLib.VariantType('av')
        });
        updateGridWindows.connect('activate', (action, parameter) => {
            this.updateGridWindows(parameter.recursiveUnpack());
        });
        let updateThumbnail = new Gio.SimpleAction({
            name: 'updateThumbnail',
            parameter_type: new GLib.VariantType('as')
        });
        updateThumbnail.connect('activate', (action, parameter) => {
            this.updateFileItemThumbnail(parameter.recursiveUnpack());
        });
        let actionGroup = new Gio.SimpleActionGroup();
        actionGroup.add_action(updateThumbnail);
        let busname = this.mainApp.get_dbus_object_path();
        this._connection = Gio.DBus.session;
        this._dbusConnectionGroupId = this._connection.export_action_group(
            `${busname}/actions`,
            actionGroup
        );
        actionGroup.add_action(updateGridWindows);
    }

    updateFileItemThumbnail(thumbnailinfo) {
        let fileuri = thumbnailinfo[0];
        let thumbnailFile = thumbnailinfo[1];
        let updateFileList;
        if (this._allFileList && (this._allFileList.length > 0)) {
            updateFileList = this._allFileList;
        } else {
            updateFileList = this._fileList;
        }
        updateFileList.forEach(f => {
            if (f.uri == fileuri) {
                f.thumbnailFile = thumbnailFile;
                f.updateIcon();
            }
        });
    }

    updateGridWindows(newdesktoplist) {
        if ((newdesktoplist.length > 0) && ('primaryMonitor' in newdesktoplist[0])) {
            this._primaryIndex = newdesktoplist[0].primaryMonitor;
        }
        if (newdesktoplist.length != this._desktopList.length) {
            this._fileList.forEach(x => x.removeFromGrid());
            this._desktopList = newdesktoplist;
            if (this._primaryIndex < this._desktopList.length) {
                this._primaryScreen = this._desktopList[this._primaryIndex];
            } else {
                this._primaryScreen = null;
            }
            this._createGridWindows();
            this._placeAllFilesOnGrids(true);
            return;
        }
        let monitorschanged= [];
        let gridschanged = [];
        for(let index = 0; index < newdesktoplist.length; index++) {
            let area = newdesktoplist[index];
            let area2 = this._desktopList[index];
            if ((area.x != area2.x) ||
                (area.y != area2.y) ||
                (area.width != area2.width) ||
                (area.height != area2.height) ||
                (area.zoom != area2.zoom) ||
                (area.monitorIndex != area2.monitorIndex)) {
                monitorschanged.push(index);
                gridschanged.push(index);
                continue;
            }
            if ((area.marginTop != area2.marginTop) ||
                (area.marginBottom != area2.marginBottom) ||
                (area.marginLeft != area2.marginLeft) ||
                (area.marginRight != area2.marginRight)) {
                    if (! gridschanged.includes(index)) {
                        gridschanged.push(index);
                    }
            }
        }
        if (gridschanged.length > 0) {
            this._fileList.forEach(x => x.removeFromGrid());
            for (let gridindex of gridschanged) {
                let desktop = this._desktops[gridindex];
                desktop.updateGridDescription(newdesktoplist[gridindex]);
                if (monitorschanged.includes(gridindex)) {
                    desktop.resizeWindow();
                }
                desktop.resizeGrid();
            }
            this._desktopList = newdesktoplist;
            this._placeAllFilesOnGrids(true);
        }
        if (this._primaryIndex < this._desktopList.length) {
            this._primaryScreen = this._desktopList[this._primaryIndex];
        } else {
            this._primaryScreen = null;
        }
    }

    _createGridWindows() {
        for(let desktop of this._desktops) {
            desktop.destroy();
        }
        this._desktops = [];
        for(let desktopIndex in this._desktopList) {
            let desktop = this._desktopList[desktopIndex];
            if (this._asDesktop) {
                var desktopName = `@!${desktop.x},${desktop.y};BDHF`;
            } else {
                var desktopName = `DING ${desktopIndex}`;
            }
            this._desktops.push(new DesktopGrid.DesktopGrid(this, desktopName, desktop, this._asDesktop, this._premultiplied));
        }
    }

    _configureSelectionColor() {
        let box = new Gtk.Box;
        this._styleContext = box.get_style_context();
        this._styleContext.add_class('view');
        this._cssProviderSelection = new Gtk.CssProvider();
        this._styleContext.connect('notify::vfunc_changed', () => {
            Gtk.StyleContext.remove_provider_for_display(Gdk.Screen.get_default(), this._cssProviderSelection);
            this._setSelectionColor();
        });
        this._setSelectionColor();
    }

    _setSelectionColor() {
        let [exists, color] = this._styleContext.lookup_color('theme_selected_bg_color');
        if (exists) {
            this.selectColor = color;
        } else {
            this.selectColor = this._styleContext.get_color(); // just set to foreground color
        }
        let style = `.desktop-icons-selected {
            background-color: rgba(${this.selectColor.red * 255},${this.selectColor.green * 255}, ${this.selectColor.blue * 255}, 0.6);
        }`;
        this._cssProviderSelection.load_from_data(style);
        Gtk.StyleContext.add_provider_for_display(Gdk.Display.get_default(), this._cssProviderSelection, 600);
    }

    clearFileCoordinates(fileList, dropCoordinates, desktoppath=null, doCopy=false) {
        for(let element of fileList) {
            let file = Gio.File.new_for_uri(element);
            if (!file.is_native() || !file.query_exists(null) || doCopy) {
                if (dropCoordinates != null) {
                    let copylinkGio = Gio.File.new_for_path(GLib.build_filenamev([desktoppath, file.get_basename()]));
                    if (! copylinkGio.query_exists(null)) {
                        this._pendingDropFiles[file.get_basename()] = dropCoordinates;
                    }
                }
                continue;
            }
            let info = new Gio.FileInfo();
            info.set_attribute_string('metadata::nautilus-icon-position', '');
            if (dropCoordinates != null) {
                info.set_attribute_string('metadata::nautilus-drop-position', `${dropCoordinates[0]},${dropCoordinates[1]}`);
            }
            try {
                file.set_attributes_from_info(info, Gio.FileQueryInfoFlags.NONE, null);
            } catch(e) {}
        }
    }

    doMoveWithDragAndDrop(xOrigin, yOrigin, xDestination, yDestination) {
        let keepArranged = this.keepArranged || this.keepStacked;
        if ( this.sortSpecialFolders && keepArranged ) {
            return;
        }
        // Find the grid where the destination lies and aim towards the positive side, middle of grid to ensure drop in the grid
        for(let desktop of this._desktops) {
            let grid = desktop.getGridAt(xDestination, yDestination, true);
            if (grid !== null) {
                xDestination = grid[0] + desktop._elementWidth/2;
                yDestination = grid[1] + desktop._elementHeight/2;
                break;
            }
        }
        let deltaX = xDestination - xOrigin;
        let deltaY = yDestination - yOrigin;
        let fileItems = [];
        for(let item of this._fileList) {
            if (item.isSelected) {
                if (keepArranged) {
                    if (item.isSpecial) {
                        fileItems.push(item);
                        item.removeFromGrid(false);
                        let [x, y, a, b, c] = item.getCoordinates();
                        item.savedCoordinates = [x + deltaX, y + deltaY];
                    } else {
                        continue;
                    }
                } else {
                    fileItems.push(item);
                    item.removeFromGrid(false);
                    let [x, y, a, b, c] = item.getCoordinates();
                    item.savedCoordinates = [x + deltaX, y + deltaY];
                }
            }
        }
        // force to store the new coordinates
        this._addFilesToDesktop(fileItems, Enums.StoredCoordinates.OVERWRITE);
        if (this.keepArranged) {
            this._updateDesktop().catch((e) => {
                print(`Exception while doing move with drag and drop and keeping arranged: ${e.message}\n${e.stack}`);
            });
        }
    }

    onDragBegin(item) {
        this.dragItem = item;
    }

    onDragMotion(x, y) {
        if (this.dragItem === null) {
            for(let desktop of this._desktops) {
                desktop.refreshDrag([[0, 0]], x, y);
            }
            return;
        }
        if (this._dragList === null) {
            let itemList = this.getCurrentSelection(false);
            if (!itemList) {
                return;
            }
            let [x1, y1, x2, y2, c] = this.dragItem.getCoordinates();
            let oX = x1;
            let oY = y1;
            this._dragList = [];
            for (let item of itemList) {
                [x1, y1, x2, y2, c] = item.getCoordinates();
                this._dragList.push([x1 - oX, y1 - oY]);
            }
        }
        for(let desktop of this._desktops) {
            desktop.refreshDrag(this._dragList, x, y);
        }
    }

    onDragLeave() {
        this._dragList = null;
        for(let desktop of this._desktops) {
            desktop.refreshDrag(null, 0, 0);
        }
    }

    onDragEnd() {
        this.dragItem = null;
    }

    onDragDataReceived(xGlobalDestination, yGlobalDestination, xlocalDestination, ylocalDestination, selection, info, gdkDropAction) {

        this.onDragLeave();
        let fileList;

        switch(info) {
            case 'dingdrop':
                fileList = selection.split('\r\n')
                if (fileList.length >= 2) {
                    fileList.splice(-1, 1);
                }
                if (fileList.length != 0) {
                    let [xOrigin, yOrigin, a, b, c] = this.dragItem.getCoordinates();
                    this.doMoveWithDragAndDrop(xOrigin, yOrigin, xGlobalDestination, yGlobalDestination);
                }
                break;
            case 'gnomeicondrop':
                fileList = selection.split('\r\n')
                if (fileList.length >= 2) {
                    fileList.splice(-1, 1);
                }
                let desktoppath = GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_DESKTOP);
                let destinationuri = "file://" + desktoppath;
                if (fileList.length != 0) {
                    let data = Gio.File.new_for_uri(fileList[0]).query_info('id::filesystem', Gio.FileQueryInfoFlags.NONE, null);
                    let id_fs = data.get_attribute_string('id::filesystem');
                    if ((this.desktopFsId == id_fs) && (gdkDropAction == Gdk.DragAction.MOVE)) {
                        this.clearFileCoordinates(fileList, [xGlobalDestination, yGlobalDestination], desktoppath);
                        DBusUtils.RemoteFileOperations.MoveURIsRemote(fileList, destinationuri);
                    } else if ((this.desktopFsId == id_fs) && ((gdkDropAction != Gdk.DragAction.MOVE) || (gdkDropAction != Gdk.DragAction.COPY))) {
                        this.askWhatToDoWithFiles(fileList, destinationuri, desktoppath, xGlobalDestination, yGlobalDestination, xlocalDestination, ylocalDestination);
                    } else {
                        this.clearFileCoordinates(fileList, [xGlobalDestination, yGlobalDestination], desktoppath, true);
                        DBusUtils.RemoteFileOperations.CopyURIsRemote(fileList, destinationuri);
                    }
                }
                break;
            case 'textdrop':
                if (selection.length != 0 ) {
                    let dropCoordinates = [ xGlobalDestination, yGlobalDestination ];
                    this.detectURLorText(selection, dropCoordinates);
                }
                break;
        }
    }

    askWhatToDoWithFiles(fileList, destinationuri, desktoppath, X, Y, x, y) {
        this._askWhatToDoWindow = new Gtk.Dialog({use_header_bar: false,
                                       resizable: false});
        let headerbar = Gtk.HeaderBar.new();
        headerbar.set_show_title_buttons(false);
        this._askWhatToDoWindow.set_titlebar(headerbar);
        this._askWhatToDoWindow.add_button(_("Move"), 1)
        this._askWhatToDoWindow.add_button(_("Copy"), 2)
        this._askWhatToDoWindow.add_button(_("Link"), 3);
        this._askWhatToDoWindow.add_button(_("Cancel"), Gtk.ResponseType.CLOSE);
        this._askWhatToDoWindow.set_modal(true);
        this._askWhatToDoWindow.set_title(_('Choose Action for Files'));
        DesktopIconsUtil.windowHidePagerTaskbarModal(this._askWhatToDoWindow, true);
        this._askWhatToDoWindow.show();
        this.textEntryAccelsTurnOff();
        this._askWhatToDoWindow.connect('close', () => {
            this._askWhatToDoWindow.response(Gtk.ResponseType.CANCEL);
        })
        this._askWhatToDoWindow.connect('response', (actor, retval) => {
            switch(retval) {
                case 1:
                    this.clearFileCoordinates(fileList, [X, Y], desktoppath);
                    DBusUtils.RemoteFileOperations.MoveURIsRemote(fileList, destinationuri);
                    break;
                case 2:
                    this.clearFileCoordinates(fileList, [X, Y], desktoppath, true);
                    DBusUtils.RemoteFileOperations.CopyURIsRemote(fileList, destinationuri);
                    break;
                case 3:
                    this.makeLinks(fileList, destinationuri, X, Y, x, y);
                    break;
            }
            this.textEntryAccelsTurnOn();
            this._askWhatToDoWindow.destroy();
            this._askWhatToDoWindow = null;
        });
    }

    makeLinks(fileList, destination, X, Y, x, y) {
        let gioDestination = Gio.File.new_for_uri(destination);
        for (let file of fileList) {
            let fileGio = Gio.File.new_for_uri(file);
            let i = 0;
            let baseName = fileGio.get_basename();
            let newSymlinkName = baseName;
            while (  0 < this._fileList.filter(f => f.fileName == newSymlinkName).length) {
                i += 1;
                newSymlinkName = baseName + "(" + i + ")";
            }
            let symlinkGio = Gio.File.new_for_commandline_arg(GLib.build_filenamev([gioDestination.get_path() , newSymlinkName]));
            try {
                if (symlinkGio.make_symbolic_link(GLib.build_filenamev([fileGio.get_path()]), null)) {
                    let info = new Gio.FileInfo();
                    info.set_attribute_string('metadata::nautilus-drop-position', `${X},${Y}`);
                    info.set_attribute_string('metadata::nautilus-icon-position', '');
                    symlinkGio.set_attributes_from_info(info, Gio.FileQueryInfoFlags.NONE, null);
                }
            } catch(e) {}
        }
    }

    detectURLorText(fileList, dropCoordinates) {
        function isValidURL(str) {
            var pattern = new RegExp('^(https|http|ftp|rtsp|mms)?:\\/\\/?'+ 
            '((([a-z\\d]([a-z\\d-]*[a-z\\d])*)\\.)+[a-z]{2,}|'+
            '((\\d{1,3}\\.){3}\\d{1,3}))'+ 
            '(\\:\\d+)?(\\/[-a-z\\d%_.~+]*)*'+ 
            '(\\?[;&a-z\\d%_.~+=-]*)?'+ 
            '(\\#[-a-z\\d_]*)?$','i'); 
            return !!pattern.test(str);
        }
        let text = fileList.toString();
        if (isValidURL(text)) {
            this.writeURLlinktoDesktop(text, dropCoordinates);
        } else {
            let filename = "Dragged Text";
            let now = Date().valueOf().split(" ").join("").replace( /:/g , '-');
            filename = filename + "-" + now;
            DesktopIconsUtil.writeTextFileToDesktop(text, filename, dropCoordinates);
        }
    }

    writeURLlinktoDesktop(link, dropCoordinates) {
        let filename = link.split("?")[0];
        filename = filename.split("//")[1];
        filename = filename.split("/")[0] ;
        let now = Date().valueOf().split(" ").join("").replace( /:/g , '-' );
        filename = filename + "-" + now ;
        this.writeHTMLTypeLink(filename, link, dropCoordinates);
    }


    writeHTMLTypeLink(filename, link, dropCoordinates) {
        filename = filename + ".html";
        let body = [ '<html>', '<head>', '<meta http-equiv="refresh" content="0; url=' + link + '" />', '</head>', '<body>', '</body>', '</html>' ];
        body = body.join('\n');
        DesktopIconsUtil.writeTextFileToDesktop(body, filename, dropCoordinates);
    }

    fillDragDataGet(info) {
        let fileList = this.getCurrentSelection(false);
        if (fileList == null) {
            return null;
        }
        let data = "";
        for (let fileItem of fileList) {
            data += fileItem.uri;
            if (info == 'x-special/gnome-icon-list') {
                let coordinates = fileItem.getCoordinates();
                if (coordinates != null) {
                    data += `\r${coordinates[0]}:${coordinates[1]}:${coordinates[2] - coordinates[0] + 1}:${coordinates[3] - coordinates[1] + 1}`
                }
            }
            data += '\r\n';
        }
        return data;
    }

    onPressButton(X, Y, x, y, button, shiftPressed, controlPressed, grid) {
        this._clickX = Math.floor(X);
        this._clickY = Math.floor(Y);

        if (button == 1) {
            if (!shiftPressed && !controlPressed) {
                // clear selection
                this.unselectAll();
            }
            this._startRubberband(X, Y);
        }

        if (button == 3) {
            this._syncUndoRedo();
            let clipboard = Gdk.Display.get_default().get_clipboard();
            this._isCut = false;
            this._clipboardFiles = null;
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
             * To maintain compatibility, we first check if there's binary data in that atom, and if not, we check if
             * there is text data in the old format.
             */
            let text = null;
            if (clipboard.get_formats()) {
                let mimetypes = clipboard.get_formats().to_string();
                if (mimetypes.includes('x-special/gnome-copied-files')) {
                    clipboard.read_async(['x-special/gnome-copied-files'], GLib.PRIORITY_DEFAULT, null, (actor, result, error) => {
                            let success = actor.read_finish(result);
                            let bytes = success[0].read_bytes(8192, null);
                            text = ByteArray.toString(bytes.get_data());
                            text = 'x-special/nautilus-clipboard\n' + text + '\n'
                            this._setClipboardContent(text);
                    });
                } else if (mimetypes.includes('text/plain')) {
                    clipboard.read_async(['text/plain'], GLib.PRIORITY_DEFAULT, null, (actor, result, error) => {
                        try {
                            let success = actor.read_finish(result);
                            let bytes = success[0].read_bytes(8192, null);
                            text = ByteArray.toString(bytes.get_data());
                            this._setClipboardContent(text);
                        } catch(e) {}
                    });
                } else {
                    if (text && !text.endsWith('\n')) {
                        text += '\n';
                    }
                    this._setClipboardContent(text);
                }
            }
            this._createDesktopBackgroundGioMenu();
            this.popupmenu = Gtk.PopoverMenu.new_from_model(this.desktopBackgroundGioMenu);
            this.popupmenu.set_parent(grid._container);
            this.popupmenu.set_pointing_to(new Gdk.Rectangle({x:x,y:y,width:1,height:1}));
            this.popupmenu.set_has_arrow(true);
            this.popupmenuopen = true;
            this.popupmenu.popup();
            this.popupmenu.connect('closed', async () => {
                await DesktopIconsUtil.waitDelayMs(50);
                this.popupmenu.unparent();
                this.popupmenuopen = false;
            });
        }
        this._setClipboardContent(text);
    }

    _setClipboardContent(text) {
        let [valid, is_cut, files] = this._parseClipboardText(text);
        if (valid) {
            this._isCut = is_cut;
            this._clipboardFiles = files;
        }
        this.doPasteSimpleAction.set_enabled(valid);
    }

    _syncUndoRedo() {
        switch (DBusUtils.RemoteFileOperations.UndoStatus()) {
            case Enums.UndoStatus.UNDO:
                this.doUndoSimpleAction.set_enabled(true);
                this.doRedoSimpleAction.set_enabled(false);
                break;
            case Enums.UndoStatus.REDO:
                this.doUndoSimpleAction.set_enabled(false);
                this.doRedoSimpleAction.set_enabled(true);
                break;
            default:
                this.doUndoSimpleAction.set_enabled(false);
                this.doRedoSimpleAction.set_enabled(false);
                break;
        }
    }

    _undoStatusChanged(proxy, properties, test) {
        if ('UndoStatus' in properties.deep_unpack()) {
            this._syncUndoRedo();
        }
    }

    _doUndo() {
        DBusUtils.RemoteFileOperations.UndoRemote();
    }

    _doRedo() {
        DBusUtils.RemoteFileOperations.RedoRemote();
    }

    onKeyPress(symbol, state, grid) {
        let isCtrl = (state & Gdk.ModifierType.CONTROL_MASK) != 0;
        let isShift = (state & Gdk.ModifierType.SHIFT_MASK) != 0;
        let isAlt = (state & Gdk.ModifierType.MOD1_MASK) != 0;
        let selection = this.getCurrentSelection(false);
        this.keyEventGrid = grid;
        if (this.popupmenuopen) {
            return true;
        }
        if (this.ignoreKeys.includes(symbol)) {
            return true;
        }
        let key = String.fromCharCode(Gdk.keyval_to_unicode(symbol));
        if (this.keypressTimeoutID && this.searchString) {
            this.searchString = this.searchString.concat(key);
        } else {
            this.searchString = key;
        }
        if (this.searchString != '') {
            let found = this.scanForFiles(this.searchString, false);
            if (found) {
                if ((this.getNumberOfSelectedItems() >= 1) && (! this.keypressTimeoutID)) {
                    let windowError = new ShowErrorPopup.ShowErrorPopup(
                        _("Clear Current Selection before New Search"),
                        null,
                        true,
                        this.textEntryAccelsTurnOff.bind(this),
                        this.textEntryAccelsTurnOn.bind(this));
                    windowError.timeoutClose(2000);
                    return true;
                }
                this.searchEventTime = GLib.get_monotonic_time();
                if (! this.keypressTimeoutID) {
                    this.keypressTimeoutID = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
                        if (GLib.get_monotonic_time() - this.searchEventTime < 1500000) {
                            return true;
                        }
                        this.searchString = null;
                        this.keypressTimeoutID = null;
                        if (this._findFileWindow) {
                            this._findFileWindow.response(Gtk.ResponseType.OK);
                        }
                        return false;
                    });
                }
                this.findFiles(this.searchString)
            }
            return true;
        } else {
            return false;
        }
    }

    unselectAll() {
        this._fileList.map(f => f.unsetSelected());
    }

    findFiles(text) {
        this._findFileWindow = new Gtk.Dialog({use_header_bar: true,
                                       resizable: false});
        this._findFileButton = this._findFileWindow.add_button(_("OK"), Gtk.ResponseType.OK);
        this._findFileButton.sensitive = false;
        this._findFileWindow.add_button(_("Cancel"), Gtk.ResponseType.CANCEL);
        this._findFileWindow.set_modal(true);
        this._findFileWindow.set_title(_('Find Files on Desktop'));
        DesktopIconsUtil.windowHidePagerTaskbarModal(this._findFileWindow, true);
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
            if (this._findFileButton.sensitive) {
                this._findFileWindow.response(Gtk.ResponseType.OK);
            }
        });
        this._findFileTextArea.connect('changed', () => {
            let context = this._findFileTextArea.get_style_context();
            if (this.scanForFiles(this._findFileTextArea.text, true)){
                this._findFileButton.sensitive = true;
                if (context.has_class('not-found')) {
                    context.remove_class('not-found');
                }
            } else {
                this._findFileButton.sensitive = false;
                this._findFileTextArea.error_bell();
                if (!context.has_class('not-found')) {
                    context.add_class('not-found');
                }
            }
            this.searchEventTime = GLib.get_monotonic_time();
        });
        this._findFileTextArea.grab_focus_without_selecting();
        if (text) {
            this._findFileTextArea.set_text(text);
            this._findFileTextArea.set_position(text.length);
        } else {
            this.scanForFiles(null);
        }
        this._findFileWindow.show();
        this.textEntryAccelsTurnOff();
        this._findFileWindow.connect('close', () => {
            this._findFileWindow.response(Gtk.ResponseType.CANCEL);
        })
        this._findFileWindow.connect('response', (actor, retval) => {
            if (retval == Gtk.ResponseType.CANCEL) {
                this.unselectAll();
            }
            this.textEntryAccelsTurnOn();
            this._findFileWindow.destroy();
            this._findFileWindow = null;
        });
    }

    scanForFiles(text, setselected) {
        let found = [];
        if (text && (text != '')) {
            found = this._fileList.filter(f => (f.fileName.toLowerCase().includes(text.toLowerCase())) || (f._label.get_text().toLowerCase().includes(text.toLowerCase())));
        }
        if (found.length != 0) {
            if (setselected) {
                this.unselectAll();
                found.map(f => f.setSelected());
            }
            return true;
        } else {
            return false;
        }
    }

    _createMenuActionGroup() {

        let newFolder = Gio.SimpleAction.new('doNewFolder', null);
        newFolder.connect('activate', () => {
            this.doNewFolder();
        });
        this.mainApp.add_action(newFolder);
        this.mainApp.set_accels_for_action('app.doNewFolder', ['<Control><Shift>N'])

        this.doPasteSimpleAction = Gio.SimpleAction.new('doPaste', null);
        this.doPasteSimpleAction.connect('activate', () => {
            this._doPaste();
        });
        this.mainApp.add_action(this.doPasteSimpleAction);
        this.mainApp.set_accels_for_action('app.doPaste', ['<Control>V'])

        this.doUndoSimpleAction = Gio.SimpleAction.new('doUndo', null);
        this.doUndoSimpleAction.connect('activate', () => {
            this._doUndo();
        });
        this.mainApp.add_action(this.doUndoSimpleAction);
        this.mainApp.set_accels_for_action('app.doUndo', ['<Control>Z'])

        this.doRedoSimpleAction = Gio.SimpleAction.new('doRedo', null);
        this.doRedoSimpleAction.connect('activate', () => {
            this._doRedo();
        });
        this.mainApp.add_action(this.doRedoSimpleAction);
        this.mainApp.set_accels_for_action('app.doRedo', ['<Control><Shift>Z'])

        let selectAll = Gio.SimpleAction.new('selectAll', null);
        selectAll.connect('activate', () => {
            this._selectAll();
        });
        this.mainApp.add_action(selectAll);
        this.mainApp.set_accels_for_action('app.selectAll', ['<Control>A'])

        let showDesktopInFiles = Gio.SimpleAction.new('showDesktopInFiles', null);
        showDesktopInFiles.connect('activate', this._onOpenDesktopInFilesClicked.bind(this));
        this.mainApp.add_action(showDesktopInFiles);

        let openInTerminal = Gio.SimpleAction.new('openInTerminal', null);
        openInTerminal.connect('activate', this._onOpenTerminalClicked.bind(this));
        this.mainApp.add_action(openInTerminal);

        let changeBackGround = Gio.SimpleAction.new('changeBackGround', null);
        changeBackGround.connect('activate', (action, parameter) => {
            let desktopFile = Gio.DesktopAppInfo.new('gnome-background-panel.desktop');
            const context = Gdk.Display.get_default().get_app_launch_context();
            context.set_timestamp(Gdk.CURRENT_TIME);
            // Fix me, context in the following causes a crash;
            desktopFile.launch([], null);
        });
        this.mainApp.add_action(changeBackGround);

        let changeDisplaySettings = Gio.SimpleAction.new('changeDisplaySettings', null);
        changeDisplaySettings.connect('activate', (action, parameter) => {
            let desktopFile = Gio.DesktopAppInfo.new('gnome-display-panel.desktop');
            const context = Gdk.Display.get_default().get_app_launch_context();
            context.set_timestamp(Gdk.CURRENT_TIME);
            // Fix me, context in the following causes a crash;
            desktopFile.launch([], null);
        });
        this.mainApp.add_action(changeDisplaySettings);

        let changeDesktopIconSettings = Gio.SimpleAction.new('changeDesktopIconSettings', null);
        changeDesktopIconSettings.connect('activate', this._showPreferences.bind(this));
        this.mainApp.add_action(changeDesktopIconSettings);

        let cleanUpIconsAction = Gio.SimpleAction.new('cleanUpIcons', null)
        cleanUpIconsAction.connect('activate', () => this._sortAllFilesFromGridsByPosition());
        this.mainApp.add_action(cleanUpIconsAction);

        let keepArrangedAction = Prefs.desktopSettings.create_action("keep-arranged")
        this.mainApp.add_action(keepArrangedAction);
        Prefs.desktopSettings.bind("keep-arranged", cleanUpIconsAction, "enabled", 16);
        this.mainApp.add_action(Prefs.desktopSettings.create_action("keep-stacked"));
        this.mainApp.add_action(Prefs.desktopSettings.create_action("sort-special-folders"));
        this.mainApp.add_action(Prefs.desktopSettings.create_action("arrangeorder"));

        let findFilesAction = Gio.SimpleAction.new("findFiles", null);
        findFilesAction.connect("activate", () => {
            this.findFiles(null);
        });
        this.mainApp.add_action(findFilesAction);
        this.mainApp.set_accels_for_action('app.findFiles', ['<Control>F']);

        let updateDesktop = Gio.SimpleAction.new("updateDesktop", null);
        updateDesktop.connect('activate', () => {
            this._updateDesktop().catch((e) => {
                print(`Exception while updating Desktop after pressing F5: ${e.message}\n${e.stack}`);
            });
        });
        this.mainApp.add_action(updateDesktop);
        this.mainApp.set_accels_for_action('app.updateDesktop', ['F5']);

        let showHideHiddenFiles = Gio.SimpleAction.new('showHideHiddenFiles', null)
        showHideHiddenFiles.connect('activate', () => {
            Prefs.gtkSettings.set_boolean('show-hidden', !this._showHidden);
        });
        this.mainApp.add_action(showHideHiddenFiles);
        this.mainApp.set_accels_for_action('app.showHideHiddenFiles', ['<Control>H']);

        let unselectAll = Gio.SimpleAction.new('unselectAll', null);
        unselectAll.connect('activate', () => {
            this.unselectAll();
            if (this.searchString) {
                this.searchString = null;
            }
        });
        this.mainApp.add_action(unselectAll);
        this.mainApp.set_accels_for_action('app.unselectAll', ['Escape']);

        let previewAction = Gio.SimpleAction.new('previewAction', null);
        previewAction.connect('activate', () => {
            if (this.popupmenuopen || ! this.activeFileItem) {
                return;
            }
            DBusUtils.RemoteFileOperations.ShowFileRemote(this.activeFileItem.uri, 0, true);
        });
        this.mainApp.add_action(previewAction);
        this.mainApp.set_accels_for_action('app.previewAction', ['space']);

        let chooseIconLeft = Gio.SimpleAction.new('chooseIconLeft', null);
        chooseIconLeft.connect('activate', () => {
            this._selectFileItemInDirection(Gdk.KEY_Left);
        });
        this.mainApp.add_action(chooseIconLeft);
        this.mainApp.set_accels_for_action('app.chooseIconLeft', ['Left']);

        let chooseIconRight = Gio.SimpleAction.new('chooseIconRight', null);
        chooseIconRight.connect('activate', () => {
            this._selectFileItemInDirection(Gdk.KEY_Right);
        });
        this.mainApp.add_action(chooseIconRight);
        this.mainApp.set_accels_for_action('app.chooseIconRight', ['Right']);

        let chooseIconUp = Gio.SimpleAction.new('chooseIconUp', null);
        chooseIconUp.connect('activate', () => {
            this._selectFileItemInDirection(Gdk.KEY_Up);
        });
        this.mainApp.add_action(chooseIconUp);
        this.mainApp.set_accels_for_action('app.chooseIconUp', ['Up']);

        let chooseIconDown = Gio.SimpleAction.new('chooseIconDown', null);
        chooseIconDown.connect('activate', () => {
            this._selectFileItemInDirection(Gdk.KEY_Down);
        });
        this.mainApp.add_action(chooseIconDown);
        this.mainApp.set_accels_for_action('app.chooseIconDown', ['Down']);

        let menuKeyPressed = Gio.SimpleAction.new('menuKeyPressed', null);
        menuKeyPressed.connect('activate', () => {
            this._menuKeyPressed();
        });
        this.mainApp.add_action(menuKeyPressed);
        this.mainApp.set_accels_for_action('app.menuKeyPressed', ['Menu']);
    }

    textEntryAccelsTurnOn() {
        this.mainApp.set_accels_for_action('app.previewAction', ['space']);
        this.mainApp.set_accels_for_action('app.unselectAll', ['Escape']);
        this.mainApp.set_accels_for_action('app.openOneFileAction', ['Return'])
        this.mainApp.set_accels_for_action('app.movetotrash', ['Delete']);
        this.mainApp.set_accels_for_action('app.chooseIconLeft', ['Left']);
        this.mainApp.set_accels_for_action('app.chooseIconRight', ['Right']);
        this.mainApp.set_accels_for_action('app.chooseIconUp', ['Up']);
        this.mainApp.set_accels_for_action('app.chooseIconDown', ['Down']);
        this.mainApp.set_accels_for_action('app.menuKeyPressed', ['Menu']);
    }

    textEntryAccelsTurnOff() {
        this.mainApp.set_accels_for_action('app.previewAction', ['']);
        this.mainApp.set_accels_for_action('app.unselectAll', ['']);
        this.mainApp.set_accels_for_action('app.openOneFileAction', [''])
        this.mainApp.set_accels_for_action('app.movetotrash', ['']);
        this.mainApp.set_accels_for_action('app.chooseIconLeft', ['']);
        this.mainApp.set_accels_for_action('app.chooseIconRight', ['']);
        this.mainApp.set_accels_for_action('app.chooseIconUp', ['']);
        this.mainApp.set_accels_for_action('app.chooseIconDown', ['']);
        this.mainApp.set_accels_for_action('app.menuKeyPressed', ['']);
    }

    _createDesktopBackgroundGioMenu() {

        this.sortingRadioMenu = Gio.Menu.new();
        this.sortingRadioMenu.append(_("Sort by Name"), "app.arrangeorder::NAME");
        this.sortingRadioMenu.append(_("Sort by Name Descending"), "app.arrangeorder::DESCENDINGNAME");
        this.sortingRadioMenu.append(_("Sort by Modified Time"), "app.arrangeorder::MODIFIEDTIME");
        this.sortingRadioMenu.append(_("Sort by Type"), "app.arrangeorder::KIND");
        this.sortingRadioMenu.append(_("Sort by Size"), "app.arrangeorder::SIZE");

        this.sortingSubMenu = Gio.Menu.new();
        this.keepArrangedMenuItem = Gio.MenuItem.new(_("Keep Arranged…"), "app.keep-arranged");
        if (! this.keepStacked) {
            this.sortingSubMenu.append_item(this.keepArrangedMenuItem);
        }
        this.sortingSubMenu.append(_("Keep Stacked by Type…"), "app.keep-stacked");
        this.sortingSubMenu.append(_("Sort Home/Drives/Trash…"), "app.sort-special-folders");
        this.sortingSubMenu.append_section(null, this.sortingRadioMenu);

        this.desktopBackgroundGioMenu = Gio.Menu.new();

        this.desktopBackgroundGioMenu.append(_("New Folder"), "app.doNewFolder");

        let templates = this.templatesMonitor.getGioMenu();
        if ( ! (templates === null)) {
            this.desktopBackgroundGioMenu.append_submenu(_("New Document"), templates);
        }

        this.pasteUndoRedoMenu = Gio.Menu.new();
        this.pasteUndoRedoMenu.append(_("Paste"), "app.doPaste");
        this.pasteUndoRedoMenu.append(_("Undo"), "app.doUndo");
        this.pasteUndoRedoMenu.append(_("Redo"), "app.doRedo");

        this.desktopBackgroundGioMenu.append_section(null, this.pasteUndoRedoMenu);

        this.selectAllMenu = Gio.Menu.new();
        this.selectAllMenu.append(_("Select All"), "app.selectAll");

        this.desktopBackgroundGioMenu.append_section(null, this.selectAllMenu);

        this.sortingMenu = Gio.Menu.new();
        this.cleanUpMenuItem = Gio.MenuItem.new( _("Arrange Icons"), "app.cleanUpIcons");
        if (! this.keepStacked) {
            this.sortingMenu.append_item(this.cleanUpMenuItem);
        }
        this.arrangeSubMenuItem = Gio.MenuItem.new_submenu(_("Arrange By…"), this.sortingSubMenu)
        this.sortingMenu.append_item(this.arrangeSubMenuItem);
        this.desktopBackgroundGioMenu.append_section(null, this.sortingMenu);

        this.desktopTerminalMenu = Gio.Menu.new()
        this.desktopTerminalMenu.append(_("Show Desktop In Files"), "app.showDesktopInFiles");
        this.desktopTerminalMenu.append(_("Open In Terminal"), "app.openInTerminal");

        this.desktopBackgroundGioMenu.append_section(null, this.desktopTerminalMenu);

        this.backgroundMenu = Gio.Menu.new();
        this.backgroundMenu.append(_("Change Background…"), "app.changeBackGround");

        this.desktopBackgroundGioMenu.append_section(null, this.backgroundMenu);

        this.settingsMenu = Gio.Menu.new();
        this.settingsMenu.append(_("Desktop Icon Settings"), "app.changeDesktopIconSettings");
        this.settingsMenu.append(_("Display Settings"), "app.changeDisplaySettings");

        this.desktopBackgroundGioMenu.append_section(null, this.settingsMenu);
    }

    _selectAll() {
        for(let fileItem of this._fileList) {
            if (fileItem.isAllSelectable) {
                fileItem.setSelected();
            }
        }
    }

    _onOpenDesktopInFilesClicked() {
        const context = Gdk.Display.get_default().get_app_launch_context();
        context.set_timestamp(Gdk.CURRENT_TIME);
        // Fix me, context in the following causes a crash;
        Gio.AppInfo.launch_default_for_uri_async(this._desktopDir.get_uri(),
            null, null,
            (source, result) => {
                try {
                    Gio.AppInfo.launch_default_for_uri_finish(result);
                } catch (e) {
                   log('Error opening Desktop in Files: ' + e.message);
                }
            }
        );
    }

    _showPreferences() {
    if (this.preferencesWindow) {
        return;
    }
    this.preferencesWindow = new Gtk.Window({ resizable: false});
    this.preferencesWindow.connect('close-request', () => {this.preferencesWindow = null});
    this.preferencesWindow.set_title(_("Settings"));
    DesktopIconsUtil.windowHidePagerTaskbarModal(this.preferencesWindow, true);
    let frame = Prefs.get_preferencesFrame();
    this.preferencesWindow.set_child(frame);
    this.preferencesWindow.show();
}

    _onOpenTerminalClicked() {
        let desktopPath = this._desktopDir.get_path();
        DesktopIconsUtil.launchTerminal(desktopPath, null);
    }

    _selectFileItemInDirection(symbol) {
        let selection = this.getCurrentSelection(false);
        if (!selection) {
            selection = this._fileList;
        }
        if (!selection) {
            return false;
        }
        let selected = selection[0];
        let selectedCoordinates = selected.getCoordinates();
        this.unselectAll();
        if (selection.length > 1) {
            for (let item of selection) {
                let itemCoordinates = item.getCoordinates();
                if (itemCoordinates[0] > selectedCoordinates[0]) {
                    continue;
                }
                if ((itemCoordinates[0] < selectedCoordinates[0]) ||
                    (itemCoordinates[1] < selectedCoordinates[1])) {
                        selected = item;
                        selectedCoordinates = itemCoordinates;
                        continue;
                }
            }
        }
        switch (symbol) {
        case Gdk.KEY_Left:
            var index = 0;
            var multiplier = -1;
            break;
        case Gdk.KEY_Right:
            var index = 0;
            var multiplier = 1;
            break;
        case Gdk.KEY_Up:
            var index = 1;
            var multiplier = -1;
            break;
        case Gdk.KEY_Down:
            var index = 1;
            var multiplier = 1;
            break;
        }
        let newDistance = null;
        let newItem = null;
        for (let item of this._fileList) {
            let itemCoordinates = item.getCoordinates();
            if ((selectedCoordinates[index] * multiplier) >= (itemCoordinates[index] * multiplier)) {
                continue;
            }
            let distance = Math.pow(selectedCoordinates[0] - itemCoordinates[0], 2) + Math.pow(selectedCoordinates[1] - itemCoordinates[1], 2)
            if ((newDistance === null) || (newDistance > distance)) {
                newDistance = distance;
                newItem = item;
            }
        }
        if (newItem === null) {
            newItem = selected;
        }
        newItem.setSelected();
    }

    _menuKeyPressed() {
        let selection = this.getCurrentSelection(false);
        if (selection) {
            let fileItem = selection[0];
            let X = fileItem.iconRectangle.x + fileItem.iconRectangle.width/2;
            let Y = fileItem.iconRectangle.y + fileItem.iconRectangle.height/2;
            this.fileItemMenu.showMenu(fileItem, 3, 0, 0, X, Y, false, false);
        } else {
            let grid = this._desktops.filter(f => f._coordinatesBelongToThisGrid(this.pointerX, this.pointerY));
            this.onPressButton(null, null, this.pointerX, this.pointerY, 3, false, false, grid[0])
        }
    }

    _doPaste() {
        if (this._clipboardFiles === null) {
            return;
        }

        let desktopDir = this._desktopDir.get_uri();
        if (this._isCut) {
            DBusUtils.RemoteFileOperations.MoveURIsRemote(this._clipboardFiles, desktopDir);
        } else {
            DBusUtils.RemoteFileOperations.CopyURIsRemote(this._clipboardFiles, desktopDir);
        }
    }

    _parseClipboardText(text) {
        if (text === null)
            return [false, false, null];

        let lines = text.split('\n');
        let [mime, action, ...files] = lines;

        if (mime != 'x-special/nautilus-clipboard')
            return [false, false, null];
        if (!(['copy', 'cut'].includes(action)))
            return [false, false, null];
        let isCut = action == 'cut';

        /* Last line is empty due to the split */
        if (files.length <= 1)
            return [false, false, null];
        /* Remove last line */
        files.pop();

        return [true, isCut, files];
    }

    onMotion(X, Y) {
        this.pointerX = X;
        this.pointerY = Y;
        if (this.rubberBand) {
            this.x1 = Math.min(X, this.rubberBandInitX);
            this.x2 = Math.max(X, this.rubberBandInitX);
            this.y1 = Math.min(Y, this.rubberBandInitY);
            this.y2 = Math.max(Y, this.rubberBandInitY);
            this.selectionRectangle = new Gdk.Rectangle({'x':this.x1, 'y':this.y1, 'width':(this.x2-this.x1), 'height':(this.y2-this.y1)});
            for(let grid of this._desktops) {
                grid.queue_draw();
            }
            for(let item of this._fileList) {
                let labelintersect = item.labelRectangle.intersect(this.selectionRectangle)[0];
                let iconintersect = item.iconRectangle.intersect(this.selectionRectangle)[0];
                if (labelintersect || iconintersect) {
                    item.setSelected();
                    item.touchedByRubberband = true;
                } else {
                    if (item.touchedByRubberband) {
                        item.unsetSelected();
                    }
                }
            }
        }
        return false;
    }

    onReleaseButton(grid) {
        if (this.rubberBand) {
            this.rubberBand = false;
            this.selectionRectangle = null;
        }
        for(let grid of this._desktops) {
            grid.queue_draw();
        }
        return false;
    }

    _startRubberband(X, Y) {
        this.rubberBandInitX = X;
        this.rubberBandInitY = Y;
        this.rubberBand = true;
        for(let item of this._fileList) {
            item.touchedByRubberband = false;
        }
    }

    unHighLightDropTarget() {
        this._fileList.forEach(item => item.unHighLightDropTarget());
    }

    selected(fileItem, action) {
        switch(action) {
        case Enums.Selection.ALONE:
            if (!fileItem.isSelected) {
                for(let item of this._fileList) {
                    if (item === fileItem) {
                        item.setSelected();
                    } else {
                        item.unsetSelected();
                    }
                }
            }
            break;
        case Enums.Selection.WITH_SHIFT:
            fileItem.toggleSelected();
            break;
        case Enums.Selection.RIGHT_BUTTON:
            if (!fileItem.isSelected) {
                for(let item of this._fileList) {
                    if (item === fileItem) {
                        item.setSelected();
                    } else {
                        item.unsetSelected();
                    }
                }
            }
            break;
        case Enums.Selection.ENTER:
            if (this.rubberBand) {
                fileItem.setSelected();
            }
            break;
        case Enums.Selection.RELEASE:
            for(let item of this._fileList) {
                if (item === fileItem) {
                    item.setSelected();
                } else {
                    item.unsetSelected();
                }
            }
            break;
        }
    }

    _removeAllFilesFromGrids() {
        for(let fileItem of this._fileList) {
            fileItem.removeFromGrid(true);
        }
        this._fileList = [];
    }

    async _updateDesktop() {
        if (this._readingDesktopFiles) {
            // just notify that the files changed while being read from the disk.
            this._desktopFilesChanged = true;
            if (this._desktopEnumerateCancellable && ! this._forceDraw) {
                this._desktopEnumerateCancellable.cancel();
                this._desktopEnumerateCancellable = null;
            }
            return;
        }

        this._readingDesktopFiles = true;
        this._forceDraw = false;
        this._lastDesktopUpdateRequest = GLib.get_monotonic_time();
        let fileList;
        while(true) {
            this._desktopFilesChanged = false;
            if (! this._desktopDir.query_exists(null)) {
                fileList = [];
                break;
            }
            fileList = await this._doReadAsync();
            if (this._forcedExit) {
                return;
            }
            if (fileList !== null) {
                 if (!this._desktopFilesChanged) {
                     break;
                }
                if (this._forceDraw) {
                    this._drawDesktop(fileList);
                    this._lastDesktopUpdateRequest = GLib.get_monotonic_time();
                }
            }
            await DesktopIconsUtil.waitDelayMs(500);
            if ((GLib.get_monotonic_time() - this._lastDesktopUpdateRequest) > 1000000) {
                this._forceDraw = true;
            } else {
                this._forceDraw = false;
            }
        }
        this._readingDesktopFiles = false;
        this._forceDraw = false;
        this._drawDesktop(fileList);
    }

    _doReadAsync() {
        if (this._desktopEnumerateCancellable) {
            this._desktopEnumerateCancellable.cancel();
        }
        this._desktopEnumerateCancellable = new Gio.Cancellable();
        return new Promise ((resolve, reject) => {
            this._desktopDir.enumerate_children_async(
                Enums.DEFAULT_ATTRIBUTES,
                Gio.FileQueryInfoFlags.NONE,
                GLib.PRIORITY_DEFAULT,
                this._desktopEnumerateCancellable,
                (source, result) => {
                    this._desktopEnumerateCancellable = null;
                    try {
                        let fileEnum = source.enumerate_children_finish(result);
                        if (this._desktopFilesChanged && ! this._forceDraw) {
                            resolve(null);
                            return;
                        }
                        let fileList = [];
                        for (let [newFolder, extras] of DesktopIconsUtil.getExtraFolders()) {
                            try {
                                fileList.push(new FileItem.FileItem(this,
                                                                    newFolder,
                                                                    newFolder.query_info(Enums.DEFAULT_ATTRIBUTES, Gio.FileQueryInfoFlags.NONE, null),
                                                                    extras,
                                                                    null));
                            } catch (e) {
                                print(`Failed with ${e.message} while adding extra folder ${newFolder.get_uri()}\n${e.stack}`);
                            }
                        }
                        let info;
                        while ((info = fileEnum.next_file(null))) {
                            let fileItem = new FileItem.FileItem(this,
                                                                 fileEnum.get_child(info),
                                                                 info,
                                                                 Enums.FileType.NONE,
                                                                 null);
                            if (fileItem.isHidden && !this._showHidden) {
                                /* if there are hidden files in the desktop and the user doesn't want to
                                    show them, remove the coordinates. This ensures that if the user enables
                                    showing them, they won't fight with other icons for the same place
                                */
                                if (fileItem.savedCoordinates) {
                                    // only overwrite them if needed
                                    fileItem.savedCoordinates = null;
                                }
                                continue;
                            }
                            fileList.push(fileItem);
                            if (fileItem.dropCoordinates == null) {
                                let basename = fileItem.file.get_basename();
                                if (basename in this._pendingDropFiles) {
                                    fileItem.dropCoordinates = this._pendingDropFiles[basename];
                                    delete this._pendingDropFiles[basename];
                                }
                            }
                        }
                        for (let [newFolder, extras, volume] of DesktopIconsUtil.getMounts(this._volumeMonitor)) {
                            try {
                                fileList.push(new FileItem.FileItem(this,
                                                                    newFolder,
                                                                    newFolder.query_info(Enums.DEFAULT_ATTRIBUTES, Gio.FileQueryInfoFlags.NONE, null),
                                                                    extras,
                                                                    volume));
                            } catch (e) {
                                print(`Failed with ${e} while adding volume ${newFolder}`);
                            }
                        }
                        resolve(fileList);
                        return;
                    } catch(e) {
                        resolve(null);
                        return;
                    }
                }
            );
        });
    }

    _drawDesktop(fileList) {
        this._selectedFiles = this.getCurrentSelection(true);
        if (this.newItemDoRename || this.fileItemMenu.popupmenuopen || this.activeFileItem) {
            this._refreshMenus(fileList);
        }
        this._removeAllFilesFromGrids();
        this._fileList = fileList;
        this._placeAllFilesOnGrids();
    }

    _refreshMenus(fileList) {
        let activeItem = null;
        let newItemDoRename = false;
        fileList.forEach(f => {
            if (this.activeFileItem && (f.fileName == this.activeFileItem.fileName)) {
                this.fileItemMenu.activeFileItem = this.activeFileItem = activeItem = f;
            }
            if (this.newItemDoRename && (f.fileName == this.newItemDoRename)) {
                newItemDoRename = f.fileName;
            }
        });
        if (this.newItemDoRename) {
            if (! newItemDoRename) {
                if (this._renameWindow) {
                    this._renameWindow.close();
                } else {
                    this.newItemDoRename = null;
                }
            }
        }
        if (this.fileItemMenu.popupmenuopen) {
            if (activeItem) {
                return;
            }
            if (this.activeFileItem.isStackMarker) {
                this.keepStacked = Prefs.desktopSettings.get_boolean('keep-stacked');
                if (this.keepStacked){
                    let attributeExists = fileList.filter(f => f.attributeContentType == this.activeFileItem.attributeContentType);
                    if (attributeExists.length > 1) {
                        return;
                    }
                }
            }
            this.fileItemMenu.popupmenu.popdown();
        }
    }

    _placeAllFilesOnGrids(redisplay=false) {
        this.keepStacked = Prefs.desktopSettings.get_boolean('keep-stacked');
        this.keepArranged = Prefs.desktopSettings.get_boolean('keep-arranged');
        this.sortSpecialFolders = Prefs.desktopSettings.get_boolean('sort-special-folders');
        if (this.keepStacked) {
            this.doStacks(redisplay);
        } else if (this.keepArranged) {
            this.doSorts();
        } else {
            this._addFilesToDesktop(this._fileList, Enums.StoredCoordinates.PRESERVE);
        }
    }

    _addFilesToDesktop(fileList, storeMode) {

        if (this._desktops.length == 0) {
            return;
        }
        let outOfDesktops = [];
        let notAssignedYet = [];
        // First, add those icons that fit in the current desktops
        for(let fileItem of fileList) {
            if (fileItem.savedCoordinates == null) {
                notAssignedYet.push(fileItem);
                continue;
            }
            if (fileItem.dropCoordinates != null) {
                fileItem.dropCoordinates = null;
            }
            let [itemX, itemY] = fileItem.savedCoordinates;
            let addedToDesktop = false;
            for(let desktop of this._desktops) {
                if (desktop.getDistance(itemX, itemY) == 0) {
                    addedToDesktop = true;
                    desktop.addFileItemCloseTo(fileItem, itemX, itemY, storeMode);
                    break;
                }
            }
            if (!addedToDesktop) {
                outOfDesktops.push(fileItem);
            }
        }
        // Now, assign those icons that are outside the current desktops,
        // but have assigned coordinates
        for(let fileItem of outOfDesktops) {
            let minDistance = -1;
            let [itemX, itemY] = fileItem.savedCoordinates;
            let newDesktop = null;
            for (let desktop of this._desktops) {
                let distance = desktop.getDistance(itemX, itemY);
                if (distance == -1) {
                    continue;
                }
                if ((minDistance == -1) || (distance < minDistance)) {
                    minDistance = distance;
                    newDesktop = desktop;
                }
            }
            if (newDesktop == null) {
                print("Not enough space to add icons");
                break;
            } else {
                newDesktop.addFileItemCloseTo(fileItem, itemX, itemY, storeMode);
            }
        }
        // Finally, assign those icons that still don't have coordinates
        for (let fileItem of notAssignedYet) {
            let x, y;
            if (fileItem.dropCoordinates == null) {
                if (this._primaryScreen !== null) {
                    x = this._primaryScreen.x;
                    y = this._primaryScreen.y;
                } else {
                    x = 0;
                    y = 0;
                }
                storeMode = Enums.StoredCoordinates.ASSIGN;
            } else {
                [x, y] = fileItem.dropCoordinates;
                fileItem.dropCoordinates = null;
                storeMode = Enums.StoredCoordinates.OVERWRITE;
            }
            // try first in the designated desktop
            let assigned = false;
            for (let desktop of this._desktops) {
                if (desktop.getDistance(x, y) == 0) {
                    desktop.addFileItemCloseTo(fileItem, x, y, storeMode);
                    assigned = true;
                    break;
                }
            }
            if (assigned) {
                continue;
            }
            // if there is no space in the designated desktop, try in another
            for (let desktop of this._desktops) {
                if (desktop.getDistance(x, y) != -1) {
                    desktop.addFileItemCloseTo(fileItem, x, y, storeMode);
                    break;
                }
            }
        }
    }

    _updateWritableByOthers() {
        let info = this._desktopDir.query_info(Gio.FILE_ATTRIBUTE_UNIX_MODE,
                                               Gio.FileQueryInfoFlags.NONE,
                                               null);
        this.unixMode = info.get_attribute_uint32(Gio.FILE_ATTRIBUTE_UNIX_MODE);
        let writableByOthers = (this.unixMode & Enums.S_IWOTH) != 0;
        if (writableByOthers != this.writableByOthers) {
            this.writableByOthers = writableByOthers;
            if (this.writableByOthers) {
                print(`desktop-icons: Desktop is writable by others - will not allow launching any desktop files`);
            }
            return true;
        } else {
            return false;
        }
    }

    _updateDesktopIfChanged(file, otherFile, eventType) {
        if (eventType == Gio.FileMonitorEvent.CHANGED) {
            // use only CHANGES_DONE_HINT
            return;
        }
        if (!this._showHidden && (file.get_basename()[0] == '.')) {
            // If the file is not visible, we don't need to refresh the desktop
            // Unless it is a hidden file being renamed to visible
            if (!otherFile || (otherFile.get_basename()[0] == '.')) {
                return;
            }
        }
        switch(eventType) {
            case Gio.FileMonitorEvent.MOVED_IN:
            case Gio.FileMonitorEvent.MOVED_CREATED:
                /* Remove the coordinates that could exist to avoid conflicts between
                   files that are already in the desktop and the new one
                 */
                try {
                    let info = new Gio.FileInfo();
                    info.set_attribute_string('metadata::nautilus-icon-position', '');
                    file.set_attributes_from_info(info, Gio.FileQueryInfoFlags.NONE, null);
                } catch (e) {} // can happen if a file is created and deleted very fast
                break;
            case Gio.FileMonitorEvent.ATTRIBUTE_CHANGED:
                /* The desktop is what changed, and not a file inside it */
                if (file.get_uri() == this._desktopDir.get_uri()) {
                    if (this._updateWritableByOthers()) {
                        this._updateDesktop().catch((e) => {
                            print(`Exception while updating Desktop from Directory Monitor Attribute Change: ${e.message}\n${e.stack}`);
                        });
                    }
                    return;
                }
                break;
        }
        this._updateDesktop().catch((e) => {
                print(`Exception while updating Desktop from Directory Monitor: ${e.message}\n${e.stack}`);
        });
    }

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
     * To maintain compatibility, we check the current Gnome Shell version and, based on that, we use the
     * binary or the text clipboards.
     */

    _manageCutCopy(action) {
        let clipboard = Gdk.Display.get_default().get_clipboard();
        let content = "";
        if (this.GnomeShellVersion < 40) {
            content = 'x-special/nautilus-clipboard\n';
        }
        if (action == 'doCut') {
            content += 'cut\n';
        } else {
            content += 'copy\n';
        }

        let first = true;
        if ( ! this.getCurrentSelection(true)) {
            return;
        }
        for (let file of this.getCurrentSelection(true)) {
            if (!first) {
                content += '\n';
            }
            first = false;
            content += file;
        }

        let contentProvider;
        if (this.GnomeShellVersion < 40) {
            contentProvider = Gdk.ContentProvider.new_for_bytes('text/plain', ByteArray.toGBytes(ByteArray.fromString(content)));
        } else {
            contentProvider = Gdk.ContentProvider.new_for_bytes('x-special/gnome-copied-files', ByteArray.toGBytes(ByteArray.fromString(content)));
        }
        clipboard.set_content(contentProvider);
    }

    doCopy() {
        this._manageCutCopy('doCopy');
    }

    doCut() {
        this._manageCutCopy('doCut');
    }

    doTrash() {
        const selection = this._fileList.filter(i => i.isSelected && !i.isSpecial).map(i =>
            i.file.get_uri());

        if (selection.length) {
            DBusUtils.RemoteFileOperations.TrashURIsRemote(selection);
        }
    }

    doDeletePermanently() {
        const toDelete = this._fileList.filter(i => i.isSelected && !i.isSpecial).map(i =>
            i.file.get_uri());

        if (!toDelete.length) {
            if (this._fileList.some(i => i.isSelected && i.isTrash))
                this.doEmptyTrash();
            return;
        }

        DBusUtils.RemoteFileOperations.DeleteURIsRemote(toDelete);
    }

    doEmptyTrash(askConfirmation = true) {
        DBusUtils.RemoteFileOperations.EmptyTrashRemote(askConfirmation);
    }

    checkIfSpecialFilesAreSelected() {
        for(let item of this._fileList) {
            if (item.isSelected && item.isSpecial) {
                return true;
            }
        }
        return false;
    }

    checkIfDirectoryIsSelected() {
        for(let item of this._fileList) {
            if (item.isSelected && item.isDirectory) {
                return true;
            }
        }
        return false;
    }

    getCurrentSelection(getUri) {
        let listToTrash = [];
        for(let fileItem of this._fileList) {
            if (fileItem.isSelected) {
                if (getUri) {
                    listToTrash.push(fileItem.file.get_uri());
                } else {
                    listToTrash.push(fileItem);
                }
            }
        }
        if (listToTrash.length != 0) {
            return listToTrash;
        } else {
            return null;
        }
    }

    getNumberOfSelectedItems() {
        let count = 0;
        for(let item of this._fileList) {
            if (item.isSelected) {
                count++;
            }
        }
        return count;
    }

    doRename(fileItem, allowReturnOnSameName = false) {
        let selection = this.getCurrentSelection(false);
        if (! (selection && (selection.length == 1))) {
            return;
        }
        if (fileItem == null) {
                fileItem = selection[0];
                allowReturnOnSameName = false;
        }
        if (!fileItem.canRename) {
            return;
        }
        if (! this._renameWindow) {
            this.textEntryAccelsTurnOff();
            if (! this.newItemDoRename) {
                this.newItemDoRename = fileItem.fileName;
            }
            this._renameWindow = new AskRenamePopup.AskRenamePopup(fileItem, allowReturnOnSameName, () => {
                this.mainApp.get_active_window().grab_focus();
                this.textEntryAccelsTurnOn();
                this._renameWindow = null;
                this.newItemDoRename = null;
            });
        } else {
            this._renameWindow.popupat(fileItem);
        }
    }

    doNewFolder(position) {
        let X;
        let Y;
        if (position) {
            [X, Y] = position;
        } else {
            [X, Y] = [this._clickX, this._clickY];
        }
        this.unselectAll();
        let i = 0;
        let baseName = _("New Folder");
        let newName = baseName;
        while ( 0 != this._fileList.filter(file => file.fileName == newName).length) {
            i += 1;
            newName = baseName + " " + i;
        }
        if (newName) {
            let dir = DesktopIconsUtil.getDesktopDir().get_child(newName);
            try {
                dir.make_directory(null);
                let info = new Gio.FileInfo();
                info.set_attribute_string('metadata::nautilus-drop-position', `${X},${Y}`);
                info.set_attribute_string('metadata::nautilus-icon-position', '');
                dir.set_attributes_from_info(info, Gio.FileQueryInfoFlags.NONE, null);
                this.newItemDoRename = newName;
                if (position) {
                    return dir.get_uri();
                }
            } catch(e) {
                print(`Failed to create folder ${e.message}`);
            }
        }
    }

    _newDocument(template) {
        let file = Gio.File.new_for_path(template);
        if ((file == null) || (!file.query_exists(null))) {
            return;
        }
        let counter = 0;
        let fullName = file.get_basename();
        let offset = DesktopIconsUtil.getFileExtensionOffset(fullName, false);
        let name = fullName.substring(0, offset);
        let extension = fullName.substring(offset);

        let finalName = `${name}${extension}`;
        let destination;
        do {
            if (counter != 0) {
                finalName = `${name} ${counter}${extension}`
            }
            destination = Gio.File.new_for_path(GLib.build_filenamev([GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_DESKTOP), finalName]));
            counter++;
        } while(destination.query_exists(null));
        try {
            file.copy(destination, Gio.FileCopyFlags.NONE, null, null);
            let info = new Gio.FileInfo();
            info.set_attribute_string('metadata::nautilus-drop-position', `${this._clickX},${this._clickY}`);
            info.set_attribute_string('metadata::nautilus-icon-position', '');
            destination.set_attributes_from_info(info, Gio.FileQueryInfoFlags.NONE, null);
        } catch(e) {
            print(`Failed to create template ${e.message}`);
        }
    }

    onToggleStackUnstackThisTypeClicked(type, typeInList, unstackList) {
        if (!unstackList) {
            unstackList = Prefs.getUnstackList();
            typeInList = unstackList.includes(type);
        }
        if (typeInList) {
            let index = unstackList.indexOf(type);
            unstackList.splice(index, 1);
        } else {
            unstackList.push(type);
        }
        Prefs.setUnstackList(unstackList);
    }

    doStacks(restack) {
        if (restack) {
            for (let fileItem of this._fileList) {
                fileItem.removeFromGrid();
            }
        }
        if (! this.stackInitialCoordinates && ! this._allFileList) {
            this._allFileList = [];
            this._saveStackInitialCoordinates();
            if (this.sortingSubMenu && this.sortingMenu) {
                this.sortingSubMenu.remove(0);
                this.sortingMenu.remove(0);
            }
            restack = false;
        }
        this._sortAllFilesFromGridsByKindStacked(restack);
        this._reassignFilesToDesktop();
    }

    _unstack() {
        if (this.stackInitialCoordinates && this._allFileList) {
            this._fileList.forEach(f => {
                f.removeFromGrid();
                if (f.isStackMarker) {
                    f.onDestroy();
                }
            });
            this._restoreStackInitialCoordinates();
            this._fileList = this._allFileList;
            this._allFileList = null;
            if (this.sortingSubMenu && this.sortingMenu) {
                this.sortingSubMenu.prepend_item(this.keepArrangedMenuItem);
                this.sortingMenu.prepend_item(this.cleanUpMenuItem)
            }
            if (this.keepArranged) {
                this.doSorts();
            } else {
                this._addFilesToDesktop(this._fileList, Enums.StoredCoordinates.PRESERVE);
            }
        }
    }

    _saveStackInitialCoordinates() {
        this.stackInitialCoordinates = [];
        for(let fileItem of this._fileList) {
            this.stackInitialCoordinates.push([fileItem.fileName, fileItem.savedCoordinates]);
        }
    }

    _restoreStackInitialCoordinates() {
        if (this.stackInitialCoordinates && this.stackInitialCoordinates.length != 0) {
            this._allFileList.forEach(fileItem => {
                this.stackInitialCoordinates.forEach(savedItem => {
                    if (savedItem[0] == fileItem.fileName) {
                        fileItem.savedCoordinates = savedItem[1];
                    }
                });
            });
        }
        this.stackInitialCoordinates = null;
    }

    _makeStackTopMarkerFolder(type, list) {
        let stackAttribute = type.split("/")[1];
        let fileItem = new stackItem.stackItem(
            this,
            stackAttribute,
            type,
            Enums.FileType.STACK_TOP,
        );
        list.push(fileItem);
    }

    _sortAllFilesFromGridsByKindStacked(restack) {

        function determineStackTopSizeOrTime() {
            for (let item of otherFiles) {
                if (item.isStackMarker) {
                    for (let unstackitem of stackedFiles) {
                        if(item.attributeContentType == unstackitem.attributeContentType) {
                            item.size = unstackitem.fileSize;
                            item.time = unstackitem.modifiedTime;
                            break;
                        }
                    }
                }
            }
        }

        let specialFiles = [];
        let directoryFiles = [];
        let validDesktopFiles = [];
        let otherFiles = [];
        let stackedFiles = [];
        let newFileList = [];
        let stackTopMarkerFolderList = [];
        let unstackList = Prefs.getUnstackList();
        if (this._allFileList && restack) {
            this._fileList.forEach(f => {
                if (f.isStackMarker) {
                    f.onDestroy();
                }
            });
            this._fileList = this._allFileList;
        }
        this._sortByName(this._fileList);
        for(let fileItem of this._fileList) {
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
                    if (type == item.attributeContentType) {
                        stackedFiles.push(fileItem);
                        stacked = true;
                    }
                }
                if ( ! stacked ) {
                    fileItem.isStackTop = true;
                    otherFiles.push(fileItem);
                }
                continue;
            }
        }
        for (let a of otherFiles) {
            let instack = false;
            for (let c of stackedFiles) {
                if( c.attributeContentType == a.attributeContentType) {
                    instack = true;
                    break;
                }
            }
            if (! instack) {
                a.stackUnique = true;
            }
            continue;
        }
        for (let item of otherFiles) {
            if (! item.stackUnique) {
                this._makeStackTopMarkerFolder(item.attributeContentType, stackTopMarkerFolderList);
                item.isStackTop = false;
                stackedFiles.push(item);
            }
            if (item.stackUnique) {
                stackTopMarkerFolderList.push(item);
            }
            item._updateIcon;
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
        switch (Prefs.getSortOrder()) {
            case Enums.SortOrder.NAME:
                this._sortByName(otherFiles);
                break;
            case Enums.SortOrder.DESCENDINGNAME:
                this._sortByName(otherFiles);
                otherFiles.reverse();
                this._sortByName(stackedFiles);
                stackedFiles.reverse();
                break;
            case Enums.SortOrder.MODIFIEDTIME:
                function byTime(a, b) {
                    return ( a._modifiedTime - b._modifiedTime )
                }
                stackedFiles.sort(byTime);
                determineStackTopSizeOrTime();
                otherFiles.sort(byTime);
                break;
            case Enums.SortOrder.KIND:
                break;
            case Enums.SortOrder.SIZE:
                function bySize(a, b) {
                    return ( a.fileSize - b.fileSize );
                }
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
                if ((unstackList.includes(unstackitem.attributeContentType)) && (unstackitem.attributeContentType == itemtype)) {
                    newFileList.push(unstackitem);
                }
            }
        }
        if (this._allFileList) {
            this._allFileList = this._fileList;
        }
        this._fileList = newFileList;
    }

    _sortByName(fileList) {
        function byName(a, b) {
            //sort by label name instead of the the fileName or displayName so that the "Home" folder is sorted in the correct order
            //alphabetical sort taking into account accent characters & locale, natural language sort for numbers, ie 10.etc before 2.etc
            //other options for locale are best fit, or by specifying directly in function below for translators
            return a._label.get_text().localeCompare(b._label.get_text(), { sensitivity: 'accent' , numeric: 'true', localeMatcher: 'lookup' } );
        }
        fileList.sort(byName);
    }

    _sortByKindByName(fileList) {
        function byKindByName(a, b) {
            return a.attributeContentType.localeCompare(b.attributeContentType) ||
             a._label.get_text().localeCompare(b._label.get_text(), { sensitivity: 'accent' , numeric: 'true', localeMatcher: 'lookup' } );
        }
        fileList.sort(byKindByName);
    }

    _sortAllFilesFromGridsByName(order) {
        this._sortByName(this._fileList)
        if ( order == Enums.SortOrder.DESCENDINGNAME ) {
            this._fileList.reverse();
        }
        this._reassignFilesToDesktop();
    }

    _sortAllFilesFromGridsByPosition() {
        if (this.keepArranged) {
            return;
        }
        this._fileList.map(f => f.removeFromGrid(false));
        let cornerInversion = Prefs.get_start_corner();
        if (!cornerInversion[0] && !cornerInversion[1]) {
            this._fileList.sort((a, b) =>   {   if (a._x1 < b._x1) return -1;
                                                if (a._x1 > b._x1) return 1;
                                                if (a._y1 < b._y1) return -1;
                                                if (a._y1 > b._y1) return 1;
                                                return 0;
                                            });
        }
        if (cornerInversion[0] && cornerInversion[1]) {
            this._fileList.sort((a, b) =>   {   if (a._x1 < b._x1) return 1;
                                                if (a._x1 > b._x1) return -1;
                                                if (a._y1 < b._y1) return 1;
                                                if (a._y1 > b._y1) return -1;
                                                return 0;
                                            });
        }
        if (cornerInversion[0] && !cornerInversion[1]) {
            this._fileList.sort((a, b) =>   {   if (a._x1 < b._x1) return 1;
                                                if (a._x1 > b._x1) return -1;
                                                if (a._y1 < b._y1) return -1;
                                                if (a._y1 > b._y1) return 1;
                                                return 0;
                                            });
        }
        if (!cornerInversion[0] && cornerInversion[1]) {
            this._fileList.sort((a, b) =>   {   if (a._x1 < b._x1) return -1;
                                                if (a._x1 > b._x1) return 1;
                                                if (a._y1 < b._y1) return 1;
                                                if (a._y1 > b._y1) return -1;
                                                return 0;
                                            });
        }
        this._reassignFilesToDesktop();
    }

    _sortAllFilesFromGridsByModifiedTime() {
        function byTime(a, b) {
            return ( a._modifiedTime - b._modifiedTime )
        }
        this._fileList.sort(byTime);
        this._reassignFilesToDesktop();
    }

    _sortAllFilesFromGridsBySize() {
        function bySize(a, b) {
            return ( a.fileSize - b.fileSize );
        }
        this._fileList.sort(bySize);
        this._reassignFilesToDesktop();
    }

    _sortAllFilesFromGridsByKind() {
        let specialFiles = [];
        let directoryFiles = [];
        let validDesktopFiles = [];
        let otherFiles = [];
        let newFileList = [];
        for(let fileItem of this._fileList) {
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
        newFileList.push(...otherFiles)
        if ( this._fileList.length == newFileList.length) {
            this._fileList = newFileList ;
        }
        this._reassignFilesToDesktop();
    }

    _reassignFilesToDesktop() {
        if ( ! this.sortSpecialFolders) {
            this._reassignFilesToDesktopPreserveSpecialFiles();
            return;
        }
        for(let fileItem of this._fileList){
            fileItem.savedCoordinates = null;
            fileItem.dropCoordinates = null;
        }
        this._addFilesToDesktop(this._fileList, Enums.StoredCoordinates.ASSIGN);
    }

    _reassignFilesToDesktopPreserveSpecialFiles() {
        let specialFiles = [];
        let otherFiles = [];
        let newFileList = [];
        for(let fileItem of this._fileList){
            if ( fileItem._isSpecial) {
                specialFiles.push(fileItem);
                continue;
            }
            if (! fileItem._isSpecial) {
                otherFiles.push(fileItem);
                fileItem.savedCoordinates = null;
                fileItem.dropCoordinates = null;
                continue;
            }
        }
        newFileList.push(...specialFiles);
        newFileList.push(...otherFiles);
        if ( this._fileList.length == newFileList.length) {
            this._fileList = newFileList ;
        }
        this._addFilesToDesktop(this._fileList, Enums.StoredCoordinates.PRESERVE);
    }

    doSorts(cleargrids) {
        if (cleargrids) {
            this._fileList.map(f => f.removeFromGrid());
        }
        switch (Prefs.getSortOrder()) {
            case Enums.SortOrder.NAME:
                this._sortAllFilesFromGridsByName();
                break;
            case Enums.SortOrder.DESCENDINGNAME:
                this._sortAllFilesFromGridsByName(Enums.SortOrder.DESCENDINGNAME);
                break;
            case Enums.SortOrder.MODIFIEDTIME:
                this._sortAllFilesFromGridsByModifiedTime();
                break;
            case Enums.SortOrder.KIND:
                this._sortAllFilesFromGridsByKind();
                break;
            case Enums.SortOrder.SIZE:
                this._sortAllFilesFromGridsBySize();
                break;
            default:
                this._addFilesToDesktop(this._fileList, Enums.StoredCoordinates.PRESERVE);
                break;
        }
    }
}
