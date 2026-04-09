# Media Widget Horizontal

This widget shows current playback information from an MPRIS-compatible media player.

Original author: xiaozhangup
Version 1.2 improvements: Sundeep Mediratta
CSS playback controls: Sundeep Mediratta

## Version 1.2

- Switched the backend to signal-driven MPRIS refreshes instead of fixed polling.
- Reduced frontend playback updates to a visible-only 1 Hz timer.
- Rendered the progress bar with compositor-friendly transforms.
- Refreshed reload snapshots on demand for accurate playback position.
- Persisted only meaningful media changes instead of every playback tick.

## Controls

- Controls appear when the widget host chrome is visible.
- `Previous`, `Play/Pause`, and `Next` send the matching MPRIS transport commands to the selected player.
- `-` and `+` change volume in 5% steps.
- The volume slider updates volume live while dragging.
- Scrolling the mouse wheel over the widget also changes volume in 5% steps.
- Volume controls are only shown when the current player supports volume control.
