# Widget API Reference (Current Implementation)

This document describes the **current** HTML widget JavaScript API as implemented by:
- the injected widget script (`WIDGET_API`) and CSP profiles, and
- the WebKit runtime bridge (`WebWidgetContext`) that receives and handles widget messages.

It intentionally documents **only what exists today** in code.

If you want a quick start, the optional `ding-client.js` helper handles the bridge plumbing for you, and `ding-widget.css` lets you react to host state using only CSS—jump to those sections if that’s all you need.

---

## Runtime model (high-level)

- Widgets run in a **WebKit WebView**.
- The host injects a JS bridge (`window.ding`) into **all frames** at document-start.
- Widgets talk to the host through a WebKit script message handler named **`dingWidget`**.
- The host talks to widgets by evaluating JavaScript that calls internal hooks (see **Host state**).
- A single shared `WebContext` and `UserContentManager` are reused across all widget instances; each widget instance gets its own `WebView`.
- Persistent WebKit data/cache directories are scoped under the app’s data/cache roots (see `DesktopIconsUtil.ensureDir` in `WebWidgetContext`), and the shared network session uses those paths.
- The outer GTK frame clips the WebView with rounded corners; authors should let the host own the outer rounding (set your outer background radius to 0).

The shared `WebContext`/`UserContentManager` means:

- one network session and cookie/storage space is shared across all widget views;
- per-view isolation still applies to filesystem access via the jailed scheme.

WebKit storage/cache paths are created at runtime:

- storage: `$XDG_DATA_HOME/<app-id>/webkit/storage`
- cache: `$XDG_CACHE_HOME/<app-id>/webkit/cache`

These are managed by the network session; widget authors do not write to them directly.

---

## Internet access, CSP, and CORS

HTML widgets run inside a WebKit WebView and follow standard web security rules.

The widget platform allows outbound network access according to the active Content Security Policy (CSP). In STRICT mode, widgets may initiate HTTPS requests (`connect-src https:`), load local resources, and use modern web APIs. The CSP applied to widgets is set by the program and can be adjusted via the CSP profile in enums.js.

However, Cross-Origin Resource Sharing (CORS) is enforced by WebKit, just like in a normal browser:

- CORS rules are dictated by the remote server, not the widget.
- WebKit enforces CORS when widgets use `fetch()`, XHR, or load remote resources.
- If a server does not allow cross-origin access, the request may succeed but the response will not be readable by the widget.

This is expected and intentional. Tools like `curl` or host-side HTTP clients do not enforce CORS, but WebKit does, to protect user data and prevent unintended information leaks.

As a result:

- Widgets can freely consume CORS-enabled APIs (weather, JSON REST services, etc.).
- Widgets cannot bypass server-defined security restrictions.

The behavior matches standard browser semantics.


## Loading widget resources with `ding-widget://`

HTML widgets are loaded from a **custom URI scheme**:

- `ding-widget://<instanceId>/index.html`

When `index.html` references other files (CSS, JS, images, fonts, etc.) using **relative URLs**, WebKit resolves them against the current document URL, which means they are also requested through the same scheme.

### Relative paths and subdirectories

You can organize assets in subdirectories and reference them normally:

```html
<link rel="stylesheet" href="css/style.css">
<script src="js/main.js"></script>
<img src="images/icon.png">
```

Those requests resolve to:

- `ding-widget://<instanceId>/css/style.css`
- `ding-widget://<instanceId>/js/main.js`
- `ding-widget://<instanceId>/images/icon.png`

A few notes based on the current handler:

- The URI path is treated as **widget-root-relative**.
- Leading `/` is stripped (so `/css/style.css` is treated like `css/style.css`).
- Leading `./` segments are stripped (so `./css/style.css` works too).

### Filesystem confinement and symlink policy

The scheme handler is **jailed to the widget’s root directory** that was bound to the WebView when the instance was created.

Security rules enforced by the handler:

- Requests must match the instance bound to that WebView (the host/instanceId must match).
- Paths are resolved under the widget root; attempts to escape the root are rejected.
- **Symlinks are not allowed and are not followed.** If any path component resolves to a symlink, the request is denied.

This means a widget author can safely ship assets under subdirectories, but cannot “link out” of the widget bundle via symlinks.

### Practical author guidance

- Keep your entry point at the widget root as `index.html`.
- Put assets in subdirectories (`css/`, `js/`, `images/`, etc.) and reference them with relative URLs.
- Do not rely on symlinks inside the widget bundle; they will fail to load.

