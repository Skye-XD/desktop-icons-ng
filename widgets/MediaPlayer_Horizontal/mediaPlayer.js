/* eslint-disable no-restricted-globals */
/* eslint-disable no-undef */
import {DingClient} from './widgetHelper.js';

const DEFAULT_CONFIG = {
    textColor: '#ffffff',
    progressColor: '#ffffff',
    bgColor: '#000000',
    bgAlpha: 0.3,
    mediaCache: null,
};

const POSITION_SAVE_GRANULARITY_US = 5 * 1000 * 1000;
const PLAYBACK_TICK_MS = 1000;
const VOLUME_STEP = 0.05;
const VOLUME_WRITE_DELAY_MS = 90;

class MediaPlayerWidget {
    constructor(root) {
        this._root = root;
        this._config = {...DEFAULT_CONFIG};
        this._ui = null;
        this._lastSnapshot = null;
        this._currentArtId = null;
        this._currentArtUrl = null;
        this._lastPersistedKey = '';
        this._controlRequest = null;
        this._playbackTimer = 0;
        this._volumeWriteTimer = 0;
        this._lastProgressRenderKey = '';
        this._lastTitleSpacingKey = '';
        this._lastControlOverlayKey = '';
        this._pendingVolume = null;
        this._isVisible = true;
        this._titleSpacingObserver = null;
        this._dragRegionObserver = null;
        this._pinnedMoveCleanup = null;
        this._beforeUnloadHandler = this._handleBeforeUnload.bind(this);
        this._syncConfig = this._readSyncConfig();
        this._client = new DingClient({mode: 'widget'});
        this._cacheUi();
        this._client.onHostState(() => {
            this._client.setDraggable('#media-root', {
                exclude: '.mp-controls-overlay button, .mp-controls-overlay input',
            });
        });
        this._client.setDraggable('#media-root', {
            exclude: '.mp-controls-overlay button, .mp-controls-overlay input',
        });
        this._pinnedMoveCleanup = this._client.attachPinnedMoveHandle(
            this._ui?.root ?? this._root,
            {
                allowWhen: () => this._client.isPinned(),
                ignoreSelector: '.mp-controls-overlay, button, input, select, textarea, a',
            }
        );
        this._bindControlButtons();
        this._watchTitleSpacing();
        this._watchDragRegion();
        window.addEventListener('pagehide', this._beforeUnloadHandler);
        window.addEventListener('beforeunload', this._beforeUnloadHandler);
        this._init();
    }

    async _init() {
        this._applyConfigObject(this._syncConfig);
        this._renderFromCache();
        this._applyConfig();

        this._client.onBackendEvent((name, payload) => {
            if (name === 'update')
                this._applySnapshot(payload, {persist: true});
        });

        this._client.onConfigChanged?.(cfg => {
            if (!cfg || typeof cfg !== 'object')
                return;
            this._applyConfigObject(cfg);
            this._applyConfig();
            if (this._shouldRestoreFromCache({allowLiveOverride: false}))
                this._renderFromCache();
        });

        this._client.onVisibilityChange(visible => {
            this._isVisible = visible;
            this._syncPlaybackTimer();
        });

        await this._loadConfig();
        this._applyConfig();
        if (this._shouldRestoreFromCache({allowLiveOverride: false}))
            this._renderFromCache();

        if (!this._lastSnapshot) {
            this._client.backendRequest('getSnapshot').then(snapshot => {
                if (snapshot)
                    this._applySnapshot(snapshot, {persist: true});
            }).catch(() => {});
        }
    }

    _readSyncConfig() {
        try {
            return window.ding?.getConfigSync?.() ?? null;
        } catch (_error) {
            return null;
        }
    }

    async _loadConfig() {
        try {
            const cfg = await this._client.getConfig();
            if (cfg && typeof cfg === 'object')
                this._applyConfigObject(cfg);
        } catch (_error) {}
    }

