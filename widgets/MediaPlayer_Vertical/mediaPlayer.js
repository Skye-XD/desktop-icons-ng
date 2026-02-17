import {DingClient} from '../widgetHelper.js';

class MediaPlayerWidget {
  constructor(root) {
    this._root = root;
    this._client = new DingClient({mode: 'widget'});
    this._lastSnapshot = null;
    this._config = {
      textColor: '#ffffff',
      progressColor: '#ffffff',
      bgColor: '#000000',
      bgAlpha: 0.3,
    };
    this._currentArtId = null;
    this._init();
  }

  async _init() {
    await this._loadConfig();
    this._applyConfig();

    this._client.onBackendEvent((name, payload) => {
      if (name === 'update')
        this._render(payload);
    });

    this._client.onConfigChanged?.(cfg => {
      if (cfg && typeof cfg === 'object') {
        this._config = {...this._config, ...cfg};
        this._applyConfig();
      }
    });

    this._client.backendRequest('getSnapshot').then(s => {
      if (s) this._render(s);
    }).catch(()=>{});
  }

  async _loadConfig() {
    try {
      const cfg = await this._client.getConfig();
      if (cfg && typeof cfg === 'object')
        this._config = {...this._config, ...cfg};
    } catch (e) {}
  }

  _applyConfig() {
    const textColor = typeof this._config.textColor === 'string' ? this._config.textColor.trim() : '#ffffff';
    const progressColor = typeof this._config.progressColor === 'string' ? this._config.progressColor.trim() : '#ffffff';
    const bgColor = typeof this._config.bgColor === 'string' ? this._config.bgColor.trim() : '#000000';
    const bgAlpha = Number.isFinite(this._config.bgAlpha) ? Math.max(0, Math.min(1, this._config.bgAlpha)) : 0.3;

    document.body?.style?.setProperty('--text-color', textColor);
    document.body?.style?.setProperty('--progress-color', progressColor);
    
    // Parse bgColor hex to RGB components
    const bgRgb = this._hexToRgb(bgColor);
    if (bgRgb) {
      document.body?.style?.setProperty('--bg-r', String(bgRgb.r));
      document.body?.style?.setProperty('--bg-g', String(bgRgb.g));
      document.body?.style?.setProperty('--bg-b', String(bgRgb.b));
    }
    document.body?.style?.setProperty('--bg-alpha', String(bgAlpha));
  }

  _hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  }

  async _render(s) {
    this._lastSnapshot = s;

    if (!s || !s.player) {
      this._root.innerHTML = ``;
      return;
    }

    const percent = s.length > 0
      ? Math.min(100, Math.round(s.position / s.length * 100))
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

    this._root.querySelector('.mp-title').textContent = s.title || '';
    this._root.querySelector('.mp-artist').textContent = s.artist || '';
    this._root.querySelector('.mp-bar').style.width = `${percent}%`;
    this._root.querySelector('.mp-time-current').textContent = this._formatTime(s.position/1000000);
    this._root.querySelector('.mp-time-total').textContent = this._formatTime(s.length/1000000);
    this._root.querySelector('.mp-status').textContent = s.playbackStatus || '';

    if (s.artId !== this._currentArtId) {
      this._currentArtId = s.artId;
      if (s.artId) {
        this._loadCover(s.artId);
      } else {
        this._lastArtId = null;
        const coverDiv = this._root.querySelector('#mp-cover');
        if (coverDiv)
          coverDiv.innerHTML = '<div class="mp-nocover" style="display:flex;align-items:center;justify-content:center;font-size:2em;color:#aaa;">?</div>';
      }
    }
  }

  async _loadCover(artId) {
    if (this._lastArtId === artId) return;
    this._lastArtId = artId;
    let artUrl = null;
    try {
      artUrl = await this._client.backendRequest('getArt', {artId});
    } catch {}
    
    if (this._lastArtId !== artId) return;
    const coverDiv = this._root.querySelector('#mp-cover');
    if (coverDiv) {
      if (artUrl) {
        coverDiv.innerHTML = `<img src="${this._escapeAttr(artUrl)}" alt="cover" style="max-width:100%;max-height:100%;object-fit:cover;"/>`;
      } else {
        coverDiv.innerHTML = '<div class="mp-nocover" style="display:flex;align-items:center;justify-content:center;font-size:2em;color:#aaa;">?</div>';
      }
    }
  }

  _escapeAttr(str) {
  return String(str || '').replace(/"/g, '&quot;');
  }

  _escape(str) {
    return String(str||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
  }
  _formatTime(sec) {
    if (!sec || isNaN(sec)) return '0:00';
    const m = Math.floor(sec/60);
    const s = Math.floor(sec%60);
    return `${m}:${s.toString().padStart(2,'0')}`;
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new MediaPlayerWidget(document.getElementById('media-root'));
});
