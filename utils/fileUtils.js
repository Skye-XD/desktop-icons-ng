/* eslint-disable jsdoc/require-param-type */
/* DING: Desktop Icons New Generation for GNOME Shell
 *
 * Copyright (C) 2022 Marco Trevisan <marco.trevisan@canonical.com>
 * Copyright (C) 2026 Sundeep Mediratta <smedius@gmail.com>
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
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {Soup} from '../dependencies/gi.js';

const DEFAULT_ENUMERATE_BATCH_SIZE = 100;
const DEFAULT_QUERY_ATTRIBUTES = [
    Gio.FILE_ATTRIBUTE_STANDARD_NAME,
    Gio.FILE_ATTRIBUTE_STANDARD_TYPE,
].join(',');

/**
 *
 * @param dir
 * @param cancellable
 * @param priority
 * @param queryAttributes
 */
// eslint-disable-next-line consistent-return
export async function enumerateDir(dir, cancellable = null, priority = GLib.PRIORITY_DEFAULT,
    queryAttributes = DEFAULT_QUERY_ATTRIBUTES) {
    let childrenEnumerator;
    try {
        childrenEnumerator = await dir.enumerate_children_async(queryAttributes,
            Gio.FileQueryInfoFlags.NONE, priority, cancellable);

        const children = [];
        while (true) {
            // The enumerator doesn't support multiple async calls, nor
            // we can predict how many they will be, so using Promise.all
            // isn't an option here, thus we just need to await each batch
            // eslint-disable-next-line no-await-in-loop
            const batch = await childrenEnumerator.next_files_async(
                DEFAULT_ENUMERATE_BATCH_SIZE, priority, cancellable);

            if (!batch.length)
                return children;

            children.push(...batch);
        }
    } catch (e) {
        if (e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND)) {
            console.error('Desktop directory does not exist');
            return [];
        }
    } finally {
        if (!childrenEnumerator?.is_closed())
            await childrenEnumerator?.close_async(priority, null);
    }
}

/**
 *
 * @param dir
 * @param deleteParent
 * @param cancellable
 * @param priority
 */
export async function recursivelyDeleteDir(dir, deleteParent, cancellable = null,
    priority = GLib.PRIORITY_DEFAULT) {
    const children = await enumerateDir(dir, cancellable, priority);
    for (let info of children)
        // eslint-disable-next-line no-await-in-loop
        await deleteFile(dir.get_child(info.get_name()), info, cancellable, priority);


    if (deleteParent)
        await dir.delete_async(priority, cancellable);
}

/**
 *
 * @param file
 * @param info
 * @param cancellable
 * @param priority
 */
export async function deleteFile(file, info = null, cancellable = null,
    priority = GLib.PRIORITY_DEFAULT) {
    if (!info) {
        info = await file.query_info_async(
            Gio.FILE_ATTRIBUTE_STANDARD_TYPE, Gio.FileQueryInfoFlags.NONE,
            priority, cancellable);
    }

    const type = info.get_file_type();
    if (type === Gio.FileType.REGULAR || type === Gio.FileType.SYMBOLIC_LINK) {
        await file.delete_async(priority, cancellable);
    } else if (type === Gio.FileType.DIRECTORY) {
        await recursivelyDeleteDir(file, true, cancellable, priority);
    } else {
        throw new GLib.Error(Gio.IOErrorEnum,
            Gio.IOErrorEnum.NOT_SUPPORTED,
            `${file.get_path()} of type ${type} cannot be removed`);
    }
}

/**
 *
 * @param file
 * @param cancellable
 * @param priority
 */
export async function queryExists(file, cancellable = null,
    priority = GLib.PRIORITY_DEFAULT) {
    try {
        await file.query_info_async(Gio.FILE_ATTRIBUTE_STANDARD_TYPE,
            Gio.FileQueryInfoFlags.NONE, priority, cancellable);
        return true;
    } catch (e) {
        if (e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
            throw e;
        if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
            console.error(e);
        return false;
    }
}

/**
 *
 * @param dir
 * @param cancellable
 * @param priority
 */
export async function recursivelyMakeDir(dir, cancellable = null,
    priority = GLib.PRIORITY_DEFAULT) {
    try {
        await dir.make_directory_async(priority, cancellable);
    } catch (e) {
        if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
            throw e;
    }

    const missingDirs = [dir];
    for (let parent = dir.get_parent(); parent; parent = parent.get_parent()) {
        try {
            // eslint-disable-next-line no-await-in-loop
            await parent.make_directory_async(priority, cancellable);
        } catch (e) {
            if (e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.EXISTS))
                break;
            else if (e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
                missingDirs.unshift(parent);
            else
                throw e;
        }
    }

    // Sadly we must be sequential here, so we can't use Promise.all
    missingDirs.forEach(async direct => {
        try {
            await direct.make_directory_async(priority, cancellable);
        } catch (e) {
            if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.EXISTS))
                throw e;
        }
    });
}

/**
 *
 * @param message
 * @param bytes
 * @returns {{ok: boolean, error?: string}}
 */
