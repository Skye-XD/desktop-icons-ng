import {DingClient} from './widgetHelper.js';

const DEFAULT_CONFIG = {
  textColor: '#ffffff',
  progressColor: '#ffffff',
  bgColor: '#000000',
  bgAlpha: 0.3,
  mediaCache: null,
};

const POSITION_SAVE_GRANULARITY_US = 5 * 1000 * 1000;
const PLAYBACK_TICK_MS = 250;
const POSITION_PERSIST_INTERVAL_MS = 1000;
const VOLUME_STEP = 0.05;
const VOLUME_WRITE_DELAY_MS = 90;

class MediaPlayerWidget {
  constructor(root) {
    this._root = root;
    this._config = {...DEFAULT_CONFIG};
    this._lastSnapshot = null;
    this._currentArtId = null;
    this._currentArtUrl = null;
    this._lastPersistedKey = '';
    this._controlRequest = null;
    this._playbackTimer = 0;
    this._positionPersistTimer = 0;
    this._volumeWriteTimer = 0;
    this._pendingVolume = null;
    this._visibilityObserver = null;
    this._beforeUnloadHandler = this._handleBeforeUnload.bind(this);
    this._syncConfig = this._readSyncConfig();
    this._client = new DingClient({mode: 'widget'});
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

    this._watchOverlayVisibility();
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
    this._syncPlaybackTimer();
    this._syncPositionPersistTimer();
    this._render(this._getRenderSnapshot());

    if (!normalized?.artId) {
      this._currentArtId = null;
      this._currentArtUrl = null;
      if (persist)
        this._persistMediaCache({immediate: mediaChanged || playbackStateChanged});
      return;
    }

    const cachedArtUrl = this._config.mediaCache?.artId === normalized.artId
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
    if (!snapshot || !snapshot.player) {
      this._root.innerHTML = ``;
      return;
    }

    const percent = snapshot.length > 0
      ? Math.min(100, Math.round(snapshot.position / snapshot.length * 100))
      : 0;

    if (!this._root.querySelector('.mp-main')) {
      this._root.innerHTML = `
        <div class="mp-main">
          <div class="mp-cover" id="mp-cover">
            <div class="mp-nocover" style="display:flex;align-items:center;justify-content:center;font-size:2em;color:#aaa;">?</div>
          </div>
          <div class="mp-info">
            <div class="mp-title"></div>
            <div class="mp-artist"></div>
            <div class="mp-progress">
              <div class="mp-bar"></div>
            </div>
            <div class="mp-meta">
              <span class="mp-time-wrap">
                <span class="mp-time-current"></span>
                <span style="margin:0 2px;">/</span>
                <span class="mp-time-total"></span>
              </span>
              <span class="mp-status"></span>
            </div>
          </div>
          <div class="mp-controls-overlay" aria-label="Media controls">
            <div class="mp-volume-strip" aria-label="Volume controls">
              <input class="mp-volume-slider" type="range" min="0" max="100" step="1" aria-label="Volume" />
            </div>
            <div class="mp-control-strip">
              <button class="mp-volume-btn" type="button" data-volume-step="-1" aria-label="Decrease volume">-</button>
              <button class="mp-control-btn" type="button" data-action="previous" aria-label="Previous track"></button>
              <button class="mp-control-btn mp-control-btn-primary" type="button" data-action="playPause" aria-label="Play or pause"></button>
              <button class="mp-control-btn" type="button" data-action="next" aria-label="Next track"></button>
              <button class="mp-volume-btn" type="button" data-volume-step="1" aria-label="Increase volume">+</button>
            </div>
          </div>
        </div>
      `;
      this._bindControlButtons();
    }

    this._root.querySelector('.mp-title').textContent = snapshot.title || '';
    this._root.querySelector('.mp-artist').textContent = snapshot.artist || '';
    this._root.querySelector('.mp-bar').style.width = `${percent}%`;
    this._root.querySelector('.mp-time-current').textContent = this._formatTime(snapshot.position / 1000000);
    this._root.querySelector('.mp-time-total').textContent = this._formatTime(snapshot.length / 1000000);
    this._root.querySelector('.mp-status').textContent = snapshot.playbackStatus || '';
    this._updateControlButtons(snapshot);
    this._updateVolumeControls(snapshot);
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
    const coverDiv = this._root.querySelector('#mp-cover');
    if (!coverDiv)
      return;

    if (artUrl) {
      const currentImg = coverDiv.querySelector('img');
      if (currentImg?.getAttribute('src') === artUrl)
        return;
      coverDiv.innerHTML = `<img src="${this._escapeAttr(artUrl)}" alt="cover" style="max-width:100%;max-height:100%;object-fit:cover;"/>`;
      return;
    }

    if (coverDiv.querySelector('.mp-nocover'))
      return;
    coverDiv.innerHTML = '<div class="mp-nocover" style="display:flex;align-items:center;justify-content:center;font-size:2em;color:#aaa;">?</div>';
  }

  _bindControlButtons() {
    for (const button of this._root.querySelectorAll('.mp-control-btn')) {
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

    for (const button of this._root.querySelectorAll('.mp-volume-btn')) {
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

    const slider = this._root.querySelector('.mp-volume-slider');
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

    this._root.querySelector('.mp-main')?.addEventListener('wheel', event => {
      if (!this._lastSnapshot?.player || !this._lastSnapshot?.canControlVolume)
        return;
      event.preventDefault();
      event.stopPropagation();
      const direction = event.deltaY > 0 ? -1 : 1;
      this._stepVolume(direction * VOLUME_STEP);
    }, {passive: false});
  }

  _watchOverlayVisibility() {
    if (this._visibilityObserver || !document.body)
      return;

    const syncVisibleVolume = () => {
      if (!document.body?.classList?.contains('ding-host-chrome-visible'))
        return;
      this._syncVisibleVolumeControls();
    };

    this._visibilityObserver = new MutationObserver(() => {
      syncVisibleVolume();
    });
    this._visibilityObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['class'],
    });

    document.addEventListener('visibilitychange', syncVisibleVolume);
    this._visibilityChangeHandler = syncVisibleVolume;
  }