    _applyConfigObject(cfg) {
        if (!cfg || typeof cfg !== 'object')
            return;
        this._config = {...this._config, ...cfg};
        this._lastPersistedKey = this._buildCachePersistKey(this._config.mediaCache);
    }

    _renderFromCache() {
        const restored = this._restoreSnapshotFromCache(this._config.mediaCache);
        if (!restored)
            return;
        this._applySnapshot(restored, {persist: false, fromCache: true});
    }

    _shouldRestoreFromCache({allowLiveOverride = false} = {}) {
        if (!this._config.mediaCache?.snapshot)
            return false;
        if (!this._lastSnapshot)
            return true;
        if (!allowLiveOverride)
            return false;
        const cachedTs = Number(this._config.mediaCache.snapshot.ts) || 0;
        const currentTs = Number(this._lastSnapshot.ts) || 0;
        return cachedTs > currentTs;
    }

    _restoreSnapshotFromCache(mediaCache) {
        const snapshot = this._normalizeSnapshot(mediaCache?.snapshot);
        if (!snapshot)
            return null;

        const restored = {...snapshot};
        if (restored.playbackStatus === 'Playing' &&
        Number.isFinite(restored.position) &&
        Number.isFinite(restored.ts)) {
            const elapsedUs = Math.max(0, Date.now() - restored.ts) * 1000;
            restored.position += elapsedUs;
            if (Number.isFinite(restored.length) && restored.length > 0)
                restored.position = Math.min(restored.position, restored.length);
            restored.ts = Date.now();
        }

        return restored;
    }

    _applyConfig() {
        const textColor = typeof this._config.textColor === 'string' ? this._config.textColor.trim() : '#ffffff';
        const progressColor = typeof this._config.progressColor === 'string' ? this._config.progressColor.trim() : '#ffffff';
        const bgColor = typeof this._config.bgColor === 'string' ? this._config.bgColor.trim() : '#000000';
        const bgAlpha = Number.isFinite(this._config.bgAlpha) ? Math.max(0, Math.min(1, this._config.bgAlpha)) : 0.3;

        document.body?.style?.setProperty('--text-color', textColor);
        document.body?.style?.setProperty('--progress-color', progressColor);

        const bgRgb = this._hexToRgb(bgColor);
        if (bgRgb) {
            document.body?.style?.setProperty('--bg-r', String(bgRgb.r));
            document.body?.style?.setProperty('--bg-g', String(bgRgb.g));
            document.body?.style?.setProperty('--bg-b', String(bgRgb.b));
        }
        document.body?.style?.setProperty('--bg-alpha', String(bgAlpha));
    }

    _applySnapshot(snapshot, {persist = false, fromCache = false} = {}) {
        const normalized = this._normalizeSnapshot(snapshot);
        const previous = this._lastSnapshot;
        const mediaChanged = this._didMediaIdentityChange(previous, normalized);
        const playbackStateChanged = previous?.playbackStatus !== normalized?.playbackStatus;
        this._lastSnapshot = normalized;
        if (mediaChanged)
            this._lastProgressRenderKey = '';
        this._syncPlaybackTimer();
        this._render(this._getRenderSnapshot());

        if (mediaChanged && !fromCache) {
            this._currentArtId = null;
            this._currentArtUrl = null;
            this._renderCover(null);
        }

        if (!normalized?.artId) {
            this._currentArtId = null;
            this._currentArtUrl = null;
            if (persist)
                this._persistMediaCache({immediate: mediaChanged || playbackStateChanged});
            return;
        }

        const cachedArtUrl = (!mediaChanged || fromCache) &&
            this._config.mediaCache?.artId === normalized.artId
            ? this._config.mediaCache?.artUrl ?? null
            : null;

        if (cachedArtUrl) {
            const artChanged =
        this._currentArtId !== normalized.artId ||
        this._currentArtUrl !== cachedArtUrl;
            this._currentArtId = normalized.artId;
            this._currentArtUrl = cachedArtUrl;
            if (artChanged)
                this._renderCover(cachedArtUrl);
            if (persist)
                this._persistMediaCache({immediate: mediaChanged || playbackStateChanged});
            return;
        }

        if (normalized.artId !== this._currentArtId || !this._currentArtUrl)
            this._renderCover(null);

        if (!fromCache)
            this._loadCover(normalized.artId);

        if (persist)
            this._persistMediaCache({immediate: mediaChanged || playbackStateChanged});
    }

