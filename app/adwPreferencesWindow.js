/* Desktop Icons GNOME Shell extension
 *
 * Copyright (C) 2023 Sundeep Mediratta (smedius@gmail.com)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

var AdwPreferencesWindow = class {
    constructor(Gtk, GObject, desktopSettings, nautilusSettings, gtkSettings, getTextDomain, Adw, Gio) {
        this._Gio = Gio;
        this._Gtk = Gtk;
        this._GObject = GObject;
        this.desktopSettings = desktopSettings;
        this.nautilusSettings = nautilusSettings;
        this.gtkSettings = gtkSettings;
        this._Adw = Adw;
        this._ = getTextDomain;
        this.listObject = this.makeListObject('peferences-list');
        this.selectorCombo = this.makeKeyRowSelectorObject();
    }

    getAdwPreferencesWindow(window = null) {
        var prefsWindow;
        if (window)
            prefsWindow = window;
        else
            prefsWindow = new this._Adw.PreferencesWindow();
        prefsWindow.set_can_navigate_back(true);
        prefsWindow.set_search_enabled(true);

        const prefsFrame = new this._Adw.PreferencesPage();
        prefsFrame.set_name(this._('Desktop'));
        prefsFrame.set_title(this._('Desktop'));
        prefsFrame.set_icon_name('user-black-desktop');

        const filesPrefsFrame = new this._Adw.PreferencesPage();
        filesPrefsFrame.set_name(this._('Files'));
        filesPrefsFrame.set_title(this._('Files'));
        filesPrefsFrame.set_icon_name('user-black-home');

        const tweaksFrame = new this._Adw.PreferencesPage();
        tweaksFrame.set_name(this._('Tweaks'));
        tweaksFrame.set_title(this._('Tweaks'));
        tweaksFrame.set_icon_name('view-more');

        prefsWindow.add(prefsFrame);
        prefsWindow.add(filesPrefsFrame);
        prefsWindow.add(tweaksFrame);
        prefsWindow.set_visible(prefsFrame);

        const desktopGroup = new this._Adw.PreferencesGroup();
        desktopGroup.set_title(this._('Desktop Settings'));
        desktopGroup.set_description(this._('Settings for the Desktop Program'));
        prefsFrame.add(desktopGroup);

        const volumesGroup = new this._Adw.PreferencesGroup();
        volumesGroup.set_title(this._('Volumes'));
        volumesGroup.set_description(this._('Desktop volumes display'));
        prefsFrame.add(volumesGroup);

        const filesGroup = new this._Adw.PreferencesGroup();
        filesGroup.set_title(this._('Files Settings'));
        filesGroup.set_description(this._('Settings shared with Gnome Files'));
        filesPrefsFrame.add(filesGroup);

        const tweaksGroup = new this._Adw.PreferencesGroup();
        tweaksGroup.set_title(this._('Tweaks'));
        tweaksGroup.set_description(this._('Miscellaneous Tweaks'));
        tweaksFrame.add(tweaksGroup);

        desktopGroup.add(this.addActionRowSelector(this.desktopSettings,
            'icon-size',
            this._('Size for the desktop icons'),
            {
                'tiny': this._('Tiny'),
                'small': this._('Small'),
                'standard': this._('Standard'),
                'large': this._('Large'),
            }
        ));
        desktopGroup.add(this.addActionRowSelector(this.desktopSettings,
            'start-corner',
            this._('New icons alignment'),
            {
                'top-left': this._('Top left corner'),
                'top-right': this._('Top right corner'),
                'bottom-left': this._('Bottom left corner'),
                'bottom-right': this._('Bottom right corner'),
            }
        ));
        desktopGroup.add(this.addActionRowSwitch(this.desktopSettings, 'show-second-monitor', this._('Add new icons to Secondary Monitors first, if available')));

        volumesGroup.add(this.addActionRowSwitch(this.desktopSettings, 'show-home', this._('Show the personal folder on the desktop')));
        volumesGroup.add(this.addActionRowSwitch(this.desktopSettings, 'show-trash', this._('Show the trash icon on the desktop')));
        volumesGroup.add(this.addActionRowSwitch(this.desktopSettings, 'show-volumes', this._('Show external drives on the desktop')));
        volumesGroup.add(this.addActionRowSwitch(this.desktopSettings, 'show-network-volumes', this._('Show network drives on the desktop')));
        volumesGroup.add(this.addActionRowSwitch(this.desktopSettings, 'add-volumes-opposite', this._('Add new drives to the opposite side of the desktop')));

        tweaksGroup.add(this.addActionRowSwitch(this.desktopSettings, 'show-drop-place', this._('Highlight the drop grid during Drag and Drop')));
        tweaksGroup.add(this.addActionRowSwitch(this.desktopSettings, 'use-nemo', this._('Use Nemo to open folders')));
        tweaksGroup.add(this.addActionRowSwitch(this.desktopSettings, 'show-link-emblem', this._('Add an emblem to soft links')));
        tweaksGroup.add(this.addActionRowSwitch(this.desktopSettings, 'dark-text-in-labels', this._('Use dark text in icon labels')));

        filesGroup.add(this.addActionRowSelector(this.nautilusSettings,
            'click-policy',
            this._('Action to Open Items'),
            {
                'single': this._('Single click'),
                'double': this._('Double click'),
            }));
        filesGroup.add(this.addActionRowSelector(this.nautilusSettings,
            'show-image-thumbnails',
            this._('Show image thumbnails'),
            {
                'always': this._('Always'),
                'local-only': this._('On this computer only'),
                'never': this._('Never'),
            }));
        filesGroup.add(this.addActionRowSwitch(this.nautilusSettings, 'show-delete-permanently', this._('Show a context menu item to delete permanently')));
        filesGroup.add(this.addActionRowSwitch(this.gtkSettings, 'show-hidden', this._('Show hidden files')));

        if (!window)
            return prefsWindow;
    }

    addActionRowSwitch(settings, key, labelText) {
        const actionRow = this._Adw.ActionRow.new();
        const switcher = new this._Gtk.Switch({ active: settings.get_boolean(key) });
        switcher.set_halign(this._Gtk.Align.END);
        switcher.set_valign(this._Gtk.Align.CENTER);
        switcher.set_hexpand(false);
        switcher.set_vexpand(false);
        actionRow.set_title(labelText);
        actionRow.add_suffix(switcher);
        settings.bind(key, switcher, 'active', 3);  // Gio.SettingsBindFlags.DEFAULT = 3
        actionRow.set_activatable_widget(switcher);

        return actionRow;
    }

    addActionRowSelector(settings, key, labelText, elements) {
        const actionRow = new this.selectorCombo();
        actionRow.set_title(labelText);
        actionRow.set_use_subtitle(false);
        actionRow.makeEnumn(elements);

        const listStore = new this._Gio.ListStore(this.listObject._$gtype);
        for (let keys in elements) {
            let listObject = new this.listObject();
            listObject.indexkey = keys;
            listObject.description = elements[keys];
            listStore.append(listObject);
        }
        actionRow.set_model(listStore);

        let listFactory = new this._Gtk.SignalListItemFactory();
        listFactory.connect('setup', (actor, listitem) => {
            let label = new this._Gtk.Label();
            listitem.set_child(label);
        });
        listFactory.connect('bind', (actor, listitem) => {
            let label = listitem.get_child();
            let item = listitem.get_item();
            label.set_text(item.description);
        });
        actionRow.set_factory(listFactory);

        let expression = new this._Gtk.PropertyExpression(this.listObject, null, 'description');
        actionRow.set_expression(expression);

        actionRow.set_selected(settings.get_enum(key));
        settings.bind(key, actionRow, 'indexkey', 3);  // Gio.SettingsBindFlags.DEFAULT = 3

        return actionRow;
    }

    makeListObject(key) {
        const listObject = this._GObject.registerClass({
            GTypeName: key,
            Properties: {
                'indexkey': this._GObject.ParamSpec.string(
                    'indexkey',
                    'Indexkey',
                    'A read-write string property',
                    this._GObject.ParamFlags.READWRITE,
                    ''
                ),
                'description': this._GObject.ParamSpec.string(
                    'description',
                    'Description',
                    'A read-write string property',
                    this._GObject.ParamFlags.READWRITE,
                    ''
                ),
            },
        }, class listObject extends this._GObject.Object {
            constructor(constructProperties = {}) {
                super(constructProperties);
            }

            get indexkey() {
                if (this._indexkey === undefined)
                    this._indexkey = '';

                return this._indexkey;
            }

            set indexkey(value) {
                if (this.indexkey === value)
                    return;

                this._indexkey = value;
                this.notify('indexkey');
            }

            get description() {
                if (this._description === undefined)
                    this._description = '';

                return this._description;
            }

            set description(value) {
                if (this.description === value)
                    return;

                this._description = value;
                this.notify('description');
            }
        });

        return listObject;
    }

    makeKeyRowSelectorObject() {
        const ComboRowWithKey = this._GObject.registerClass({
            GTypeName: 'ComboRowWithKey',
            Properties: {
                'indexkey': this._GObject.ParamSpec.string(
                    'indexkey',
                    'Indexkey',
                    'A read-write string property',
                    this._GObject.ParamFlags.READWRITE,
                    ''
                ),
            },
        }, class ComboRowWithKey extends this._Adw.ComboRow {
            constructor(constructProperties = {}) {
                super(constructProperties);
                this._indexKey = '';
                this.connect('notify::selected-item', () => {
                    let item = this.get_selected_item();
                    this.indexkey = item.indexkey;
                });
            }

            makeEnumn(enumexpression) {
                this.enumExpression = {};
                let i = 0;
                for (let key in enumexpression) {
                    this.enumExpression[key] = parseInt(i);
                    i += 1;
                }
            }

            get indexkey() {
                if (this._indexkey === undefined)
                    this._indexkey = '';

                return this._indexkey;
            }

            set indexkey(value) {
                if (this.indexkey === value)
                    return;

                this._indexkey = value;
                if (this.get_selected !== this.enumExpression[value])
                    this.set_selected(this.enumExpression[value]);

                this.notify('indexkey');
            }
        });

        return ComboRowWithKey;
    }
};

