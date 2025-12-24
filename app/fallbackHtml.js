/* Fallback HTML content for widgets.
 *
 * Exported builder so HtmlWidgetHost can render fallback without embedding
 * the template inline.
 */


export const FallbackHtml = (widgetId, shortId, instanceLabel) => {
    return `
        <!doctype html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                html, body {
                    margin: 0;
                    padding: 0;
                    width: 100%;
                    height: 100%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-family: system-ui, sans-serif;
                    background: transparent;
                    color: #fff;
                }
                body[data-theme="light"] {
                    background: #f5f5f5;
                    color: #111;
                }
                body[data-theme="dark"] {
                    background: #111;
                    color: #f5f5f5;
                }
                body.ding-selected .widget-debug {
                    box-shadow: 0 0 0 2px #4da3ff;
                }
                body.ding-edit-mode .widget-debug {
                    box-shadow: 0 0 0 2px #ffb347;
                }
                body.ding-reduced-motion * {
                    transition: none !important;
                    animation: none !important;
                }

                .widget-debug {
                    box-sizing: border-box;
                    padding: 12px 14px;
                    border-radius: 10px;
                    background: rgba(0, 0, 0, 0.55);
                    font-size: 13px;
                    border: 1px solid rgba(255,255,255,0.1);
                    box-shadow: 0 6px 14px rgba(0,0,0,0.35);
                    min-width: 360px;
                    max-width: 700px;
                    height: 460px;

                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                }

                .ok { color: #8ef08e; }
                .warn { color: #f0d58e; }
                .err { color: #f08e8e; }
                code {
                    font-family: "JetBrains Mono", "SFMono-Regular", monospace;
                    font-size: 12px;
                }

                /* Top: widget info + buttons band */
                .top-panel {
                    flex: 0 0 auto;
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                }

                .widget-info {
                    padding: 8px 10px;
                    border: 1px solid rgba(255,255,255,0.15);
                    border-radius: 6px;
                    background: rgba(0,0,0,0.25);
                }

                .controls-band {
                    padding: 6px 8px;
                    margin: 0 4px;
                    border-radius: 6px;
                    background: rgba(255,255,255,0.05);
                }

                .controls {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 6px;
                }
                .controls button {
                    font-size: 11px;
                    padding: 3px 8px;
                    cursor: pointer;
                }

                /* Bottom: log label + scrollable log */
                .log-panel {
                    flex: 1 1 auto;
                    display: flex;
                    flex-direction: column;
                    min-height: 140px;
                    gap: 4px;
                }

                /* Just text now, no translucent band */
                .log-header {
                    flex: 0 0 auto;
                    margin: 0 8px 0 8px;
                    font-size: 12px;
                }
                .log-header-title {
                    font-weight: 600;
                }
                .log-header-sub {
                    opacity: 0.8;
                    margin-left: 4px;
                }

                #log {
                    flex: 1 1 auto;
                    overflow-y: auto;
                    padding: 8px;
                    box-sizing: border-box;
                    border: none;
                    border-radius: 6px;
                    background: transparent;
                    font-size: 12px;
                    cursor: pointer; /* click log to trigger save */
                    margin: 0 8px 0 18px;  /* bumped slightly right */
                }

                /* Belt-and-suspenders: if it somehow gets focus, no ring */
                #log:focus,
                #log:focus-visible {
                    outline: none;
                    box-shadow: none;
                }
            </style>
            <script>
                function logLine(msg, cls) {
                    const el = document.getElementById('log');
                    if (!el) return;
                    const line = document.createElement('div');
                    if (cls) line.className = cls;
                    line.textContent = msg;
                    el.appendChild(line);
                    el.scrollTop = el.scrollHeight;
                }

                function renderHostState(state) {
                    logLine('HostState → ' + JSON.stringify(state), 'ok');
                }

                function saveAndVerify() {
                    if (!window.ding) {
                        logLine('ding API missing; cannot save config', 'err');
                        return;
                    }

                    const id =
                        (window.ding.getInstanceId && window.ding.getInstanceId()) ||
                        window.ding.instanceId ||
                        '(none)';

                    if (id && id !== '(none)')
                        window.ding.instanceId = id;

                    const payload = {
                        lastClicked: Date.now(),
                        note: 'Saved from fallback widget UI',
                        rand: Math.random(),
                    };
                    const msg = 'saveConfig() sending: ' + JSON.stringify(payload);
                    logLine(msg, 'ok');
                    try { window.ding.log(msg); } catch (e) {}

                    try {
                        window.ding.saveConfig(payload);
                    } catch (e) {
                        logLine('saveConfig() failed: ' + e, 'err');
                        return;
                    }

                    try {
                        window.ding.getConfig().then(cfg => {
                            const m = 'getConfig() after save: ' + JSON.stringify(cfg);
                            logLine(m, 'ok');
                            try { window.ding.log(m); } catch (e) {}
                        }).catch(e => logLine('getConfig() failed: ' + e, 'err'));
                    } catch (e) {
                        logLine('getConfig() threw: ' + e, 'err');
                    }
                }

                function simulateHostPatch(patch) {
                    if (!window.ding || typeof window.ding._setHostState !== 'function') {
                        logLine('simulateHostPatch: window.ding._setHostState missing', 'err');
                        return;
                    }
                    logLine('simulateHostPatch: ' + JSON.stringify(patch), 'warn');
                    window.ding._setHostState(patch);
                }

                function initHostStateDebug() {
                    if (!window.ding) {
                        logLine('window.ding missing; cannot track host state', 'err');
                        return;
                    }

                    try {
                        const initial = window.ding.getHostState();
                        logLine('initial hostState: ' + JSON.stringify(initial), 'ok');
                        renderHostState(initial);
                    } catch (e) {
                        logLine('getHostState() failed: ' + e, 'err');
                    }

                    window.ding.onHostStateChanged(function(state) {
                        logLine('hostState changed → ' + JSON.stringify(state), 'ok');
                        renderHostState(state);
                    });
                }

                function init() {
                    logLine('Fallback HTML widget loaded', 'warn');

                    const hasWebkit = !!(window.webkit &&
                        window.webkit.messageHandlers &&
                        window.webkit.messageHandlers.dingWidget);
                    logLine('webkit handler: ' + (hasWebkit ? 'present' : 'missing'),
                        hasWebkit ? 'ok' : 'err');

                    if (window.ding) {
                        logLine('window.ding present', 'ok');
                        const fromApi = (window.ding.getInstanceId && window.ding.getInstanceId()) || '(none)';
                        logLine('ding.getInstanceId(): ' + fromApi, fromApi ? 'ok' : 'err');
                        try { window.ding.log('ding.getInstanceId(): ' + fromApi); } catch (e) {}

                        window.ding.getConfig().then(cfg => {
                            logLine('getConfig() resolved: ' + JSON.stringify(cfg), 'ok');
                        }).catch(e => logLine('getConfig() failed: ' + e, 'err'));

                        try {
                            window.ding.log('ding bootstrap probe from fallback');
                            logLine('ding.log() sent', 'ok');
                        } catch (e) {
                            logLine('ding.log() failed: ' + e, 'err');
                        }

                        saveAndVerify();
                        initHostStateDebug();
                    } else {
                        logLine('window.ding missing', 'err');
                    }
                }
            </script>
        </head>
        <body onload="init()">
            <div class="widget-debug">
                <div class="top-panel">
                    <div class="widget-info">
                        <div><strong>HTML widget:</strong> ${widgetId}</div>
                        <div><strong>id:</strong> ${shortId}</div>
                        <div><strong>Instance:</strong> ${instanceLabel}</div>
                        <div style="margin:6px 0; font-size:12px;">
                            Use the buttons to simulate host-state changes.
                            Click the log area below to trigger a config save/read.
                        </div>
                    </div>

                    <div class="controls-band">
                        <div class="controls">
                            <button type="button"
                                onclick="simulateHostPatch({ selected: true })">
                                Select (selected = true)
                            </button>
                            <button type="button"
                                onclick="simulateHostPatch({ selected: false })">
                                Deselect (selected = false)
                            </button>
                            <button type="button"
                                onclick="simulateHostPatch({ editMode: true })">
                                Edit Mode ON
                            </button>
                            <button type="button"
                                onclick="simulateHostPatch({ editMode: false })">
                                Edit Mode OFF
                            </button>
                            <button type="button"
                                onclick="simulateHostPatch({ theme: 'light' })">
                                Theme: Light
                            </button>
                            <button type="button"
                                onclick="simulateHostPatch({ theme: 'dark' })">
                                Theme: Dark
                            </button>
                            <button type="button"
                                onclick="simulateHostPatch({ reducedMotion: true })">
                                Reduced Motion ON
                            </button>
                            <button type="button"
                                onclick="simulateHostPatch({ reducedMotion: false })">
                                Reduced Motion OFF
                            </button>
                        </div>
                    </div>
                </div>

                <div class="log-panel">
                    <div class="log-header">
                        <span class="log-header-title">Log:</span>
                        <span class="log-header-sub">(click inside log area to save &amp; verify config)</span>
                    </div>
                    <!-- NOTE: no tabindex, so click still works but no focus ring -->
                    <div id="log" onclick="saveAndVerify()"></div>
                </div>
            </div>
        </body>
        </html>
    `;
};