## Default injected CSS (transparency)

On injection, the platform attempts to insert a `<style>` tag at the top of the document:

- `id="ding-widget-background"`
- forces `background: transparent !important` for `html`, `body`, but not `*`. Widget renderings do not have a transparent background to they can be seen.

This is intended to make widgets “desktop-friendly” by default (a transparent base), while still allowing the widget author to override visuals with their own CSS.

### Optional helper stylesheet: `ding-widget.css`

Alongside this document, the widgets folder includes `ding-widget.css`, an optional helper stylesheet that reacts to host-managed DOM state. No JavaScript is required; it simply listens to classes and attributes the host already maintains.

#### State applied by the host

Widgets must never toggle these themselves; the host keeps them up to date:

| Host state      | DOM effect                         |
|-----------------|------------------------------------|
| Theme           | `body[data-theme="light|dark"]`   |
| Edit mode       | `body.ding-edit-mode`              |
| Selection       | `body.ding-selected`               |
| Reduced motion  | `body.ding-reduced-motion`         |
| Text direction  | `html[dir="ltr|rtl"]`            |

#### What the stylesheet provides

- **Theme hinting** – sets `color-scheme` based on `body[data-theme]` so built-in controls adopt light/dark without extra code.
- **Reduced motion** – globally disables animations, transitions, and smooth scrolling whenever `body` has `ding-reduced-motion`, matching GNOME’s accessibility toggle.
- **Edit mode helpers** – `.ding-only-edit` elements are shown only while the widget is in edit mode.
- **Selection helpers** – `.ding-only-selected` elements show only when selected; `.ding-selection-outline` can wrap outlines.
- **Direction awareness** – relies on `html[dir]` so widgets can react to RTL purely via CSS.

#### Using the stylesheet

- Plain HTML widget: `<link rel="stylesheet" href="../ding-widget.css">`
- Bundled builds (React/Svelte/Vite): `import '../ding-widget.css';`

That’s it—no additional setup. The stylesheet reacts immediately when host state changes.

#### Relationship to `ding-client.js`

`ding-widget.css` handles the visual layer while `ding-client.js` focuses on JavaScript plumbing (config, backend IPC, subscriptions). They are independent: the CSS works without the helper, and the helper doesn’t require the CSS. Together they cover both JS and CSS glue so widget authors can focus on UI logic.

### Authoring note: outer chrome and clipping

The host wraps your page in a GTK box that already clips with rounded corners. To avoid visual seams with the host chrome:

- Do **not** put border, outline, or box-shadow on `html`, `body`, or a full-size root wrapper.
- Do **not** set border-radius for the outermost background; let the host rounding clipping show through.
- If you want an inner “card”, add padding and style an inner element instead:

```html
<body>
  <div class="card">…content…</div>
</body>

<style>
body { background: transparent; }
.card {
  margin: 8px;           /* gap from the clipped edge */
  border-radius: 12px;   /* inner rounding is fine */
  box-shadow: …;         /* inner shadow is fine */
  background: …;
}
</style>
```

This keeps the host’s rounded clip clean and avoids a 1px edge fighting the selection/chrome ring.

---

## Content Security Policy (CSP) profiles

CSP strings are defined as three profiles:

- **Strict**: allows widget self-origin scripts/styles (including inline), images/media from self and `data:`/`blob:`, and network to `http:`/`https:`. Blocks frames/workers.
- **Dev**: same as Strict, plus `http://localhost:*` and `ws://localhost:*` in `connect-src`.
- **Relaxed**: permits broader `https:` loading for scripts/styles/images/fonts/media, allows `ws:`/`wss:`, allows `worker-src blob:` and `frame-src https:`.

> Note: these are *CSP strings applied to widget content responses* served via the `ding-widget://` scheme.

### CSP profile table

| Profile | Intended use | Allows | Blocks / Limits |
|---|---|---|---|
| Strict | Default / production | `script-src 'self' 'unsafe-inline'`; `style-src 'self' 'unsafe-inline'`; `connect-src 'self' https: http:`; images `data:`/`blob:` | `default-src 'none'`; no frames (`frame-src 'none'`); no workers (`worker-src 'none'`); no embedding (`frame-ancestors 'none'`); no form submits (`form-action 'none'`) |
| Dev | Local dev & debugging | Strict + `connect-src http://localhost:* ws://localhost:*` | Same structural blocks as Strict (frames/workers/etc.) |
| Relaxed | Experimental | Adds `https:` to scripts/styles; `connect-src ws: wss:`; `worker-src blob:`; `frame-src https:` | Still `default-src 'none'`; still blocks plugins (`object-src 'none'`); reduces protection substantially |

