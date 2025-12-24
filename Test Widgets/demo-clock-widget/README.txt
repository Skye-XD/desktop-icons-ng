Demo Clock Widget (Example)

Files:
- widget.json                 Manifest (size defaults + config defaults)
- index.html                  Main widget UI (clock face)
- prefs.html                  Preferences UI + CSP/connectivity diagnostics button
- assets/css/style.css        Heavily commented reference stylesheet
- assets/fonts/DemoMono.woff2 Local font (subset of DejaVuSansMono from system)
- assets/icons/*.svg          Local icons (clock + globe)
- assets/images/*.png         Local images used on the clock face

Notes:
- All logging goes through window.ding.log() (host console).
- Diagnostics do NOT run automatically; use "Run diagnostics" in prefs.