    _normalizeSnapshot(snapshot) {
        if (!snapshot || typeof snapshot !== 'object')
            return null;

        return {
            player: snapshot.player ? String(snapshot.player) : null,
            identity: snapshot.identity ? String(snapshot.identity) : null,
            title: snapshot.title ? String(snapshot.title) : '',
            artist: snapshot.artist ? String(snapshot.artist) : '',
            length: Number.isFinite(snapshot.length) ? snapshot.length : 0,
            position: Number.isFinite(snapshot.position) ? snapshot.position : 0,
            volume: Number.isFinite(snapshot.volume) ? Math.max(0, Math.min(1, snapshot.volume)) : null,
            canControlVolume: snapshot.canControlVolume === true,
            artId: snapshot.artId ? String(snapshot.artId) : null,
            playbackStatus: snapshot.playbackStatus ? String(snapshot.playbackStatus) : '',
            ts: Number.isFinite(snapshot.ts) ? snapshot.ts : Date.now(),
        };
    }

    _render(snapshot) {
        const ui = this._ui;
        if (!ui)
            return;

        ui.root?.classList.toggle('has-player', !!snapshot?.player);

        if (!snapshot || !snapshot.player) {
            this._lastProgressRenderKey = '';
            if (ui.title)
                ui.title.style.marginTop = '0px';
            ui.main?.style?.removeProperty('--controls-center-x');
            return;
        }

        const percent = snapshot.length > 0
            ? Math.min(100, Math.round(snapshot.position / snapshot.length * 100))
            : 0;

        this._updateStaticFields(snapshot);
        this._updatePlaybackProgress(snapshot, percent);
        this._updateControlButtons(snapshot);
        this._updateVolumeControls(snapshot);
    }

    _cacheUi() {
        this._ui = {
            root: this._root,
            main: this._root.querySelector('.mp-main'),
            cover: this._root.querySelector('#mp-cover'),
            coverImg: this._root.querySelector('.mp-cover-img'),
            coverFallback: this._root.querySelector('.mp-nocover'),
            info: this._root.querySelector('.mp-info'),
            title: this._root.querySelector('.mp-title'),
            artist: this._root.querySelector('.mp-artist'),
            progressBar: this._root.querySelector('.mp-bar'),
            timeCurrent: this._root.querySelector('.mp-time-current'),
            timeTotal: this._root.querySelector('.mp-time-total'),
            status: this._root.querySelector('.mp-status'),
            volumeStrip: this._root.querySelector('.mp-volume-strip'),
            volumeSlider: this._root.querySelector('.mp-volume-slider'),
            controlButtons: [...this._root.querySelectorAll('.mp-control-btn')],
            volumeButtons: [...this._root.querySelectorAll('.mp-volume-btn')],
        };
    }

    _watchTitleSpacing() {
        if (!this._ui?.info || !window.ResizeObserver || this._titleSpacingObserver)
            return;

        this._titleSpacingObserver = new ResizeObserver(() => {
            this._syncTitleSpacing();
            this._syncControlOverlayPosition();
        });
        this._titleSpacingObserver.observe(this._ui.info);
    }

    _watchDragRegion() {
        if (!this._ui?.root || !window.ResizeObserver ||
            this._dragRegionObserver)
            return;

        this._dragRegionObserver = new ResizeObserver(() => {
            this._syncDragRegion();
        });
        this._dragRegionObserver.observe(this._ui.root);
    }

    _syncDragRegion() {
        this._client.setDraggable('#media-root', {
            exclude: '.mp-controls-overlay button, .mp-controls-overlay input',
        });
    }

