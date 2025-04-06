/* DING: Desktop Icons New Generation for GNOME Shell
 *
 * Adw/Gtk4 Port Copyright (C) 2025 Sundeep Mediratta (smedius@gmail.com)
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

export {DragManager};

const DragManager = class {
    constructor(desktopManager, Data) {
        this.DesktopManager = desktopManager;
        this.FileUtils = Data.FileUtils;
        this.DesktopIconsUtil = Data.DesktopIconsUtil;
        this.DBusUtils = Data.DBusUtils;
        this._dragging = false;
        this._draggingItem = null;
        this._draggingItemData = null;
        this._draggingItemData2 = null;
        this._draggingItemData3 = null;
        this._draggingItemData4 = null;
        this._draggingItemData5 = null;
    }
}