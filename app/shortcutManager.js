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

import {Adw, Gio, GLib, GObject, Gtk} from '../dependencies/gi.js';
import {_} from '../dependencies/gettext.js';
import {DefaultShortcuts} from '../dependencies/localFiles.js';

export {ShortcutManager};

const ShortcutViewer = GObject.registerClass(
class ShortcutViewer extends Gtk.Box {
    _init(params = {}) {
        super._init(
            {orientation: Gtk.Orientation.VERTICAL, spacing: 12, ...params}
        );

        this._actionMap = null;
        this._descriptions = {};

        const headerBar = Adw.HeaderBar.new();
        const headerTitle = Adw.WindowTitle.new(_('Keyboard Short Cuts'), '');
        headerBar.set_title_widget(headerTitle);
        headerBar.set_show_end_title_buttons(true);
        this.append(headerBar);

        const scrolled = new Gtk.ScrolledWindow({hexpand: true, vexpand: true});

        this._listbox =
            new Gtk.ListBox({selection_mode: Gtk.SelectionMode.NONE});

        scrolled.set_child(this._listbox);
        this.append(scrolled);
    }

    set_action_map(actionMap) {
        this._actionMap = actionMap;
        this._refresh();
    }

    set_descriptions(descriptionMap) {
        this._descriptions = descriptionMap;
        this._refresh();
    }

    _refresh() {
        if (!this._actionMap)
            return;

        this._listbox.remove_all();

        const actions =
            this._actionMap.list_actions()
            .sort((a, b) => {
                return a
                .localeCompare(
                    b,
                    {
                        sensitivity: 'accent',
                        numeric: 'true',
                        localeMatcher: 'lookup',
                    }
                );
            });

        for (const actionName of actions) {
            const accels =
                this._actionMap.get_accels_for_action(`app.${actionName}`);

            if (accels.length === 0)
                continue;
            const actionObj = this._actionMap.lookup_action(actionName);

            let title;

            if (actionObj && actionObj.get_state_hint) {
                const hint = actionObj.get_state_hint();
                title = hint ? hint.get_string()[0] : null;
            }

            title = title ?? this._descriptions?.[actionName];

            const description = title || this._prettify(actionName);
            const accelText = accels.toString().replace(',', ', ');

            const row = new Gtk.Box({
                orientation: Gtk.Orientation.HORIZONTAL,
                spacing: 12,
                margin_top: 6,
                margin_bottom: 6,
                margin_start: 12,
                margin_end: 12,
            });

            const label = new Gtk.Label({
                label: description,
                xalign: 0,
                hexpand: true,
            });

            const accelLabel = new Gtk.Label({
                label: accelText,
                xalign: 1,
                css_classes: ['monospace'],
            });

            row.append(label);
            row.append(accelLabel);
            this._listbox.append(row);
        }

        this._listbox.show();
    }

    _prettify(name) {
        const prettyName =
            name.charAt(0).toUpperCase() +
            name.slice(1).replace(/[-_]/g, ' ');

        return prettyName;
    }
}
);