    _updateStaticFields(snapshot) {
        const ui = this._ui;
        if (!ui)
            return;

        if (ui.title)
            ui.title.textContent = snapshot.title || '';
        if (ui.artist)
            ui.artist.textContent = snapshot.artist || '';
        if (ui.timeTotal)
            ui.timeTotal.textContent = this._formatTime(snapshot.length / 1000000);
        if (ui.status)
            ui.status.textContent = snapshot.playbackStatus || '';

        const spacingKey = `${snapshot.title || ''}|${snapshot.artist || ''}|${snapshot.playbackStatus || ''}|${snapshot.length || 0}`;
        if (spacingKey !== this._lastTitleSpacingKey) {
            this._lastTitleSpacingKey = spacingKey;
            this._syncTitleSpacing();
            this._syncControlOverlayPosition();
        }
    }

    _syncTitleSpacing() {
        const ui = this._ui;
        if (!ui?.info || !ui.title || !ui.artist || !ui.progressBar) {
            if (ui?.title)
                ui.title.style.marginTop = '0px';
            return;
        }

        ui.title.style.marginTop = '0px';

        const infoRect = ui.info.getBoundingClientRect();
        const progressRect = ui.progressBar.getBoundingClientRect();
        const titleRect = ui.title.getBoundingClientRect();
        const artistRect = ui.artist.getBoundingClientRect();

        const available = Math.max(0, progressRect.top - infoRect.top);
        const textHeight = Math.max(0, titleRect.height + artistRect.height);
        const offset = Math.max(0, Math.round((available - textHeight) / 2));
        ui.title.style.marginTop = `${offset}px`;
    }

    _updatePlaybackProgress(snapshot, percent = null) {
        const ui = this._ui;
        if (!ui)
            return;

        const progressPct = percent ?? (
            snapshot.length > 0
                ? Math.min(100, Math.round(snapshot.position / snapshot.length * 100))
                : 0
        );
        const currentText = this._formatTime(snapshot.position / 1000000);
        const renderKey = `${progressPct}|${currentText}`;
        if (renderKey === this._lastProgressRenderKey)
            return;

        this._lastProgressRenderKey = renderKey;

        if (ui.progressBar)
            ui.progressBar.style.setProperty('--progress-scale', String(progressPct / 100));
        if (ui.timeCurrent)
            ui.timeCurrent.textContent = currentText;
    }

    _syncControlOverlayPosition() {
        const ui = this._ui;
        if (!ui?.main || !ui?.info)
            return;

        const mainRect = ui.main.getBoundingClientRect();
        const infoRect = ui.info.getBoundingClientRect();
        if (!mainRect.width || !infoRect.width)
            return;

        const centerX = Math.max(0, Math.round(infoRect.left - mainRect.left + infoRect.width / 2));
        const key = `${centerX}|${Math.round(infoRect.width)}|${Math.round(mainRect.width)}`;
        if (key === this._lastControlOverlayKey)
            return;

        this._lastControlOverlayKey = key;
        ui.main.style.setProperty('--controls-center-x', `${centerX}px`);
    }

    async _loadCover(artId) {
        if (!artId || this._currentArtId === artId && this._currentArtUrl)
            return;

        this._currentArtId = artId;
        let artUrl = null;
        try {
            artUrl = await this._client.backendRequest('getArt', {artId});
        } catch (_error) {}

        if (this._currentArtId !== artId)
            return;

        this._currentArtUrl = artUrl || null;
        this._renderCover(this._currentArtUrl);
        this._flushPersist();
    }

