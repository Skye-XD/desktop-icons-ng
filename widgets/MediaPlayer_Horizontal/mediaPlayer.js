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

class MediaPlayerWidget {
  constructor(root) {
    this._root = root;
    this._config = {...DEFAULT_CONFIG};
    this._lastSnapshot = null;
    this._currentArtId = null;
    this._currentArtUrl = null;
    this._lastPersistedKey = '';
    this._persistTimer = 0;
    this._playbackTimer = 0;
    this._syncConfig = this._readSyncConfig();
    this._client = new DingClient({mode: 'widget'});
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
      if (this._shouldRestoreFromCache())
        this._renderFromCache();
    });

    await this._loadConfig();
    this._applyConfig();
    if (this._shouldRestoreFromCache())
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

  _shouldRestoreFromCache() {
    if (!this._config.mediaCache?.snapshot)
      return false;
    if (!this._lastSnapshot)
      return true;
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
    this._lastSnapshot = normalized;
    this._syncPlaybackTimer();
    this._render(this._getRenderSnapshot());

    if (!normalized?.artId) {
      this._currentArtId = null;
      this._currentArtUrl = null;
      if (persist)
        this._schedulePersist();
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
        this._schedulePersist();
      return;
    }

    if (normalized.artId !== this._currentArtId || !this._currentArtUrl)
      this._renderCover(null);

    if (!fromCache)
      this._loadCover(normalized.artId);

    if (persist)
      this._schedulePersist();
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
        </div>
      `;
    }

    this._root.querySelector('.mp-title').textContent = snapshot.title || '';
    this._root.querySelector('.mp-artist').textContent = snapshot.artist || '';
    this._root.querySelector('.mp-bar').style.width = `${percent}%`;
    this._root.querySelector('.mp-time-current').textContent = this._formatTime(snapshot.position / 1000000);
    this._root.querySelector('.mp-time-total').textContent = this._formatTime(snapshot.length / 1000000);
    this._root.querySelector('.mp-status').textContent = snapshot.playbackStatus || '';
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
    this._schedulePersist();
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

  _schedulePersist() {
    const mediaCache = this._buildMediaCache();
    const persistKey = this._buildCachePersistKey(mediaCache);
    if (!mediaCache || persistKey === this._lastPersistedKey)
      return;

    if (this._persistTimer)
      clearTimeout(this._persistTimer);

    this._persistTimer = setTimeout(() => {
      this._persistTimer = 0;
      const nextCache = this._buildMediaCache();
      const nextKey = this._buildCachePersistKey(nextCache);
      if (!nextCache || nextKey === this._lastPersistedKey)
        return;

      this._config = {...this._config, mediaCache: nextCache};
      this._lastPersistedKey = nextKey;
      this._client.patchConfig({mediaCache: nextCache}).catch(() => {});
    }, 250);
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
      this._schedulePersist();
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
}

window.addEventListener('DOMContentLoaded', () => {
  new MediaPlayerWidget(document.getElementById('media-root'));
});