---

## The injected JavaScript API: `window.ding`

Widgets receive a single injected global:

```js
window.ding
```

It is injected once; reinjection is skipped if `window.ding` already exists.

### Properties

- `apiVersion: 1`
- `instanceId: string|null`  
  Derived from URL query parameters (first match wins):
  - `dingInstanceId`
  - `widgetInstanceId`
  - `instanceId`

### Methods

#### `ding.getInstanceId(): string|null`

Returns `ding.instanceId`.

#### `ding.post(message: object): void`

Low-level escape hatch. Sends a JSON-encoded message to the host via:

`window.webkit.messageHandlers.dingWidget.postMessage(JSON.stringify(message))`

If WebKit message handlers are unavailable, it silently does nothing.

#### `ding.log(message: any): void`

Sends a message of type `"log"` to the host:

```js
ding.log("hello")
```

Host prints a console message prefixed with instance information.

#### `ding.saveConfig(config: object): void`

Sends an `"updateConfig"` message to the host:

```js
ding.saveConfig({ refreshInterval: 60 })
```

If `instanceId` is missing, it does nothing.

> Important: this method **does not merge**. The host replaces the existing config with the object you send; no deep merge is performed. Merge yourself before calling if you need that behavior.

#### `ding.getConfig(): Promise<object|null>`

Requests config from the host, returning a Promise resolved with the config object (or `null` if `instanceId` is missing).

Mechanism:
- widget sends `{ type: "getConfig", instanceId, requestId }`
- host replies by running:
  `window.postMessage({ _dingInternal: true, requestId, config }, "*")`
- the widget resolves the pending Promise for that `requestId`

#### `ding.getConfigCached(): object`

Returns the last known config snapshot (shallow-cloned). This cache is updated whenever `getConfig()` resolves or when the host pushes `configChanged`. Caution: It may be null initially, although the program seeds it automatically after the hostready signal.

#### `ding.onConfigChanged(cb: (config, meta) => void): () => void`

Subscribe to config updates pushed from the host. `meta` includes:

- `reason`: `"configChanged"` or `"getConfigReply"`
- `sourceMode`: `"widget"` or `"prefs"` (if provided by host)

Returns an unsubscribe function.

#### `ding.getHostState(): object`

Returns a shallow snapshot of host state (see below).

#### `ding.onHostStateChanged(cb: function): function`

Registers a callback that will be called:
- immediately (with the current snapshot), and
- again whenever host state changes.

Returns an `unsubscribe()` function.

#### `ding.backendRequest(method: string, params?: object): Promise<any>` (sends `requestId`)

Send a request to a widget backend **only if a backend exists** (the widget declares a `backendSpec`). Each call carries an auto-incremented `requestId`; the backend response includes the same `id` so replies are matched to the right Promise. `method` is a widget-author defined string, and `params` is arbitrary JSON defined by the widget/backend author. The backend replies with a `response` object shaped as `{ type: "response", id, ok, result, error }`: `id` matches the request, `ok` is a boolean success flag, `result` is the success payload (any JSON), and `error` is the failure payload (any JSON or string). The Promise resolves with `result` when `ok` is true and rejects with `error` when `ok` is false.

#### `ding.backendSend(name: string, payload?: object): void`

Fire-and-forget message to a widget backend **only if a backend exists** (the widget declares a `backendSpec`). `name` and `payload` are widget-author defined and can be any JSON shape.

#### `ding.onBackendEvent(cb: function): function`

Subscribe to backend `event` messages **only if a backend exists**. Event `name` and `payload` shapes are widget-author defined. Returns an `unsubscribe()` function.



---

## Host state

The injected API maintains an internal `_hostState` object:

```js
{
  editMode: false,
  selected: false,
  theme: "light",
  reducedMotion: false,
  direction: "ltr",
  locale: navigator.language || "en_US"
}
```

### How host state is applied to the DOM

When host state changes, the script attempts to update the DOM:

- `document.documentElement.dir = direction`
- `document.body.dataset.theme = theme`
- `document.body.classList.toggle("ding-edit-mode", editMode)`
- `document.body.classList.toggle("ding-selected", selected)`
- `document.body.classList.toggle("ding-reduced-motion", reducedMotion)`

