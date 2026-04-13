import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Soup from 'gi://Soup?version=3.0';
import {BackendApp, runBackend} from '../backEndApp.js';
const ByteArray = imports.byteArray;

const MPRIS_PREFIX = 'org.mpris.MediaPlayer2.';
const SEEK_JUMP_THRESHOLD_US = 5 * 1000 * 1000;
const MIN_VOLUME = 0;
const MAX_VOLUME = 1;

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
        this._signalSubscriptions = [];
        this._lastSnapshot = null;
        this.registerMethod('getSnapshot', async () => {
            await this._refresh();
            return this._lastSnapshot;
        });
        this.registerMethod('getArt', async ({artId}) => {
            if (!artId) return null;
            if (!this._lastSnapshot || this._lastSnapshot.artId !== artId) return null;
            return await this._getArtUrl(this._lastSnapshot._rawArtUrl);
        });
        this.registerMethod('playPause', async () => await this._invokePlayerMethod('PlayPause'));
        this.registerMethod('next', async () => await this._invokePlayerMethod('Next'));
        this.registerMethod('previous', async () => await this._invokePlayerMethod('Previous'));
        this.registerMethod('setVolume', async ({volume}) => await this._setPlayerVolume(volume));
    }

    onHello(_ctx) {
        this._ensureSignalSubscriptions();
        this._scheduleRefresh();
    }

    onShutdown() {
        this._clearRefreshSource();
        this._clearSignalSubscriptions();
    }

    _clearRefreshSource() {
        if (this._refreshSource)
            GLib.Source.remove(this._refreshSource);
        this._refreshSource = 0;
    }

    _scheduleRefresh() {
        if (this._refreshSource)
            return;

        this._refreshSource = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            this._refreshSource = 0;
            this._refresh();
            return GLib.SOURCE_REMOVE;
        });
    }

    _ensureSignalSubscriptions() {
        if (this._signalSubscriptions.length)
            return;

        const bus = Gio.DBus.session;
        this._signalSubscriptions.push(
            bus.signal_subscribe(
                null,
                'org.freedesktop.DBus',
                'NameOwnerChanged',
                '/org/freedesktop/DBus',
                null,
                Gio.DBusSignalFlags.NONE,
                (_conn, _sender, _path, _iface, _signal, params) => {
                    const [name] = params.deep_unpack();
                    if (typeof name === 'string' && name.startsWith(MPRIS_PREFIX))
                        this._scheduleRefresh();
                }
            )
        );

        this._signalSubscriptions.push(
            bus.signal_subscribe(
                null,
                'org.freedesktop.DBus.Properties',
                'PropertiesChanged',
                '/org/mpris/MediaPlayer2',
                null,
                Gio.DBusSignalFlags.NONE,
                (_conn, _sender, _path, _iface, _signal, params) => {
                    const [ifaceName] = params.deep_unpack();
                    if (ifaceName === 'org.mpris.MediaPlayer2.Player')
                        this._scheduleRefresh();
                }
            )
        );

        this._signalSubscriptions.push(
            bus.signal_subscribe(
                null,
                'org.mpris.MediaPlayer2.Player',
                'Seeked',
                '/org/mpris/MediaPlayer2',
                null,
                Gio.DBusSignalFlags.NONE,
                () => this._scheduleRefresh()
            )
        );
    }

    _clearSignalSubscriptions() {
        const bus = Gio.DBus.session;
        for (const id of this._signalSubscriptions) {
            try {
                bus.signal_unsubscribe(id);
            } catch (e) {}
        }
        this._signalSubscriptions = [];
    }

    _listPlayerCandidates() {
        const bus = Gio.DBus.session;
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
            if (!name.startsWith(MPRIS_PREFIX))
                continue;
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

        return candidates;
    }

    _selectPlayer(candidates = []) {
        const lastPlayer = this._lastSnapshot?.player ?? null;
        if (lastPlayer) {
            const matching = candidates.find(candidate => candidate.name === lastPlayer);
            if (matching)
                return matching;
        }

        return candidates.find(candidate => candidate.status === 'Playing') ||
            candidates.find(candidate => candidate.status === 'Paused') ||
            candidates[0] ||
            null;
    }

    async _invokePlayerMethod(method) {
        const selected = this._selectPlayer(this._listPlayerCandidates());
        if (!selected)
            return {ok: false, reason: 'no-player'};

        Gio.DBus.session.call_sync(
            selected.name,
            '/org/mpris/MediaPlayer2',
            'org.mpris.MediaPlayer2.Player',
            method,
            null,
            null,
            Gio.DBusCallFlags.NONE,
            -1,
            null
        );

        await this._refresh();
        return {ok: true, player: selected.name, method};
    }

    _getPlayerProperty(player, iface, property) {
        return Gio.DBus.session.call_sync(
            player,
            '/org/mpris/MediaPlayer2',
            'org.freedesktop.DBus.Properties',
            'Get',
            GLib.Variant.new_tuple([
                GLib.Variant.new_string(iface),
                GLib.Variant.new_string(property),
            ]),
            null,
            Gio.DBusCallFlags.NONE,
            -1,
            null
        ).deep_unpack()[0].deep_unpack();
    }

    _setPlayerProperty(player, iface, property, value) {
        Gio.DBus.session.call_sync(
            player,
            '/org/mpris/MediaPlayer2',
            'org.freedesktop.DBus.Properties',
            'Set',
            GLib.Variant.new_tuple([
                GLib.Variant.new_string(iface),
                GLib.Variant.new_string(property),
                GLib.Variant.new_variant(value),
            ]),
            null,
            Gio.DBusCallFlags.NONE,
            -1,
            null
        );
    }

    async _setPlayerVolume(volume) {
        const selected = this._selectPlayer(this._listPlayerCandidates());
        if (!selected)
            return {ok: false, reason: 'no-player'};

        const nextVolume = Math.max(
            MIN_VOLUME,
            Math.min(MAX_VOLUME, Number(volume))
        );
        if (!Number.isFinite(nextVolume))
            return {ok: false, reason: 'invalid-volume'};

        this._setPlayerProperty(
            selected.name,
            'org.mpris.MediaPlayer2.Player',
            'Volume',
            GLib.Variant.new_double(nextVolume)
        );

        await this._refresh();
        return {ok: true, player: selected.name, volume: nextVolume};
    }

    async _refresh() {
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
        let volume = null;
        let canControlVolume = false;
        try {
            let candidates = this._listPlayerCandidates();
            let selected = this._selectPlayer(candidates);
            if (selected) {
                player = selected.name;
                playbackStatus = selected.status;
                identity = this._getPlayerProperty(
                    player,
                    'org.mpris.MediaPlayer2',
                    'Identity'
                );
                metadata = this._getPlayerProperty(
                    player,
                    'org.mpris.MediaPlayer2.Player',
                    'Metadata'
                );
                position = this._getPlayerProperty(
                    player,
                    'org.mpris.MediaPlayer2.Player',
                    'Position'
                );
                try {
                    canControlVolume = !!this._getPlayerProperty(
                        player,
                        'org.mpris.MediaPlayer2.Player',
                        'CanControl'
                    );
                } catch (e) {
                    canControlVolume = false;
                }
                try {
                    let rawVolume = this._getPlayerProperty(
                        player,
                        'org.mpris.MediaPlayer2.Player',
                        'Volume'
                    );
                    if (typeof rawVolume === 'number')
                        volume = rawVolume;
                    else if (typeof rawVolume === 'bigint')
                        volume = Number(rawVolume);
                    if (Number.isFinite(volume))
                        canControlVolume = true;
                } catch (e) {
                    volume = null;
                }
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
        const nextSnapshot = {
            player,
            identity,
            title,
            artist,
            length,
            position,
            volume,
            canControlVolume,
            artId,
            playbackStatus,
            ts: Date.now(),
            _rawArtUrl
        };
        this._lastSnapshot = nextSnapshot;

        if (!this._shouldSendUpdate(prev, nextSnapshot))
            return;

        const { _rawArtUrl: _r, ...publicSnapshot } = nextSnapshot;
        this.sendEvent('update', publicSnapshot);
    }

    _shouldSendUpdate(prev, next) {
        if (!next)
            return false;

        if (!prev)
            return true;

        if (prev.player !== next.player ||
            prev.identity !== next.identity ||
            prev.title !== next.title ||
            prev.artist !== next.artist ||
            prev.length !== next.length ||
            prev.volume !== next.volume ||
            prev.canControlVolume !== next.canControlVolume ||
            prev.artId !== next.artId ||
            prev.playbackStatus !== next.playbackStatus)
            return true;

        if (!next.player)
            return false;

        const previousTs = Number(prev.ts) || 0;
        const nextTs = Number(next.ts) || previousTs;
        const previousPosition = Number(prev.position) || 0;
        const nextPosition = Number(next.position) || 0;
        const expectedPosition =
            prev.playbackStatus === 'Playing'
                ? previousPosition + Math.max(0, nextTs - previousTs) * 1000
                : previousPosition;

        if (Math.abs(nextPosition - expectedPosition) >= SEEK_JUMP_THRESHOLD_US)
            return true;

        return false;
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
