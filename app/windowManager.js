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
import {
    DesktopGrid
} from '../dependencies/localFiles.js';

import {Gio, GLib} from '../dependencies/gi.js';

export {WindowManager};

const WindowManager = class {
    constructor(desktopManager, desktopList, asDesktop, primaryIndex) {
        this._desktopManager = desktopManager;
        this.mainApp = desktopManager.mainApp;
        this._desktopList = desktopList;
        this._primaryIndex = primaryIndex;
        if (primaryIndex < desktopList.length)
            this._primaryScreen = desktopList[primaryIndex];
        else
            this._primaryScreen = null;
        this._priorDesktopList = [];
        this._desktops = [];
        this._asDesktop = asDesktop;
        this._zoom = 1;
        this._primaryIndex = null;
        this._primaryMonitorIndex = null;
        this._priorPrimaryIndex = null;
        this._priorPrimaryMonitorIndex = null;
        this._primaryScreen = null;
        this._differentZooms = false;
    }

    requestGeometryUpdate() {
        let variant = new GLib.Variant('(sb)', ['updategeometry', true]);
        const busObjectPath = this.mainApp.get_dbus_object_path();
        const busName = this.mainApp.get_application_id();
        const connection = Gio.DBus.session;
        const signalName = 'updategeometry';
        connection.emit_signal(
            null,
            busObjectPath,
            busName,
            signalName,
            variant
        );
    }

    updateGridWindows(newdesktoplist) {
        this._priorDesktopList = this._desktopList;
        this._desktopList = newdesktoplist;

        this._priorPrimaryIndex = this._primaryIndex ?? null;
        let newPrimaryIndex;

        if ((newdesktoplist.length > 0) &&
            ('primaryMonitor' in newdesktoplist[0]))
            newPrimaryIndex = newdesktoplist[0].primaryMonitor ?? null;

        if (newPrimaryIndex !== this._priorPrimaryIndex)
            this._primaryIndex = newPrimaryIndex;

        this._priorPrimaryMonitorIndex = this._primaryMonitorIndex ?? 0;

        // Find the new primary monitor
        this._primaryScreen = this._desktopList[this._primaryIndex] ?? null;
        this._primaryMonitorIndex = this._primaryScreen.monitorIndex ?? null;

        const indexChanged = this._priorPrimaryMonitorIndex !==
            this._primaryMonitorIndex;

        // See if there are different zooms in the desktops
        this._differentZooms = this._desktopList.some((d, index) => {
            const nextd = this._desktopList[index + 1];
            if (nextd != null)
                return d.zoom !== nextd.zoom;
            return false;
        });

        // Allow initial startup if no desktops defined on initiation
        // or if any new monitors plugged in or removed
        // by creating new desktops
        if (this._priorDesktopList.some(d =>
            typeof d !== 'object' || d == null) ||
            this._priorDesktopList.length !== this._desktopList.length) {
            // First desktop list is created from a null list or a
            // monitor has been plugged in or removed.
            this._desktopManager._fileList.forEach(x => x.removeFromGrid());
            this.createGridWindows();
            this._desktopManager._performSanityChecks();

            // If valid fileList is available, no change in fileList
            // recompute postion of all icons for new geometry
            this._desktopManager_placeAllFilesOnGrids({
                redisplay: true,
                monitorschanged: true,
                gridschanged: true,
            });
            return;
        }

        // if no change in monitors, check if any change in monitor geometry
        // or if any change in grid geometry

        const monitorschangedList = [];
        const gridschangedList = [];

        this._desktopList.forEach((area, index) => {
            const area2 = this._priorDesktopList[index];
            if ((area.x !== area2.x) ||
                (area.y !== area2.y) ||
                (area.width !== area2.width) ||
                (area.height !== area2.height) ||
                (area.zoom !== area2.zoom) ||
                (area.monitorIndex !== area2.monitorIndex)) {
                monitorschangedList.push(index);
                gridschangedList.push(index);
                return;
            }
            if ((area.marginTop !== area2.marginTop) ||
                (area.marginBottom !== area2.marginBottom) ||
                (area.marginLeft !== area2.marginLeft) ||
                (area.marginRight !== area2.marginRight)) {
                if (!gridschangedList.includes(index))
                    gridschangedList.push(index);
            }
        });

        // indexchanged implies monitors have changed
        // monitors changed or index changed implies grids have changed
        // as there may be other actors on the new monitor edge
        const monitorschanged = !!monitorschangedList.length || indexChanged;

        // only the grids have changed, no monitor changes
        const gridschanged = gridschangedList.length
            ? gridschangedList.some(i => !monitorschangedList.includes(i))
            : false;

        // redisplay is needed for sorting and stacking. Icons
        // need to be redisplayed if anything changes - the actual fileList
        // has not changed
        const redisplay = monitorschanged || gridschanged;

        if (gridschanged || redisplay) {
            this._desktopManager._fileList.forEach(x => x.removeFromGrid());
            this._desktops.forEach((desktop, index) => {
                desktop.updateGridDescription(this._desktopList[index]);
                if (monitorschangedList.includes(index)) {
                    desktop.resizeWindow();
                    desktop.resizeGrid();
                } else if (gridschangedList.includes(index)) {
                    desktop.resizeGrid();
                }
            });
            // There is a subtle difference here, all information is needed
            //
            // gridschanged implies prior grid information is available.
            // Therefore write mode is 'PRESERVE', recomputed coordintes are not
            // rewritten to disk, and icons can jump back to the prior 'snap to grid'
            // postion when grid and margins change again - albeight by only small
            // relative margin changes :), ie with small dock size or top bar changes,
            // big changes will still make icons jump snap grid postion row/column.
            //
            // FIX ME- in future, as we use relative normalized coordingates,
            // it may be better to write and save the new coordinates.
            //
            // monitors changed implies that all coordintes are rewritten to the
            // new monitor relative coordinates with a write mode of 'OVERWRITE'
            //
            // redisplay re-arranges all the icons on the new desktop monitor,
            // essential for proper sorting/stacking of icons and arranging of icons
            // For keep arranged new coordinates are automatically written to
            // grid. However for stacked co-ordinates- we will neeed to redo the
            // old coordinates seperately in do stacks with nonitorschanged info
            this._desktopManager._performSanityChecks();
            this._desktopManager._placeAllFilesOnGrids({redisplay, monitorschanged, gridschanged});
        }
    }

    createGridWindows() {
        // Allow startup with no desktops from desktopmanager constructor
        // even if no desktops are defined.
        // desktops can be defined later from updateGridWindows(), dbus
        // activation
        if (!this._desktopList.length ||
            this._desktopList.some(d => typeof d !== 'object' || d == null))
            return;

        this._desktops.forEach(desktop => desktop.destroy());
        this._desktops = [];

        this._desktopList.forEach((desktop, desktopIndex) => {
            const desktopName =
                this._asDesktop
                    ? `@!${desktop.x},${desktop.y};BDHF`
                    : `DING ${desktopIndex}`;

            this._desktops.push(
                new DesktopGrid.DesktopGrid(
                    this._desktopManager,
                    desktopName,
                    desktop,
                    this._asDesktop
                )
            );
        });

        if (this._desktopManager.windowsPromiseResolve)
            this._desktopManager.windowsPromiseResolve(true);
    }

    get desktops() {
        return this._desktops;
    }

    get desktopList() {
        return this._desktopList;
    }

    get primaryMonitorIndex() {
        return this._primaryMonitorIndex;
    }

    get primaryMonitor() {
        return this._primaryScreen;
    }

    get primaryIndex() {
        return this._primaryIndex;
    }

    get priorDesktopList() {
        return this._priorDesktopList;
    }

    get priorPrimaryMonitorIndex() {
        return this._priorPrimaryMonitorIndex;
    }

    get differentZooms() {
        return this._differentZooms;
    }
};