This provides a **default styling contract** for widget authors:
- Use `.ding-selected` to style selection state
- Use `.ding-edit-mode` to react to edit-mode behavior
- Use `.ding-reduced-motion` to disable/shorten animations
- Use `[data-theme="dark"]` / `[data-theme="light"]` for theme styling
- Use `html[dir="rtl"]` for direction-sensitive layouts

### How host state is delivered from the host

Host state is pushed into the widget by calling an internal method:

- `window.ding._setHostState(patchObject)`

This is intended to be invoked from the host via `evaluate_javascript()` on the WebView.

The widget script also posts a `"hostReady"` message once injection finishes:

```json
{ "type": "hostReady", "instanceId": "<id-or-null>" }
```

When the host receives `"hostReady"`, it pushes the full current host-state snapshot for that instance.

---

## Preferences (current behavior)

### What exists today

- `WebWidgetContext` implements a **single shared preferences window** using GTK + a WebKit WebView.
- Preferences are opened by the host (typically via the desktop chrome / gear icon).
- Only **one preferences window** may exist at a time.
- Preferences will only open for the **currently selected** widget instance.
- Unselecting or destroying the widget closes the prefs window.

### What does NOT exist today in the injected API

The injected `window.ding` API does **not** currently provide dedicated convenience methods like:

- `ding.openPreferences()`
- `ding.closePreferences()`

If a widget needs to request preferences programmatically, it can only do so via the low-level `ding.post(...)` mechanism using a message type the host recognizes (see next section).

---

## Widget → Host message types (recognized today)

The host (WebWidgetContext) recognizes these message types from widgets:

| Type | Sent by | Purpose |
|---|---|---|
| `log` | `ding.log()` | host logs the message |
| `updateConfig` | `ding.saveConfig()` | update instance configuration |
| `getConfig` | `ding.getConfig()` | request configuration; host replies via `window.postMessage` |
| `hostReady` | injected script | triggers host to push full host state |
| `openPreferences` | low-level (`ding.post`) | host may open preferences (if implemented by WidgetManager) |
| `closePreferences` | low-level (`ding.post`) | host closes preferences (or falls back to closing for instance) |

> Note: `openPreferences` / `closePreferences` are handled in `WebWidgetContext`, but there are currently **no high-level helper methods** in `window.ding` to emit them. Authors may use `ding.post({type: "openPreferences", instanceId})` for now, but it is not a strict guarantee in future.

---

## HtmlWidgetHostWithBackend JSON protocol

Some widgets declare a backend subprocess via `backendSpec`. When present, `HtmlWidgetHostWithBackend` launches that subprocess and exchanges newline-delimited JSON objects over stdin/stdout.

### Host → backend messages

- **hello**  
  Sent once after the process starts. Shape:  
  `{ type: "hello", instanceId, widgetId, mode: "widget", config }`  
  Receipt of `hello` is a backend’s signal that it can begin doing work. The host sends `hello` immediately after wiring the subprocess—even before any real `request` is dispatched—so widget authors can force eager startup by issuing a no-op `backendRequest` during widget load to trigger process creation.
- **request**  
  Sent for each `backendRequest()` invoked by the widget. Shape:  
  `{ type: "request", id, method, params }`  
  `method` is an author-defined string that the backend understands, and `params` is arbitrary JSON supplied by the widget.
- **shutdown**  
  Sent when the widget host is being destroyed. Shape:  
  `{ type: "shutdown" }`  
  Backends should treat this as a polite SIGTERM-equivalent and exit promptly; the host will forcibly terminate the process shortly after.

### Backend → host messages

- **response**  
  Completes a pending request. Shape:  
  `{ type: "response", id, ok, result, error }`
- **event**  
  Asynchronous notifications forwarded to the widget as `backendEvent`. Shape:  
  `{ type: "event", name, payload }`  
  `name` is an author-defined string, and `payload` is arbitrary JSON decided entirely by the backend/widget author pair.
- **log**  
  Diagnostics printed by the host. Shape:  
  `{ type: "log", level, message }`  
  `level` is a string (common values: `log`, `warn`, `error`, `debug`) and `message` is free-form text; both are widget-author defined.

Messages with unknown `type` values or malformed JSON lines are ignored (no error response is sent).

---

### Backend helper: `backEndApp.js` (backend process)

Widget backends can subclass `BackendApp` from `widgets/backEndApp.js`, which implements the JSONL protocol over stdin/stdout and wires up request routing, logging, and shutdown handling.

