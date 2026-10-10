/* eslint-disable no-control-regex -- Sanitize untrusted filenames. */
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
    } finally {
        if (!childrenEnumerator?.is_closed())
            await childrenEnumerator?.close_async(priority, null);
    }
}

/**
 * Enumerate a directory, treating a missing directory as empty.
 *
 * @param dir
 * @param cancellable
 * @param priority
 * @param queryAttributes
 */
export async function enumerateDirOrEmpty(
    dir,
    cancellable = null,
    priority = GLib.PRIORITY_DEFAULT,
    queryAttributes = DEFAULT_QUERY_ATTRIBUTES
) {
    try {
        return await enumerateDir(dir, cancellable, priority, queryAttributes);
    } catch (e) {
        if (e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND)) {
            console.warn(`Directory does not exist: ${dir.get_path()}`);
            return [];
        }

        throw e;
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
 * Create missing parents before the requested directory. An already-existing
 * target still raises EXISTS, preserving the contract used by existing callers.
 *
 * @param dir
 * @param cancellable
 * @param priority
 */
export async function recursivelyMakeDir(dir, cancellable = null,
    priority = GLib.PRIORITY_DEFAULT) {
    try {
        await dir.make_directory_async(priority, cancellable);
        return;
    } catch (e) {
        if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
            throw e;
    }

    const parent = dir.get_parent();
    if (!parent)
        throw new GLib.Error(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND, 'Directory has no parent');
    try {
        await recursivelyMakeDir(parent, cancellable, priority);
    } catch (e) {
        if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.EXISTS))
            throw e;
    }
    try {
        await dir.make_directory_async(priority, cancellable);
    } catch (e) {
        // Another creator may have completed this directory while we awaited its parent.
        if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.EXISTS))
            throw e;
    }
}

/**
 * Split a filename, preserving the project's compound archive extensions.
 *
 * @param filename
 * @param opts
 */
export function getFileExtensionOffset(filename, opts = {isDirectory: false}) {
    let offset = filename.length;
    let extension = '';
    if (!opts.isDirectory) {
        for (const suffix of ['.gz', '.bz2', '.sit', '.Z', '.bz', '.xz']) {
            if (filename.endsWith(suffix)) {
                offset -= suffix.length;
                extension = filename.substring(offset);
                filename = filename.substring(0, offset);
                break;
            }
        }
        const lastDot = filename.lastIndexOf('.');
        if (lastDot > 0) {
            offset = lastDot;
            extension = filename.substring(offset) + extension;
            filename = filename.substring(0, offset);
        }
    }
    return {offset, basename: filename, extension};
}

/**
 * Generate a collision candidate using the desktop's existing numbered suffix.
 *
 * @param filename
 * @param index
 */
export function collisionName(filename, index) {
    if (!index)
        return filename;
    const {basename, extension} = getFileExtensionOffset(filename);
    return `${basename} ${index}${extension}`;
}

/**
 * Create without overwriting; keep owned GBytes alive through partial writes.
 *
 * @param file
 * @param bytes
 * @param cancellable
 */
export async function writeExclusive(file, bytes, cancellable = null) {
    const stream = await file.create_async(Gio.FileCreateFlags.PRIVATE, GLib.PRIORITY_DEFAULT, cancellable);
    try {
        let offset = 0;
        const size = bytes.get_size();
        while (offset < size) {
            const remaining = GLib.Bytes.new_from_bytes(bytes, offset, size - offset);
            // eslint-disable-next-line no-await-in-loop
            const written = await stream.write_bytes_async(remaining, GLib.PRIORITY_DEFAULT, cancellable);
            if (written <= 0 || written > size - offset)
                throw new Error('Incomplete file write');
            offset += written;
        }
        await stream.close_async(GLib.PRIORITY_DEFAULT, cancellable);
    } catch (e) {
        // Cleanup must still run if the operation was cancelled.
        try {
            await stream.close_async(GLib.PRIORITY_DEFAULT, null);
        } catch (_closeError) {
            // Preserve the original write/close error.
        }
        await file.delete_async(GLib.PRIORITY_DEFAULT, null).catch(error => console.error(error));
        throw e;
    }
}

