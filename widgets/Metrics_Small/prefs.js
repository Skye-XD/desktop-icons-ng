// Metrics prefs: align styling/behavior with World Clock prefs

(() => {
  'use strict';

  const DEFAULT_CONFIG = {
    intervalSec: 2,
    color: 'cyan',
  };

  const refreshSelect = document.getElementById('refreshSelect');
  const colorSelect = document.getElementById('colorSelect');
  const headerTitle = document.getElementById('headerTitle');

  let config = { ...DEFAULT_CONFIG };

  function syncUiFromConfig() {
    headerTitle.textContent = 'Metrics';

    const interval = Number.isFinite(config.intervalSec)
      ? Math.max(1, Math.min(60, Number(config.intervalSec)))
      : DEFAULT_CONFIG.intervalSec;
    refreshSelect.value = String(interval);

    const color = (config.color && String(config.color).toLowerCase()) || DEFAULT_CONFIG.color;
    colorSelect.value = color;
  }

  function pushConfig() {
    try {
      if (window.ding && typeof window.ding.saveConfig === 'function')
        window.ding.saveConfig(config);
    } catch (e) {
      // ignore
    }
  }

  function updateConfig(patch) {
    config = { ...config, ...patch };
    pushConfig();
  }

  function wire() {
    refreshSelect.addEventListener('change', () => {
      const v = Number(refreshSelect.value);
      const interval = Number.isFinite(v) ? Math.max(1, Math.min(60, v)) : DEFAULT_CONFIG.intervalSec;
      updateConfig({ intervalSec: interval });
      refreshSelect.value = String(interval);
    });

    colorSelect.addEventListener('change', () => {
      updateConfig({ color: colorSelect.value });
    });
  }

  async function init() {
    // Load persisted config if available
    try {
      if (window.ding && typeof window.ding.getConfig === 'function') {
        const cfg = await window.ding.getConfig();
        if (cfg && typeof cfg === 'object')
          config = { ...DEFAULT_CONFIG, ...cfg };
      }
    } catch (e) {}

    syncUiFromConfig();
    wire();

    // Live updates from host
    try {
      if (window.ding && typeof window.ding.onConfigChanged === 'function') {
        window.ding.onConfigChanged((cfg) => {
          if (cfg && typeof cfg === 'object')
            config = { ...DEFAULT_CONFIG, ...cfg };
          else
            config = { ...DEFAULT_CONFIG };
          syncUiFromConfig();
        });
      }
    } catch (e) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