  _syncVisibleVolumeControls() {
    if (!this._lastSnapshot)
      return;

    const snapshot = this._getRenderSnapshot();
    if (!snapshot?.canControlVolume || !Number.isFinite(snapshot?.volume))
      return;

    this._updateVolumeControls(snapshot);
    requestAnimationFrame(() => this._updateVolumeControls(snapshot));
  }

  _updateControlButtons(snapshot) {
    const buttons = this._root.querySelectorAll('.mp-control-btn');
    if (!buttons.length)
      return;

    const hasPlayer = !!snapshot?.player;
    const busyAction = this._controlRequest;
    for (const button of buttons) {
      const action = button.dataset.action;
      const isBusy = busyAction === action;
      button.disabled = !hasPlayer || !!busyAction;
      button.classList.toggle('is-busy', isBusy);
      button.innerHTML = this._getControlIconSvg(
        action,
        action === 'playPause' && snapshot?.playbackStatus === 'Playing'
      );
    }
  }

  _getControlIconSvg(action, isPlaying) {
    switch (action) {
    case 'previous':
      return `
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M4 3.25a.75.75 0 0 1 .75.75v8a.75.75 0 0 1-1.5 0V4A.75.75 0 0 1 4 3.25Zm7.396.134a.75.75 0 0 1 .354.636v7.96a.75.75 0 0 1-1.146.636L4.38 8.636a.75.75 0 0 1 0-1.272l6.224-3.98a.75.75 0 0 1 .792 0Z"/>
        </svg>`;
    case 'next':
      return `
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M12 3.25a.75.75 0 0 1 .75.75v8a.75.75 0 0 1-1.5 0V4a.75.75 0 0 1 .75-.75Zm-7.396.134a.75.75 0 0 1 .792 0l6.224 3.98a.75.75 0 0 1 0 1.272l-6.224 3.98A.75.75 0 0 1 4.25 11.98V4.02a.75.75 0 0 1 .354-.636Z"/>
        </svg>`;
    case 'playPause':
      if (isPlaying) {
        return `
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M4.75 3.25a.75.75 0 0 1 .75.75v8a.75.75 0 0 1-1.5 0V4a.75.75 0 0 1 .75-.75Zm6.5 0A.75.75 0 0 1 12 4v8a.75.75 0 0 1-1.5 0V4a.75.75 0 0 1 .75-.75Z"/>
          </svg>`;
      }
      return `
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M5.153 3.459A.75.75 0 0 1 6.25 4.12v7.76a.75.75 0 0 1-1.097.662l6-3.88a.75.75 0 0 0 0-1.324l-6-3.88Z"/>
        </svg>`;
    default:
      return '';
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
    const overlay = this._root.querySelector('.mp-volume-strip');
    const slider = this._root.querySelector('.mp-volume-slider');
    if (!overlay || !slider)
      return;

    const enabled = !!snapshot?.player && snapshot?.canControlVolume && Number.isFinite(snapshot?.volume);
    overlay.hidden = !enabled;
    slider.disabled = !enabled;

    for (const button of this._root.querySelectorAll('.mp-volume-btn'))
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
      this._root.querySelector('.mp-volume-slider'),
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

  _persistMediaCache({_immediate = false} = {}) {
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

  _escapeAttr(str) {
    return String(str || '').replace(/"/g, '&quot;');
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
      this._lastSnapshot?.playbackStatus === 'Playing';

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

      this._render(this._getRenderSnapshot());
    }, PLAYBACK_TICK_MS);
  }

  _syncPositionPersistTimer() {
    const shouldPersistPosition = this._lastSnapshot?.player &&
      this._lastSnapshot?.playbackStatus === 'Playing';

    if (!shouldPersistPosition) {
      if (this._positionPersistTimer) {
        clearInterval(this._positionPersistTimer);
        this._positionPersistTimer = 0;
      }
      return;
    }

    if (this._positionPersistTimer)
      return;

    this._positionPersistTimer = setInterval(() => {
      if (!this._lastSnapshot || this._lastSnapshot.playbackStatus !== 'Playing') {
        this._syncPositionPersistTimer();
        return;
      }

      this._flushPersist();
    }, POSITION_PERSIST_INTERVAL_MS);
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
    if (this._positionPersistTimer) {
      clearInterval(this._positionPersistTimer);
      this._positionPersistTimer = 0;
    }
    if (this._volumeWriteTimer) {
      clearTimeout(this._volumeWriteTimer);
      this._volumeWriteTimer = 0;
    }
    this._flushVolumeWrite();
    this._visibilityObserver?.disconnect?.();
    this._visibilityObserver = null;
    if (this._visibilityChangeHandler) {
      document.removeEventListener(
        'visibilitychange',
        this._visibilityChangeHandler
      );
      this._visibilityChangeHandler = null;
    }
    this._client?.destroy?.();
    window.removeEventListener('pagehide', this._beforeUnloadHandler);
    window.removeEventListener('beforeunload', this._beforeUnloadHandler);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new MediaPlayerWidget(document.getElementById('media-root'));
});