export function verifyHttpDownload(message, bytes) {
    if (!message) {
        return {
            ok: false,
            error: 'Download verification failed: missing response.',
        };
    }

    const status = message.get_status?.() ?? 0;
    if (status !== Soup.Status.OK) {
        return {
            ok: false,
            error: `Download failed: HTTP ${status}`,
        };
    }

    if (!bytes || bytes.get_size() <= 0) {
        return {
            ok: false,
            error: 'Download verification failed: empty archive.',
        };
    }

    return {ok: true};
}

/**
 *
 * @param url
 * @param timeoutMs
 * @returns {Promise<{message: object, bytes: GLib.Bytes}>}
 */
export async function downloadBytes(url, timeoutMs = 30) {
    if (!Soup)
        throw new Error('Soup is unavailable');

    const session = new Soup.Session({
        timeout: timeoutMs,
    });

    const message = Soup.Message.new('GET', url);
    const bytes = await new Promise((resolve, reject) => {
        session.send_and_read_async(
            message,
            GLib.PRIORITY_DEFAULT,
            null,
            (_soupSession, result) => {
                try {
                    resolve(session.send_and_read_finish(result));
                } catch (e) {
                    reject(e);
                }
            }
        );
    });

    const verification = verifyHttpDownload(message, bytes);
    if (!verification.ok) {
        const error = new Error(verification.error);
        error.status = message.get_status?.() ?? 0;
        throw error;
    }

    return {message, bytes};
}

/**
 *
 * @param file
 * @param bytes
 * @param cancellable
 */
export async function writeBytesToFile(file, bytes, cancellable = null) {
    await new Promise((resolve, reject) => {
        try {
            file.replace_contents_bytes_async(
                bytes,
                null,
                true,
                Gio.FileCreateFlags.REPLACE_DESTINATION,
                cancellable,
                (_source, result) => {
                    try {
                        resolve(file.replace_contents_finish(result));
                    } catch (e) {
                        reject(e);
                    }
                }
            );
        } catch (e) {
            reject(e);
        }
    });
}

/**
 *
 * @param source
 * @param destination
 * @param cancellable
 */
export async function copyFile(source, destination, cancellable = null) {
    await new Promise((resolve, reject) => {
        try {
            source.copy_async(
                destination,
                Gio.FileCopyFlags.OVERWRITE |
                    Gio.FileCopyFlags.TARGET_DEFAULT_PERMS,
                GLib.PRIORITY_DEFAULT,
                cancellable,
                null,
                (src, result) => {
                    try {
                        resolve(src.copy_finish(result));
                    } catch (e) {
                        reject(e);
                    }
                }
            );
        } catch (e) {
            reject(e);
        }
    });
}

/**
 *
 * @param source
 * @param destination
 * @param cancellable
 */
export async function moveFile(source, destination, cancellable = null) {
    await new Promise((resolve, reject) => {
        try {
            source.move_async(
                destination,
                Gio.FileCopyFlags.OVERWRITE,
                GLib.PRIORITY_DEFAULT,
                cancellable,
                null,
                (src, result) => {
                    try {
                        resolve(src.move_finish(result));
                    } catch (e) {
                        reject(e);
                    }
                }
            );
        } catch (e) {
            reject(e);
        }
    });
}

/**
 *
 * @param sourceDir
 * @param destinationDir
 * @param cancellable
 */
export async function copyTree(sourceDir, destinationDir, cancellable = null) {
    await recursivelyMakeDir(destinationDir, cancellable);

    const children = await enumerateDir(sourceDir, cancellable);
    for (const info of children) {
        const name = info.get_name();
        const sourceChild = sourceDir.get_child(name);
        const destinationChild = destinationDir.get_child(name);

        if (info.get_file_type() === Gio.FileType.DIRECTORY) {
            // eslint-disable-next-line no-await-in-loop
            await copyTree(sourceChild, destinationChild, cancellable);
        } else {
            // eslint-disable-next-line no-await-in-loop
            await copyFile(sourceChild, destinationChild, cancellable);
        }
    }
}

/**
 *
 * @param rootDir
 * @param targetName
 * @param cancellable
 * @returns {Promise<Gio.File|null>}
 */
export async function findChildDirRecursive(
    rootDir,
    targetName,
    cancellable = null
) {
    const children = await enumerateDir(rootDir, cancellable);
    for (const info of children) {
        if (info.get_file_type() !== Gio.FileType.DIRECTORY)
            continue;

        const child = rootDir.get_child(info.get_name());
        if (info.get_name() === targetName)
            return child;

        // eslint-disable-next-line no-await-in-loop
        const nested = await findChildDirRecursive(
            child,
            targetName,
            cancellable
        );
        if (nested)
            return nested;
    }

    return null;
}

/**
 *
 * @param archiveFile
 * @param extractDir
 */
export function extractTarGzArchive(archiveFile, extractDir) {
    const command =
        `tar -xzf ${GLib.shell_quote(String(archiveFile.get_path()))} ` +
        `-C ${GLib.shell_quote(String(extractDir.get_path()))}`;

    const [, , error, status] = GLib.spawn_command_line_sync(command);
    if (status !== 0) {
        const decoder = new TextDecoder();
        const stderr = decoder.decode(error ?? new Uint8Array());
        throw new Error(
            stderr.trim() || `Archive extraction failed: exit ${status}`
        );
    }
}
