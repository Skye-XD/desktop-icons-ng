# Browser drop validation

## Ownership

`DropSession` owns the current `Gdk.Drop` from first inspection through native
completion. It receives its grid's `Gtk.DropTargetAsync` once at construction so
that asynchronous classification can reject and release an unsupported drop
without calling back through the grid. It snapshots the advertised formats and
MIME names once, owns the shared cancellable, caches decoded text
representations, classifies the route, negotiates actions, reads and decodes
every required representation, and returns one complete type-specific result
before finishing and releasing the drop.
When a drop is accepted, the grid keeps a small immutable context captured by the
session. Mutable decision values and coordinate arrays are copied, while the
original `Gdk.Drop`, `Gio.Cancellable`, content formats, and destination item are
retained by identity. All asynchronous representation reads use that context, so
a replacement drop can cancel an older read without redirecting it to the newer
drop. A completed stale action finishes only its captured drop and does not clear
feedback belonging to the current drop.
`DropSession` reads and classifies external content. `WebUtils` supplies MIME,
URL, encoding, and HTML parsers. `DesktopIconsUtil` creates desktop links and
content using `FileUtils` for sanitization, exclusive writes, collisions, and
metadata. `ThumbnailLoader` renders supplied link images and persists them as
content-addressed custom icons under the application's XDG data directory.
The grid retains readable controller wiring, destination hit-testing, and routing
to either a file item or the desktop. All asynchronous GI methods are promisified
at application startup.

## API findings