const ShortcutManager = class {
    constructor(desktopManager) {
        this._desktopManager = desktopManager;
        this._mainApp = desktopManager.mainApp;
        this._initializeOurShortcuts();
        this._setStateHints();
        this._setAccels();
    }

    _setStateHints() {
        for (const [actionName, {Hint}] of Object.entries(DefaultShortcuts)) {
            const action = this._mainApp.lookup_action(actionName);
            if (action) {
                action.set_state_hint(
                    GLib.Variant.new_string(Hint)
                );
            }
        }
    }

    _setAccels() {
        for (const [actionName, {Accel}] of Object.entries(DefaultShortcuts)) {
            const action = this._mainApp.lookup_action(actionName);
            if (action) {
                const accelarray = Accel.length ? Accel.split(',') : [];
                this._mainApp.set_accels_for_action(
                    `app.${actionName}`, accelarray
                );
            }
        }
    }

    _initializeOurShortcuts() {
        const showShortcutViewer =
            Gio.SimpleAction.new('showShortcutViewer', null);
        showShortcutViewer.connect('activate', () => {
            this._showShortcutViewer();
        });
        this._mainApp.add_action(showShortcutViewer);

        const textEntryAccelsTurnOn =
            Gio.SimpleAction.new('textEntryAccelsTurnOn', null);
        textEntryAccelsTurnOn.connect('activate', () => {
            this._textEntryAccelsTurnOn();
        });
        this._mainApp.add_action(textEntryAccelsTurnOn);

        const textEntryAccelsTurnOff =
            Gio.SimpleAction.new('textEntryAccelsTurnOff', null);
        textEntryAccelsTurnOff.connect('activate', () => {
            this._textEntryAccelsTurnOff();
        });
        this._mainApp.add_action(textEntryAccelsTurnOff);
    }

    _textEntryAccelsTurnOn() {
        this._mainApp.set_accels_for_action(
            'app.previewAction',
            DefaultShortcuts.previewAction.Accel.split(',')
        );
        this._mainApp.set_accels_for_action(
            'app.unselectAll',
            DefaultShortcuts.unselectAll.Accel.split(',')
        );
        this._mainApp.set_accels_for_action(
            'app.openOneFileAction',
            DefaultShortcuts.openOneFileAction.Accel.split(',')
        );
        this._mainApp.set_accels_for_action(
            'app.movetotrash',
            DefaultShortcuts.movetotrash.Accel.split(',')
        );
        this._mainApp.set_accels_for_action(
            'app.chooseIconLeft',
            DefaultShortcuts.chooseIconLeft.Accel.split(',')
        );
        this._mainApp.set_accels_for_action(
            'app.chooseIconRight',
            DefaultShortcuts.chooseIconRight.Accel.split(',')
        );
        this._mainApp.set_accels_for_action(
            'app.chooseIconUp',
            DefaultShortcuts.chooseIconUp.Accel.split(',')
        );
        this._mainApp.set_accels_for_action(
            'app.chooseIconDown',
            DefaultShortcuts.chooseIconDown.Accel.split(',')
        );
        this._mainApp.set_accels_for_action(
            'app.menuKeyPressed',
            DefaultShortcuts.menuKeyPressed.Accel.split(',')
        );
        this._mainApp.set_accels_for_action(
            'app.findFiles',
            DefaultShortcuts.findFiles.Accel.split(',')
        );
    }

    _textEntryAccelsTurnOff() {
        this._mainApp.set_accels_for_action('app.previewAction', ['']);
        this._mainApp.set_accels_for_action('app.unselectAll', ['']);
        this._mainApp.set_accels_for_action('app.openOneFileAction', ['']);
        this._mainApp.set_accels_for_action('app.movetotrash', ['']);
        this._mainApp.set_accels_for_action('app.chooseIconLeft', ['']);
        this._mainApp.set_accels_for_action('app.chooseIconRight', ['']);
        this._mainApp.set_accels_for_action('app.chooseIconUp', ['']);
        this._mainApp.set_accels_for_action('app.chooseIconDown', ['']);
        this._mainApp.set_accels_for_action('app.menuKeyPressed', ['']);
        this._mainApp.set_accels_for_action('app.findFiles', ['']);
    }

    _showShortcutViewer() {
        if (this._shortCutsWindow)
            return;

        const shortcutViewer = new ShortcutViewer();
        shortcutViewer.set_action_map(this._mainApp);

        const shortcutsWindow = new Adw.ApplicationWindow();
        shortcutsWindow.set_application(this._mainApp);

        shortcutsWindow.set_default_size(400, 600);
        shortcutsWindow.set_decorated(true);
        shortcutsWindow.set_deletable(true);
        shortcutsWindow.set_name('shortcutsWindow');

        // Do not make modal or skip-taskbar as we have a .desktop icon
        // showing up in the dock for the window to assist navigation.
        // const modal = true;
        // this._DesktopIconsUtil.windowHidePagerTaskbarModal(
        //     shortcutsWindow, modal);

        shortcutsWindow.set_content(shortcutViewer);

        this._shortCutsWindow = shortcutsWindow;

        shortcutsWindow.connect('close-request', () => {
            this._shortCutsWindow = null;
        });

        shortcutsWindow.show();
    }
};
