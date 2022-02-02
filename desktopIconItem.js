
/* DING: Desktop Icons New Generation for GNOME Shell
 *
 * Copyright (C) 2021 Sundeep Mediratta (smedius@gmail.com)
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

const GObject = imports.gi.GObject;
const Gtk = imports.gi.Gtk;
const Gdk = imports.gi.Gdk;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Pango = imports.gi.Pango;
const GdkPixbuf = imports.gi.GdkPixbuf;
const Cairo = imports.gi.cairo;
const DesktopIconsUtil = imports.desktopIconsUtil;

const Prefs = imports.preferences;
const Enums = imports.enums;
const DBusUtils = imports.dbusUtils;

const ByteArray = imports.byteArray;
const Signals = imports.signals;
const Gettext = imports.gettext.domain('ding');

const _ = Gettext.gettext;

var desktopIconItem = class desktopIconItem {

    constructor(desktopManager, fileExtra) {
        this._desktopManager = desktopManager;
        this._fileExtra = fileExtra;
        this._loadThumbnailDataCancellable = null;
        this._queryFileInfoCancellable = null;
        this._grid = null;
        this._lastClickTime = 0;
        this._lastClickButton = 0;
        this._clickCount = 0;
        this._isSelected = false;
        this._isSpecial = false;
        this._primaryButtonPressed = false;
        this._savedCoordinates = null;
        this._dropCoordinates = null;
        this._destroyed = false;
    }

    /***********************
     * Destroyers *
     ***********************/

    removeFromGrid(callOnDestroy) {
        if (this._grid) {
            this._grid.removeItem(this);
            this._grid = null;
        }
        if (callOnDestroy) {
            this._onDestroy();
        }
    }

    _destroy() {
        /* Regular file data */
        if (this._queryFileInfoCancellable) {
            this._queryFileInfoCancellable.cancel();
        }

        /* Thumbnailing */
        if (this._loadThumbnailDataCancellable) {
            this._loadThumbnailDataCancellable.cancel();
        }
        /* Container */
        if (this._containerId) {
            this.container.disconnect(this._containerId);
            this._containerId = 0;
        }
        /* DragItem */
        if (this.dragIconSignal) {
            this.dragIcon.disconnect(this.dragIconSignal);
        }
    }

    _onDestroy() {
        this._destroy();
        this._destroyed = true;
    }

    /***********************
     * Creators *
     ***********************/

    _createIconActor() {
        this.container = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL, halign: Gtk.Align.CENTER});
        this._containerId = this.container.connect('destroy', () => this._onDestroy());

        this._icon = new Gtk.Picture();
        this._icon.set_can_shrink(true);
        this._icon.set_keep_aspect_ratio(true);
        this._iconContainer = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL});
        this._iconContainer.append(this._icon);
        this._iconContainer.set_baseline_position(Gtk.BaselinePosition.CENTER);

        this._label = new Gtk.Label();
        this._labelContainer = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL, halign: Gtk.Align.CENTER});
        let labelStyleContext = this._label.get_style_context();
        if (this._desktopManager.darkText) {
            labelStyleContext.add_class('file-label-dark');
        } else {
            labelStyleContext.add_class('file-label');
        }
        this._label.set_ellipsize(Pango.EllipsizeMode.END);
        this._label.set_wrap(true);
        this._label.set_wrap_mode(Pango.WrapMode.WORD_CHAR);
        this._label.set_yalign(0.0);
        this._label.set_justify(Gtk.Justification.CENTER);
        this._label.set_lines(2);
        this._labelContainer.append(this._label);

        this.container.set_spacing(2);
        this.container.append(this._iconContainer);
        this.container.append(this._labelContainer);

        this._styleContext = this._iconContainer.get_style_context();
        this._labelStyleContext = this._labelContainer.get_style_context();
        this._styleContext.add_class('file-item');
        this._labelStyleContext.add_class('file-item');

        this.iconRectangle = new Gdk.Rectangle();
        this.labelRectangle = new Gdk.Rectangle();

        this._iconEventController = Gtk.EventControllerMotion.new();
        this._iconEventController.set_propagation_phase(Gtk.PropagationPhase.TARGET);
        this._iconEventController.connect('enter', (actor, x, y) => this._onEnter(actor, x, y));
        this._iconEventController.connect('leave', (actor) => this._onLeave(actor));
        this._iconContainer.add_controller(this._iconEventController);

        this._labelEventController = Gtk.EventControllerMotion.new();
        this._labelEventController.set_propagation_phase(Gtk.PropagationPhase.TARGET);
        this._labelEventController.connect('enter', (actor, x, y) => this._onEnter(actor, x, y));
        this._labelEventController.connect('leave', (actor) => this._onLeave(actor));
        this._labelContainer.add_controller(this._labelEventController);

        this.dragIcon = Gtk.WidgetPaintable.new(this.container);
        this.dragIconSignal = this.dragIcon.connect('invalidate-size', () => {
            this._calculateIconRectangle();
            this._calculateLabelRectangle();
        });

        this.container.show();
    }

    _calculateIconRectangle() {
        this.iconwidth = this._iconContainer.get_allocated_width();
        this.iconheight = this._iconContainer.get_allocated_height();
        let x = this._x1 + ((this.width - this.iconwidth)/2)*this._zoom;
        let y = this._y1 + 2;
        this.iconRectangle.x = x;
        this.iconRectangle.y = y;
        this.iconRectangle.width = this.iconwidth*this._zoom;
        this.iconRectangle.height = this.iconheight*this._zoom;
    }

    _calculateLabelRectangle() {
        this.labelwidth = this._labelContainer.get_allocated_width();
        this.labelheight = this._labelContainer.get_allocated_height();
        let x = this._x1 + ((this.width - this.labelwidth)/2)*this._zoom;
        let y = this._y1 + 4 + (this.iconheight)*this._zoom;
        this.labelRectangle.x = x;
        this.labelRectangle.y = y;
        this.labelRectangle.width = this.labelwidth*this._zoom;
        this.labelRectangle.height = this.labelheight*this._zoom;
    }

    setCoordinates(x, y, width, height, margin, zoom, grid) {
        this._x1 = x;
        this._y1 = y;
        this.width = width;
        this.height = height;
        this._zoom = zoom;
        this._x2 = x + (width * zoom) - 1;
        this._y2 = y + (height * zoom) - 1;
        this._grid = grid;
        this.container.set_size_request(width, height);
        this._label.margin_start = margin;
        this._label.margin_end = margin;
        this._label.margin_bottom = margin;
        this._iconContainer.margin_top = margin;
        this._checkForRename();
    }

    getCoordinates() {
        return [this._x1, this._y1, this._x2, this._y2, this._grid];
    }

    _setLabelName(text) {
        this._currentFileName = text;
        this._iconContainer.set_tooltip_text(text);
        let lastCutPos = -1;
        let newText = '';
        for (let pos=0; pos < text.length; pos++) {
            let character = text[pos];
            newText += character;
            if (pos < (text.length - 1)) {
                var nextChar = text[pos+1]
            } else {
                var nextChar = '';
            }
            if (character == ' ') {
                lastCutPos = pos;
            }
            if (['.',',','-','_','@',':'].includes(character)) {
                /* if the next character is already an space or this is the last
                 * character, the string will be naturally cut here, so we do
                 * nothing.
                 */
                if ((nextChar == ' ') || (nextChar == '')) {
                    continue;
                }
                /* if there is a cut element in the last four previous characters,
                 * do not add a new cut element.
                 */
                if ((lastCutPos > -1) && ((pos - lastCutPos) < 4)) {
                    continue;
                }
                newText += '\u200B';
            }
        }
        this._label.label = newText;
    }

    _checkForRename() {
        if (this._desktopManager.newFolderDoRename) {
            if (this._desktopManager.newFolderDoRename == this.fileName) {
                this._desktopManager.doRename(this, true);
            }
        }
    }


    /***********************
     * Button Clicks *
     ***********************/

    _updateClickState(button, eventtime) {
        let settings = Gtk.Settings.get_default();

        if ((button == this._lastClickButton) &&
            ((eventtime - this._lastClickTime) < settings.gtk_double_click_time))
            this._clickCount++;
        else
            this._clickCount = 1;

        this._lastClickTime = eventtime;
        this._lastClickButton = button;
    }

    getClickCount() {
        return this._clickCount;
    }

    _onPressButton(actor, X, Y, x, y, shiftPressed, controlPressed) {
        let button = actor.get_current_button();
        let eventtime = actor.get_current_event_time();
        this._updateClickState(button, eventtime);
        this._buttonPressInitialX = x - this._x1;
        this._buttonPressInitialY = y - this._y1;
        if (button == 3) {
            this._doButtonThreePressed(button, X, Y, x, y, shiftPressed, controlPressed);
        } else if (button == 1) {
            this._doButtonOnePressed(button, X, Y, x, y, shiftPressed, controlPressed);
        }
    }

    _onReleaseButton(actor, X, Y, x, y, shiftPressed, controlPressed) {
        let button = actor.get_current_button();
        if (button == 1) {
            this._doButtonOneReleased(button, X, Y, x, y, shiftPressed, controlPressed);
        }
    }

    _doButtonThreePressed(button, X, Y, x, y, shiftPressed, controlPressed) {
        if (!this._isSelected) {
            this._desktopManager.selected(this, Enums.Selection.RIGHT_BUTTON);
        }
        this._desktopManager.fileItemMenu.showMenu(this, button, X, Y, x, y, shiftPressed, controlPressed);
    }

    _doButtonOnePressed(button, X, Y, x, y, shiftPressed, controlPressed) {
        if (this.getClickCount() == 1) {
            this._primaryButtonPressed = true;
            if (shiftPressed || controlPressed) {
                this._desktopManager.selected(this, Enums.Selection.WITH_SHIFT);
            } else {
                this._desktopManager.selected(this, Enums.Selection.ALONE);
            }
        }
    }

    _doButtonOneReleased(button, X, Y, x, y, shiftPressed, controlPressed) {
    }

    /***********************
     * Drag and Drop *
     ***********************/

    _onEnter(actor, x, y) {
        if (!this._styleContext.has_class('file-item-hover')) {
            this._styleContext.add_class('file-item-hover');
            this._labelStyleContext.add_class('file-item-hover');
        }
        if (Prefs.CLICK_POLICY_SINGLE) {
            let window = this._grid._window;
            if (window) {
                window.set_cursor(Gdk.Cursor.new_from_name("hand", null));
            }
        }
        return false;
    }

    _onLeave(actor) {
        this._primaryButtonPressed = false;
        if (this._styleContext.has_class('file-item-hover')) {
            this._styleContext.remove_class('file-item-hover');
            this._labelStyleContext.remove_class('file-item-hover');
        }
        if (Prefs.CLICK_POLICY_SINGLE) {
            let window = this._grid._window;
            if (window) {
                window.set_cursor(Gdk.Cursor.new_from_name("default", null));
            }
        }
        return false;
    }

    _hasToRouteDragToGrid() {
        if (this._grid) {
            return true;
        }
    }

    _updateDragStatus(context, time) {
        if (DesktopIconsUtil.getModifiersInDnD(context, Gdk.ModifierType.CONTROL_MASK))
            Gdk.drag_status(context, Gdk.DragAction.COPY, time);
        else
            Gdk.drag_status(context, Gdk.DragAction.MOVE, time);
    }

    highLightDropTarget(x, y) {
        if (this._hasToRouteDragToGrid()) {
            this._grid.receiveMotion(this._x1, this._y1, true);
            return;
        }
        if (! this._styleContext.has_class('desktop-icons-selected')) {
            this._styleContext.add_class('desktop-icons-selected');
            this._labelStyleContext.add_class('desktop-icons-selected');
        }
        this._grid.highLightGridAt(this._x1, this._y1);
    }

    unHighLightDropTarget() {
        if (this._hasToRouteDragToGrid()) {
            this._grid.receiveLeave();
            return;
        }
        if (! this._isSelected && this._styleContext.has_class('desktop-icons-selected')) {
            this._styleContext.remove_class('desktop-icons-selected');
            this._labelStyleContext.remove_class('desktop-icons-selected');
        }
        this._grid.unHighLightGrids();
    }

    setSelected() {
        this._isSelected = true;
        this._setSelectedStatus();
    }

    unsetSelected() {
        this._isSelected = false;
        this._setSelectedStatus();
    }

    toggleSelected() {
        this._isSelected = !this._isSelected;
        this._setSelectedStatus();
    }

    _setSelectedStatus() {
        if (this._isSelected && !this._styleContext.has_class('desktop-icons-selected')) {
            this._styleContext.add_class('desktop-icons-selected');
            this._labelStyleContext.add_class('desktop-icons-selected');
        }
        if (!this._isSelected && this._styleContext.has_class('desktop-icons-selected')) {
            this._styleContext.remove_class('desktop-icons-selected');
            this._labelStyleContext.remove_class('desktop-icons-selected');
        }
    }

    _calculateOffset(X, Y) {
        return [ Math.round(X - this._x1), Math.round(Y - this._y1)];
    }

    receiveDrop(x, y, selection, info) {
        return;
    }

    dropCapable() {
        return false;
    }

    /***********************
     * Icon Rendering *
     ***********************/

    updateIcon() {
        this._updateIcon();
    }

    async _updateIcon() {
        if (this._destroyed) {
            return;
        }

        this._icon.set_halign(Gtk.Align.CENTER);
        try {
            let customIcon = this._fileInfo.get_attribute_as_string('metadata::custom-icon');
            if (customIcon && (customIcon != '')) {
                let customIconFile = Gio.File.new_for_uri(customIcon);
                if (customIconFile.query_exists(null)) {
                    let loadedImage = await this._loadImageAsIcon(customIconFile);
                    if (loadedImage | this._destroyed) {
                        return;
                    }
                }
            }
        } catch (error) {
            print(`Error while updating icon: ${error.message}.\n${error.stack}`);
        }

        if (this._fileExtra == Enums.FileType.USER_DIRECTORY_TRASH) {
            let pixbuf = this._createEmblemedIcon(this._fileInfo.get_icon(), null);;
            this._icon.set_paintable(pixbuf);
            return;
        }
        let icon_set = false;
        //if ((Prefs.nautilusSettings.get_string('show-image-thumbnails') != 'never') &&
            //(this._desktopManager.thumbnailLoader.canThumbnail(this))) {
                //let thumbnail = this._desktopManager.thumbnailLoader.getThumbnail(this, this._updateIcon.bind(this));
                //if (thumbnail != null) {
                    //let thumbnailFile = Gio.File.new_for_path(thumbnail);
                    //icon_set = await this._loadImageAsIcon(thumbnailFile);
                    //if (this._destroyed) {
                        //return;
                    //}
                //}
        //}

        if (!icon_set) {
            let pixbuf;
            if (this._isBrokenSymlink) {
                pixbuf = this._createEmblemedIcon(null, 'text-x-generic');
            } else {
                if (this._desktopFile && this._desktopFile.has_key('Icon')) {
                    pixbuf = this._createEmblemedIcon(null, this._desktopFile.get_string('Icon'));
                } else {
                    pixbuf = this._createEmblemedIcon(this._getDefaultIcon(), null);
                }
            }
            const scale = this._icon.get_scale_factor();
            this._icon.set_paintable(pixbuf);
        }
    }

    _getDefaultIcon() {
        if (this._fileExtra == Enums.FileType.EXTERNAL_DRIVE) {
            return this._custom.get_icon();
        }
        return this._fileInfo.get_icon();
    }

    _loadImageAsIcon(imageFile) {

        if (this._loadThumbnailDataCancellable)
            this._loadThumbnailDataCancellable.cancel();
        this._loadThumbnailDataCancellable = new Gio.Cancellable();

        return new Promise( (resolve, reject) => {
            imageFile.load_bytes_async(this._loadThumbnailDataCancellable, (source, result) => {
                this._loadThumbnailDataCancellable = null;
                try {
                    let [thumbnailData, etag_out] = source.load_bytes_finish(result);
                    let thumbnailStream = Gio.MemoryInputStream.new_from_bytes(thumbnailData);
                    let thumbnailPixbuf = GdkPixbuf.Pixbuf.new_from_stream(thumbnailStream, null);

                    if (thumbnailPixbuf != null) {
                        let width = Prefs.get_desired_width() - 8;
                        let height = Prefs.get_icon_size() - 8;
                        let aspectRatio = thumbnailPixbuf.width / thumbnailPixbuf.height;
                        if ((width / height) > aspectRatio)
                            width = height * aspectRatio;
                        else
                            height = width / aspectRatio;
                        const scale = this._icon.get_scale_factor();
                        width *= scale;
                        height *= scale;
                        let pixbuf = thumbnailPixbuf.scale_simple(Math.floor(width), Math.floor(height), GdkPixbuf.InterpType.BILINEAR);
                        pixbuf = this._addEmblemsToPixbufIfNeeded(pixbuf);
                        this._icon.set_paintable(pixbuf);
                        this._icon.margin_top(4);
                        this._icon.margin_bottom(4);
                        this._icon.margin_start(4);
                        this._icon.margin_end(4);
                        resolve(true);
                    }
                    resolve(false);
                } catch(e) {
                    resolve(false);
                }
            });
        });
    }

    _copyAndResizeIfNeeded(pixbuf) {
        /**
         * If the pixbuf is the original from the theme, copies it into a new one, to be able
         * to paint the emblems without altering the cached pixbuf in the theme object.
         * Also, ensures that the copied pixbuf is, at least, as big as the desired icon size,
         * to ensure that the emblems fit.
         */

        if (this._copiedPixbuf) {
            return pixbuf;
        }

        this._copiedPixbuf = true;
        let minsize = Prefs.get_icon_size();
        if ((pixbuf.width < minsize) || (pixbuf.height < minsize)) {
            let width = (pixbuf.width < minsize) ? minsize : pixbuf.width;
            let height = (pixbuf.height < minsize) ? minsize : pixbuf.height;
            let newpixbuf = GdkPixbuf.Pixbuf.new(pixbuf.colorspace, true, pixbuf.bits_per_sample, width, height);
            newpixbuf.fill(0);
            let x = Math.floor((width - pixbuf.width) / 2);
            let y = Math.floor((height - pixbuf.height) / 2);
            pixbuf.composite(newpixbuf, x, y, pixbuf.width, pixbuf.height, x, y, 1, 1,  GdkPixbuf.InterpType.NEAREST, 255);
            return newpixbuf;
        } else {
            return pixbuf;
        }
    }

    _addEmblemsToPixbufIfNeeded(pixbuf) {
        const scale = this._icon.get_scale_factor();
        this._copiedPixbuf = false;
        let emblem = null;
        let finalSize = Math.floor(Prefs.get_icon_size() / 3) * scale;

        if (this._isDesktopFile && ((! this._isValidDesktopFile) || (! this.trustedDesktopFile))) {
            pixbuf = this._copyAndResizeIfNeeded(pixbuf);
            pixbuf.saturate_and_pixelate(pixbuf, 0.5, true);
            emblem = Gio.ThemedIcon.new('emblem-unreadable');
            pixbuf = this._copyAndResizeIfNeeded(pixbuf);
            let theme = Gtk.IconTheme.get_default();
            let emblemIcon = theme.lookup_by_gicon_for_scale(emblem, finalSize / scale, scale, Gtk.IconLookupFlags.FORCE_SIZE).load_icon();
            emblemIcon.composite(pixbuf, pixbuf.width - finalSize, pixbuf.height - finalSize, finalSize, finalSize, pixbuf.width - finalSize, pixbuf.height - finalSize, 1, 1, GdkPixbuf.InterpType.BILINEAR, 255);
        }

        if (this._isSymlink && (this._desktopManager.showLinkEmblem || this._isBrokenSymlink)) {
            if (this._isBrokenSymlink)
                emblem = Gio.ThemedIcon.new('emblem-unreadable');
            else
                emblem = Gio.ThemedIcon.new('emblem-symbolic-link');
            pixbuf = this._copyAndResizeIfNeeded(pixbuf);
            let theme = Gtk.IconTheme.get_for_display(Gdk.Display.get_default());
            let emblemIcon = theme.lookup_by_gicon(emblem, finalSize / scale, scale, Gtk.TextDirection.NONE, Gtk.IconLookupFlags.FORCE_SIZE);
            //emblemIcon.composite(pixbuf, pixbuf.width - finalSize, pixbuf.height - finalSize, finalSize, finalSize, pixbuf.width - finalSize, pixbuf.height - finalSize, 1, 1, GdkPixbuf.InterpType.BILINEAR, 255);
        }

        if (this.isStackTop && ! this.stackUnique) {
            pixbuf = this._copyAndResizeIfNeeded(pixbuf);
            let theme = Gtk.IconTheme.get_for_display(Gdk.Display.get_default());
            emblem = Gio.ThemedIcon.new('emblem-downloads');
            let emblemIcon = theme.lookup_by_gicon(emblem, finalSize / scale, scale, Gtk.TextDirection.NONE, Gtk.IconLookupFlags.FORCE_SIZE);
            //emblemIcon.composite(pixbuf, 0, 0, finalSize, finalSize, 0, 0, 1, 1, GdkPixbuf.InterpType.BILINEAR, 255);
        }
        return pixbuf;
    }

    _createEmblemedIcon(icon, iconName) {
        if (icon == null) {
            if (GLib.path_is_absolute(iconName)) {
                try {
                    let iconFile = Gio.File.new_for_commandline_arg(iconName);
                    icon = new Gio.FileIcon({ file: iconFile });
                } catch(e) {
                    icon = Gio.ThemedIcon.new_with_default_fallbacks(iconName);
                }
            } else {
                icon = Gio.ThemedIcon.new_with_default_fallbacks(iconName);
            }
        }
        let theme = Gtk.IconTheme.get_for_display(Gdk.Display.get_default());
        const scale = this._icon.get_scale_factor();
        let itemIcon = null;
        try {
            itemIcon = theme.lookup_by_gicon(icon, Prefs.get_icon_size(), scale, Gtk.TextDirection.NONE, Gtk.IconLookupFlags.FORCE_SIZE);
        } catch (e) {
            itemIcon = theme.lookup_icon("text-x-generic", [], Prefs.get_icon_size(), scale, Gtk.TextDirection.NONE, Gtk.IconLookupFlags.FORCE_SIZE);
        }

        itemIcon = this._addEmblemsToPixbufIfNeeded(itemIcon);

        return itemIcon;
    }

    /***********************
     * Getters and setters *
     ***********************/

    get state() {
        return this._state;
    }

    set state(state) {
        if (state == this._state)
            return;

        this._state = state;
    }

    get isDrive() {
        return this._fileExtra == Enums.FileType.EXTERNAL_DRIVE;
    }

    get isSelected() {
        return this._isSelected;
    }

    get isSpecial() {
        return this._isSpecial;
    }

    get dropCoordinates() {
        return this._dropCoordinates;
    }

    set dropCoordinates(pos) {
        this._dropCoordinates = pos;
    }
}
Signals.addSignalMethods(desktopIconItem.prototype);