    _renderCover(artUrl) {
        const ui = this._ui;
        if (!ui?.cover)
            return;

        if (!artUrl) {
            if (ui.coverImg)
                ui.coverImg.hidden = true;
            if (ui.coverFallback)
                ui.coverFallback.hidden = false;
            return;
        }

        if (ui.coverImg?.getAttribute('src') === artUrl && !ui.coverImg.hidden) {
            if (ui.coverFallback)
                ui.coverFallback.hidden = true;
            return;
        }

        if (ui.coverImg) {
            ui.coverImg.src = artUrl;
            ui.coverImg.hidden = false;
        }
        if (ui.coverFallback)
            ui.coverFallback.hidden = true;
    }

    _bindControlButtons() {
        for (const button of this._ui?.controlButtons ?? []) {
            button.addEventListener('pointerdown', event => {
                if (event.button !== 0)
                    return;
                event.preventDefault();
                event.stopImmediatePropagation();
                event.stopPropagation();
                this._handleControlClick(button.dataset.action);
            });
            button.addEventListener('click', event => {
                event.preventDefault();
                event.stopImmediatePropagation();
                event.stopPropagation();
            });
        }

        for (const button of this._ui?.volumeButtons ?? []) {
            button.addEventListener('pointerdown', event => {
                if (event.button !== 0)
                    return;
                event.preventDefault();
                event.stopImmediatePropagation();
                event.stopPropagation();
                const dir = Number(button.dataset.volumeStep);
                if (!Number.isFinite(dir))
                    return;
                this._stepVolume(dir * VOLUME_STEP);
            });
            button.addEventListener('click', event => {
                event.preventDefault();
                event.stopImmediatePropagation();
                event.stopPropagation();
            });
        }

        const slider = this._ui?.volumeSlider;
        const handleVolumeSliderInput = event => {
            event.stopPropagation();
            const nextVolume = Number(event.currentTarget.value) / 100;
            this._setLocalVolume(nextVolume);
            this._scheduleVolumeWrite(nextVolume);
        };
        slider?.addEventListener('input', handleVolumeSliderInput);
        slider?.addEventListener('change', handleVolumeSliderInput);
        slider?.addEventListener('pointerdown', event => {
            event.stopPropagation();
        });
        slider?.addEventListener('click', event => {
            event.stopPropagation();
        });

        this._ui?.main?.addEventListener('wheel', event => {
            if (!this._lastSnapshot?.player || !this._lastSnapshot?.canControlVolume)
                return;
            event.preventDefault();
            event.stopPropagation();
            const direction = event.deltaY > 0 ? -1 : 1;
            this._stepVolume(direction * VOLUME_STEP);
        }, {passive: false});
    }

    _updateControlButtons(snapshot) {
        const buttons = this._ui?.controlButtons ?? [];
        if (!buttons.length)
            return;

        const hasPlayer = !!snapshot?.player;
        const busyAction = this._controlRequest;
        for (const button of buttons) {
            const action = button.dataset.action;
            const isBusy = busyAction === action;
            button.disabled = !hasPlayer || !!busyAction;
            button.classList.toggle('is-busy', isBusy);
            if (action === 'playPause') {
                const isPlaying = snapshot?.playbackStatus === 'Playing';
                button.classList.toggle('is-playing', isPlaying);
                button.setAttribute('aria-label', isPlaying ? 'Pause' : 'Play or pause');
            }
        }
    }

    async _handleControlClick(action) {
        if (!action || this._controlRequest || !this._lastSnapshot?.player)
            return;

        this._controlRequest = action;
        this._updateControlButtons(this._getRenderSnapshot());
        try {
            await this._client.backendRequest(action);
            const snapshot = await this._client.backendRequest('getSnapshot');
            if (snapshot)
                this._applySnapshot(snapshot, {persist: true});
        } catch (_error) {
        } finally {
            this._controlRequest = null;
            this._updateControlButtons(this._getRenderSnapshot());
        }
    }