- [Wayland wl_data_offer.receive](https://wayland.freedesktop.org/docs/html/apa.html#protocol-spec-wl_data_offer)
  explicitly permits repeated reads of different MIME types, before and after
  the physical drop. No further requests are allowed after `finish`.
- [GDK's X11 drop implementation](https://github.com/GNOME/gtk/blob/main/gdk/x11/gdkdrop-x11.c)
  starts a new Xdnd selection stream for each read. It does not consume the entire
  offer on the first read. Reads here are sequential and streams are closed before
  the next read; all extraction precedes completion.
- [Gtk.DropTargetAsync::drop](https://docs.gtk.org/gtk4/signal.DropTargetAsync.drop.html)
  requires the callback to return true when taking responsibility for an
  asynchronous operation, and to finish after receiving the data.
- [Chromium's Wayland exchange provider](https://github.com/chromium/chromium/blob/main/ui/ozone/platform/wayland/host/wayland_exchange_data_provider.cc)
  documents URL/newline/title and contains UTF-16 import and UTF-8 export paths.
  MIME names alone do not establish encoding. The reader detects UTF-16 BOMs or
  alternating zero bytes and otherwise strictly decodes UTF-8.

## Behavior

Internal DING and GNOME file offers keep file routing. URI-only offers are read
during hover to distinguish web links from files before negotiating an action.
While this inspection is pending, the cursor does not advertise a drop action.
An all-web URI list creates one link per URL. Mixed file/web lists are rejected
without starting partial file operations. Unsupported URI schemes are rejected.
GFile/GdkFileList values without browser markers or a URI-list offer retain typed
file reads, even when accompanied by plain text.

Browser URL extraction prefers `text/x-moz-url`, URL-data with its matching
description, and `_NETSCAPE_URL`. A single HTML anchor can supply a missing URL
or title, followed by URI-list and the advertised plain-text variants. Titles
from conflicting URLs are not merged. Once a complete URL/title is obtained,
redundant text representations are not read. HTML is parsed conservatively:
single absolute HTTP(S) anchors, nested link text, quoted/unquoted attributes,
numeric entities and basic named entities. Ambiguous fragments and relative URLs
fall back to plain text; HTML is never executed or fetched.

The rich browser path validates HTTP/HTTPS. Existing ordinary-text handling
retains its legacy URL schemes. Browser links negotiate COPY during hover, before
the physical drop fixes Wayland's selected action. File COPY/MOVE/ASK handling
and internal positioning remain on their original paths. Browser link creation
targets empty desktop space; directory/icon destinations retain file operations.

Optional custom link icons are read after identifying a browser link. Explicit
`image/*` representations are preferred, followed by Chromium's named
`application/octet-stream` file contents. Encoded data is limited to 4 MiB and
written to a private temporary file. `ThumbnailLoader` delegates rendering to
GNOME's configured thumbnailers, with its existing GdkPixbuf and Poppler
fallbacks. The temporary source is always removed. A successfully generated
image is accepted without applying a second size or aspect-ratio policy.
Text reads are limited to 1 MiB;
each representation transfer has a three-second timeout. A stalled transfer
cancels the session-owned cancellable, terminates the entire drop, and prevents
fallback representations or content creation from continuing.

The supplied representation is a custom link icon, not a proven favicon or a
thumbnail derived from the HTML file. Before creating the HTML link,
`ThumbnailLoader` writes a content-addressed PNG under
`$XDG_DATA_HOME/<app-id>/link-icons`. The resulting file URI is stored in the
link's `metadata::custom-icon` attribute. Identical generated icons share one
durable file.

HTML links use title-based filenames, sanitized and limited by UTF-8 byte length,
with host fallback and exclusive creation of `Name.html`, `Name 1.html`, etc.
Redirect attributes and title/link text are escaped. `Gio.FileInfo` string
attributes are applied with `set_attributes_async` and the returned per-attribute
status is checked. Position metadata failure does not fail link creation.

HTML offers with a UTF-8 charset parameter are recognized regardless of parameter
spacing, quoting, or charset case; reads use the exact advertised token. Other
declared HTML encodings are not interpreted as UTF-8.

Standalone `image/*` offers create picture files using installed image decoders,
including AVIF, HEIF/HEIC, JPEG XL, and SVG when supported by the system.
Original bytes and animation are preserved.
Encoded data is limited to 32 MiB, dimensions to 16384 per side and 16 megapixels
total. The decoder is selected explicitly by MIME. Named
`application/octet-stream;name="..."` offers save the
supplied bytes without decoding, downloading, executing, or trusting them.
Names are sanitized, made visible, and UTF-8 length-limited; exclusive creation
adds collision suffixes before the extension. These operations target empty
desktop space, require COPY, and finish only after writing and position metadata
have settled. Portal handling is unchanged.

## Automated checks

Run `npm test`. The GJS integration test requires GJS, GTK4, GdkPixbuf, and access
to the system image decoder (on some systems this uses D-Bus). It exercises real
Gio input streams, encoding and representation fallback, URI classification,
HTML extraction/escaping, Unicode/long/reserved filenames, concurrent collisions,
custom-icon persistence, metadata failure, and completion ordering. A controller
harness also checks sequential URL/icon reads and nonfatal icon failure. Saved
PNG and HTML contents are compared byte-for-byte. The generated browser icon is
verified under the application's XDG data directory, and partial writes are
covered. The controller harness
covers browser COPY, URI inspection, file actions/destinations, internal moves,
plain-text failure, and rejection of invalid targets. It does not simulate an
actual compositor or browser.

## Live checklist (pending)

Reload the extension before exercising the live cases below.

For Firefox and Chrome, check address-bar and ordinary page-link drags, sites with
and without supplied previews, long and Unicode titles, repeated titles, and titles
containing filename punctuation. Confirm the generated filename, target URL,
COPY action, and custom-icon appearance.

On Wayland and X11, check Nautilus single/multiple files, COPY/MOVE and ASK where
supported, directory/drive destinations, internal icon repositioning, arranged
mode, monitor-to-monitor moves, ordinary text, and cancelling/leaving a drag.
These live cases have not been claimed as passing by the automated harness.

Also check image-only drags from an image editor, Chromium named file-content
drags, repeated filenames, animated GIFs, and UTF-8-parameterized HTML offers.
Confirm picture files contain the supplied image (not a URL shortcut), existing
files are not overwritten, and failed transfers finish with action zero.
