# Today Widget

The Today widget shows calendar events for the current local day using a small
HTML frontend and a `gjs` backend helper that runs in its own scope backed by Evolution Data Server.

Copyright (C) 2026 Sundeep Mediratta

## Notes

- Timed events are normalized in the backend helper before being sent to the widget UI.
- The backend preserves the event timezone semantics when converting
  `ICalGLib.Time` values to Unix timestamps.
- The frontend displays those normalized timestamps using local time formatting.
- All-day events are treated separately as date-only entries and are rendered in
  the `All day` section without time-of-day labels.

## Files

- `calendar.js`: widget UI and rendering logic
- `calendarBackend.js`: calendar query and timestamp normalization
- `widget.json`: widget metadata and backend entrypoint
- `prefs.html` / `prefs.js`: widget preferences