    _updateVolumeControls(snapshot) {
        const overlay = this._ui?.volumeStrip;
        const slider = this._ui?.volumeSlider;
        if (!overlay || !slider)
            return;

        const enabled = !!snapshot?.player && snapshot?.canControlVolume && Number.isFinite(snapshot?.volume);
        overlay.hidden = !enabled;
        slider.disabled = !enabled;

        for (const button of this._ui?.volumeButtons ?? [])
            button.disabled = !enabled;

        if (!enabled)
            return;

        const volume = Math.max(0, Math.min(1, Number(snapshot.volume) || 0));
        const volumePct = Math.round(volume * 100);
        this._paintVolumeSlider(slider, volumePct);
        slider.setAttribute('aria-valuenow', String(volumePct));
        slider.setAttribute('aria-valuetext', `${volumePct}%`);
        overlay.setAttribute('data-volume', `${volumePct}%`);
    }

    _paintVolumeSlider(slider, volumePct) {
        if (!slider)
            return;

        const pct = Math.max(0, Math.min(100, Math.round(Number(volumePct) || 0)));
        const pctText = `${pct}%`;
        slider.value = String(pct);
        slider.setAttribute('value', String(pct));
        slider.defaultValue = String(pct);
        slider.style.setProperty('--volume-fill', pctText);
        slider.style.background = `linear-gradient(90deg, rgba(255, 255, 255, 0.95) 0, rgba(255, 255, 255, 0.95) ${pct}%, rgba(255, 255, 255, 0.28) ${pct}%, rgba(255, 255, 255, 0.28) 100%)`;
    }

    _setLocalVolume(volume) {
        const nextVolume = Math.max(0, Math.min(1, Number(volume)));
        if (!Number.isFinite(nextVolume) || !this._lastSnapshot)
            return;

        this._lastSnapshot = {
            ...this._lastSnapshot,
            volume: nextVolume,
            ts: Date.now(),
        };
        this._paintVolumeSlider(
            this._ui?.volumeSlider,
            nextVolume * 100
        );
        this._updateVolumeControls(this._getRenderSnapshot());
    }

    _stepVolume(delta) {
        if (!this._lastSnapshot?.player || !this._lastSnapshot?.canControlVolume)
            return;
        const baseVolume = Number.isFinite(this._lastSnapshot.volume)
            ? this._lastSnapshot.volume
            : 0;
        const nextVolume = Math.max(0, Math.min(1, baseVolume + delta));
        this._setLocalVolume(nextVolume);
        this._scheduleVolumeWrite(nextVolume);
    }

    _scheduleVolumeWrite(volume) {
        this._pendingVolume = Math.max(0, Math.min(1, Number(volume)));
        if (!Number.isFinite(this._pendingVolume))
            return;
        if (this._volumeWriteTimer)
            clearTimeout(this._volumeWriteTimer);
        this._volumeWriteTimer = setTimeout(() => {
            this._volumeWriteTimer = 0;
            this._flushVolumeWrite();
        }, VOLUME_WRITE_DELAY_MS);
    }

    _flushVolumeWrite() {
        const volume = this._pendingVolume;
        this._pendingVolume = null;
        if (!Number.isFinite(volume) || !this._lastSnapshot?.player)
            return;
        this._client.backendRequest('setVolume', {volume}).catch(() => {});
    }

    _persistMediaCache() {
        this._flushPersist();
    }

    _flushPersist() {
        const nextCache = this._buildMediaCache();
        const nextKey = this._buildCachePersistKey(nextCache);
        if (!this._needsPersist(nextCache, nextKey))
            return;

        this._config = {...this._config, mediaCache: nextCache};
        this._lastPersistedKey = nextKey;
        this._client.setConfig({...this._config}).catch(() => {});
    }

    _needsPersist(mediaCache, persistKey = this._buildCachePersistKey(mediaCache)) {
        if (persistKey !== this._lastPersistedKey)
            return true;

        return !this._mediaCacheEquals(this._config.mediaCache, mediaCache);
    }

    _mediaCacheEquals(a, b) {
        return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
    }

    _buildMediaCache() {
        const snapshot = this._getRenderSnapshot();
        if (!snapshot)
            return null;

        return {
            snapshot: {
                ...snapshot,
                position: this._coarsenPosition(snapshot.position),
            },
            artId: snapshot.artId ?? null,
            artUrl: this._currentArtUrl ?? null,
        };
    }