Key hooks and helpers:

- `registerMethod(method, handler)`  
  Registers an async handler for `request` messages. The handler receives `(params, ctx)` and returns a JSON-serializable result. Replies are emitted as `{ type: "response", id, ok, result, error }` with the matching `id`.
- `onHello(ctx)`  
  Called after the host sends `hello`. `ctx` includes `{ instanceId, widgetId, mode, config }`.
- `onHostEvent(name, payload)`  
  Called for inbound `event` messages from the host.
- `onShutdown()`  
  Called when the host requests shutdown or on SIGTERM/SIGINT.
- `sendEvent(name, payload)`  
  Sends an async `event` to the widget. `name`/`payload` are widget-author defined.
- `sendLog(level, message)` and helpers `log()`, `warn()`, `error()`, `debug()`  
  Sends a `log` message to the host. `level` is typically `log`, `warn`, `error`, or `debug`.

To run a backend, subclass `BackendApp` and call `runBackend(MyBackend)` from your backend entry point.

### Backend helper for widgets: `widgetHelper.js` (DingClient)

For widget-side code, `widgets/widgetHelper.js` exports `DingClient` as a thin helper around the injected `window.ding` API. It exposes `backendRequest`, `backendSend`, and `onBackendEvent`, sends an initial backend hello for lazy startup, and includes optional timeouts for requests.


### Preferences and the gear icon

Widgets may optionally provide a preferences UI by setting a `prefs` path in `widget.json` (for example `prefs.html` or `ui/prefs.html`) and including that file somewhere under the widget directory.

#### Automatic gear icon

If the `prefs` path is set and the file exists:

- the platform automatically shows a gear icon in the widget chrome
- the gear icon is only visible when the widget is selected **and** the desktop is in edit mode
- the gear icon is fully managed by the host
- widget authors do not need to implement their own preferences button

#### Opening preferences

When the user clicks the gear icon:

- the host opens a dedicated preferences view
- `prefs.html` is loaded in a separate `WebView`
- only one preferences window may exist at a time
- the preferences view is associated with the currently selected widget instance

Widgets cannot open preferences arbitrarily; preferences are opened as a user-driven action via the host UI.

#### Preferences runtime behavior

When running in preferences mode:

- `prefs.html` receives the same injected `window.ding` API
- `window.ding.mode === "prefs"`
- configuration access (`getConfig`, `saveConfig`) works the same as in widget mode
- destroying or unselecting the widget automatically closes the preferences view
- `configChanged` pushes from the host are delivered to both widget and prefs contexts
- Calling `saveConfig()` from either widget or prefs triggers a host `configChanged` push so UIs can update.

#### File location and resource loading

The prefs file may live anywhere under the widget directory; its relative path comes from `widget.json`. Just like `index.html`, it may reference other resources using relative paths:

```html
<link rel="stylesheet" href="css/prefs.css">
<script src="js/prefs.js"></script>
<img src="images/icon.png">
```

These resources are resolved through the `ding-widget://` scheme and are:

- confined to the widget directory
- allowed to use subdirectories
- not allowed to traverse symlinks
- not allowed to escape the widget root

#### Design intent

Preferences are deliberately:

- host-controlled, not widget-controlled
- tied to widget selection
- opened explicitly by user interaction

This avoids widgets opening UI unexpectedly and keeps preferences behavior consistent across all widgets.

Widget authors should treat preferences as a configuration surface, not as a secondary application window.

---

## Debugging host state

Two debug knobs exist:

### In-page debug flag (widget side)

The injected script defines:

```js
window.DING_DEBUG_HOST_STATE = false;
```

When set to `true`, the injected script prints extra logs to the widget console for host-state patches.

### Host-side debug flags

The host will log host-state operations when `WIDGET_MANAGER_DEBUG` includes the `HOST_STATE` flag.

### Default Flags

Default flag are set in Enums.js as an OR of the possible flags above.

These defaults are read during application startup and currently remain constant for the lifetime of the application instance.

---

## Guarantees and non-guarantees

### Guaranteed by current design

- Widget JS does **not** run inside GNOME Shell.
- Widgets get a stable, minimal `window.ding` API.
- Host state is delivered as patches and mirrored into DOM classes/dataset.
- Widget config is delivered and set on initiation

### Not guaranteed

- Absolute security.
- Any undocumented API surface beyond `window.ding` and the message types listed above.

---

## Optional helper: `ding-client.js`

