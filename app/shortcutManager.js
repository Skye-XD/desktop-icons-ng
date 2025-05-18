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

import {Adw, Gdk, Gio, GLib, GObject, Gtk} from '../dependencies/gi.js';
import {_} from '../dependencies/gettext.js';
import {DefaultShortcuts} from '../dependencies/localFiles.js';
import {GlobalShortcuts} from '../dependencies/localFiles.js';

export {ShortcutManager};

const DisplayShortcutRow = GObject.registerClass(
    class DisplayShortcutRow extends Adw.ActionRow {
        constructor({actionname, actionmap, readaccel}) {
            super({});
            this.actionNamed = actionname;
            this.actionMap = actionmap;
            this.readaccel = readaccel;

            this._descriptions = DefaultShortcuts;
            this.accelLabel = new Gtk.Label({
                label: '',
                xalign: 1,
                css_classes: ['monospace'],
            });
            this.add_suffix(this.accelLabel);
            this.updateRow();
        }

        updateRow() {
            const accels = this.readaccel(this.actionNamed);

            this.accelText = _('None');
            if (accels && accels.length)
                this.accelText = accels.toString().replace(',', ', ');

            this.accelLabel.set_label(this.accelText);

            this.description =
                this._descriptions[this.actionNamed].Hint ||
                this._prettify(this.actionNamed);

            this.set_title(this.description);
        }

        _prettify(name) {
            const prettyName =
                name.charAt(0).toUpperCase() +
                name.slice(1).replace(/[-_]/g, ' ');

            return prettyName;
        }
    }
);

const EditableShortcutRow = GObject.registerClass(
    class EditableShortcutRow extends DisplayShortcutRow {
        constructor({actionname, actionmap, readaccel, writeaccel}) {
            super({actionname, actionmap, readaccel});
            this.writeaccel = writeaccel;

            if (Adw.get_minor_version() > 2)
                this.set_subtitle_selectable(false);

            this.addEditor();
        }

        updateRow() {
            super.updateRow();
            this.use_markup = false;
            this.defaultAccel = this._descriptions[this.actionNamed].Accel;
            const subtitlestring = _('Default Shortcut:');
            const subtitle = this.defaultAccel ? this.defaultAccel : _('None');
            this.set_subtitle(`${subtitlestring} ${subtitle}`);
        }

        addEditor() {
            this.editIcon = Gtk.Image.new_from_icon_name('document-edit');
            this.editIcon.margin_start = 10;
            this.add_suffix(this.editIcon);
            this.set_activatable_widget(this.editIcon);
            this.makeActive();
        }

        makeActive() {
            this.activatable = true;
            this.set_sensitive = true;
            this.connect('activated', () => this.setShortcut());
        }

        setShortcut() {
            if (this.changingKey)
                return;

            this.changingKey = true;
            this.accelLabel.set_label(_('Type new...'));

            this.resetIcon = Gtk.Image.new_from_icon_name('revert');
            this.resetIcon.margin_start = 10;

            this.clearIcon = Gtk.Image.new_from_icon_name('no');
            this.clearIcon.margin_start = 10;

            const shortcutEditor = new Gtk.Entry({
                editable: false,
                hexpand: false,
                vexpand: false,
                halign: Gtk.Align.END,
                valign: Gtk.Align.CENTER,
                xalign: 0,  // Right-align
                placeholder_text:
                    _('Modifier + Key (e.g. Ctrl + Alt + D)'),
                width_chars: 30,
                can_focus: true,
                has_frame: true,
                primary_icon_name: 'revert',
                primary_icon_tooltip_text: _('Rest to Default'),
                primary_icon_sensitive: this.defaultAccel !== this.accelText,
                primary_icon_activatable: true,
                secondary_icon_name: 'no',
                secondary_icon_tooltip_text: _('No Accelerator'),
                secondary_icon_sensitive: true,
                secondary_icon_activatable: true,
            });

            const keyController = new Gtk.EventControllerKey();
            shortcutEditor.add_controller(keyController);

            let popover = new Gtk.Popover({
                has_arrow: false,
                autohide: true,
                child: shortcutEditor,
            });
            popover.set_parent(this.accelLabel);
            popover.set_position(Gtk.PositionType.BOTTOM);
            popover.popup();

            shortcutEditor.grab_focus_without_selecting();

            const finishEditing = () => {
                this.changingKey = false;
                this.updateRow();
            };

            shortcutEditor.connect('activate', () => {
                const newaccelstring = '';
                shortcutEditor.set_text('');
                this.writeaccel(this.actionNamed, newaccelstring);
                popover.popdown();
            }); // on Enter

            shortcutEditor.connect('icon-press', (entry, position) => {
                switch (position) {
                case Gtk.EntryIconPosition.PRIMARY:
                    this.writeaccel(this.actionNamed, this.defaultAccel);
                    popover.hide();
                    break;
                case Gtk.EntryIconPosition.SECONDARY:
                    shortcutEditor.emit('activate');
                    break;
                }
            });


            // On popover close (via outside click)
            popover.connect('hide', () => {
                finishEditing();
                popover.unparent();
                popover = null;
            });

            keyController.connect(
                'key-pressed', (actor, keyval, keycode, state) => {
                    let newaccelstring;

                    if (keyval === Gdk.KEY_Escape)
                        popover.popdown();

                    if (state &&
                    keyval !== Gdk.KEY_Shift_L &&
                    keyval !== Gdk.KEY_Shift_R &&
                    keyval !== Gdk.KEY_Control_L &&
                    keyval !== Gdk.KEY_Control_R &&
                    keyval !== Gdk.KEY_Alt_L &&
                    keyval !== Gdk.KEY_Alt_R &&
                    keyval !== Gdk.KEY_Meta_L &&
                    keyval !== Gdk.KEY_Meta_R &&
                    keyval !== Gdk.KEY_Super_L &&
                    keyval !== Gdk.KEY_Super_R &&
                    keyval !== Gdk.KEY_Caps_Lock &&
                    keyval !== Gdk.KEY_Num_Lock &&
                    keyval !== Gdk.KEY_AltGr_L &&
                    keyval !== Gdk.KEY_AltGr_R &&
                    keyval !== Gdk.KEY_ISO_Level3_Shift &&
                    keyval !== Gdk.KEY_ISO_Level3_Lock &&
                    keyval !== Gdk.KEY_ISO_Level5_Shift &&
                    keyval !== Gdk.KEY_ISO_Level5_Lock
                    ) {
                        const mask =
                            state & Gtk.accelerator_get_default_mod_mask();

                        newaccelstring = Gtk.accelerator_name(keyval, mask);
                        shortcutEditor.set_text(newaccelstring);
                        const oldaccelstring = this.readaccel(this.actionNamed);

                        if (oldaccelstring !== newaccelstring)
                            this.writeaccel(this.actionNamed, newaccelstring);

                        popover.hide();
                    }

                    return true;
                });
        }
    }
);