    _buildCachePersistKey(mediaCache) {
        if (!mediaCache?.snapshot)
            return '';

        const snapshot = mediaCache.snapshot;
        return JSON.stringify({
            player: snapshot.player ?? null,
            identity: snapshot.identity ?? null,
            title: snapshot.title ?? '',
            artist: snapshot.artist ?? '',
            length: snapshot.length ?? 0,
            positionBucket: this._coarsenPosition(snapshot.position),
            artId: snapshot.artId ?? null,
            playbackStatus: snapshot.playbackStatus ?? '',
            artUrlToken: mediaCache.artUrl ? `${mediaCache.artUrl.slice(0, 96)}:${mediaCache.artUrl.length}` : null,
        });
    }

    _coarsenPosition(position) {
        if (!Number.isFinite(position) || position <= 0)
            return 0;
        return Math.round(position / POSITION_SAVE_GRANULARITY_US) * POSITION_SAVE_GRANULARITY_US;
    }

    _hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16),
        } : null;
    }

    _formatTime(sec) {
        if (!sec || Number.isNaN(sec))
            return '0:00';
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    }

    _syncPlaybackTimer() {
        const shouldTick = this._lastSnapshot?.player &&
      this._lastSnapshot?.playbackStatus === 'Playing' &&
      this._isVisible;

        if (!shouldTick) {
            if (this._playbackTimer) {
                clearInterval(this._playbackTimer);
                this._playbackTimer = 0;
            }
            return;
        }

        if (this._playbackTimer)
            return;

        this._playbackTimer = setInterval(() => {
            if (!this._lastSnapshot || this._lastSnapshot.playbackStatus !== 'Playing') {
                this._syncPlaybackTimer();
                return;
            }

            this._updatePlaybackProgress(this._getRenderSnapshot());
        }, PLAYBACK_TICK_MS);
    }

    _getRenderSnapshot() {
        const snapshot = this._lastSnapshot;
        if (!snapshot)
            return null;

        const rendered = {...snapshot};
        if (rendered.playbackStatus === 'Playing' &&
        Number.isFinite(rendered.position) &&
        Number.isFinite(rendered.ts)) {
            const elapsedUs = Math.max(0, Date.now() - rendered.ts) * 1000;
            rendered.position += elapsedUs;
            if (Number.isFinite(rendered.length) && rendered.length > 0)
                rendered.position = Math.min(rendered.position, rendered.length);
            rendered.ts = Date.now();
        }

        return rendered;
    }

    _didMediaIdentityChange(previous, next) {
        if (!previous && !next)
            return false;
        if (!previous || !next)
            return true;

        return previous.player !== next.player ||
      previous.identity !== next.identity ||
      previous.title !== next.title ||
      previous.artist !== next.artist ||
      previous.length !== next.length ||
      previous.artId !== next.artId;
    }

    _handleBeforeUnload() {
        this._flushPersist();
        if (this._playbackTimer) {
            clearInterval(this._playbackTimer);
            this._playbackTimer = 0;
        }
        if (this._volumeWriteTimer) {
            clearTimeout(this._volumeWriteTimer);
            this._volumeWriteTimer = 0;
        }
        this._flushVolumeWrite();
        this._titleSpacingObserver?.disconnect?.();
        this._titleSpacingObserver = null;
        this._dragRegionObserver?.disconnect?.();
        this._dragRegionObserver = null;
        this._pinnedMoveCleanup?.();
        this._pinnedMoveCleanup = null;
        this._client?.destroy?.();
        window.removeEventListener('pagehide', this._beforeUnloadHandler);
        window.removeEventListener('beforeunload', this._beforeUnloadHandler);
    }
}

window.addEventListener('DOMContentLoaded', () => {
    new MediaPlayerWidget(document.getElementById('media-root'));
});