The widgets folder ships an optional helper (`ding-client.js`) that wraps the injected `window.ding` bridge. Including it is entirely up to the widget author; it just provides a thin, framework-agnostic convenience layer so widget code can stay focused on UI logic.

### What the client abstracts

- **Instance routing**  
  Automatically pulls `instanceId` from the injected bridge; authors never pass it around manually.
- **Request/reply plumbing**  
  Generates `requestId`s, tracks pending Promises, matches replies, handles timeouts, and cleans up pending state.
- **Unified async config API**  
  Exposes only Promise-based `getConfig()` / `setConfig()`. There is no sync variant, keeping usage consistent across frameworks.
- **Partial config updates with full-write semantics**  
  `patchConfig(patch)` performs read → deep-merge → write so authors can update just the fields they care about while the host still receives the full config.
- **Event subscription helpers**  
  Tiny wrappers like `onHostState(cb)`, `onConfigChanged(cb)`, and `onBackendEvent(cb)` that return unsubscribe functions and hide the raw message plumbing.
- **Backend IPC helpers**  
  `backendRequest(name, payload)` (request/reply) and `backendSend(name, payload)` (fire-and-forget) without manual envelope building.

### Why it helps across frameworks

- **Vanilla HTML widgets** use the same async API without reinventing message parsing.
- **React/Svelte/Vue** components can subscribe on mount and unsubscribe on unmount, awaiting config during init and calling `patchConfig()` from event handlers—no hooks or framework coupling required.
- **Node/tooling/tests** can instantiate the client with a mocked `ding` object so unit tests run without GNOME, keeping transport concerns at the boundary.

### What it intentionally does **not** do

- Provide alternative transports or fallbacks (it still uses `window.ding` only).
- Offer UI/rendering helpers or framework-specific wrappers.
- Reintroduce synchronous config access.

Use it if it simplifies your widget codebase, but it remains an optional convenience layer; everything described above can also be done directly via `window.ding`.

### When the helper is not worth adopting

If your widget is truly trivial—single-file, no prefs, no backend, writes config once, never streams events—the helper is optional overhead. You can talk to `window.ding` directly without much boilerplate.

### When the helper shines

- You ship both widget and prefs pages that need to share config handling
- You plan to use `backendRequest` / `backendSend`

In those cases the helper pays for itself immediately by keeping all widgets consistent and hiding the protocol details.

---

## Optional helper: `backEndApp.js`

For JavaScript backends, the widgets folder ships `backEndApp.js`, a small GJS base class that implements the JSONL protocol for you. It is optional, but it saves boilerplate and keeps backends consistent.

### Why use it for backends

- **Request routing**  
  `registerMethod()` wires method names to async handlers and automatically emits matching `{ type: "response", id, ok, result, error }`.
- **Lifecycle hooks**  
  `onHello(ctx)`, `onHostEvent(name, payload)`, and `onShutdown()` give clean entry points without manual parsing.
- **Logging helpers**  
  `log()`, `warn()`, `error()`, `debug()` emit host-visible log messages with consistent levels.
- **Shutdown handling**  
  Handles `shutdown` messages plus SIGTERM/SIGINT, so your backend exits cleanly.
- **Context access**  
  `this.context` provides `{ instanceId, widgetId, mode, config }` from the host hello.

Use it if you are writing a JS/GJS backend and want a well-defined protocol wrapper; you can still implement the raw protocol directly if you need full control.

---

## Quick author checklist

- Wait until you have a valid `ding.instanceId` before calling `getConfig()` / `saveConfig()`.
- Remember: `saveConfig()` replaces the stored config object; merge existing values yourself if needed.
- Use `getConfigCached()` and `onConfigChanged()` to react to host-pushed config updates (widgets and prefs views both receive them).
- Use `ding.onHostStateChanged(...)` to react to:
  - selection
  - edit mode
  - theme changes
  - reduced motion
  - locale changes
- Prefer shipping all JS/CSS locally; do not rely on remote `<script src=...>`.
- If you adopt `ding-client.js`, it can hide most of the plumbing above (instance routing, config access, event subscriptions, backend IPC) so your widget code stays focused on UI logic; using it is optional but recommended for consistency.
- For purely visual reactions to host state, you can skip JavaScript entirely and include `widgets/ding-widget.css`, which already responds to theme, edit/selection state, reduced motion, and direction changes (see [Optional helper stylesheet](#optional-helper-stylesheet-ding-widgetcss)).