const ShortcutViewer = GObject.registerClass(
class ShortcutViewer extends Adw.PreferencesGroup {
    constructor(params = {}) {
        super({});
        this._shortcutManager = params.manager;
        this._actionMap = this._shortcutManager._mainApp;

        this.readaccel =
            this._shortcutManager.readActionShortcut
            .bind(this._shortcutManager);

        this.writeaccel =
            this._shortcutManager.writeActionShortcut
            .bind(this._shortcutManager);

        this._descriptions = DefaultShortcuts;
        this.set_title(_('Local Shortcuts'));
        this.set_description(_('Application Keyboard Shortcuts'));
        this._addLocalShortcuts();
    }

    _addLocalShortcuts() {
        if (!this._actionMap)
            return;

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

        for (const action of actions) {
            if (!this._descriptions[action]?.Edit)
                continue;

            const actionRow =
                new EditableShortcutRow({
                    'actionname': action,
                    'actionmap': this._actionMap,
                    'readaccel': this.readaccel.bind(this),
                    'writeaccel': this.writeaccel.bind(this),
                });

            this.add(actionRow);
        }
    }
});

const GlobalShortcutEditor = GObject.registerClass(
    class GlobalShortcutEditor extends Adw.PreferencesGroup {
        constructor(settings, params = {}) {
            super(params);
            this._desktopSettings = settings;
            this.set_title(_('Global Shortcuts'));
            this.set_description(_('Sytem Keyboard Shortcuts'));
            this._description = GlobalShortcuts;
            this._addGlobalShortcuts();
        }

        _addGlobalShortcuts() {
            for (const actionName in this._description) {
                const key = actionName.toLowerCase();

                let currentAccel =
                    this._desktopSettings.get_strv(key);

                currentAccel = currentAccel[0]
                    ? currentAccel[0] : _('None');

                const subtitlestring = _('Current shortcut:');
                const actionRow =
                    this.addActionRowButton(
                        this._description[actionName].Hint,
                        `${subtitlestring} ${currentAccel}`,
                        _('Edit'),
                        this.setShortcutrow.bind(this),
                        actionName
                    );

                this.add(actionRow);
            }
        }

        addActionRowButton(
            title, subtitle, buttonLabel, action, actionName = null
        ) {
            const actionRow = Adw.ActionRow.new();

            actionRow.set_title(title);

            if (subtitle) {
                actionRow.use_markup = false;
                actionRow.set_subtitle(subtitle);
                if (Adw.get_minor_version() > 2)
                    actionRow.set_subtitle_selectable(true);
            }

            if (buttonLabel && action) {
                const button = Gtk.Button.new_with_label(buttonLabel);

                button.set_size_request(120, -1);
                button.set_halign(Gtk.Align.END);
                button.set_valign(Gtk.Align.CENTER);
                button.set_hexpand(true);
                button.set_vexpand(false);
                button.connect(
                    'clicked',
                    action.bind(this, actionRow, button, actionName)
                );

                actionRow.add_suffix(button);
                actionRow.set_activatable_widget(button);
                const icon = Gtk.Image.new_from_icon_name('document-edit');
                actionRow.add_prefix(icon);
            }

            return actionRow;
        }

        setShortcutrow(actionrow, button, key) {
            if (!key)
                return;

            if (this.changingKey)
                return;

            this.changingKey = true;
            const oldlabel = button.get_label();
            button.set_label(_('Type new...'));
            actionrow.set_subtitle(_('Press Enter or Return to clear...'));

            const shortcutEditor = new Gtk.Entry({
                editable: false,
                hexpand: false,
                vexpand: false,
                halign: Gtk.Align.END,
                valign: Gtk.Align.CENTER,
                xalign: 0,  // Right-align
                placeholder_text:
                    _('Modifier + Key (e.g. Ctrl + Alt + D)'),
                width_chars: 30,
                can_focus: true,
                has_frame: true,
            });

            const keyController = new Gtk.EventControllerKey();
            shortcutEditor.add_controller(keyController);

            let popover = new Gtk.Popover({
                has_arrow: false,
                autohide: true,
                child: shortcutEditor,
            });
            popover.set_parent(button);
            popover.set_position(Gtk.PositionType.BOTTOM);
            popover.popup();

            shortcutEditor.grab_focus_without_selecting();

            const finishEditing = () => {
                button.set_label(oldlabel);
                const accel = this._desktopSettings.get_strv(key.toLowerCase());
                const string = accel[0] ? accel[0] : _('None');
                actionrow.set_subtitle(
                    // eslint-disable-next-line prefer-template
                    _('Current shortcut: ') + string
                );
                this.changingKey = false;
            };

            shortcutEditor.connect('activate', () => {
                const newaccelstring = '';
                shortcutEditor.set_text('');
                this._desktopSettings.set_strv(
                    key.toLowerCase(),
                    [newaccelstring]
                );
                popover.popdown();
            }); // on Enter

            // On popover close (via outside click)
            popover.connect('hide', () => {
                finishEditing();
                popover.unparent();
                popover = null;
            });

            keyController.connect(
                'key-pressed', (actor, keyval, keycode, state) => {
                    if (keyval === Gdk.KEY_Escape)
                        popover.popdown();

                    if (state &&
                    keyval !== Gdk.KEY_Shift_L &&
                    keyval !== Gdk.KEY_Shift_R &&
                    keyval !== Gdk.KEY_Control_L &&
                    keyval !== Gdk.KEY_Control_R &&
                    keyval !== Gdk.KEY_Alt_L &&
                    keyval !== Gdk.KEY_Alt_R &&
                    keyval !== Gdk.KEY_Meta_L &&
                    keyval !== Gdk.KEY_Meta_R &&
                    keyval !== Gdk.KEY_Super_L &&
                    keyval !== Gdk.KEY_Super_R &&
                    keyval !== Gdk.KEY_Caps_Lock &&
                    keyval !== Gdk.KEY_Num_Lock &&
                    keyval !== Gdk.KEY_AltGr_L &&
                    keyval !== Gdk.KEY_AltGr_R &&
                    keyval !== Gdk.KEY_ISO_Level3_Shift &&
                    keyval !== Gdk.KEY_ISO_Level3_Lock &&
                    keyval !== Gdk.KEY_ISO_Level5_Shift &&
                    keyval !== Gdk.KEY_ISO_Level5_Lock
                    ) {
                        const mask =
                            state & Gtk.accelerator_get_default_mod_mask();

                        const accelstring = Gtk.accelerator_name(keyval, mask);
                        shortcutEditor.set_text(accelstring);

                        this._desktopSettings.set_strv(
                            key.toLowerCase(),
                            [accelstring]
                        );

                        popover.hide();
                    }

                    return true;
                });
        }
    }
);

