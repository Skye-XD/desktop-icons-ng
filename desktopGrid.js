/* DING: Desktop Icons New Generation for GNOME Shell
 *
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

const Gtk = imports.gi.Gtk;
const Gdk = imports.gi.Gdk;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
const Prefs = imports.preferences;
const Enums = imports.enums;
const DesktopIconsUtil = imports.desktopIconsUtil;
const Signals = imports.signals;

const Gettext = imports.gettext.domain('ding');

const _ = Gettext.gettext;


var elementSpacing = 2;

var DesktopGrid = class {

    constructor(desktopManager, desktopName, desktopDescription, asDesktop, premultiplied) {
        this._destroying = false;
        this._desktopManager = desktopManager;
        this._desktopName = desktopName;
        this._asDesktop = asDesktop;
        this._premultiplied = premultiplied;
        this._asDesktop = asDesktop;
        this._desktopDescription = desktopDescription;
        this._using_X11 = Gdk.Display.get_default().constructor.$gtype.name === 'GdkX11Display';
        this.updateWindowGeometry();
        this.updateUnscaledHeightWidthMargins();
        this.createGrids();

        this._window = new Gtk.ApplicationWindow({application: desktopManager.mainApp, "title": desktopName});
        this._windowContext = this._window.get_style_context();
        if (this._asDesktop) {
            this._window.set_decorated(false);
            this._window.set_deletable(false);
            // For Wayland Transparent background, but only if this instance is working as desktop
            this._windowContext.add_class("desktopwindow");
            // If we are under X11, Transparent background and everything else from here as well
            if (this._using_X11) {
                let screen = this._window.get_screen();
                let visual = screen.get_rgba_visual();
                if (visual && screen.is_composited()) {
                    this._window.set_visual(visual);
                } else {
                    print('Unable to set Transperancy under X11!');
                }
                this._window.set_type_hint(Gdk.WindowTypeHint.DESKTOP);
                this._window.stick();
                this._window.move(this._x / this._size_divisor, this._y / this._size_divisor);
            } else { // Wayland
                this._window.maximize();
            }
        } else {
            // Opaque black test window
            this._windowContext.add_class("testwindow");
        }
        this._window.set_resizable(false);
        this._window.connect('close-request', () => {
            if (this._destroying) {
                return false;
            }
            if (this._asDesktop) {
                // Do not destroy window when closing if the instance is working as desktop
                return true;
            } else {
                // Exit if this instance is working as an stand-alone window
                return false;
            }
        });

        this.scale = this._window.get_scale_factor();
        this.gridGlobalRectangle = new Gdk.Rectangle({
            'x':this._x + this._marginLeft,
            'y':this._y + this._marginTop,
            'width':(this._width*this.scale) - this._marginLeft - this._marginRight,
            'height':(this._height*this.scale) - this._marginTop - this._marginBottom
        });

        this._container = new Gtk.Fixed();
        this.sizeContainer(this._container);
        this._overlay = new Gtk.Overlay();
        this._overlay.set_child(this._container);
        this._window.set_child(this._overlay);

        this.setDropDestination(this._container);

        this._selectedList = null;

        this.setGridStatus();

        this._window.show();
        this._window.set_size_request(this._windowWidth, this._windowHeight);

        this._drawArea = new Gtk.DrawingArea();
        this._drawArea.set_content_height(this._windowHeight);
        this._drawArea.set_content_width(this._windowWidth);
        this.sizeContainer(this._drawArea);
        this._drawArea.set_draw_func(this._doDrawRubberBand.bind(this));
        this._overlay.add_overlay(this._drawArea);
        this._drawArea.set_can_target(false);

        this._eventKey = Gtk.EventControllerKey.new();
        this._window.add_controller(this._eventKey);
        this._eventMotion = Gtk.EventControllerMotion.new();
        this._eventMotion.set_propagation_phase(Gtk.PropagationPhase.BUBBLE);
        this._container.add_controller(this._eventMotion);
        this._eventKey.connect('key-pressed', (keyval, keycode, state) => {
            this._desktopManager.onKeyPress(keycode, state, this);
        });
        this._eventMotion.connect('motion', (actor, x, y) => {
            let [X, Y] = this._coordinatesLocalToGlobal(x, y);
            this._desktopManager.onMotion(X, Y);
        });
        this._buttonClick = Gtk.GestureClick.new();
        this._buttonClick.set_button(0);
        this._buttonClick.set_propagation_phase(Gtk.PropagationPhase.BUBBLE);
        this._container.add_controller(this._buttonClick);
        this._buttonClick.connect('pressed', (actor, n_press, x, y) => {
            let button = actor.get_current_button();
            let state = this._buttonClick.get_current_event_state();
            let isCtrl = (state & Gdk.ModifierType.CONTROL_MASK) != 0;
            let isShift = (state & Gdk.ModifierType.SHIFT_MASK) != 0;
            let [X, Y] = this._coordinatesLocalToGlobal(x, y);
            let clickItem = this._fileAt(x, y);
            if (clickItem) {
                let clickRectangle = new Gdk.Rectangle({x:x,y:y,width:1,height:1});
                if ((clickRectangle.intersect(clickItem.iconRectangle)[0]) || (clickRectangle.intersect(clickItem.labelRectangle)[0])) {
                    clickItem._onPressButton(actor, X, Y, x, y, isShift, isCtrl);
                    return;
                }
            }
            this._desktopManager.onPressButton(X, Y, x, y, button, isShift, isCtrl, this);
       });
       
       this._buttonClick.connect('released', (actor, n_press, x, y) => {
            let state = this._buttonClick.get_current_event_state();
            let isCtrl = (state & Gdk.ModifierType.CONTROL_MASK) != 0;
            let isShift = (state & Gdk.ModifierType.SHIFT_MASK) != 0;
            let [X, Y] = this._coordinatesLocalToGlobal(x, y);
            let clickItem = this._fileAt(x, y);
            if (clickItem && ! this._desktopManager.rubberBand) {
                let clickRectangle = new Gdk.Rectangle({x:x,y:y,width:1,height:1});
                if ((clickRectangle.intersect(clickItem.iconRectangle)[0]) || (clickRectangle.intersect(clickItem.labelRectangle)[0])) {
                    clickItem._onReleaseButton(actor, X, Y, x, y, isShift, isCtrl);
                    return;
                }
            }
            this._desktopManager.onReleaseButton(this);
       });
    }

    updateGridDescription(desktopDescription) {
        this._desktopDescription = desktopDescription;
    }

    updateWindowGeometry() {
        this._zoom = this._desktopDescription.zoom;
        this._x = this._desktopDescription.x;
        this._y = this._desktopDescription.y;
        this._monitor = this._desktopDescription.monitorIndex;
        this._size_divisor = this._zoom;
        if (this._asDesktop) {
            if (this._using_X11) {
                this._size_divisor = Math.ceil(this._zoom);
            } else {
                if (this._premultiplied) {
                    this._size_divisor = 1;
                }
            }
        }
        this._windowWidth = Math.floor(this._desktopDescription.width / this._size_divisor);
        this._windowHeight = Math.floor(this._desktopDescription.height / this._size_divisor);
    }

    resizeWindow() {
        this.updateWindowGeometry();
        this._desktopName = `@!${this._x},${this._y};BDHF`;
        this._window.set_title(this._desktopName);
        this._window.set_default_size(this._windowWidth, this._windowHeight);
        this._window.set_size_request(this._windowWidth, this._windowHeight);
        this.scale = this._window.get_scale_factor();
        this._drawArea.set_content_height(this._windowHeight);
        this._drawArea.set_content_width(this._windowWidth);
    }

    updateUnscaledHeightWidthMargins() {
        this._marginTop = this._desktopDescription.marginTop;
        this._marginBottom = this._desktopDescription.marginBottom;
        this._marginLeft = this._desktopDescription.marginLeft;
        this._marginRight = this._desktopDescription.marginRight;
        this._width = this._desktopDescription.width - this._marginLeft - this._marginRight;
        this._height = this._desktopDescription.height - this._marginTop - this._marginBottom;
    }

    createGrids() {
        this._width = Math.floor( this._width / this._size_divisor);
        this._height = Math.floor(this._height / this._size_divisor);
        this._marginTop = Math.floor(this._marginTop / this._size_divisor);
        this._marginBottom = Math.floor(this._marginBottom / this._size_divisor);
        this._marginLeft = Math.floor(this._marginLeft / this._size_divisor);
        this._marginRight = Math.floor(this._marginRight / this._size_divisor);
        this._maxColumns = Math.floor(this._width / (Prefs.get_desired_width() + 4 * elementSpacing));
        this._maxRows =  Math.floor(this._height / (Prefs.get_desired_height() + 4 * elementSpacing));
        this._elementWidth = Math.floor(this._width / this._maxColumns);
        this._elementHeight = Math.floor(this._height / this._maxRows);
    }

    updateGridRectangle() {
        this.scale = this._window.get_scale_factor();
        this.gridGlobalRectangle.x = this._x + this._marginLeft;
        this.gridGlobalRectangle.y = this._y + this._marginTop;
        this.gridGlobalRectangle.width = (this._width*this.scale) - this._marginLeft - this._marginRight;
        this.gridGlobalRectangle.height = (this._height*this.scale) - this._marginTop - this._marginBottom;
    }

    sizeContainer(widget) {
        widget.margin_top = this._marginTop;
        widget.margin_bottom = this._marginBottom;
        widget.margin_start = this._marginLeft;
        widget.margin_end = this._marginRight;
    }

    setGridStatus() {
        this._fileItems = {};
        this._gridStatus = {};
        for (let y=0; y<this._maxRows; y++) {
            for (let x=0; x<this._maxColumns; x++) {
                this._setGridUse(x, y, false);
            }
        }
    }

    resizeGrid() {
        this.updateUnscaledHeightWidthMargins();
        this.createGrids();
        this.updateGridRectangle();
        this.sizeContainer(this._container);
        this.sizeContainer(this._drawArea);
        this.setGridStatus();
    }

    destroy() {
        this._destroying = true;
        this._window.destroy();
    }

    setDropDestination(dropDestination) {
        this.gridDropController = new Gtk.DropTargetAsync();
        this.gridDropController.set_actions(Gdk.DragAction.MOVE | Gdk.DragAction.COPY);
        this.dropMimeTypes = ['x-special/ding-icon-list', 'x-special/gnome-icon-list', 'text/uri-list', 'text/plain'];
        let formats = Gdk.ContentFormats.new(this.dropMimeTypes);
        this.gridDropController.set_formats(formats);
        let dropformats;
        let info;
        let selection;
        this.gridDropController.connect('accept', (actor, drop) => {
            if (drop.get_formats().match(formats)) {
                dropformats = drop.get_formats().to_string();
                if (dropformats.includes('x-special/ding-icon-list')) {
                    info = 'dingdrop';
                } else if (dropformats.includes('x-special/gnome-icon-list')) {
                    info = 'gnomeicondrop';
                } else if (dropformats.includes('text/plain')) {
                    info = 'textdrop';
                }
                return true;
            }
        });
        this.gridDropController.connect('drag-enter', (actor, drop, x, y) => {
            return Gdk.DragAction.COPY;
        });
        this.gridDropController.connect('drag-motion', (actor, drop, x, y) => {
            let clickItem = this._fileAt(x, y);
            if (clickItem && ! clickItem.dropCapable()) {
                return false;
            }
            this.receiveMotion(x, y, false);
            return Gdk.DragAction.COPY;
        });
        this.gridDropController.connect('drag-leave', (actor, drop, x, y) => {
            this.receiveLeave();
        });
        this.gridDropController.connect('drop', (actor, drop, x, y) => {
            drop.read_value_async(String.$gtype, GLib.PRIORITY_DEFAULT, null, (dropactor, task) => {
                selection = dropactor.read_value_finish(task);
                drop.finish(Gdk.DragAction.COPY);
                if (selection && info) {
                    let clickItem = this._fileAt(x, y);
                    let clickRectangle = new Gdk.Rectangle({x:x,y:y,width:1,height:1});
                    if (clickItem && ! clickItem._hasToRouteDragToGrid()) {
                        if (this._desktopManager.showDropPlace) {
                            clickItem.recieveDrop(x, y, selection, info);
                        } else if ((clickRectangle.intersect(clickItem.iconRectangle)[0]) || (clickRectangle.intersect(clickItem.labelRectangle)[0])) {
                            clickItem.recieveDrop(x, y, selection, info);
                        }
                    return;
                    }
                    this.receiveDrop(x, y, selection, info);
                }
            });
        });
        this._container.add_controller(this.gridDropController);

        this.gridDropControllerMotion = new Gtk.DropControllerMotion();
        this.gridDropControllerMotion.connect('motion', (actor, x, y) => {
            if ( ! this.gridDropControllerMotion.is_pointer) {
                let clickItem = this._fileAt(x, y);
                if (clickItem.dropCapable()) {
                    clickItem.highLightDropTarget(x, y);
                }
            } else {
                this._desktopManager.unHighLightDropTarget();
            }
        });
        this._container.add_controller(this.gridDropControllerMotion);
    }

    receiveLeave() {
        this._desktopManager.onDragLeave();
    }

    receiveMotion(x, y, global) {
        if (! global) {
            x = this._elementWidth * Math.floor(x / this._elementWidth);
            y = this._elementHeight * Math.floor(y / this._elementHeight);
            [x, y] = this._coordinatesLocalToGlobal(x, y);
        }
        this._desktopManager.onDragMotion(x, y);
    }

    receiveDrop(x, y, selection, info) {
        x = this._elementWidth * Math.floor(x / this._elementWidth);
        y = this._elementHeight * Math.floor(y / this._elementHeight);
        let [X, Y] = this._coordinatesLocalToGlobal(x, y);
        this._desktopManager.onDragDataReceived(X, Y, x, y, selection, info);
        this._window.queue_draw();
    }

    highLightGridAt(x,y) {
        let selected = this.getGridAt(x, y, false);
        this._selectedList = [selected];
        this._window.queue_draw();
    }

    unHighLightGrids() {
        this._selectedList = null;
        this._window.queue_draw();
    }

    _getGridCoordinates(x, y, clamp) {
        let placeX = Math.floor(x / this._elementWidth);
        let placeY = Math.floor(y / this._elementHeight);
        placeX = DesktopIconsUtil.clamp(placeX, 0, this._maxColumns - 1);
        placeY = DesktopIconsUtil.clamp(placeY, 0, this._maxRows - 1);
        return [placeX, placeY];
    }

    gridInUse(x, y) {
        let [placeX, placeY] = this._getGridCoordinates(x, y);
        return !this._isEmptyAt(placeX, placeY);
    }

    getGridLocalCoordinates(x, y) {
        let [column, row] = this._getGridCoordinates(x, y);
        let localX = Math.floor(this._width * column / this._maxColumns);
        let localY = Math.floor(this._height * row / this._maxRows);
        return [localX, localY];
    }

    _fileAt(x,y) {
        let [placeX, placeY] = this._getGridCoordinates(x, y);
        return this._gridStatus[placeY * this._maxColumns + placeX];
    }

    refreshDrag(selectedList, ox, oy) {
        if (selectedList === null) {
            this._selectedList = null;
            this._drawArea.queue_draw();
            return;
        }
        let newSelectedList = [];
        for (let [x, y] of selectedList) {
            x = x + this._elementWidth/2;
            y = y + this._elementHeight/2;
            x += ox;
            y += oy;
            let r = this.getGridAt(x, y);
            if ((r !== null) && ((!this.gridInUse(r[0],r[1])) || this._fileAt(r[0],r[1]).isSelected)) {
                newSelectedList.push(r);
            }
        }
        if (newSelectedList.length == 0) {
            if (this._selectedList !== null) {
                this._selectedList = null;
                this._drawArea.queue_draw();
            }
            return;
        }
        if (this._selectedList !== null) {
            if ((newSelectedList[0][0] == this._selectedList[0][0]) && (newSelectedList[0][1] == this._selectedList[0][1])) {
                return;
            }
        }
        this._selectedList = newSelectedList;
        this._drawArea.queue_draw();
    }

    queue_draw() {
        this._drawArea.queue_draw();
    }

    _doDrawRubberBand(actor, cr, width, height) {
        if (this._desktopManager.rubberBand && this._desktopManager.selectionRectangle) {
            if (! this.gridGlobalRectangle.intersect(this._desktopManager.selectionRectangle)[0]) {
                return;
            }
            let [xInit, yInit] = this._coordinatesGlobalToLocal(this._desktopManager.x1, this._desktopManager.y1);
            let [xFin, yFin] = this._coordinatesGlobalToLocal(this._desktopManager.x2, this._desktopManager.y2);

            cr.rectangle(xInit + 0.5, yInit + 0.5, xFin - xInit, yFin - yInit);
            Gdk.cairo_set_source_rgba(cr, new Gdk.RGBA({red: this._desktopManager.selectColor.red,
                                                        green: this._desktopManager.selectColor.green,
                                                        blue: this._desktopManager.selectColor.blue,
                                                        alpha: 0.6})
            );
            cr.fill();
            cr.setLineWidth(1);
            cr.rectangle(xInit + 0.5, yInit + 0.5, xFin - xInit, yFin - yInit);
            Gdk.cairo_set_source_rgba(cr, new Gdk.RGBA({red: this._desktopManager.selectColor.red,
                                                        green: this._desktopManager.selectColor.green,
                                                        blue: this._desktopManager.selectColor.blue,
                                                        alpha: 1.0})
            );
            cr.stroke();
        }
        if (this._desktopManager.showDropPlace && (this._selectedList !== null)) {
            for(let [x, y] of this._selectedList) {
                cr.rectangle(x + 0.5, y + 0.5, this._elementWidth, this._elementHeight);
                Gdk.cairo_set_source_rgba(cr, new Gdk.RGBA({red: 1.0 - this._desktopManager.selectColor.red,
                                                            green: 1.0 - this._desktopManager.selectColor.green,
                                                            blue: 1.0 - this._desktopManager.selectColor.blue,
                                                            alpha: 0.4})
                );
                cr.fill();
                cr.setLineWidth(0.5);
                cr.rectangle(x + 0.5, y + 0.5, this._elementWidth, this._elementHeight);
                Gdk.cairo_set_source_rgba(cr, new Gdk.RGBA({red: 1.0 - this._desktopManager.selectColor.red,
                                                            green: 1.0 - this._desktopManager.selectColor.green,
                                                            blue: 1.0 - this._desktopManager.selectColor.blue,
                                                            alpha: 1.0})
                );
                cr.stroke();
            }
        }
    }

    getDistance(x, y) {
        /**
         * Checks if these coordinates belong to this grid.
         *
         * @Returns: -1 if there is no free space for new icons;
         *            0 if the coordinates are inside this grid;
         *            or the distance to the middle point, if none of the previous
         */

         let isFree = false;
         for (let element in this._gridStatus) {
             if (!this._gridStatus[element]) {
                 isFree = true;
                 break;
             }
         }
         if (!isFree) {
             return -1;
         }
         if (this._coordinatesBelongToThisGrid(x, y)) {
             return 0;
         }
         return Math.pow(x - (this._x + this._width * this._zoom / 2), 2) + Math.pow(x - (this._y + this._height * this._zoom / 2), 2);
    }

    _coordinatesGlobalToLocal(x, y) {
        if (! this._asDesktop && ! this._using_X11) {
            let offset = this._window.get_allocated_height() - this._container.get_allocated_height();
            y = y - offset;
        }
        x = DesktopIconsUtil.clamp(Math.floor((x - this._x) / this._zoom), 0, this._width - 1);
        y = DesktopIconsUtil.clamp(Math.floor((y - this._y) / this._zoom), 0, this._height - 1);
        x = x + this._marginLeft;
        y = y + this._marginRight;
        return [x, y];
    }

    _coordinatesLocalToGlobal(x, y) {
        let a = x - this._marginLeft;
        let b = y - this._marginTop;
        let [X, Y] = [a * this._zoom + this._x, b * this._zoom + this._y];
        if (! this._asDesktop && ! this._using_X11) {
            let offset = this._window.get_allocated_height() - this._container.get_allocated_height();
            Y = Y + offset;
        }
        return [X, Y];
    }

    _addFileItemTo(fileItem, column, row, coordinatesAction) {

        if (this._destroying) {
            return;
        }
        let localX = Math.floor(this._width * column / this._maxColumns);
        let localY = Math.floor(this._height * row / this._maxRows);
        this._container.put(fileItem.container, localX + elementSpacing, localY + elementSpacing);
        this._setGridUse(column, row, fileItem);
        this._fileItems[fileItem.uri] = [column, row, fileItem];
        let [x, y] = this._coordinatesLocalToGlobal(localX + elementSpacing, localY + elementSpacing);
        fileItem.setCoordinates(x,
                                y,
                                this._elementWidth - 2 * elementSpacing,
                                this._elementHeight - 2 * elementSpacing,
                                elementSpacing,
                                this._zoom,
                                this);
        /* If this file is new in the Desktop and hasn't yet
         * fixed coordinates, store the new possition to ensure
         * that the next time it will be shown in the same possition.
         * Also store the new possition if it has been moved by the user,
         * and not triggered by a screen change.
         */
        if ((fileItem.savedCoordinates == null) || (coordinatesAction == Enums.StoredCoordinates.OVERWRITE)) {
            fileItem.savedCoordinates = [x, y];
        }
    }

    removeItem(fileItem) {
        if (fileItem.uri in this._fileItems) {
            let [column, row, tmp] = this._fileItems[fileItem.uri];
            this._setGridUse(column, row, false);
            this._container.remove(fileItem.container);
            delete this._fileItems[fileItem.uri];
        }
    }

    addFileItemCloseTo(fileItem, x, y, coordinatesAction) {
        let add_volumes_opposite = Prefs.desktopSettings.get_boolean('add-volumes-opposite');
        let [column, row] = this._getEmptyPlaceClosestTo(x,
                                                         y,
                                                         coordinatesAction,
                                                         fileItem.isDrive && add_volumes_opposite);
        this._addFileItemTo(fileItem, column, row, coordinatesAction);
    }

    _isEmptyAt(x,y) {
        return (this._gridStatus[y * this._maxColumns + x] === false);
    }

    _setGridUse(x, y, inUse) {
        this._gridStatus[y * this._maxColumns + x] = inUse;
    }

    getGridAt(x, y, globalCoordinates=false) {
        if (this._coordinatesBelongToThisGrid(x, y)) {
            [x, y] = this._coordinatesGlobalToLocal(x, y);
            if (globalCoordinates) {
                x = this._elementWidth * Math.floor((x / this._elementWidth) + 0.5);
                y = this._elementHeight * Math.floor((y / this._elementHeight) + 0.5);
                [x, y] = this._coordinatesLocalToGlobal(x, y);
                return [x, y];
            } else {
                return this.getGridLocalCoordinates(x, y);
            }
        } else {
            return null;
        }
    }

    _coordinatesBelongToThisGrid(x, y) {
        return ((x >= this._x) && (x < (this._x + this._width * this._zoom)) && (y >= this._y) && (y < (this._y + this._height * this._zoom)));
    }

    _getEmptyPlaceClosestTo(x, y, coordinatesAction, reverseHorizontal) {

        [x, y] = this._coordinatesGlobalToLocal(x, y);
        let placeX = Math.floor(x / this._elementWidth);
        let placeY = Math.floor(y / this._elementHeight);

        let cornerInversion = Prefs.get_start_corner();
        if (reverseHorizontal) {
            cornerInversion[0] = !cornerInversion[0];
        }

        placeX = DesktopIconsUtil.clamp(placeX, 0, this._maxColumns - 1);
        placeY = DesktopIconsUtil.clamp(placeY, 0, this._maxRows - 1);
        if (this._isEmptyAt(placeX, placeY) && (coordinatesAction != Enums.StoredCoordinates.ASSIGN)) {
            return [placeX, placeY];
        }
        let found = false;
        let resColumn = null;
        let resRow = null;
        let minDistance = Infinity;
        let column, row;
        for (let tmp_column = 0; tmp_column < this._maxColumns; tmp_column++) {
            if (cornerInversion[0]) {
                column = this._maxColumns - tmp_column - 1;
            } else {
                column = tmp_column;
            }
            for (let tmp_row = 0; tmp_row < this._maxRows; tmp_row++) {
                if (cornerInversion[1]) {
                    row = this._maxRows - tmp_row - 1;
                } else {
                    row = tmp_row;
                }
                if (!this._isEmptyAt(column, row)) {
                    continue;
                }

                let proposedX = column * this._elementWidth;
                let proposedY = row * this._elementHeight;
                if (coordinatesAction == Enums.StoredCoordinates.ASSIGN)
                    return [column, row];
                let distance = DesktopIconsUtil.distanceBetweenPoints(proposedX, proposedY, x, y);
                if (distance < minDistance) {
                    found = true;
                    minDistance = distance;
                    resColumn = column;
                    resRow = row;
                }
            }
        }

        if (!found) {
            throw new Error(`Not enough place at monitor`);
        }

        return [resColumn, resRow];
    }
};
