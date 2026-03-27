/* DING: Desktop Icons New Generation for GNOME Shell
 *
 * Gtk4 Port Copyright (C) 2026 Sundeep Mediratta (smedius@gmail.com)
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

import {Gdk, GLib, Gtk} from '../dependencies/gi.js';
import {_} from '../dependencies/gettext.js';

export {WidgetWindow};

const PINNED_CONTROLS_HIDE_DELAY_MS = 600;

const WidgetWindow = class {
    /**
     * Runtime adapter for one pinned widget window.
     *
     * The WidgetManager remains the canonical owner of widget geometry/state.
     * WidgetWindow only owns the Gtk.Window runtime host and reports runtime
     * events back to WidgetManager through explicit callbacks.
     *
     * Contract:
     * - This class is runtime-only. It does not own persistent widget state.
     * - It should be created only after WidgetManager has created inst.actor.
     * - The authoritative position/size remain in WidgetManager.
     * - The shell-side window type/stacking behavior is derived from the title
     *   string emitted here and enforced by windowTypeManager.
     *
     * @param {object} params
     * @param {object} params.widgetManager
     *   Canonical owner of the widget instance. Must provide:
     *   - getInstance(instanceId)
     *   - getInstanceFrame(instanceId)
     *   - beginPinnedEdit(instanceId)
     *   - beginPinnedAssistedMove(instanceId)
     *   - setInstancePinned(instanceId, pinned)
     *   - optional pinned-window lifecycle callbacks
     * @param {object} params.mainApp
     *   Gtk.Application used to create a DING-owned Gtk.ApplicationWindow.
     * @param {string} params.instanceId
     *   The instance being hosted. Its actor must already exist before this
     *   runtime host is constructed and used.
     */
    constructor(params = {}) {
        this._widgetManager = params.widgetManager ?? null;
        this._mainApp = params.mainApp ?? null;
        this._instanceId = params.instanceId ?? null;

        this._window = null;
        this._overlay = null;
        this._actor = null;
        this._destroyed = false;
        this._isMapped = false;
        this._closeRequestId = 0;
        this._windowMapId = 0;
        this._windowUnmapId = 0;
        this._actorMapId = 0;
        this._dragGesture = null;
        this._hoverController = null;
        this._popupHoverController = null;
        this._controlsPopover = null;
        this._controlsBox = null;
        this._popupButtons = new Map();
        this._hoveringOverlay = false;
        this._hoveringPopup = false;
        this._hideControlsSourceId = 0;

        this._createWindow();
    }

    // -----------------------------------------------------------------
    // Public API
    // -----------------------------------------------------------------

    attachActor(actor) {
        if (!this._window || !this._overlay || !actor)
            return;

        const oldParent = actor.get_parent();
        if (oldParent && oldParent !== this._overlay)
            oldParent.remove(actor);

        this._disconnectActorSignals();
        this._overlay.set_child(actor);
        this._actor = actor;
        this._syncSize();
        this._connectActorSignals();
    }

    detachActor() {
        if (!this._overlay)
            return;

        const actor = this._overlay.get_child() ?? this._actor;
        if (actor)
            this._overlay.set_child(null);

        this._disconnectActorSignals();
        this._actor = null;
    }

    present() {
        if (!this._window || this._destroyed)
            return;

        this._window.present();
    }

    hide() {
        if (!this._window || this._destroyed)
            return;

        this._window.hide();
    }

    destroy() {
        if (this._destroyed)
            return;

        this._destroyed = true;

        this.detachActor();
        this._disconnectSignals();

        if (this._window) {
            this._window.destroy();
            this._window = null;
        }

        this._destroyControlsPopover();
        this._clearHideControlsTimer();
        this._overlay = null;
    }

    updateFromInstance(inst, frame) {
        if (!this._window || !inst)
            return;

        this.setPinnedTitle(this.buildPinnedTitle(frame));
        this._refreshControlsPopover();
    }

    setPinnedTitle(title) {
        if (!this._window || typeof title !== 'string')
            return;

        this._window.set_title(title);
    }

    buildPinnedTitle(frame = null) {
        const resolvedFrame =
            frame ??
            this._widgetManager.getInstanceGlobalFrame(this._instanceId) ??
            null;

        const x = Number.isFinite(resolvedFrame && resolvedFrame.x)
            ? Math.round(resolvedFrame.x)
            : 0;
        const y = Number.isFinite(resolvedFrame && resolvedFrame.y)
            ? Math.round(resolvedFrame.y)
            : 0;

        // Dock window:
        // K = dock type
        // H = hide from window list
        return `@!${x},${y};KH`;
    }

    beginPinnedEdit(_options = {}) {
        if (this._destroyed)
            return;

        this._widgetManager.beginPinnedEdit(this._instanceId);
    }

    beginPinnedWindowMove(params = {}) {
        if (!this._window || this._destroyed)
            return;

        this._beginWindowMoveFromPoint(params);
    }

    syncFromManager() {
        if (this._destroyed || !this._widgetManager)
            return;

        const inst = this._widgetManager.getInstance(this._instanceId);
        if (!inst)
            return;

        const frame =
            this._widgetManager.getInstanceGlobalFrame(this._instanceId) ?? null;

        this.updateFromInstance(inst, frame);
    }

    // -----------------------------------------------------------------
    // Private API
    // -----------------------------------------------------------------

    _createWindow() {
        this._window = new Gtk.ApplicationWindow({
            application: this._mainApp,
            decorated: false,
            deletable: false,
            resizable: false,
            modal: false,
            focusable: true,
            title: this.buildPinnedTitle(),
        });

        this._window.set_name('ding-widget-window');
        this._window.add_css_class('background');
        this._window.add_css_class('ding-widget-window');

        this._overlay = new Gtk.Overlay();
        this._overlay.set_name('ding-widget-window-content');
        this._installHoverController();
        this._installMoveGesture();

        this._window.set_child(this._overlay);
        this._connectSignals();
    }

    _installControlsPopover() {
        if (!this._overlay)
            return;

        if (this._controlsPopover)
            return;

        this._controlsPopover = new Gtk.Popover({
            has_arrow: false,
            position: Gtk.PositionType.TOP,
            autohide: false,
            halign: Gtk.Align.CENTER,
        });
        this._controlsPopover.set_name('ding-pinned-controls-popover');
        this._controlsPopover.set_parent(this._overlay);

        this._controlsBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 6,
            margin_top: 8,
            margin_bottom: 8,
            margin_start: 8,
            margin_end: 8,
        });
        this._controlsBox.set_name('ding-pinned-popup-controls');
        this._controlsPopover.set_child(this._controlsBox);
        this._rebuildControlsPopover();

        this._popupHoverController = new Gtk.EventControllerMotion();
        this._popupHoverController.connect('enter', () => {
            this._hoveringPopup = true;
            this._clearHideControlsTimer();
        });
        this._popupHoverController.connect('leave', () => {
            this._hoveringPopup = false;
            this._scheduleHideControls();
        });
        this._controlsBox.add_controller(this._popupHoverController);
    }

    _createOverlayButton(spec) {
        const button = new Gtk.Button({
            focus_on_click: false,
            can_focus: false,
            valign: Gtk.Align.CENTER,
            halign: Gtk.Align.CENTER,
        });
        button.set_name(spec.cssName);
        button.set_child(Gtk.Image.new_from_icon_name(spec.iconName));
        if (spec.tooltip)
            button.set_tooltip_text(spec.tooltip);

        for (const cssClass of spec.classes ?? [])
            button.add_css_class(cssClass);

        button.connect('clicked', () => {
            this._destroyControlsPopover();
            this._widgetManager.activateHostAction(this._instanceId, spec.id);
        });
        return button;
    }

    _installHoverController() {
        if (!this._overlay)
            return;

        this._hoverController = new Gtk.EventControllerMotion();
        this._hoverController.connect('enter', () => {
            this._hoveringOverlay = true;
            this._showControlsPopover();
        });
        this._hoverController.connect('leave', () => {
            this._hoveringOverlay = false;
            this._scheduleHideControls();
        });
        this._overlay.add_controller(this._hoverController);
    }

    _rebuildControlsPopover() {
        if (!this._controlsBox)
            return;

        let child = this._controlsBox.get_first_child();
        while (child) {
            const next = child.get_next_sibling();
            this._controlsBox.remove(child);
            child = next;
        }

        this._popupButtons.clear();

        const specs = this._widgetManager.getHostActionSpecsForInstance(
            this._instanceId,
            {pinnedPopup: true}
        );

        for (const spec of specs) {
            const button = this._createOverlayButton(spec);
            this._popupButtons.set(spec.id, button);
            this._controlsBox.append(button);
        }
    }

    _refreshControlsPopover() {
        if (!this._controlsPopover)
            return;

        this._rebuildControlsPopover();
    }

    _showControlsPopover() {
        if (!this._overlay)
            return;

        this._clearHideControlsTimer();
        this._installControlsPopover();
        this._refreshControlsPopover();

        const width = this._overlay.get_width();
        const rect = new Gdk.Rectangle({
            x: Math.max(0, Math.floor(width / 2)),
            y: 0,
            width: 1,
            height: 1,
        });

        this._controlsPopover.set_pointing_to(rect);
        this._controlsPopover.popup();
    }

    _scheduleHideControls() {
        this._clearHideControlsTimer();
        this._hideControlsSourceId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            PINNED_CONTROLS_HIDE_DELAY_MS,
            () => {
                this._hideControlsSourceId = 0;
                if (this._hoveringOverlay || this._hoveringPopup)
                    return GLib.SOURCE_REMOVE;

                this._destroyControlsPopover();
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    _clearHideControlsTimer() {
        if (!this._hideControlsSourceId)
            return;

        GLib.source_remove(this._hideControlsSourceId);
        this._hideControlsSourceId = 0;
    }

    _destroyControlsPopover() {
        this._clearHideControlsTimer();
        this._hoveringPopup = false;

        if (!this._controlsPopover)
            return;

        this._controlsPopover.popdown();
        this._controlsPopover.unparent();
        this._controlsPopover = null;
        this._controlsBox = null;
        this._popupHoverController = null;
        this._popupButtons.clear();
    }

    _installMoveGesture() {
        if (!this._overlay)
            return;

        this._dragGesture = new Gtk.GestureDrag({button: 1});
        this._dragGesture.set_propagation_phase(Gtk.PropagationPhase.CAPTURE);
        this._dragGesture.connect(
            'drag-begin',
            this._onOverlayDragBegin.bind(this)
        );
        this._overlay.add_controller(this._dragGesture);
    }

    _connectSignals() {
        if (!this._window)
            return;

        this._closeRequestId = this._window.connect(
            'close-request',
            this._onCloseRequest.bind(this)
        );
        this._windowMapId = this._window.connect(
            'map',
            this._onMap.bind(this)
        );
        this._windowUnmapId = this._window.connect(
            'unmap',
            this._onUnmap.bind(this)
        );
    }

    _disconnectSignals() {
        if (this._closeRequestId && this._window)
            this._window.disconnect(this._closeRequestId);
        this._closeRequestId = 0;

        if (this._windowMapId && this._window)
            this._window.disconnect(this._windowMapId);
        this._windowMapId = 0;

        if (this._windowUnmapId && this._window)
            this._window.disconnect(this._windowUnmapId);
        this._windowUnmapId = 0;
    }

    _connectActorSignals() {
        if (!this._actor)
            return;

        this._actorMapId = this._actor.connect(
            'map',
            this._onActorMap.bind(this)
        );
    }

    _disconnectActorSignals() {
        if (this._actorMapId && this._actor)
            this._actor.disconnect(this._actorMapId);
        this._actorMapId = 0;
    }

    _syncSize() {
        if (!this._window)
            return;

        let width = 0;
        let height = 0;

        if (this._actor) {
            const alloc = this._actor.get_allocation();
            width = alloc && alloc.width ? alloc.width : this._actor.get_width();
            height = alloc && alloc.height ? alloc.height : this._actor.get_height();
        }

        if (width <= 0 || height <= 0) {
            const inst = this._widgetManager.getInstance(this._instanceId);
            width = inst && inst.width ? inst.width : width;
            height = inst && inst.height ? inst.height : height;
        }

        if (width > 0 && height > 0) {
            this._window.set_default_size(width, height);
            this._window.set_size_request(width, height);
        }
    }

    _onCloseRequest() {
        // Pinned widgets do not destroy themselves via the window close path.
        // WidgetManager decides whether close means "unpin" or "remove".
        this._widgetManager.onPinnedWindowCloseRequest(this._instanceId);
        return true;
    }

    _onMap() {
        this._isMapped = true;
        this.syncFromManager();
    }

    _onUnmap() {
        this._isMapped = false;
    }

    _onActorMap() {
        this._syncSize();
    }

    _onOverlayDragBegin(gesture, startX, startY) {
        if (!this._window || this._destroyed)
            return;

        const picked = this._overlay.pick(startX, startY, Gtk.PickFlags.DEFAULT);

        if (this._isOverlayControlActor(picked) ||
            this._widgetManager.hasContentManagedPinnedMove(this._instanceId)) {
            gesture.set_state(Gtk.EventSequenceState.DENIED);
            return;
        }

        console.log(
            `[WidgetWindow] drag-begin instance=${this._instanceId} ` +
            `gestureStart=(${Math.round(startX)},${Math.round(startY)}) ` +
            'temporary pinned-window move'
        );
        this._beginWindowMoveFromPoint({
            localX: startX,
            localY: startY,
            button: gesture.get_current_button(),
            timestamp: gesture.get_current_event_time(),
            device: gesture.get_current_event_device(),
        });
    }

    _beginWindowMoveFromPoint(params = {}) {
        const native = this._overlay.get_native();
        const surface = native.get_surface();
        const toplevel = surface;
        const display = Gdk.Display.get_default();
        const seat = display.get_default_seat();
        const device = params.device ?? seat.get_pointer();
        const button = Number.isFinite(params.button) ? params.button : 1;
        const timestamp = Number.isFinite(params.timestamp) ? params.timestamp : 0;
        const localX = Number.isFinite(params.localX) ? params.localX : 0;
        const localY = Number.isFinite(params.localY) ? params.localY : 0;

        if (!toplevel.begin_move || !device)
            return false;

        const [transformX, transformY] = native.get_surface_transform();

        toplevel.begin_move(
            device,
            button,
            localX + transformX,
            localY + transformY,
            timestamp
        );
        return true;
    }

    _isOverlayControlActor(actor) {
        let current = actor;
        while (current && current !== this._overlay) {
            if (current === this._controlsBox ||
                current === this._controlsPopover ||
                [...this._popupButtons.values()].includes(current)) {
                return true;
            }

            current = current.get_parent();
        }

        return false;
    }

    _onPinButtonClicked() {
        // unused; popup buttons route through WidgetManager.activateHostAction()
    }

    _onMoveButtonClicked() {
        // unused; popup buttons route through WidgetManager.activateHostAction()
    }
};
