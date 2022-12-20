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

imports.gi.versions.Gtk = '4.0';

const { GLib, Gtk, GObject, Gio } = imports.gi;
const GioSSS = Gio.SettingsSchemaSource;

const Gettext = imports.gettext;

var _ = Gettext.domain('gtk4-ding').gettext;

var Preferences = class {
    constructor(Data) {
        this._extensionPath = Data.codePath;
        this._Enums = Data.Enums;
        let schemaSource = GioSSS.get_default();
        let schemaGtk = schemaSource.lookup(this._Enums.SCHEMA_GTK, true);
        this.gtkSettings = new Gio.Settings({ settings_schema: schemaGtk });
        let schemaObj = schemaSource.lookup(this._Enums.SCHEMA_NAUTILUS, true);
        if (!schemaObj) {
            this.nautilusSettings = null;
            this.CLICK_POLICY_SINGLE = false;
        } else {
            this.nautilusSettings = new Gio.Settings({ settings_schema: schemaObj });
            this.nautilusSettings.connect('changed', this._onNautilusSettingsChanged.bind(this));
            this._onNautilusSettingsChanged();
        }
        const compressionSchema = schemaSource.lookup(this._Enums.SCHEMA_NAUTILUS_COMPRESSION, true);
        if (!compressionSchema)
            this.nautilusCompression = null;
        else
            this.nautilusCompression = new Gio.Settings({ settings_schema: compressionSchema });

        this.desktopSettings = this._get_schema(this._Enums.SCHEMA);

        let schemaMutter = schemaSource.lookup(this._Enums.SCHEMA_MUTTER, true);
        if (schemaMutter)
            this.mutterSettings = new Gio.Settings({ settings_schema: schemaMutter });

        this._preferencesFrame = new Data.PreferencesFrame.PreferencesFrame(Gtk, GObject, this.desktopSettings, this.nautilusSettings, this.gtkSettings, _);
        this._cacheInitialSettings();
    }

    _onNautilusSettingsChanged() {
        this.CLICK_POLICY_SINGLE = this.nautilusSettings.get_string('click-policy') === 'single';
    }

    _get_schema(schema) {
        // check if this extension was built with "make zip-file", and thus
        // has the schema files in a subfolder
        // otherwise assume that extension has been installed in the
        // same prefix as gnome-shell (and therefore schemas are available
        // in the standard folders)
        let schemaSource;
        let schemaFile = Gio.File.new_for_path(GLib.build_filenamev([this._extensionPath, 'schemas', 'gschemas.compiled']));
        if (schemaFile.query_exists(null))
            schemaSource = GioSSS.new_from_directory(GLib.build_filenamev([this._extensionPath, 'schemas']), GioSSS.get_default(), false);
        else
            schemaSource = GioSSS.get_default();


        let schemaObj = schemaSource.lookup(schema, true);
        if (!schemaObj)
            throw new Error(`Schema ${schema} could not be found for extension. Please check your installation.`);

        return new Gio.Settings({ settings_schema: schemaObj });
    }

    _cacheInitialSettings() {
        this.PrefrencesFrame = this._preferencesFrame.getFrame();
        this.updateIconSize();
        this.getStartCorner();
        this.getSortOrder();
    }

    updateIconSize() {
        let iconSize = this.desktopSettings.get_string('icon-size')
        this.IconSize = this._Enums.ICON_SIZE[iconSize];
        this.DesiredWidth = this._Enums.ICON_WIDTH[iconSize];
        this.DesiredHeight = this._Enums.ICON_HEIGHT[iconSize];
    }

    setSortOrder(order) {
        let x = Object.values(this._Enums.SortOrder).indexOf(order);
        this.desktopSettings.set_enum(this._Enums.SortOrder.ORDER, x);
    }

    setUnstackList(array) {
        this.desktopSettings.set_strv('unstackedtypes', array);
    }

    getPreferencesFrame() {
        return this.PreferencesFrame;
    }

    getIconSize() {
        return this.IconSize;
    }

    getDesiredWidth() {
        return this.DesiredWidth;
    }

    getDesiredHeight() {
        return this.DesiredHeight;
    }

    getStartCorner() {
        this.StartCorner = this._Enums.START_CORNER[this.desktopSettings.get_string('start-corner')].slice();
        return this.StartCorner;
    }

    getSortOrder() {
        this.SortOrder = this._Enums.SortOrder[this.desktopSettings.get_string(this._Enums.SortOrder.ORDER)];
        return this.SortOrder;
    }

    getUnstackList() {
        this.UnstackList = this.desktopSettings.get_strv('unstackedtypes');
        return this.UnstackList;
    }
};
