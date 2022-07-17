/* DING: Desktop Icons New Generation for GNOME Shell
 *
 * Copyright (C) 2022 Sundeep Mediratta (smedius@gmail.com) port to Gtk.app-
 * to communicate over dbus.
 *
 * Copyright (C) 2021 Sergio Costas (rastersoft@gmail.com)
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

var gnomedesktop;
var Gtk;
var GnomeDesktop;

try {
    imports.gi.versions.GnomeDesktop = '4.0';
    imports.gi.versions.Gtk = '4.0';
    gnomedesktop = 4;
    Gtk = imports.gi.Gtk;
    GnomeDesktop = imports.gi.GnomeDesktop;
} catch(e) {
    gnomedesktop = 3;
    imports.gi.versions.GnomeDesktop = '3.0';
    imports.gi.versions.Gtk = '3.0';
    Gtk = imports.gi.Gtk;
    GnomeDesktop = imports.gi.GnomeDesktop;
}

const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;

const useAsyncAPI =
    !!GnomeDesktop.DesktopThumbnailFactory.prototype.generate_thumbnail_async;

if (useAsyncAPI) {
    Gio._promisify(GnomeDesktop.DesktopThumbnailFactory.prototype,
        'generate_thumbnail_async',
        'generate_thumbnail_finish');
    Gio._promisify(GnomeDesktop.DesktopThumbnailFactory.prototype,
        'create_failed_thumbnail_async',
        'create_failed_thumbnail_finish');
    Gio._promisify(GnomeDesktop.DesktopThumbnailFactory.prototype,
        'save_thumbnail_async',
        'save_thumbnail_finish');
}

var ThumbnailLoader = class {

    constructor(codePath) {
        this._timeoutValue = 5000;
        this._codePath = codePath;
        this._thumbList = [];
        this._thumbnailScriptWatch = null;
        this._running = false;
        this._thumbnailFactory = GnomeDesktop.DesktopThumbnailFactory.new(GnomeDesktop.DesktopThumbnailSize.LARGE);
        if (useAsyncAPI) {
            print("Detected async api for thumbnails");
        } else {
            print("Failed to detected async api for thumbnails");
        }
    }
    
    _updateDesktopIcon(file, thumbnail) {
        file.thumbnailFile = thumbnail;
        file._updateIcon();
    }

    _updateThumbnail(file) {
        if (this.canThumbnail(file)) {
            let thumbnail = this.getThumbnail(file);
            if (thumbnail != null) {
                this._updateDesktopIcon(file, thumbnail);
            }
        }
    }

    _generateThumbnail(file, callback) {
        this._thumbList.push([file, callback]);
        if (!this._running) {
            this._launchNewBuild();
        }
    }

    _launchNewBuild() {
        let file, callback;
        do {
            if (this._thumbList.length == 0) {
                this._running = false;
                return;
            }
            // if the file disappeared while waiting in the queue, don't refresh the thumbnail
            [file, callback] = this._thumbList.shift();
            if (Gio.File.new_for_uri(file.uri).query_exists(null)) {
                if (this._thumbnailFactory.has_valid_failed_thumbnail(file.uri, file.modifiedTime)) {
                    if (callback) {
                        callback();
                    }
                    continue;
                } else {
                    break;
                }
            }
        } while(true);
        this._running = true;
        if (useAsyncAPI) {
            this._createThumbnailAsync(file, callback).catch(e => logError(e));
        } else {
            this._createThumbnailSubprocess(file, callback);
        }
    }

    async _createThumbnailAsync(file, callback) {
        const cancellable = new Gio.Cancellable();
        let timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, this._timeoutValue, () => {
            print(`Timeout while generating thumbnail for ${file.displayName}`);
            timeoutId = 0;
            cancellable.cancel();
            return GLib.SOURCE_REMOVE;
        });

        let modifiedTime;
        let fileInfo;
        try {
            fileInfo = await file.file.query_info_async('standard::content-type,time::modified',
                Gio.FileQueryInfoFlags.NONE, GLib.PRIORITY_DEFAULT, cancellable);
            modifiedTime = fileInfo.get_attribute_uint64('time::modified');
        } catch (e) {
            if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                logError(e, `Error while creating thumbnail: ${e.message}`);
            return false;
        }

        try {
            const thumbnailPixbuf = await this._thumbnailFactory.generate_thumbnail_async(
                file.uri, fileInfo.get_content_type(), cancellable);
            await this._thumbnailFactory.save_thumbnail_async(thumbnailPixbuf,
                file.uri, modifiedTime, cancellable);
        } catch (e) {
            if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                logError(e, `Error while creating thumbnail: ${e.message}`);
            await this._createFailedThumbnailAsync(file, modifiedTime,
                cancellable.is_cancelled() ? null : cancellable, callback);
        } finally {
            if (timeoutId)
                GLib.source_remove(timeoutId);

            if (callback)
                callback();

            this._launchNewBuild();
        }
    }

    async _createFailedThumbnailAsync(file, modifiedTime, cancellable, callback) {
        try {
            await this._thumbnailFactory.create_failed_thumbnail_async(file.uri,
                modifiedTime, cancellable);
        } catch (e) {
            logError(e, `Error while creating failed thumbnail: ${e.message}`);
        }
    }

    _createThumbnailSubprocess(file, callback) {
        let args = [];
        args.push(GLib.build_filenamev([this._codePath, 'createThumbnail.js']));
        args.push(file.path);
        this._proc = new Gio.Subprocess({argv: args});
        this._proc.init(null);
        this._proc.wait_check_async(null, (source, result) => {
            this._removeTimeout();
            try {
                let result2 = source.wait_check_finish(result);
                if (result2) {
                    let status = source.get_status();
                    if (status == 0) {
                        if (callback) {
                            callback();
                        }
                    }
                } else {
                    print(`Failed to generate thumbnail for ${file.displayName}`);
                }
            } catch(error) {
                print(`Exception when generating thumbnail for ${file.displayName}: ${error}`);
            }
            this._launchNewBuild();
        });
        this._timeoutID = GLib.timeout_add(GLib.PRIORITY_DEFAULT, this._timeoutValue, () => {
            print(`Timeout while generating thumbnail for ${file.displayName}`);
            this._timeoutID = 0;
            this._proc.force_exit();
            this._thumbnailFactory.create_failed_thumbnail(file.uri, file.modifiedTime);
            return false;
        });
    }

    _removeTimeout() {
        if (this._timeoutID != 0) {
            GLib.source_remove(this._timeoutID);
            this._timeoutID = 0;
        }
    }

    canThumbnail(file) {
        return this._thumbnailFactory.can_thumbnail(file.uri,
                                                    file.attributeContentType,
                                                    file.modifiedTime);
    }

    getThumbnail(file) {
        try {
            let thumbnail = this._thumbnailFactory.lookup(file.uri, file.modifiedTime);
            if (thumbnail == null) {
                if (!this._thumbnailFactory.has_valid_failed_thumbnail(file.uri, file.modifiedTime)) {
                    this._generateThumbnail(file, this._updateThumbnail.bind(this, file));
                }
            }
            return thumbnail;
        } catch(error) {
            print(`Error when asking for a thumbnail for ${file.displayName}: ${error.message}\n${error.stack}`);
        }
        return null;
    }
}
