/* eslint-disable no-control-regex -- Reject control characters in URLs. */
/* eslint-disable jsdoc/require-param-type */
/* DING: Desktop Icons New Generation for GNOME Shell
 *
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
import {Gio, GLib, Soup} from '../../dependencies/gi.js';
import {Enums} from '../../dependencies/localFiles.js';

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
 * @param cancellable
 * @returns {Promise<{message: object, bytes: GLib.Bytes}>}
 */
export async function downloadBytes(url, timeoutMs = 30, cancellable = null) {
    if (!Soup)
        throw new Error('Soup is unavailable');

    const session = new Soup.Session({
        timeout: timeoutMs,
    });

    const message = Soup.Message.new('GET', url);
    let cancelId = 0;

    try {
        if (cancellable) {
            cancelId = cancellable.connect(() => {
                session.abort();
            });
        }

        const bytes = await new Promise((resolve, reject) => {
            session.send_and_read_async(
                message,
                GLib.PRIORITY_DEFAULT,
                cancellable,
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
            error.status = message.get_status() ?? 0;
            throw error;
        }

        return {message, bytes};
    } finally {
        if (!cancellable || !cancellable.is_cancelled())
            session.abort();

        if (cancelId && cancellable)
            cancellable.disconnect(cancelId);
    }
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
 * @param archiveFile
 * @param extractDir
 * @param cancellable
 */
export async function extractTarGzArchive(
    archiveFile,
    extractDir,
    cancellable = null
) {
    // Keep the tar fallback async in the app process so extraction does not
    // block GNOME Shell when AutoAr is unavailable.
    const subprocess = new Gio.Subprocess({
        argv: [
            'tar',
            '-xzf',
            String(archiveFile.get_path()),
            '-C',
            String(extractDir.get_path()),
        ],
        flags:
            Gio.SubprocessFlags.STDOUT_PIPE |
            Gio.SubprocessFlags.STDERR_PIPE,
    });

    const [, stdout, stderr] = await new Promise((resolve, reject) => {
        subprocess.communicate_utf8_async(
            null,
            cancellable,
            (_proc, result) => {
                try {
                    resolve(subprocess.communicate_utf8_finish(result));
                } catch (e) {
                    reject(e);
                }
            }
        );
    });

    if (!subprocess.get_if_exited() || subprocess.get_exit_status() !== 0) {
        const output = stderr?.trim() || stdout?.trim() || 'Archive extraction failed';
        throw new Error(output);
    }
}

/**
 * Parse MIME parameters, including quoted filenames with escaped characters.
 *
 * @param {string} value advertised format
 * @returns {?object} media type and parameters, or null for malformed input
 */
export function parseMime(value) {
    const head = value.match(/^\s*([\w!#$&^.+-]+\/[\w!#$&^.+-]+)\s*/);
    if (!head)
        return null;
    const parameters = {};
    let rest = value.slice(head[0].length);
    while (rest) {
        const parameter = rest.match(/^;\s*([\w-]+)\s*=\s*(?:"((?:[^"\\\r\n]|\\[^\r\n])*)"|([^\s;"\\]+))\s*/);
        if (!parameter)
            return null;
        const key = parameter[1].toLowerCase();
        if (Object.hasOwn(parameters, key))
            return null;
        parameters[key] = parameter[2] !== undefined
            ? parameter[2].replace(/\\(.)/g, '$1') : parameter[3];
        rest = rest.slice(parameter[0].length);
    }
    return {type: head[1].toLowerCase(), parameters};
}

/**
 * Identify HTML representations our decoder supports, retaining the offer token.
 *
 * @param {string[]} mimes advertised formats
 * @returns {string[]} supported HTML representations
 */
export function htmlFormats(mimes) {
    return mimes.filter(mime => {
        const parsed = parseMime(mime);
        return parsed?.type === Enums.DndTargetInfo.HTML &&
            (!parsed.parameters.charset || parsed.parameters.charset.toLowerCase() === 'utf-8');
    });
}

/**
 * Return every offered representation advertised as image content.
 *
 * @param {string[]} mimes advertised formats
 * @returns {string[]} image representation tokens
 */
export function imageFormats(mimes) {
    return mimes.filter(mime => parseMime(mime)?.type.startsWith('image/'));
}

/**
 * Return an explicitly supplied file-content name, never a download URL.
 *
 * @param {string} mime advertised format
 * @returns {?string} suggested name
 */
export function contentName(mime) {
    const parsed = parseMime(mime);
    return parsed?.type === Enums.DndTargetInfo.OCTET_STREAM && parsed.parameters.name?.trim()
        ? parsed.parameters.name : null;
}

/**
 * Validate one complete HTTP(S) URL without interpreting arbitrary prose.
 *
 * @param {string} value candidate text
 * @returns {?string} trimmed URL
 */
export function webURL(value) {
    const text = value.trim();
    if (/[\s\u0000-\u001f\u007f]/u.test(text))
        return null;
    try {
        const uri = GLib.Uri.parse(text, GLib.UriFlags.NONE);
        if (['http', 'https'].includes(uri.get_scheme().toLowerCase()) && uri.get_host())
            return text;
    } catch (_e) {
        // Invalid URI representations may still have a usable text fallback.
    }
    return null;
}

/**
 * Derive a readable name from a URL without fetching remote metadata.
 * Prefer the final path component and use the host for page-like URLs.
 *
 * @param {string} value web URL
 * @returns {?string} decoded path filename or host
 */
export function filenameFromURL(value) {
    const url = webURL(value);
    if (!url)
        return null;

    const uri = GLib.Uri.parse(url, GLib.UriFlags.NONE);
    const path = uri.get_path();
    if (path && !path.endsWith('/'))
        return path.slice(path.lastIndexOf('/') + 1) || null;

    return uri.get_host();
}

/**
 * Handle both browsers' UTF-8 and UTF-16 representations, with or without BOM.
 *
 * @param {Uint8Array} bytes representation data
 * @returns {object} encoding and decoded text
 */
export function decodeText(bytes) {
    let encoding = 'utf-8';
    if (bytes[0] === 0xff && bytes[1] === 0xfe)
        encoding = 'utf-16le';
    else if (bytes[0] === 0xfe && bytes[1] === 0xff)
        encoding = 'utf-16be';
    else if (bytes.length >= 4 && bytes[1] === 0 && bytes[3] === 0)
        encoding = 'utf-16le';
    else if (bytes.length >= 4 && bytes[0] === 0 && bytes[2] === 0)
        encoding = 'utf-16be';
    return {
        encoding, text: new TextDecoder(encoding, {fatal: true})
        .decode(bytes).replace(/^\uFEFF/u, '').replace(/\u0000+$/u, ''),
    };
}

/**
 * Extract the URL/title pair used by Mozilla and Netscape formats.
 *
 * @param {string} text decoded representation
 * @returns {?object} URL and title
 */
export function parseURLTitle(text) {
    const lines = text.split(/\r\n|\n|\r/);
    const url = webURL(lines.shift());
    // More than one URL/title pair is ambiguous; never silently discard a URL.
    if (!url || lines.slice(1).some(line => line.trim()))
        return null;
    return {url, title: (lines[0] ?? '').trim()};
}

function decodeEntities(text) {
    const named = {amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' '};
    return text.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, name) => {
        if (!name.startsWith('#'))
            return named[name] ?? entity;
        const hex = name[1].toLowerCase() === 'x';
        const code = parseInt(name.slice(hex ? 2 : 1), hex ? 16 : 10);
        return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)
            ? String.fromCodePoint(code) : '\uFFFD';
    });
}

