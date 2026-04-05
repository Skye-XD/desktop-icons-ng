Storm Widget

HTML test widget for validating host-side storm protection.

Behavior
- Starts automatically on widget load.
- Sends a short burst of repeated `saveConfig()` calls.
- Sends a short burst of repeated local SVG fetches through `ding-widget://`.
- Intended to verify that host-side guardrails prevent a runaway widget from overwhelming DING.

Notes
- This widget is intentionally hostile.
- It should be used only for local testing of widget host resilience.
