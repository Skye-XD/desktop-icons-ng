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

import {Gdk, Gtk, Graphene, Gsk, Pango} from '../dependencies/gi.js';


export {DragManager};


const DragManager = class {
    constructor(desktopManager) {
        this._desktopManager = desktopManager;
        this._Prefs = desktopManager.Prefs;
        this._GnomeShellDragDrop = this._desktopManager.GnomeShellDragDrop;
        this._Enums = this._desktopManager.Enums;
        this.pointerX = 0;
        this.pointerY = 0;
        this._dragList = null;
        this.dragItem = null;
        this.rubberBand = false;
        this.localDragOffset = [0, 0];
    }

    destroy() {
        this._stopGnomeShellDrag();
    }

    // Drag and Drop local Methods

    _startGnomeShellDrag() {
        if (!this._localDrag &&
            this.dragItem &&
            !this.gnomeShellDrag
        ) {
            this.gnomeShellDrag =
                new this._GnomeShellDragDrop
                    .GnomeShellDrag(this._desktopManager);
        }
    }

    _stopGnomeShellDrag() {
        this.gnomeShellDrag?.destroy();
        this.gnomeShellDrag = null;
    }

    _drawRubberBand() {
        for (let grid of this._desktops)
            grid.updateOverlay();
    }

    // Global Methods
    // *******************************************************

    // Drag Preperation

    prepareDrag(controller, item, hotspot) {
        if (this.rubberBand)
            return null;

        controller.set_actions(this._sourceActionsForCurrentSelection);
        this.localDragOffset = hotspot;
        controller.set_icon(this._createStackedDragIcon(item), ...hotspot);
        item.dragSourceOffset = hotspot;

        return this._createDragContentProvider();
    }

    _createDragContentProvider() {
        const textCoder = new TextEncoder();

        const uriList =
            this.getSelectionData(
                this._Enums.DndTargetInfo.DING_ICON_LIST);

        if (!uriList)
            return null;

        const encodedUriList = textCoder.encode(uriList);

        const dingContentProvider =
            Gdk.ContentProvider.new_for_bytes(
                this._Enums.DndTargetInfo.DING_ICON_LIST,
                encodedUriList
            );

        if (this._desktopManager.checkIfSpecialFilesAreSelected())
            return dingContentProvider;

        const selectedFiles = this._desktopManager.getCurrentSelection()
            .map(fileItem => fileItem.file);
        const fileList = Gdk.FileList.new_from_array(selectedFiles);
        const fileListContentProvider =
            Gdk.ContentProvider.new_for_value(fileList);

        const gnomeUriList =
            this.getSelectionData(
                this._Enums.DndTargetInfo.GNOME_ICON_LIST);

        if (!gnomeUriList)
            return null;

        const gnomeContentProvider =
            Gdk.ContentProvider.new_for_bytes(
                this._Enums.DndTargetInfo.GNOME_ICON_LIST,
                textCoder.encode(gnomeUriList)
            );

        const textPathList =
            this.getSelectionData(
                this._Enums.DndTargetInfo.TEXT_PLAIN
            );

        if (!textPathList)
            return null;

        const encodedPathList = textCoder.encode(textPathList);

        const textUriListContentProvider =
            Gdk.ContentProvider.new_for_bytes(
                this._Enums.DndTargetInfo.URI_LIST,
                encodedUriList
            );

        const textListContentProvider =
            Gdk.ContentProvider.new_for_bytes(
                this._Enums.DndTargetInfo.TEXT_PLAIN,
                encodedPathList
            );

        const textUtf8ListContentProvider =
            Gdk.ContentProvider.new_for_bytes(
                this._Enums.DndTargetInfo.TEXT_PLAIN_UTF8,
                encodedPathList
            );

        return Gdk.ContentProvider.new_union([
            fileListContentProvider,
            dingContentProvider,
            gnomeContentProvider,
            textUriListContentProvider,
            textListContentProvider,
            textUtf8ListContentProvider,
        ]);
    }

    // The following code is translated from Nautilus C to Javascript
    //  to form the similar stack of items

    _createStackedDragIcon(draggedItem) {
        const  selectionArray = this._desktopManager.getCurrentSelection();
        selectionArray.sort(
            // eslint-disable-next-line no-nested-ternary
            (a, b) => a.uri === draggedItem.uri
                ? -1
                : b.uri === draggedItem.uri
                    ? 1
                    : 0
        );

        const dragIconArray = selectionArray.slice(0, 4)
            .map(f => f._icon.get_paintable());
        const numberOfIcons = dragIconArray.length;

        const dragIcon = Gtk.Snapshot.new();

        /* A wide shadow for the pile of icons gives a sense of floating. */
        const stackShadow =
            {
                color: {red: 0, green: 0, blue: 0, alpha: 0.15},
                dx: 0,
                dy: 2,
                radius: 10,
            };

        /* A slight shadow swhich makes each icon in the stack look separate. */
        const iconShadow =
            new Gsk.Shadow({
                color: {red: 0, green: 0, blue: 0, alpha: 0.30},
                dx: 0,
                dy: 1,
                radius: 1,
            });

        let xOffset = numberOfIcons % 2 === 1 ? 6 : -6;
        let yOffset;

        switch (numberOfIcons) {
        case 1:
            yOffset = 0;
            break;
        case 2:
            yOffset = 10;
            break;
        case 3:
            yOffset = 6;
            break;
        default:
            yOffset = 4;
        }

        dragIcon.translate(
            new Graphene.Point(
                {
                    x: stackShadow.radius + (xOffset / 2),
                    y: stackShadow.radius + yOffset * numberOfIcons,
                }
            )
        );

        const shadow = new Gsk.Shadow(stackShadow);
        dragIcon.push_shadow([shadow]);

        dragIconArray.reverse().forEach(
            paintableWidget => {
                const w = paintableWidget.get_intrinsic_width();
                const h = paintableWidget.get_intrinsic_height();
                const X = Math.floor((this._Prefs.IconSize - w) / 2);
                const Y = Math.floor((this._Prefs.IconSize - h) / 2);

                dragIcon.translate(
                    new Graphene.Point(
                        {
                            x: -xOffset,
                            y: -yOffset,
                        }
                    )
                );

                xOffset = -xOffset;

                dragIcon.translate(new Graphene.Point({x: X, y: Y}));
                dragIcon.push_shadow([iconShadow]);

                paintableWidget.snapshot(dragIcon, w, h);

                dragIcon.pop();

                dragIcon.translate(new Graphene.Point({x: -X, y: -Y}));
            }
        );
        dragIcon.pop();

        this._drawDragCountBadge(
            dragIcon,
            draggedItem._icon,
            selectionArray.length
        );

        return dragIcon.to_paintable(null);
    }

    _drawDragCountBadge(snapshot, widget, count) {
        if (count <= 1)
            return;

        const badgeHeight = 22;
        const layout = widget.create_pango_layout(
            count > 9999
                ? '9999+'
                : `${count}`
        );
        const attrs = new Pango.AttrList();
        attrs.insert(Pango.attr_weight_new(Pango.Weight.SEMIBOLD));
        attrs.insert(Pango.attr_size_new_absolute(
            Math.round(badgeHeight * 0.55 * Pango.SCALE)
        ));
        layout.set_attributes(attrs);

        const [inkRect] = layout.get_pixel_extents();
        const badgeWidth = Math.max(badgeHeight, inkRect.width + 8);
        const x = this._Prefs.IconSize - badgeWidth;
        const y = this._Prefs.IconSize - badgeHeight;
        const rect = new Graphene.Rect();
        rect.init(x, y, badgeWidth, badgeHeight);
        const roundedRect = new Gsk.RoundedRect();
        roundedRect.init_from_rect(rect, badgeHeight / 2);

        snapshot.push_rounded_clip(roundedRect);
        snapshot.append_color(this._Prefs.selectColor, rect);
        snapshot.pop();

        snapshot.save();
        snapshot.translate(new Graphene.Point({
            x: x + (badgeWidth - inkRect.width) / 2 - inkRect.x,
            y: y + (badgeHeight - inkRect.height) / 2 - inkRect.y,
        }));
        snapshot.append_layout(layout, new Gdk.RGBA({
            red: 1, green: 1, blue: 1, alpha: 1,
        }));
        snapshot.restore();
    }

    getSelectionData(target) {
        const fileList = this._currentSelection;
        if (!fileList)
            return null;

        let uriList = '';
        let pathList = '';

        switch (target) {
        case this._Enums.DndTargetInfo.GNOME_ICON_LIST:
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
        case this._Enums.DndTargetInfo.DING_ICON_LIST:
        case this._Enums.DndTargetInfo.TEXT_URI_LIST:
            uriList = fileList.map(f => f.uri).join('\r\n');
            uriList += '\r\n';
            return uriList;
        case this._Enums.DndTargetInfo.TEXT_PLAIN:
            pathList = fileList.map(f => f.path).join('n');
            pathList += '\n';
            return pathList;
        }
        return null;
    }

    // Drag Methods

    startRubberband(X, Y) {
        this.rubberBandInitX = X;
        this.rubberBandInitY = Y;
        this.rubberBand = true;
        for (let item of this._displayList)
            item.touchedByRubberband = false;
    }

    onDragBegin(item) {
        this.onReleaseButton();
        this._desktopManager.dropOperations.rememberSelectedFilePositionsForUndo();
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
            const itemList = this._desktopManager.getCurrentSelection();
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

    onDragCancel(reason) {
        if (reason === Gdk.DragCancelReason.NO_TARGET ||
            reason === Gdk.DragCancelReason.ERROR) {
            const shellDropHandled =
                this.gnomeShellDrag?.completeGnomeShellDrop() ?? false;

            if (shellDropHandled) {
                // GTK accepts that we handled the failed drag, but on
                // Wayland the compositor has already cancelled it, so
                // this cannot prevent the return animation.
                return true;
            }
        }

        return false;
    }

    onDragEnd(item) {
        this.dragItem = null;
        this._stopGnomeShellDrag();
        this.updateSelection(item, this._Enums.Selection.RELEASE);
    }

    doMoveWithDragAndDrop(xOrigin, yOrigin, xDestination, yDestination) {
        const keepArranged =
            this._Prefs.keepArranged || this._Prefs.keepStacked;

        if (this._Prefs.sortSpecialFolders && keepArranged)
            return;

        let deltaX;
        let deltaY;

        if (!this._Prefs.freePositionIcons) {
            deltaX = xDestination - xOrigin;
            deltaY = yDestination - yOrigin;
        } else {
            deltaX = xDestination - xOrigin - this.localDragOffset[0] * 2;
            deltaY = yDestination - yOrigin - this.localDragOffset[1];
        }

        // Force the drag update onto the same serialized desktop mutation
        // queue as geometry and file-list updates.
        this._desktopManager.runSerializedDesktopMutation(
            this._doMoveWithDragAndDrop.bind(
                this,
                deltaX,
                deltaY,
                keepArranged
            )
        ).catch(e => {
            console.log(
                'Exception while doing move with drag and drop: ' +
                `${e.message}\n${e.stack}`
            );
        });

        if (!keepArranged)
            return;

        this._desktopManager.redrawDesktop().catch(e => {
            console.log(
                'Exception while doing move with drag and drop and' +
                `"Keep arranged…": ${e.message}\n${e.stack}`);
        });
    }

    _doMoveWithDragAndDrop(deltaX, deltaY, keepArranged) {
        const fileItems = [];

        this._displayList.filter(item => item.isSelected).forEach(item => {
            if (!keepArranged || item.isSpecial) {
                fileItems.push(item);
                item.removeFromGrid({callOnDestroy: false});
                const [x, y] = item.getCoordinates().slice(0, 3);
                item.temporarySavedPosition = [x + deltaX, y + deltaY];
            }
        });

        // Force write the new coordinates
        this._desktopManager._addFilesToDesktop(
            fileItems,
            this._Enums.StoredCoordinates.OVERWRITE
        );
    }

    // Drag Motion

    onMotion(X, Y) {
        this.pointerX = X;
        this.pointerY = Y;
        if (this.rubberBand) {
            this.x1 = Math.min(X, this.rubberBandInitX);
            this.x2 = Math.max(X, this.rubberBandInitX);
            this.y1 = Math.min(Y, this.rubberBandInitY);
            this.y2 = Math.max(Y, this.rubberBandInitY);
            this.selectionRectangle =
                new Gdk.Rectangle({
                    'x': this.x1,
                    'y': this.y1,
                    'width': this.x2 - this.x1,
                    'height': this.y2 - this.y1,
                });
            this._drawRubberBand();
            for (let item of this._displayList) {
                const labelintersect =
                    item.labelRectangle.intersect(this.selectionRectangle)[0];
                const iconintersect =
                    item.iconRectangle.intersect(this.selectionRectangle)[0];
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
            grid.updateOverlay();

        return false;
    }

    // Selection HighLighting

    clearDropTargetHighlight() {
        this._displayList.forEach(item => item.unHighLightDropTarget());
    }

    updateSelection(fileItem, action) {
        this._clearKeyboardSelection();
        switch (action) {
        case this._Enums.Selection.ALONE:
            if (!fileItem.isSelected) {
                for (let item of this._displayList) {
                    if (item === fileItem)
                        item.setSelected();
                    else
                        item.unsetSelected();
                }
            }
            break;
        case this._Enums.Selection.WITH_SHIFT:
            fileItem.toggleSelected();
            break;
        case this._Enums.Selection.RIGHT_BUTTON:
            if (!fileItem.isSelected) {
                for (let item of this._displayList) {
                    if (item === fileItem)
                        item.setSelected();
                    else
                        item.unsetSelected();
                }
            }
            break;
        case this._Enums.Selection.ENTER:
            if (this.rubberBand)
                fileItem.setSelected();

            break;
        case this._Enums.Selection.RELEASE:
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

    _clearKeyboardSelection() {
        this._displayList.forEach(item => item.keyboardUnSelected());
        this._desktopManager.desktopActions.lastAnchorSelected = null;
    }

    // Getters and Setters

    get _currentSelection() {
        return this._desktopManager.getCurrentSelection();
    }

    get _sourceActionsForCurrentSelection() {
        const selection = this._currentSelection;
        const noAction = Gdk.DragAction.NONE ?? 0;

        if (!selection?.length)
            return noAction;

        // Special icons only expose DING's private format. MOVE means
        // repositioning those icons on the desktop, not moving their files.
        if (selection.some(fileItem => fileItem.isSpecial))
            return Gdk.DragAction.MOVE;

        let actions = Gdk.DragAction.COPY |
            Gdk.DragAction.LINK |
            Gdk.DragAction.ASK;

        if (selection.every(fileItem => fileItem.canDelete))
            actions |= Gdk.DragAction.MOVE;

        return actions;
    }

    get _displayList() {
        return this._desktopManager._displayList;
    }

    get _desktops() {
        return this._desktopManager._desktops;
    }

    get _localDrag() {
        return this._desktops.some(grid => grid.dragIsOverGrid);
    }
};
