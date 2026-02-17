import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Soup from 'gi://Soup?version=3.0';
import {BackendApp, runBackend} from '../backEndApp.js';
const ByteArray = imports.byteArray;

const MPRIS_PREFIX = 'org.mpris.MediaPlayer2.';

async function fetchImageAsBase64(url) {
    return new Promise((resolve) => {
        try {
            let session = new Soup.Session({
                timeout: 5
            });

            let message = Soup.Message.new('GET', url);

            session.send_and_read_async(
                message,
                GLib.PRIORITY_DEFAULT,
                null,
                (session, result) => {
                    try {
                        let bytes = session.send_and_read_finish(result);

                        if (message.get_status() !== Soup.Status.OK || !bytes) {
                            resolve(null);
                            return;
                        }

                        let arr = ByteArray.fromGBytes(bytes);

                        let headers = message.get_response_headers();
                        let mimeTuple = headers?.get_content_type();
                        let mime = mimeTuple ? mimeTuple[0] : 'image/jpeg';

                        let base64 = GLib.base64_encode(arr);

                        resolve(`data:${mime};base64,${base64}`);
                    } catch (e) {
                        logError(e);
                        resolve(null);
                    }
                }
            );
        } catch (e) {
            logError(e);
            resolve(null);
        }
    });
}