const ShortcutManager = class {
    constructor(desktopManager) {
        this._desktopManager = desktopManager;
        this._desktopSettings = desktopManager.Prefs.desktopSettings;
        this._mainApp = desktopManager.mainApp;
        this._overRideMap = new Map();
        this._initializeOurShortcuts();
        this._monitorUserShortcuts();
        this._refreshUserShortcuts();
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

    _monitorUserShortcuts() {
        this._userShortcutMonitor = this._desktopSettings.connect(
            'changed',
            (obj, key) => {
                if (key === 'shortcutoverrides')
                    this._refreshUserShortcuts();
            }
        );
    }

    _refreshUserShortcuts() {
        this._readUserShortcuts();
        this._setAllAccels();
    }

    _readUserShortcuts() {
        const value =
            this._desktopSettings.get_value('shortcutoverrides')
            .deep_unpack();

        this._overRideMap = new Map(Object.entries(value));
    }

    _writeUserShortcuts() {
        const value = Object.fromEntries(this._overRideMap);
        const variant = new GLib.Variant('a{ss}', value);
        this._desktopSettings.set_value('shortcutoverrides', variant);
    }

    _setAllAccels() {
        for (const actionName of Object.keys(DefaultShortcuts))
            this._setAccel(actionName);
    }

    _setAccel(actionName) {
        const action = this._mainApp.lookup_action(actionName);

        if (!action)
            return;

        const accel = this._readOverRideActionShortcut(actionName);
        const accelarray = accel.length ? accel.split(',') : [];

        this._mainApp.set_accels_for_action(
            `app.${actionName}`, accelarray
        );
    }

    _readOverRideActionShortcut(actionName) {
        const defaultShortCut = DefaultShortcuts[actionName].Accel ?? '';
        const userShortcut = this._overRideMap.get(actionName);

        const overrideShortCut = this._overRideMap.has(actionName)
            ? userShortcut
            : defaultShortCut;

        return overrideShortCut;
    }

    readActionShortcut(actionName) {
        return this._mainApp.get_accels_for_action(`app.${actionName}`);
    }

    writeActionShortcut(actionName, accel) {
        if (accel.length || accel === '')
            this._overRideMap.set(actionName, accel);
        else
            this._overRideMap.delete(actionName);

        this._desktopSettings.block_signal_handler(this._userShortcutMonitor);
        this._writeUserShortcuts();
        this._setAccel(actionName);
        this._desktopSettings.unblock_signal_handler(this._userShortcutMonitor);
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

        const shortcutsWindow = new Adw.PreferencesWindow();

        shortcutsWindow.set_can_navigate_back(true);
        shortcutsWindow.set_search_enabled(true);
        shortcutsWindow.set_application(this._mainApp);
        shortcutsWindow.set_default_size(400, 600);
        shortcutsWindow.set_decorated(true);
        shortcutsWindow.set_deletable(true);
        shortcutsWindow.set_name('shortcutsWindow');
        shortcutsWindow.set_title('Shortcuts');
        shortcutsWindow.set_default_size(600, 650);
        // Do not make modal or skip-taskbar as we have a .desktop icon
        // showing up in the dock for the window to assist navigation.
        // const modal = true;
        // this._DesktopIconsUtil.windowHidePagerTaskbarModal(
        //     shortcutsWindow, modal);

        const shortcutsFrame = Adw.PreferencesPage.new();
        shortcutsFrame.set_name(_('Keyboard Shortcuts'));

        const globalShortcutGroup =
            new GlobalShortcutEditor(this._desktopSettings);

        shortcutsFrame.add(globalShortcutGroup);

        const localShortcutGroup = new ShortcutViewer({manager: this});
        shortcutsFrame.add(localShortcutGroup);

        shortcutsWindow.add(shortcutsFrame);

        this._shortCutsWindow = shortcutsWindow;

        shortcutsWindow.connect('close-request', () => {
            this._shortCutsWindow = null;
        });

        shortcutsWindow.show();
    }
};
