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

        // Gtk
        let schemaGtk = schemaSource.lookup(this._Enums.SCHEMA_GTK, true);
        this.gtkSettings = new Gio.Settings({ settings_schema: schemaGtk });

        // Gnome Files
        let schemaObj = schemaSource.lookup(this._Enums.SCHEMA_NAUTILUS, true);
        if (!schemaObj) {
            this.nautilusSettings = null;
            this.CLICK_POLICY_SINGLE = false;
        } else {
            this.nautilusSettings = new Gio.Settings({ settings_schema: schemaObj });
            this.nautilusSettings.connect('changed', this._onNautilusSettingsChanged.bind(this));
            this._onNautilusSettingsChanged();
        }

        // Compression
        const compressionSchema = schemaSource.lookup(this._Enums.SCHEMA_NAUTILUS_COMPRESSION, true);
        if (!compressionSchema)
            this.nautilusCompression = null;
        else
            this.nautilusCompression = new Gio.Settings({ settings_schema: compressionSchema });

        // Mutter Settings
        let schemaMutter = schemaSource.lookup(this._Enums.SCHEMA_MUTTER, true);
        if (schemaMutter)
            this.mutterSettings = new Gio.Settings({ settings_schema: schemaMutter });

        this._preferencesFrame = new Data.PreferencesFrame.PreferencesFrame(Gtk, GObject, this.desktopSettings, this.nautilusSettings, this.gtkSettings, _);

        // Our Settings
        this.desktopSettings = this._get_schema(this._Enums.SCHEMA);
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
        this._updateIconSize();
        this._StartCorner = this._Enums.START_CORNER[this.desktopSettings.get_string('start-corner')];
        this._UnstackList = this.desktopSettings.get_strv('unstackedtypes');
        this.SortOrder = this._Enums.SortOrder[this.desktopSettings.get_string(this._Enums.SortOrder.ORDER)];
        this.addVolumesOpposite = this.desktopSettings.get_boolean('add-volumes-opposite');
        this.showHidden = this.gtkSettings.get_boolean('show-hidden');
        this.showDropPlace = this.desktopSettings.get_boolean('show-drop-place');
        this.useNemo = this.desktopSettings.get_boolean('use-nemo');
        this.showLinkEmblem = this.desktopSettings.get_boolean('show-link-emblem');
        this.darkText = this.desktopSettings.get_boolean('dark-text-in-labels');
        this.keepStacked = this.desktopSettings.get_boolean('keep-stacked');
        this.keepArranged = this.desktopSettings.get_boolean('keep-arranged');
        this.sortSpecialFolders = this.desktopSettings.get_boolean('sort-special-folders');
        this.showOnSecondaryMonitor = this.desktopSettings.get_boolean('show-second-monitor');
        this.showDropPlace = this.desktopSettings.get_boolean('show-drop-place');
    }

    getPreferencesFrame() {
        this.PrefrencesFrame = this._preferencesFrame.getFrame();
        return this.PreferencesFrame;
    }

    // Updaters
    _updateIconSize() {
        let iconSize = this.desktopSettings.get_string('icon-size');
        this.IconSize = this._Enums.ICON_SIZE[iconSize];
        this.DesiredWidth = this._Enums.ICON_WIDTH[iconSize];
        this.DesiredHeight = this._Enums.ICON_HEIGHT[iconSize];
    }

    // Monitoring
    init(desktopManager) {
        this._desktopManager = desktopManager;
        this._monitorDesktopSettings();
    }
        
    _monitorDesktopSettings() {
        this._settingsId = this.desktopSettings.connect('changed', (obj, key) => {
            if (key === 'dark-text-in-labels')  {
                this.darkText = this.desktopSettings.get_boolean('dark-text-in-labels');
                this._desktopManager._updateDesktop().catch(e => {
                    print(`Exception while updating desktop after "Dark Text" changed: ${e.message}\n${e.stack}`);
                });
                return;
            }
            if (key === 'show-link-emblem') {
                this.showLinkEmblem = this.desktopSettings.get_boolean('show-link-emblem');
                this.desktopManager._updateDesktop().catch(e => {
                    print(`Exception while updating desktop after "Show Emblems" changed: ${e.message}\n${e.stack}`);
                });
                return;
            }
            if (key === 'use-nemo') {
                this.useNemo = this.desktopSettings.get_boolean('use-nemo');
                return;
            }
            if (key === 'sort-special-folders') {
                this.sortSpecialFolders = this.desktopSettings.get_boolean('sort-special-folders');
                return;
            }
            if (key === 'add-volumes-opposite') {
                this.addVolumesOpposite = this.desktopSettings.get_boolean('add-volumes-opposite');
                return;
            }
            if (key === 'show-second-monitor') {
                this.showOnSecondaryMonitor = this.desktopSettings.get_boolean('show-second-monitor');
                return;
            }
            if (key === 'icon-size') {
                this._updateIconSize();
                this._desktopManager.onIconSizeChanged();
                return;
            }
            if (key === this.Enums.SortOrder.ORDER) {
                this.SortOrder = this._Enums.SortOrder[this.desktopSettings.get_string(this._Enums.SortOrder.ORDER)];
                this._desktopManager.onSortOrderChanged();
            }
            if (key === 'unstackedtypes') {
                this._UnstackList = this.desktopSettings.get_strv('unstackedtypes');
                this._desktopManager.onUnstackedTypesChanged();
                return;
            }
            if (key === 'keep-stacked') {
                this.keepStacked = this.desktopSettings.get_boolean('keep-stacked');
                this._desktopManager.onkeepStackedChanged();
                return;
            }
            if (key === 'keep-arranged') {
                this.keepArranged = this.Prefs.desktopSettings.get_boolean('keep-arranged');
                if (this.keepArranged)
                    this.doSorts({ redisplay: true });

                return;
            }
            if (key === 'show-drop-place') {
                this.showDropPlace = this.Prefs.desktopSettings.get_boolean('show-drop-place');
                return;
            }
            if (key === 'start-corner')
                this.Prefs.updateStartCorner();
            this._updateDesktop().catch(e => {
                print(`Exception while updating desktop after the settings changed: ${e.message}\n${e.stack}`);
            });
        });
        this.Prefs.gtkSettings.connect('changed', (obj, key) => {
            if (key === 'show-hidden') {
                this._showHidden = this.Prefs.gtkSettings.get_boolean('show-hidden');
                this._updateDesktop().catch(e => {
                    print(`Exception while updating desktop after the hidden settings changed: ${e.message}\n${e.stack}`);
                });
                this.templatesMonitor.updateEntries();
            }
        });
        this.Prefs.nautilusSettings.connect('changed', (obj, key) => {
            if (key === 'show-image-thumbnails') {
                this._updateDesktop().catch(e => {
                    print(`Exception while updating Desktop after the GNOME Files settings changed: ${e.message}\n${e.stack}`);
                });
            }
        });
        this._gtkIconTheme = Gtk.IconTheme.get_for_display(Gdk.Display.get_default());
        this._gtkIconTheme.connect('changed', () => {
            this._updateDesktop().catch(e => {
                print(`Exception while updating desktop after an GTK icon-theme change: ${e.message}\n${e.stack}`);
            });
        });
        this._volumeMonitor = Gio.VolumeMonitor.get();
        this._volumeMonitor.connect('mount-added', () => {
            this._updateDesktop().catch(e => {
                print(`Exception while updating Desktop after a mount was added: ${e.message}\n${e.stack}`);
            });
        });
        this._volumeMonitor.connect('mount-removed', () => GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
            this._updateDesktop().catch(e => {
                print(`Exception while updating desktop after a mount was removed: ${e.message}\n${e.stack}`);
            });
            return GLib.SOURCE_REMOVE;
        }));
        this.Prefs.mutterSettings.connect('changed', () => {
            this._getPremultiplied();
            for (let desktop of this._desktops)
                desktop._premultiplied = this._premultiplied;
            this._requestGeometryUpdate();
        });
    }

    // Setters
    set SortOrder(order) {
        this._sortOrder = order;
        let x = Object.values(this._Enums.SortOrder).indexOf(order);
        this.desktopSettings.set_enum(this._Enums.SortOrder.ORDER, x);
    }

    set UnstackList(array) {
        this._UnstackList = array;
        this.desktopSettings.set_strv('unstackedtypes', array);
    }

    // Getters
    get StartCorner() {
        // Return a shallow copy that can be mutated without affecting other icons with cornerinversion in DesktopGrid
        return [...this._StartCorner];
    }

    get UnstackList() {
        // Return a shallow copy that can be mutated without affecting the original
        return [...this._UnstackList];
    }
};
