# Sticky Note Widget

**Author:** Sundeep Mediratta

**Copyright:** Copyright (C) 2026 Sundeep Mediratta

Licensed under the GNU General Public License version 3 or later.
This widget is distributed without any warranty.

## Overview

Sticky Note is a local-only desktop note widget.

It does not use EDS, an external backend, or direct filesystem writes for note storage. The note is persisted through widget config, with the note body stored as raw HTML.

## Storage

The widget stores its state in widget config.

Persisted fields include:
- `contentHtml`
- `fontSize`
- `fontFamily`
- `noteColor`
- `noteTitle`

Notes:
- `contentHtml` is the canonical stored note body.
- `noteTitle` is still maintained, even though the visible title is currently hidden in the UI.
- Config is read through the injected `window.ding` bridge via `DingClient`.
- Changes are saved with `patchConfig(...)`.
- The widget does not write directly to disk.
- The widget no longer has a note UID or any external note identity.

## Interaction Model

The widget uses an explicit view/edit toggle.

View mode behavior:
- Default mode, even when the widget is selected
- Top control strip is visible when selected
- Text can be selected and copied
- Links can be activated
- Checklists can be toggled
- Editor remains read-only

Edit mode behavior:
- Entered through the top-bar edit button
- Exited when the widget is deselected or interaction leaves the widget
- Link dialog closes automatically on edit exit
- Formatting toolbars are visible only in edit mode

## Top Bar Controls

The top control strip contains:
- Add note: creates a new Sticky Note widget instance
- Pin: toggles the current note between desktop-layer and pinned/floating mode
- Move: starts repositioning for a pinned note
- Edit: toggles edit mode
- Close: removes the current widget instance

The note header also contains an invisible draggable region in the raised widget container:
- It sits between the left-side and right-side buttons in the top bar
- It lets you move the note without a visible drag handle
- It only applies while the note is in the raised widget container

## Pinning and Pinned Move

Sticky Note is pinnable and manages its own pin and move controls.

Pinning behavior:
- Pressing the pin button pins the note into the floating host window layer
- Pressing the pin button again unpins the note back into the normal desktop widget layer
- The widget saves pending content before pin and unpin transitions
- Pinning and unpinning may recreate the HTML host, so the widget treats the transition as reload-safe

Pinned behavior:
- A pinned note lives in its own floating host window instead of the desktop widget container
- The note can still enter edit mode through the Edit button
- This is a special mode, where the note becomes a normal window to keep keyboard focus, but is forcibly kept on top
- Leaving pinned edit mode returns the note to its normal pinned dock-window behavior

Moving while pinned:
- The Move button is active only while the note is pinned
- Dragging the empty part of the top bar while pinned also starts a pinned window move
- The final pinned position is reported back to the host and persisted in the widget instance state

Moving while raised on the desktop:
- Dragging the center of the top bar starts moving the widget without a visible handle
- The top bar drag area is intentionally kept clear of the chrome buttons
- This raised-container drag uses the widget helper's draggable-region API, not the pinned floating-window move API

## Editor

The widget uses a native `contenteditable` HTML editor.

View mode:
- `contenteditable="false"`
- Text is selectable
- Links are usable
- Checklists remain interactive

Edit mode:
- `contenteditable="true"`
- Spellcheck enabled
- Formatting toolbars shown
- Link text editable inline

## Formatting Controls

### First Toolbar Row
- Decrease font size
- Increase font size
- Bold
- Italic
- Underline
- Strikethrough
- Align left
- Align center
- Align right
- Bulleted list
- Numbered list
- Checklist
- Font family picker

### Second Toolbar Row
- `H1`
- `H2`
- `H3`
- Insert or edit link
- Blockquote
- Clear formatting
- Note color chips

## Checklists

Checklist support is implemented as an unordered list with a `checklist` class.

Behavior:
- Clicking near the left checkbox area toggles checked state
- Works in both view mode and edit mode
- Checked items render with a checkbox mark and strike-through styling
- Checklist state is preserved in saved HTML

## Links

Links are stored as HTML anchors in the note body.

View mode:
- Left click follows the link through the host-controlled external-open flow
- In-webview navigation is intercepted by host WebKit policy

Edit mode:
- Link text is editable inline
- The toolbar link action opens an internal link dialog

Link dialog actions:
- Apply
- Cancel
- Unlink

Link insertion and editing use explicit DOM range wrapping instead of `execCommand('createLink')`.

## Appearance

Built-in pastel note themes:
- Yellow
- Pink
- Mint
- Blue
- Peach
- Lavender

Visual behavior:
- Color changes apply immediately and are persisted
- Note surface uses translucent paper styling with backdrop blur
- Idle or display mode uses reduced opacity
- Selected or edit mode uses full opacity
- Top control strip darkens slightly in selected and edit states
- Visible title is currently hidden so the note reads as a sticky note rather than a small window

## Fonts

Font support includes:
- Configurable font family dropdown
- Generic and CJK-oriented font stacks
- Default body font size: `17px`
- Default font family: `Noto Sans, sans-serif`

## Host and WebKit Behavior

External link opening is handled by the host, not directly by the widget.

Current host behavior:
- Only `http` and `https` URLs are allowed
- User confirmation is required before launching the browser with `xdg-open`
- WebKit policy interception blocks in-webview external navigation
- Widget context menus filter out:
  - open in new window
  - download link, image, video, and audio
  - reload
- Injected widget API blocks keyboard reload shortcuts:
  - `F5`
  - `Ctrl+R`

## Cleanup Notes

This widget no longer uses the earlier notes backend approach.

Removed from this branch:
- Obsolete notes backend files
- Notes backend harness scripts
- EDS-based rich-text note persistence attempts

The current implementation is fully widget-local and HTML-backed through config storage.
