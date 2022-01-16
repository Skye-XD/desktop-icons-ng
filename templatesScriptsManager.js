/* DING: Desktop Icons New Generation for GNOME Shell
 *
 * Copyright (C) 2020 Sergio Costas (rastersoft@gmail.com)
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

const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Enums = imports.enums;

var TemplatesScriptsManager = class {

    constructor(baseFolder, callback, selectionfilter, mainApp, appname) {
        this._callback = callback;
        this._selectionFilter = selectionfilter;
        this._mainApp = mainApp;
        this._entries = [];
        this._entriesEnumerateCancellable = null;
        this._readingEntries = false;
        this._entriesDir = baseFolder;
        this._entriesDirMonitors = [];
        this._entriesFolderChanged = false;
        this.gioMenu = null;
        this.scriptManagerActionName = appname;
        this.menuSimpleAction = Gio.SimpleAction.new(`${this.scriptManagerActionName}`, GLib.VariantType.new("s"));
        this.menuSimpleAction.connect("activate", (action,parameter) => this._callback(parameter.recursiveUnpack()));
        this._mainApp.add_action(this.menuSimpleAction);

        if (this._entriesDir == GLib.get_home_dir()) {
            this._entriesDir = null;
        }
        if (this._entriesDir !== null) {
            this._monitorDir = baseFolder.monitor_directory(Gio.FileMonitorFlags.WATCH_MOVES, null);
            this._monitorDir.set_rate_limit(1000);
            this._monitorDir.connect('changed', (obj, file, otherFile, eventType) => {
                this.updateEntries().catch((e) => {
                    print(`Exception while updating entries in monitor: ${e.message}\n${e.stack}`);
                });
            });
            this.updateEntries().catch((e) => {
                print(`Exception while updating entries: ${e.message}\n${e.stack}`);
            });
        }
    }

    async updateEntries() {
        if (this._readingEntries) {
            this._entriesFolderChanged = true;
            if (this._entriesEnumerateCancellable) {
                this._entriesEnumerateCancellable.cancel();
                this._entriesEnumerateCancellable = null;
            }
            return;
        }

        this._readingEntries = true;
        let entriesList = null;

        do {
            this._entriesDirMonitors.map(f => {
                f[0].disconnect(f[1]);
                f[0].cancel();
            });
            this._entriesDirMonitors = [];
            this._entriesFolderChanged = false;
            if (! this._entriesDir.query_exists(null)) {
                entriesList = null;
                break;
            }
            entriesList = await this._processDirectory(this._entriesDir);
        } while ((entriesList === null) || this._entriesFolderChanged);

        [this._entries, this.gioMenu] = (entriesList !== null) ? entriesList : [null, null];
        this._readingEntries = false;
    }

    async _processDirectory(directory) {
        try {
            var files = await this._readDirectory(directory);
        } catch(e) {
            return null;
        }
        if (files === null) {
            return null;
        }
        let output = [];
        let menu = new Gio.Menu;
        let menuhasentries = false;
        for (let file of files) {
            let menuItemName = file[0].get_name();
            let menuItemPath = file[1].get_path();
            if (file[2] === null) {
                output.push(file);
                menuItemName = this._selectionFilter(file[0]);
                if (menuItemName) {
                    let menuItem = Gio.MenuItem.new(`${menuItemName}`, null);
                    menuItem.set_action_and_target_value(`app.${this.scriptManagerActionName}`, GLib.Variant.new('s', `${menuItemPath}`));
                    menu.append_item(menuItem);
                    menuhasentries = true;
                }
                continue;
            }
            let monitorDir = file[1].monitor_directory(Gio.FileMonitorFlags.WATCH_MOVES, null);
            monitorDir.set_rate_limit(1000);
            let monitorId = monitorDir.connect('changed', (obj, file, otherFile, eventType) => { this.updateEntries(); });
            this._entriesDirMonitors.push([monitorDir, monitorId]);
            let submenu;
            let subentriesList;
            subentriesList = await this._processDirectory(file[1]);
            if (subentriesList === null) {
                return null;
            }
            [file[2], submenu] = subentriesList;
            if (file[2].length != 0) {
                output.push(file);
            }
            if (submenu) {
                let menuItem = Gio.MenuItem.new_submenu(`${menuItemName}`, submenu);
                menu.append_item(menuItem);
                menuhasentries = true;
            }
        }
        if (! menuhasentries) {
            menu = null;
        }
        return [output, menu];
    }

    _readDirectory(directory) {
        return new Promise((resolve, reject) => {
            if (this._entriesEnumerateCancellable) {
                this._entriesEnumerateCancellable.cancel();
            }
            this._entriesEnumerateCancellable = new Gio.Cancellable();
            directory.enumerate_children_async(
                Enums.DEFAULT_ATTRIBUTES,
                Gio.FileQueryInfoFlags.NONE,
                GLib.PRIORITY_DEFAULT,
                this._entriesEnumerateCancellable,
                (source, result) => {
                    this._entriesEnumerateCancellable = null;
                    let fileList = [];
                    try {
                        let fileEnum = source.enumerate_children_finish(result);
                        if (this._entriesFolderChanged) {
                            resolve(null);
                            return;
                        }
                        let info;
                        while ((info = fileEnum.next_file(null))) {
                            let isDir = (info.get_file_type() == Gio.FileType.DIRECTORY);
                            fileList.push([info, fileEnum.get_child(info), isDir ? [] : null]);
                        }
                    } catch(e) {
                        if (e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED)) {
                            resolve(null);
                        } else {
                            reject('file-read-error');
                        }
                        return;
                    }
                    fileList.sort((a,b) => {
                        return a[0].get_name().localeCompare(b[0].get_name(), {
                            sensitivity: 'accent' ,
                            numeric: 'true',
                            localeMatcher: 'lookup' });
                    });
                    resolve(fileList);
                }
            );
        });
    }

    getGioMenu() {
        return this.gioMenu;
    }
}