export const MediaBackend = GObject.registerClass(
class MediaBackend extends BackendApp {
    constructor(params) {
        super(params);
        this._refreshSource = 0;
        this._lastSnapshot = null;
        this.registerMethod('getSnapshot', () => this._lastSnapshot);
        this.registerMethod('getArt', async ({artId}) => {
            if (!artId) return null;
            if (!this._lastSnapshot || this._lastSnapshot.artId !== artId) return null;
            return await this._getArtUrl(this._lastSnapshot._rawArtUrl);
        });
    }

    onHello(_ctx) {
        this._refresh();
        this._ensureRefreshTimer();
    }

    onShutdown() {
        if (this._refreshSource) {
            GLib.Source.remove(this._refreshSource);
            this._refreshSource = 0;
        }
    }

    _ensureRefreshTimer() {
        if (this._refreshSource)
            return;
        this._refreshSource = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT, 1, () => {
                this._refresh();
                return GLib.SOURCE_CONTINUE;
            }
        );
    }

    async _refresh() {
        const bus = Gio.DBus.session;
        let player = null;
        let identity = null;
        let metadata = null;
        let position = 0;
        let length = 0;
        let artUrl = null;
        let artId = null;
        let _rawArtUrl = null;
        let artist = null;
        let title = null;
        let playbackStatus = null;
        try {
            const names = bus.call_sync(
                'org.freedesktop.DBus',
                '/org/freedesktop/DBus',
                'org.freedesktop.DBus',
                'ListNames',
                null,
                null,
                Gio.DBusCallFlags.NONE,
                -1,
                null
            ).deep_unpack()[0];

            let candidates = [];
            for (const name of names) {
                if (!name.startsWith(MPRIS_PREFIX)) continue;
                try {
                    let status = bus.call_sync(
                        name,
                        '/org/mpris/MediaPlayer2',
                        'org.freedesktop.DBus.Properties',
                        'Get',
                        GLib.Variant.new_tuple([
                            GLib.Variant.new_string('org.mpris.MediaPlayer2.Player'),
                            GLib.Variant.new_string('PlaybackStatus')
                        ]),
                        null,
                        Gio.DBusCallFlags.NONE,
                        -1,
                        null
                    ).deep_unpack()[0].deep_unpack();
                    candidates.push({name, status});
                } catch (e) {
                }
            }
            
            let selected = candidates.find(c=>c.status==='Playing')
                || candidates.find(c=>c.status==='Paused')
                || candidates[0];
            if (selected) {
                player = selected.name;
                playbackStatus = selected.status;
                // Get identity
                identity = bus.call_sync(
                    player,
                    '/org/mpris/MediaPlayer2',
                    'org.freedesktop.DBus.Properties',
                    'Get',
                    GLib.Variant.new_tuple([
                        GLib.Variant.new_string('org.mpris.MediaPlayer2'),
                        GLib.Variant.new_string('Identity')
                    ]),
                    null,
                    Gio.DBusCallFlags.NONE,
                    -1,
                    null
                ).deep_unpack()[0].deep_unpack();
                // Get metadata
                metadata = bus.call_sync(
                    player,
                    '/org/mpris/MediaPlayer2',
                    'org.freedesktop.DBus.Properties',
                    'Get',
                    GLib.Variant.new_tuple([
                        GLib.Variant.new_string('org.mpris.MediaPlayer2.Player'),
                        GLib.Variant.new_string('Metadata')
                    ]),
                    null,
                    Gio.DBusCallFlags.NONE,
                    -1,
                    null
                ).deep_unpack()[0].deep_unpack();
                // Get position
                position = bus.call_sync(
                    player,
                    '/org/mpris/MediaPlayer2',
                    'org.freedesktop.DBus.Properties',
                    'Get',
                    GLib.Variant.new_tuple([
                        GLib.Variant.new_string('org.mpris.MediaPlayer2.Player'),
                        GLib.Variant.new_string('Position')
                    ]),
                    null,
                    Gio.DBusCallFlags.NONE,
                    -1,
                    null
                ).deep_unpack()[0].deep_unpack();
                // Parse metadata, always to string
                let rawTitle = metadata['xesam:title'];
                if (rawTitle && typeof rawTitle.deep_unpack === 'function') rawTitle = rawTitle.deep_unpack();
                if (Array.isArray(rawTitle)) rawTitle = rawTitle[0];
                title = (rawTitle !== undefined && rawTitle !== null) ? String(rawTitle) : '';

                let rawArtist = metadata['xesam:artist'];
                if (rawArtist && typeof rawArtist.deep_unpack === 'function') rawArtist = rawArtist.deep_unpack();
                if (Array.isArray(rawArtist)) rawArtist = rawArtist[0];
                artist = (rawArtist !== undefined && rawArtist !== null) ? String(rawArtist) : '';

                let rawLength = metadata['mpris:length'];
                if (rawLength && typeof rawLength.deep_unpack === 'function') rawLength = rawLength.deep_unpack();
                if (typeof rawLength === 'number') {
                    length = rawLength;
                } else if (typeof rawLength === 'bigint') {
                    length = Number(rawLength);
                } else {
                    length = 0;
                }

                let rawArtUrl = metadata['mpris:artUrl'];
                if (rawArtUrl && typeof rawArtUrl.deep_unpack === 'function') rawArtUrl = rawArtUrl.deep_unpack();
                if (Array.isArray(rawArtUrl)) rawArtUrl = rawArtUrl[0];
                _rawArtUrl = rawArtUrl;
                artId = rawArtUrl;
            }
        } catch (e) {
            this.log('MPRIS backend error: ' + (e?.message ?? e));
        }
        
        let prev = this._lastSnapshot;
        if (prev && prev.artId === artId && prev._rawArtUrl && !_rawArtUrl) {
            _rawArtUrl = prev._rawArtUrl;
        }
        this._lastSnapshot = {
            player,
            identity,
            title,
            artist,
            length,
            position,
            artId,
            playbackStatus,
            ts: Date.now(),
            _rawArtUrl
        };
        
        const { _rawArtUrl: _r, ...publicSnapshot } = this._lastSnapshot;
        this.sendEvent('update', publicSnapshot);
    }

    _makeArtId(urlStr) {
        if (!urlStr) return null;
        if (urlStr.startsWith('data:')) return urlStr.slice(0, 64);
        return urlStr;
    }

    
    async _getArtUrl(rawArtUrl) {
        if (!rawArtUrl) return null;
        let urlStr = String(rawArtUrl);
        if (urlStr.startsWith('file://')) {
            try {
                let fileUri = urlStr;
                let filePath = fileUri.slice(7);
                while (filePath.startsWith('/')) filePath = filePath.slice(1);
                filePath = '/' + filePath;
                filePath = decodeURIComponent(filePath);
                let file = Gio.File.new_for_path(filePath);
                let [, contents] = file.load_contents(null);
                let mime = 'image/jpeg';
                let extMatch = filePath.match(/\.([a-zA-Z0-9]+)$/);
                if (extMatch) {
                    let ext = extMatch[1].toLowerCase();
                    if (ext === 'png') mime = 'image/png';
                    else if (ext === 'gif') mime = 'image/gif';
                    else if (ext === 'svg') mime = 'image/svg+xml';
                    else if (ext === 'webp') mime = 'image/webp';
                    else if (ext === 'bmp') mime = 'image/bmp';
                    else if (ext === 'ico') mime = 'image/x-icon';
                }
                let base64 = GLib.base64_encode(contents);
                return `data:${mime};base64,${base64}`;
            } catch (e) {
                return null;
            }
        } else if (urlStr.startsWith('http://') || urlStr.startsWith('https://')) {
            return await fetchImageAsBase64(urlStr);
        } else {
            return urlStr;
        }
    }

});

runBackend(MediaBackend);