/**
 * Conservatively extract a single explicit anchor without rendering HTML.
 * No scripts, resource fetching, or relative URL resolution are performed.
 *
 * @param {string} html bounded HTML fragment
 * @returns {?object} unambiguous web link and visible text/title
 */
export function parseHTMLLink(html) {
    const tokens = html.match(/<!--[\s\S]*?(?:-->|$)|<\/?[a-z][^>"']*(?:(?:"[^"]*"|'[^']*')[^>"']*)*>|[^<]+|</gi) ?? [];
    const links = [];
    let link = null;
    let ignored = null;
    for (const token of tokens) {
        if (token.startsWith('<!--'))
            continue;
        const tag = token.match(/^<(\/)?([a-z][\w:-]*)\b([\s\S]*?)>$/i);
        if (tag) {
            const closing = !!tag[1];
            const name = tag[2].toLowerCase();
            if (ignored) {
                if (closing && name === ignored)
                    ignored = null;
                continue;
            }
            if (['script', 'style', 'template', 'textarea', 'title'].includes(name) && !closing) {
                ignored = name;
                continue;
            }
            if (name === 'a') {
                if (closing) {
                    link = null;
                } else {
                    const attrs = {};
                    const pattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
                    for (const match of tag[3].matchAll(pattern)) {
                        const key = match[1].toLowerCase();
                        if (!(key in attrs))
                            attrs[key] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? '');
                    }
                    link = {url: webURL(attrs.href ?? ''), title: attrs.title ?? '', text: ''};
                    links.push(link);
                }
            }
        } else if (link && !ignored) {
            link.text += decodeEntities(token);
        }
    }
    if (links.length !== 1 || !links[0].url)
        return null;
    const only = links[0];
    return {url: only.url, title: (only.text.trim() || only.title).replace(/\s+/gu, ' ').trim()};
}

/**
 * Retain DING's HTML redirect format, escaping all source-provided values.
 *
 * @param {string} url validated URL
 * @param {string} title optional title
 * @returns {string} HTML file contents
 */
export function linkHTML(url, title) {
    const escape = value => value.replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    return ['<!DOCTYPE html>', '<html>', '<head>', '<meta charset="utf-8">',
        `<title>${escape(title || url)}</title>`,
        `<meta http-equiv="refresh" content="0; url=${escape(url)}">`,
        '</head>', `<body><a href="${escape(url)}">${escape(title || url)}</a></body>`,
        '</html>', ''].join('\n');
}
