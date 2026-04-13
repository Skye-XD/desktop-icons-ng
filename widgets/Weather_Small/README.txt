Weather (Small)

Small HTML weather widget for Desktop Icons NG.

Features
- Current conditions with animated local SVG icons
- Three-day forecast
- Location search in preferences
- Unit selection
- Refresh interval selection
- Optional icon animation
- Pinned widget support

Behavior
- Weather data is fetched from Open-Meteo and cached in widget config.
- Local icon assets are still loaded by URL from the widget bundle.
- Widget layer changes and host reparenting reuse fresh cached weather data.
- Layer changes do not trigger a weather refetch.
- Failed icon fetches during reload are ignored and not retried repeatedly during the same page lifetime.
- In pinned mode, the entire widget surface acts as the drag handle for moving the window.

Configuration
- `location`: selected location label, latitude, and longitude
- `units`: `system`, `metric`, or `imperial`
- `refreshMinutes`: refresh interval, with a minimum effective interval of 15 minutes
- `animationsEnabled`: enables animated current-condition icons
- `cache`: last normalized forecast payload used for warm reloads

Permissions
- `internet`: required for Open-Meteo forecast and geocoding requests

Credits
Weather icons: Meteocons by Bas Milius — MIT License
Source: https://github.com/basmilius/meteocons

Weather data: Open-Meteo API
Source: https://open-meteo.com/en
