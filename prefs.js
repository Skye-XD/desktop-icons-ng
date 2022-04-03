
/* Desktop Icons GNOME Shell extension
 *
 * Copyright (C) 2019 Sergio Costas (rastersoft@gmail.com)
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

const ExtensionUtils = imports.misc.extensionUtils;
const Gettext = imports.gettext;
const Me = ExtensionUtils.getCurrentExtension();
const extensionPath = Me.dir.get_path();
const Enums = Me.imports.enums;
const Preferences = Me.imports.preferences;

var _ = Gettext.domain('ding').gettext;

function init() {
    Preferences.init(extensionPath, Enums);
}

function buildPrefsWidget() {

    let localedir = Me.dir.get_child('locale');
    if (localedir.query_exists(null))
        Gettext.bindtextdomain('ding', localedir.get_path());

    let frame = Preferences.get_preferencesFrame();
    frame.show();

    return frame;
}
