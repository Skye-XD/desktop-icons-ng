/* Adw-DING: Desktop Icons New Generation for GNOME Shell
 *
 * Gtk4 Port Copyright (C) 2025 Sundeep Mediratta (smedius@gmail.com)
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

import {Gio} from '../dependencies/gi.js';

import {_} from '../dependencies/gettext.js';

import {
    Enums,
    SpecialFolderIcon,
    VolumeIcon,
    SymLinkIcon,
    DesktopFileIcon,
    AppImageFileIcon,
    FileItemIcon
} from '../dependencies/localFiles.js';

export {IconCreator};

const IconCreator = class {
    constructor(desktopManager, file, fileInfo, fileExtra, custom) {
        const isSymLink = fileInfo.get_attribute_boolean(
            Gio.FILE_ATTRIBUTE_STANDARD_IS_SYMLINK);

        let BaseType;

        const attributeContentType = fileInfo.get_content_type();

        switch (attributeContentType) {
        case 'application/x-desktop':
            BaseType = DesktopFileIcon;
            break;
        case 'application/vnd.appimage':
            BaseType = AppImageFileIcon;
            break;
        default:
            BaseType = FileItemIcon;
        }

        if (fileExtra === Enums.FileType.USER_DIRECTORY_HOME ||
            fileExtra === Enums.FileType.USER_DIRECTORY_TRASH)
            BaseType = SpecialFolderIcon;


        if (fileExtra === Enums.FileType.EXTERNAL_DRIVE)
            BaseType = VolumeIcon;

        if (!isSymLink) {
            return new BaseType(
                desktopManager,
                file,
                fileInfo,
                fileExtra,
                custom
            );
        } else {
            return new SymLinkIcon(
                BaseType,
                desktopManager,
                file,
                fileInfo,
                fileExtra,
                custom
            );
        }
    }
};