/**
 * Create a file with a safe single-component name, retrying atomic collisions.
 * The caller remains responsible for sanitizing untrusted display names.
 *
 * @param directory
 * @param filename
 * @param bytes
 * @param cancellable
 * @param creationObserver optional callbacks for collision candidates.
 * `beforeCreate(file)` runs before exclusive creation and returns an ownership
 * marker. If that candidate fails, `creationFailed(file, marker)` receives the
 * same marker so the caller can undo only that attempt's registration.
 * @returns {Promise<Gio.File>} created file
 */
export async function createUniqueFile(
    directory,
    filename,
    bytes,
    cancellable = null,
    creationObserver = null
) {
    if (!filename || filename === '.' || filename === '..' || filename.includes('/') || filename.includes('\0'))
        throw new Error('Expected a single filename');
    try {
        await recursivelyMakeDir(directory, cancellable);
    } catch (e) {
        if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.EXISTS))
            throw e;
    }
    for (let index = 0; ; index++) {
        const file = directory.get_child(collisionName(filename, index));
        const creationRegistration = creationObserver?.beforeCreate(file);
        try {
            // eslint-disable-next-line no-await-in-loop
            await writeExclusive(file, bytes, cancellable);
            return file;
        } catch (e) {
            // A collision may be a basename already registered by an earlier
            // file in this batch. Only undo what this attempt registered.
            creationObserver?.creationFailed(file, creationRegistration);
            if (!e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.EXISTS))
                throw e;
        }
    }
}

/**
 * Create a symbolic link without overwriting, retrying atomic collisions.
 *
 * @param directory destination directory
 * @param source source Gio.File
 * @param cancellable
 * @param creationObserver optional callbacks matching createUniqueFile()
 * @returns {Gio.File} created symbolic link
 */
export function createUniqueSymbolicLink(
    directory,
    source,
    cancellable = null,
    creationObserver = null
) {
    const sourcePath = source.get_path();
    if (!sourcePath)
        throw new Error('Symbolic links require a local source file');

    const filename = source.get_basename();
    for (let index = 0; ; index++) {
        const file = directory.get_child(collisionName(filename, index));
        const creationRegistration = creationObserver?.beforeCreate(file);
        try {
            file.make_symbolic_link(sourcePath, cancellable);
            return file;
        } catch (error) {
            creationObserver?.creationFailed(file, creationRegistration);
            if (!error.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.EXISTS))
                throw error;
        }
    }
}

/**
 * Write a string attribute and verify its per-attribute result.
 *
 * @param file
 * @param attribute
 * @param value
 * @param cancellable
 * @param priority
 * @param queryFlags
 */
export async function setStringAttribute(file, attribute, value, cancellable = null,
    priority = GLib.PRIORITY_DEFAULT,
    queryFlags = Gio.FileQueryInfoFlags.NONE) {
    const info = new Gio.FileInfo();
    info.set_attribute_string(attribute, value);
    const [result] = await file.set_attributes_async(info, queryFlags, priority, cancellable);
    if (result.get_attribute_status(attribute) !== Gio.FileAttributeStatus.SET)
        throw new Error(`Could not set ${attribute}`);
}

/**
 * Store the initial drop position for a newly created file; null leaves it unset.
 *
 * @param file
 * @param coordinates
 * @param cancellable
 * @param priority
 */
export async function setDropPosition(file, coordinates, cancellable = null,
    priority = GLib.PRIORITY_DEFAULT) {
    if (!coordinates)
        return;
    await setStringAttribute(file, 'metadata::nautilus-drop-position', coordinates.join(','), cancellable, priority);
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
 * Sanitize an untrusted filename with space for collision suffixes.
 *
 * @param value
 * @param fallback
 */
export function sanitizeFilename(value, fallback = 'File') {
    const clean = text => text.normalize('NFC')
        .replace(/[\u0000-\u001f\u007f/\\:*?"<>|]/gu, ' ')
        .replace(/\s+/gu, ' ').trim().replace(/^[. ]+|[. ]+$/g, '');
    let name = clean(value || '');
    if (!name)
        name = clean(fallback);
    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name))
        name = `_${name}`;
    // Leave room below NAME_MAX for the extension and collision suffix in UTF-8.
    let result = '';
    let length = 0;
    const encoder = new TextEncoder();
    for (const character of name) {
        length += encoder.encode(character).length;
        if (length > 200)
            break;
        result += character;
    }
    return result.trim().replace(/[. ]+$/g, '') || 'Link';
}
