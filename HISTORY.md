# History of versions #
* Gtk4 version 50
  * Updates for Gnome 45 to work with other extensions and fix errors
  * Fix Drand and Drop on Dock - decrease offset to detect drag over dock, got broken by one pixel in Gnome 45. (Sundeep Mediratta)
  * Fix synthesize hover to deselect hover on actor if disabled. Drop all refrences to the hovered actor on disable and timeout. (Sundeep Mediratta)
  * Fix tooltip popovers - destroy completely on popdown. (Sundeep Mediratta)
  * Don't start gnome shell drop if extension control dbus not available, eg. when testing with no extension enabled. Prevents unnecceary errors. (Sundeep Mediratta)
  * Fix no content provider error introduced with lint cleanup. (Sundeep Mediratta)
  * Further eslint clean up with new upstream eslint rules for Gnome Shell and GJS.
  * Update metadata.json, History.md. Version Bump to 50.

* Gtk4 version 49
  * Maintainence fix release for Gnome 44 and lower with fixes backported from the Gnome 45 branch, Gtk4 version 48
  * Fix synthesize hover to deselect hover on actor if disabled. (Sundeep Mediratta)
  * Fix tooltip popovers - destroy completely on popdown. (Sundeep Mediratta)
  * Don't start gnome shell drop if extension control dbus not available, eg. when testing. Prevents unnecceary errors. (Sundeep Mediratta)
  * Update metadata.json, History.md. Version Bump to 49 to sync with EGO.

* Gtk4 version 48
  * Move extension.js and all files as well as the app to ESM imports.(Sundeep Mediratta)
  * Translations update. (Weblate)
  * update metadata.json, History.md, Version Bump to 48.

* Gtk4 version 47
  * Makes DING windows Meta.WindowType.DESKTOP and is_on_all_workspacesso that it works perfectly with Gnome Shell without unlimited workspaces. Also works with auto-move-windows with no further modifications. Minimal overrides to gnome shell workspaceAnimation.js to support this, remove prior multiple overrides. (Sundeep Mediratta)
  * When doing drag and drop over the dock, synthesize a hover event to highlight the dock item correctly as well as to enable scrolling and insure visibility of the app icon when it is crolled out of view on the Dock. (Sundeep Mediratta)
  * Fix DbusUtils regressions. (Sundeep Mediratta)
  * Gnome Shell overrides now happen immediately on enabling as expected by the shell. (Sundeep Mediratta)
  * Fixes regression in Ubuntu Jammy, preferences window would crash as it only has old verison of libadwaita - now works with the old version. (Sundeep Mediratta)
  * Added a link for Translations in the about page to facilated users helping in translations on Weblate.
  * Multiple tranlation updates.  (Weblate Authors)
  * Update metadata.json, History.md, Version Bump to 47.

* Gtk4 version 46
  * Fix- Stops unlimited workspaces to the right with extensions AUTO-MOVE-WINDOWS enabled. Overrides auto move windows as well so no extra workspaces are created to the right.
  * Weblate translation updates
  * Update metadata.json, History.md, Version Bump to 46 - sync with EGO

* Gtk4 version 45
  * New - tool tips are now positioned correctly to not go under the dash or make it autohide, or go over any gnome shell actors on the edge of the screen. (Sundeep Mediratta)
  * New - About pane if preferences page that shows the correct version of the extension and weblimks to gitlab website. (Sundeep Mediratta)
  * Fix - Gnome shell creates a empty workspace to the right as it detects the DING window. This can lead to Unlimited Workspaces. STILL DOES NOT WORK CORRECTL WITH AUTO-MOVE-WINDOWS EXTENSION. (Sundeep Mediratta)
  * Weblate translation updates.
  * Update metadata.json, History.md, Version Bump to 45

* Gtk4 version 44 - June maintenance
  * Fix regression - error dialog not showing in fileItemMenu.js. (Sundeep Mediratta)
  * Separate app logic for drag and drop on Gnome Shell to new class in gnomeShellDragDrop.js. (Sundeep Mediratta)
  * Weblate translation updates. (Weblate Authors)
  * update metadata.json, History.md, version bump to 44

* Gtk4 version 43
  * Bug Fix - Drag on Trash icon not showing correct cursor. (Sundeep Mediratta)
  * Weblate translation updates. (Weblate Authors)
  * update metadata.json, History.md, version bump to 43.

* Gtk4 version 42
  * New - Drag Navigation, open Gnome files on drag and hover over Gnome files icon or drive icons, and further drag navigation can be done on the window. (Sundeep Mediratta)
  * New - Improve Gnome Shell drop Detection, update cursor with correct drop action on drop onto gnome shell Actors. (Sundeep Mediratta)
  * Weblate translation updates. (Weblate authours)
  * update metadata.json, Hisotry.md, Readme.md, Version Bump to 42

* Gtk4 version 41
  * New - Drag Navigation - dragging an icon over a folder icon or a drive icon, and then hovering over it will open that location in Gnome Files. (Sundeep Mediratta)
  * New - Make a stack of dragged icon as the drag icon. Uses code tranlated from C in Nautilus to form the icon just as Nautilus. (Suneep Mediratta)
  * Fix broken right click and appchooser with appimage files as there is no default application available. (Sundeep Mediratta)
  * New - Run appimage files with right click if they are executable - mirror Gnome Files behaviour. (Sundeep Mediratta)
  * Weblate translation updates. (Weblate authors)
  * update metadata.json, History.md, Version Bump to 41.

* Gtk4 version 40
  * Fix icons not showing on preferences window in extensions downloaded from extensions.gnome.org. (Sundeep Mediratta)
  * Simplify folder structure, move icons and css files into resources as part of app, fix scripts. Should always bundle the icons and other resources with the application with the new scripts in future and prevent the problem mentioned above in the first place. (Sundeep Mediratta)
  * New application-chooser dialog, uses Gtk4, libadwaita. Same UI as the chooser in Gnome Files. Allows opening files on desktop with a different application. Has a switch to enable setting a new default application for a file type. (Sundeep Mediratta)
  * Weblate translation updates. (Weblate authors).
  * Update metadata.json, History.md, Readme.md, Version Bump to 40.

* Gtk4 version 39
  * Fix gnomeshelloverride.js for workspace animation override in gnome shell, so that all other extensions also trying to override this function work properly without crashing the shell. (Sundeep Mediratta)
  * Update History.md, metadata.json, Version Bump to 39.

* Gtk4 version 38
  * Fix for icons showing on top of windows with rapid workspace changes using shortcuts. (Sundeep Mediratta)
  * Fix for icons showing on top on lowering windows using middle click or shortcut keys. (Sundeep Mediratta)
  * Optimze drawing rectangles on the grid using async calls and promises. (Sundeep Mediratta)
  * Revert previous wrong async without await, prevent excessive CPU usage on mouse movement with lag on DING window. (Sundeep Mediratta)
  * Lint clean multiple file errors, extension.js, emulateX11WindowType.js, desktopManager.js and desktopGrid.js. (Sundeep Mediratta)
  * Rename all methods in emulateX11WidnowType.js to make it verbose, less cryptic and remove confusing true/false parameters. (Sundeep Mediratta)
  * Multilpe translations update. (Weblate authours)
  * Update History.md, metadata.json, Versin Bump to 38.

* Gtk4 version 37
  * Fix for single click opening working on alternate clicks. (Sundeep Mediratta)
  * Fix unecessary resource utilization to save icons. (Sundeep Mediratta)
  * Fix regression - local move not dropping file at the right drop target. (Sundeep Mediratta)
  * Fix regression - .desktop files not opening on clicking. (Sundeep Mediratta)
  * Prevent error logging if GsConnect extension is not installed. (Sundeep Mediratta)
  * Redo icon right click menu to mirror GNOME Files right click options. (Sundeep Mediratta)
  * Add options to right click menu to move/copy to.., make links for files. (Sundeep Mediratta)
  * Use new Gtk4 FileDialog to choose folders for move/copy/extract to.. (Sundeep Mediratta)
  * Fall back to using Gtk4 FileChooserDialog if FileDialog does not exist (requires Gtk 4.10). (Sundeep Mediatta)
  * Make all calls to grid drawing function asynchronous to speed selection rectangle and drop target. (Sundeep Mediatta)
  * Change alpha of selection rectangle to more transparent to mirror Gnome Files Selection. (Sundeep Mediratta)
  * Spanish translation. (Sergio Costas)
  * Multiple translation updates. (Weblate authors).
  * Version Bump to 37 to keep up with extensions.gnome.org.
  * Update metadata.json and History.md

* Gtk4 version 35
  * Gtk4-Ding is now a libadwaita app, port to libadwaita complete (Sundeep Mediratta)
  * Fix, preferences window not opening the second time from Extensions on libadwaita port. (Sergio Costas)
  * Update POTFILES.in, meson build automatically. (Marco Trevisian)
  * Fix Chrome App Icons not set correctly on some distributions. (Sundeep Mediratta, debugging help from Mirko Girgenti)
  * Multiple translation updates. (Hosted Weblate authors)
  * Version Bump to 35, update metadata.json, Readme.md and History.md

* Gtk4 version 34
  * Bug fixes to drag and drop. (Sundeep Mediratta)
  * Fix regression, dropCapable was somehow dropped from the getter function for desktopIconItem/FileItem. (Sundeep Mediratta)
  * When a file is dropped on a .desktop icon, a check is made to make sure the app can launch the file prior to launching the app. (Sundeep Mediratta)
  * Version Bump to 34, update metadata.json, Readme.md and History.md

* Gtk4 version 33
  * Fix Drag and Drop with X11 leaving spurious floating drop icons. (Sundeep Mediratta)
  * Fix issue where sometimes dragItem would be set to null before the drag was actually completed. (Sundeep Mediratta)
  * When a file on the desktop is dragged to trash or to another folder on desktop or files, undoing returns it to same position. (Sundeep Mediratta)
  * Offset to icon on Wayland on dragging icon is now rendered correctly. (Sundeep Mediratta)
  * Version Bump to 33, update metadata.json and History.md.

* Gtk4 version 32
  * Weblate Translations updates
  * Use regex to determine space separated Nautilus drop files to fix Drop Bug on different distributions. (Sundeep Mediratta)
  * Fix Error where files belonging to different Users, without read access were causing a GJS crash on move to Desktop. (Sundeep Mediratta)
  * Version Bump to 32, update metadata.json, History
  * Version will be retired, does not work properly with drag offsets on Gnome 43.4 and causes spurious drag icons on X11.

* Gtk4 version 31
  * Link targets are now monitored in the background for broken links. (Sundeep Mediratta)
  * Check Dock Application can actually launch the file dropped on it from the Desktop prior to launching the application. (Sundeep Mediratta)
  * Multiple Fixes to prevent errors in logs. (Sundeep Mediratta)
  * Cherry Pick simplify global context lookup. (Daniel Van Vaugt)
  * Version Bump to 31, update metadata.json, Hitory and Readme.

* Gtk4 version 30
  * Fix Gtk.CssProvider calls for API change Gtk 4.9 (Sundeep Mediratta)
  * Fix API change for Meta, Mutter 44, cherry pick from Gtk3 DING. (Daniel Van Vougt)
  * Fix right click menus in Stacks view not showing for fileItems, stackItems. (Sundeep Mediratta)
  * Fix - always start in Gnome overview mode on initialization. (Sundeep Mediratta)
  * Multiple Translation merges - please see authous on Weblate Web Site
  * Version Bump to 30 (skip verion to keep up with gnome.extensions.org), update metadata.json, History

* Gtk4 version 28
  * Fix CSS application with specific selectors and DING named colors, use Gtk4 calls to apply css. (Sundeep Mediratta)
  * Reload CSS on theme changes to change rubber band and selection colors on the fly. (Sundeep Mediratta)
  * Reload Dark Theme Variant on the fly with changes in Global Gnome Settings to Dark Mode. (Sundeep Mediratta)
  * Version Bump to 28 - metadata.json, update History and Readme.

* Gtk4 version 27
  * Preferences are now cached and all code is migrated to Preferences.js including monitoring code. Global Preferences from this file. (Sundeep Mediratta)
  * Meson.build now back in root folder, install and export scripts updated accordingly. (Sundeep Mediratta)
  * Cleanup of extension code, consolidate DBus name aquisition to common method, optimze code. (Sundeep Mediratta)
  * Fix Error if GSconnect extension not installed. (Sergio Costas)
  * Multiple eslint errors fixed. (Sergio Costas)
  * Disconnect all signals on destroy - askRenamePopup.js and fixe callback/destruction called twice. (Sergio Costas).
  * Multiple fixes and forwardports from Gtk3 branch. (Sergio Costas)
  * Update po/gtk4-ding.pot and all weblate translations.
  * Version Bump to 27 - metadata.json, update history and Readme.

* Gtk4 version 26
  * Fix regression of dropping local files on folder or icons not working. (Sundeep Mediratta)
  * Look for GIMP files for snap and flatpack installs. (Sundeep Mediratta)
  * Optimized thumbnail lookup code, more efficient faster with fewer looup and use of resources. (Sundeep Mediratta)
  * Verssion Bump to 26 - metadata.json, update history and Readme.

* Gtk4 version 25
  * Fix regression, Drag and Drop with Files version 43 and 44 was not working reliably. (Sundeep Mediratta)
  * Show GIMP thumbnails for GIMP files if the thumbnails exist. (Sundeep Mediratta)
  * Allow copy to davs:// locations mounted on the Dock. (Sundeep Mediratta)
  * Multiple translation Fixes and Weblate integration. (Allan Nordhøy)
  * Translations updates (Weblate Contributers)
  * Readme update for Theme issues
  * Version Bump to 25 - metadata.json, update history and Readme

* Gtk4 version 24
  * Add support for dragging files directily from desktop to Trash or monted volumes on Dash to Dock. (Sundeep Mediratta)
  * Make drop on Dash more sensitive for X11. (Sundeep Mediratta)
  * Update project id on all translations. (Sundeep Mediratta)
  * Version Bump to 24 - metadata.json, update history and Readme

* Gtk4 version 23, Happy Thanksgiving Release!
  * Add support back for X11. Uses a workaround to get state from the shell. Hacky! Fix when GJS if fixed. (Sundeep Mediratta)
  * Version bump to 23 - metadata.json, update history.

* Gtk4 version 22
  * Add supoort for dragging files from the desktop to the app icon on the dock, to open the file with the app. (Sundeep Mediratta)
  * Version skips, update to 22 to sync with extensions.gnome.org
  * Version bump to 22 - metadata.json, update readme and history.

* Gtk4 version 19
  * Fix window displacement when dragging down on top bar. (Sundeep Mediratta)
  * Fix icons flickering when changing work spaces with swipe gesture. (Sundeep Mediratta)
  * Version bump to 19 - metadata.json, update readme and history.

* Gtk4 version 18
  * Sets the .desktop Icon formed by moving or copying from dock favorites as trusted and executable. (Sundeep Mediratta)
  * Uses async Gio file copy to make the desktop icon, thus reolving relative symlinks for flatpack or snaps. (Sundeep Mediratta)
  * Make the DING window clone stick to background on other workspaces when switching with gestures. Makes it look as if the window was always there. (Sundeep Mediratta)
  * Version bump to 18 - metadata.json, update readme and history, now only for Gnome 42 & 43! as we are overriding only the latest shell.

* Gtk4 version 17
  * Allow using modifierKeys to move, copy or remove apps from the dock. (Sundeep Mediratta)
  * Version Bump to 17 - metadata.json, update readme and history.

* Gtk4 version 16
  * Allow dropping Favorite Apps from the Dock to the Desktop to give a launchable/droppable .desktop file on the Desktop. (Sundeep Mediratta)
  * Version Bump to 16 - metadata.json, update readme and history.

* Gtk4 version 15
  * Fix typo in importing fileUtils in thumbnailapp.js
  * Fix drag and drop of plain text to desktop - regression, had stopped working.
  * Move all utils used by app to utils subfolder in app folder as requested by reviewrs on gnome.extensions.org
  * Updated Readme with download links.
  * Version Bump to 15 - metadata.json.


* Gtk4 version 14
  * Trashed files are restored to their original position on undo action with right click menu. (Sundeep Mediratta)
  * Gsconnect branch merged to mainline. If GsConnect extension is installed, right click menu action to send file to paired device. (Sundeep Mediratta)
  * Miscellaneous drop coordinate fixes.
  * Version Bump to 14 - metadata.json.

* Gtk4 version 13
  * Clean up addFiles to desktop, completely rewritten, more legible and understandable. (Sundeep Mediratta)
  * Fix - async writing of saved coordinates race condition, introduce temporary saved position. (Sundeep Mediratta)
  * Fix - Use loose equality operator when comparing saved and dropped coordiantes. (Sundeep Mediratta)
  * All above result in more reliable placement of icons without them jumping around, specially on dual monitor setup.
  * Version Bump to 13 - metadata.json.

* Gtk4 verion 12
  * Fix - pasting a copy of a desktop file - the pasted copy and the original do not change positions. (Sundeep Mediratta)
  * Fix - Renaming a file on the desktop does not change position of the renamed file. (Sundeep Mediratta)
  * Fix - Ask Rename popup would not display on second monitor, fixed. (Sundeep Mediratta)
  * Fix - Moving, dropping icons, moving, dropping links etc are always dropped on the correct highlighted grid. (Sundeep Mediratta)
  * Multiple small clean ups and fixes. (Sundeep Mediratta)
  * Version Bump to 12 - metadata.json.

* Gtk4 version 11
  * Fix - always show new Icons on primary monitor on multi monitor setups. When primary monitor is switched during session, this tracks it as well. (Sundeep Mediratta)
  * New Feature - Add a preferences option to place new icons on the non primary display if multiple monitors are connected. (Sundeep Mediratta)
  * Version Bump to 11 - metadata.json. Also update gtk4-ding.po.

* Gtk4 version 10
  * Fix DND of icons on second monitor, use second monitor effectively. (Sundeep Mediratta)
  * Fix Global Rectangle, dont use Gtk translate coordinates as it was giving errors leaving last column of grids inaccessible for drops. (Sundeep Mediratta)
  * Version Bump to 10 - metadata.json.

* Gtk4 version 9
  * Use CSS to unhighlight droptarget instead of intercepting GObject calls. (Sundeep Mediratta)
  * Use native libadwaita prefrences window from gnome-extensions if possible to maintain UI consistency. (Sundeep Mediratta)
  * Make DBusUtils, Preferences, DesktopIconsUtil classes that are just imported once at DING startup. Import FileUtils, PromiseUtils, Enums just once at app startup. Extensice refactoring, linting of code, avoid duplicate imports, Minimize Header imports, just pass objects if imported already. (Sundeep Mediratta)
  * Verion Bump to 9 - metadata.json.

* Gtk4 version 8
  * Fix regression in mutter settings not being detected. (Sundeep Mediratta)
  * Detect change in mutter settings 'Experimental Features' to update desktop windows with the new 'premultiplied' boolean automatically. (Sundeep Mediratta)
  * Improve installer scripts to not give unecessary errors. (Sundeep Mediratta)
  * Version Bump to 8 - metadata.json

* Gtk4 version 7
  * Fix for fractional scaling and zoom on wayland on the latest distributions. (Sundeep Medirattta)
  * Fix install script to detect /etc/lsb-release prior to trying to read it. (Sundeep Mediratta)
  * Version Bump to 7 - metadata.json

* Gtk4 version 6
  * More reliable drag and drop with Nautilus 43rc with Gtk4, using Gdk.FileList istead of parsing URI strings. (Sundeep Mediratta)
  * String URI's from old Nautilus are more reliably parsed with GLib.Uri. (Sundeep Mediratta)
  * Handle local drops directly without reading the drop data, just accepting drop. This prevents and gives user feedback when tring to drop Special Files like Trash to Nautilus. (Sundeep Mediratta)
  * Use native GJS TextEncoder() and TextDecoder() objects instead of importing ByteArray for manipulating bytes. (Sundeep Mediratta)
  * Version Bump - metadata.json

* Gtk4 version 5
  * Fix regression- still accept drag and drop from old Nautilus in old format
  * Version Bump to 5 to sync with extensions.gnome.org

* Gtk4 Version 3
  * Fix Drag and Drop to work with Nautilus 43rc. (Sundeep Mediratta)
  * Update metadata to work with upcoming Gnome 43.
  * Version Bump

* Gtk4 Version 2
  * Fix prefs.js to not leave global variables so that extension could be accepted at extensions.gnome.org (Sundeep Mediatta)
  * New Folder structure to separate extension and the DING application. Facilitate review at extensions.gnome.org (Sundeep Mediratta)
  * Clearly state in comments why extension needs to run on the lock screen so it could be accepted at extensions.gnome.org (Sundeep Mediratta)
  * Update Readme etc. Sync version number with extensions.gnome.org. (Sundeep Mediratta)
  * New .pot file for gtk4-ding. (Sundeep Mediratta)
  * Fix incorrect application name in emulateX11WindowType.js (Sundeep Mediratta)
  * Use set instead of array for windowlist in emulateX11WindowType. (Sundeep Mediratta)

* Gtk4 Version 1 First Release of Gtk4 port.

  * Fix Drag and Drop. Need to add drag and drop controllers to DesktipIconItem.js. (Sundeep Mediratta)
  * Fix Rectangle Selection. Fixed by using Gtk.Overlay. (Sundeep Mediratta)
  * Fix clipboard. Fixed. Use new Gdk4 clipboard object, remove old dbus code from extension.js. (Sundeep Mediratta)
  * Fix DbusUtils Nautilus Wayland window handle. (Sundeep Mediratta)
  * Cosmetic Fixes to Gtk4 Boxes as Padding and spacing is gone in Gtk4 and need to use other methods. (Sundeep Mediratta)
  * Gtk4 Composite Emblem Icons. (Sundeep Mediratta)
  * Set custom icons using Gtk4 methods and calls. (Sundeep Mediratta)
  * Make Icons skinny, not tiles so that there is space around them to initiate selection rectangles. (Sundeep Mediratta)
  * Use Gtk Application keyboard accelerators for functions, Shortcuts are shown in Gio.Menus. (Sundeep Mediratta)
  * GnomeDesktop.DesktopThumbnailFactory is Gtk3 in gnome 40,41, new Gtk thumbnail.js application will allow use of Gtk3 factory over Dbus. (Sundeep Mediratta)
  * Fix - the desktop is not highlighted with a green rectangle on Drag and Drop. (Sundeep Mediratta)
  * Fix - Rename popups and fileItem right click menus work correctly even if the desktop is refreshed while they are open. (Sundeep Mediratta)
  * Rename popups and the right click menus are re positioned to point to the correct fileItem, This also applies to stacktopItems (Sundeep Mediratta)
  * Fix - Selection is kept even if the desktop is refreshed. (Sundeep Mediratta)
  * Fix - Keyboard accelerators work even after Gtk.PopoverMenu sub-menus are shown and dismissed. (Sundeep Mediratta)
  * Fix - Window Transparency under X11. (Sundeep Mediratta)
  * Fix Rubber band initiation by Leverages Gtk calls to translate coordinates. (Sundeep Mediratta)
  * Refactoring to avoid boolean parameters, make code more readable. (Sundeep Mediratta)

**NEW FEATURES**

  * File Right click menus on stack markers when stacks are enabled also moves with the marker. (Sundeep Mediratta)
  * Can Make Links on the Desktop on Drag and Drop from Nautilus. Pressing the Alt button on drag modifies the drop to ask the user to Copy, Move or Make Links at the destination. (Sundeep Mediratta)
  * Links are checked just before launching them, If they are broken the icon is updated to the broken link icon, and the error dialog is popped up correctly. (Sundeep Mediratta)
  * The reverse is also true, if a broken link resolves correctly as the target re-appeared, the link is opened and the icon updated to the correct icon.
  * Copied files retain the dropped position. (Sundeep Mediratta)
  * Merged all changes from branch more-asyncness, by Marco Trevisan. (Marco Trevisian, merge changes Sundeep Mediratta)
  * Make DBus Proxies asynchronously, so the extension starts at once and does not hang till DBus services respond to requests. (Sundeep Mediratta)
  * Prevent Flashing Icons - Use async await promises to update the entire fileList icon widgets prior to placing on desktop. (Sundeep Mediratta)
  * Use Promises when icons are placed in desktop, This allows queuing code that can only be executed when icon placing is complete and the desktop draw is done. (Sundeep Mediratta)
  * Optimize refreshMenus after Icons are placed on Grid to point to the correct fileItem with the above promise. (Sundeep Mediratta)
  * Also remake the menu as the old menu does not scroll and malfunctions. (Sundeep Mediratta)
  * Fix rename popup. No longer uses callback from fileItem, Directly use Promises to detecticons are placed on grid to reposition. (Sundeep Mediratta)
  * When Dock in in intelligent hide or auto hide mode, prevent menus from going under the dock, menus avoid docks and hidden objects in margins. (Sundeep Mediratta)
  * Add eslintrc.json file and lint folder containing eslint rules for GJS/Gnome files. (Sundeep Mediratta)
  * The entire project and all .js files are now scanned and corrected with eslint. (Sundeep Mediratta)
  * All formatting is fixed and errors from eslint resolved, should follow GJS/Gnome guidelines. (Sundeep Mediratta)
  * Change the UUID of the extension, the application ID  and the Dbus object paths for the application to differentiate it from the gtk-3 desktop icons NG extension. (Sundeep Mediratta)
  * Extension now runs on the lock screen under Gnome 42 and higher, so DING is no longer killed on lock and then restarted on unlock.

* Version 47
  * Pass the primary monitor index through DBus (Sergio Costas)
  * Added keyboard navigation support (Sergio Costas)
  * Code cleanups (Sergio Costas)
  * Removed File-Roller dependency (Sergio Costas and Marco Trevisan)
  * Added an Ubuntu installer (Sergio Costas)

* Version 46
  * Fix the relaunching of the desktop process to avoid high CPU usage if it fails (Sergio Costas)
  * Don't launch twice the desktop process if the extension is disabled and enabled too fast (Sergio Costas)
  * Don't fail if there are zero monitors (Sergio Costas)
  * Fix icons appearing over other windows when a dialog was shown (Sergio Costas)

* Version 45
  * Fix 'GDK_IS_MONITOR (monitor)' failed message (Sergio Costas)
  * Ensure that the desktop is refreshed periodically when a file is constantly being modified (Sundeep Mediratta)
  * Keep selected files when the desktop is repainted (Sergio Costas)

* Version 44
  * Fixed some sentences not being translated
  * Fully removed the 'size-changed' signal to avoid 100% CPU usage in some situations

* Version 43
  * Fixed another syntax mistake (Sergio Costas)
  * Unified syntax for DbusTimeoutId (Sergio Costas)

* Version 42
  * Fixed a bug due to the autocompletion (Sergio Costas)

* Version 41
  * Remove signals timeout when the extension is disabled (Sergio Costas)

* Version 40
  * Copy instead of Move if Shift or Control is pressed (Sergio Costas)
  * Redirect output to the logger in real time (Marco Trevisan)
  * Pass timestamps to avoid focus stealing (Marco Trevisan)
  * Now shows an emblem when a .desktop file is invalid (Sundeep Mediratta)
  * Use correct scaling factor during Drag'n'Drop (Daniel van Vugt)
  * Fixed rubberband after hot-change of the zoom value (Sergio Costas)
  * Added support for asynchronous thumbnail API (Sergio Costas)
  * Allows to disable the emblems in icons (Sergio Costas)
  * Now the icons won't disappear when minimizing all windows (Sergio Costas)
  * Better DBus management (Sundeep Mediratta)
  * Now shows a message when trying to use a feature that requires an external program (Sergio Costas)
  * Show a dialog when a .desktop file can't be launched (Sundeep Mediratta)
  * Allows to theme the menus (Marco Trevisan)
  * Fixed passing undefined classname (Daniel van Vugt)
  * Show preferences also in gnome-extensions-app (Sergio Costas)
  * Fixed high-CPU usage when moving windows on Ubuntu (Sergio Costas)
  * Added support for the new ActivatableServicesChanged signal in DBus (Sergio Costas)

* Version 39
  * Fixed "Allow launching" when the file doesn't have executable flag (Sergio Costas)
  * Ignore SPACE key to start a search (Laurentiu-Andrei Postole)
  * Use CSS to make the window transparent (Sundeep Mediratta)
  * Removed "ask to execute" dialog; now shows "Run as a program" (Sergio Costas)
  * Removed "run" mode for dialogs (Sundeep Mediratta)
  * Fix volume names (Sergio Costas)
  * Added support for Nemo file manager (Sergio Costas)
  * Fix transparency bug in the properties window (Sergio Costas)

* Version 38
  * Fixed Paste in Gnome Shell 3.38 (Sergio Costas)

* Version 37
  * Fixed DnD into folders of the desktop (Sergio Costas)

* Version 36
  * Fixed 'icon resize' when using stacked icons (Sundeep Mediratta)
  * Fixed typo (Davy Defaud)

* Version 35
  * Now Ctrl+Shift+N creates a folder, like in Nautilus (Sergio Costas)
  * Fixed bug when the extension was disabled (Sergio Costas)

* Version 34
  * Fix error popup when pressing arrow keys (Sundeep Mediratta)
  * Fix icons appearing during desktop change animation (Sundeep Mediratta)
  * Avoid relaunching DING when updating the window size (Sundeep Mediratta)
  * Fix scripts by passing file list as parameters (Sergio Costas)
  * Show extensions in Nautilus scripts (Sergio Costas)
  * Added support for "stacking" files, grouping files of the same type (Sundeep Mediratta)
  * Fix clipboard support for last version of Nautilus (Sergio Costas)

* Version 33
  * Synchronized version number with the one in Gnome Extensions
  * Fixed failure when TEMPLATES folder is not configured (Sergio Costas)
  * Other extensions can notify the usable work area (Sergio Costas)
  * Fix exception if File-Roller is not installed (Sergio Costas)

* Version 24
  * Fixed "Open in terminal" option in right-click menu (Sergio Costas)

* Version 23
  * Use the system bell sound instead of GSound (Sergio Costas)
  * Transformed DING into a Gtk.Application (Sergio Costas)
  * Code cleaning (Sundeep Mediratta and Sergio Costas)
  * Fixed loss of focus when an application goes full screen (Sergio Costas)
  * Fixed translation problems when installed system-wide (Sergio Costas)
  * Fixed pictures preview (Sundeep Mediratta)
  * Removed some warnings in the log (Sergio Costas)
  * Don't reload the desktop when a window changes to FullScreen (Daniel van Vugt)
  * Catch Gio exceptions from extra folders (Daniel van Vugt)

* Version 22
  * GSound is now optional (Sergio Costas)

* Version 21
  * New folders get a default name and, then, are renamed if the user wants (Sundeep Mediratta)
  * Several fixes for DnD (Sergio Costas and Sundeep Mediratta)
  * Removed odd symbols from windows title (Sergio Costas)
  * Added support for search files in the desktop (Sundeep Mediratta)
  * Support nested folders in scripts and templates (Sergio Costas)
  * Fixed a crash if a file is created and deleted too quickly (Sundeep Mediratta)
  * The desktop now receives the focus when there are no other windows in the current workspace (Sergio Costas)
  * Better error management in several places (Sundeep Mediratta and Sergio Costas)

* Version 20
  * Removed gir1.2-clutter dependency (Sergio Costas)
  * Added compatibility with Gnome Shell 41 (Daniel van Vugt)

* Version 19
  * Alt+Enter shows properties like Nautilus (Sundeep Mediratta)
  * Hide error windows, new folder window, dialog window and preferences from taskbar and pager (Sundeep Mediratta)
  * "Extract" menu item (Sundeep Mediratta)
  * Ignore distance in double-clicks, needed for touch screens (Kai-Heng Feng)
  * Dont draw green highlight around desktop when dragging and dropping files on it (Sundeep Mediratta)
  * Global rubberband (Sundeep Mediratta)
  * Smaller icon targets to allow more usable space for right click, and extra padding around rendered icons (Sundeep Mediratta)
  * Allows to arrange and sort icons (Sundeep Mediratta)
  * Don't unselect the icons after moving them (Sergio Costas)
  * Fixed the default location in network mounts (Juha Erkkilä)
  * Use the new Nautilus.FileOperations2 API (Marco Trevisan)

* Version 0.18.0
  * Pretty selection (Daniel Van Vugt)
  * Don't draw green rectangle on screen (Sundeep Mediratta)
  * Support for High DPI rendering of icons (Daniel Van Vugt)
  * Added "Extract" and "Extract to" options (Sundeep Mediratta)
  * Update desktop via DBus metadata change notification (Sundeep Mediratta)

* Version 0.17.0
  * Now the preferences are shown in Gnome Shell 40 (Sergio Costas)

* Version 0.16.0
  * Simple shadow to improve appearance (Daniel van Vugt)
  * Compatibility with Gnome Shell 40 (Sergio Costas)
  * Don't show "Email" option if a folder is selected (Sundeep Mediratta)
  * Changed the text for "Preferences", to make easier to identify it as "Desktop icons preferences"
  * Make new folders near the place where the user did right click (Sundeep Mediratta)

* Version 0.15.0
  * Allow to create a folder from a selection of files (Sundeep Mediratta)
  * Allow to compress a selection of files (Sundeep Mediratta)
  * Allow to send by mail a selection of files (Sundeep Mediratta)
  * Allow to show properties of a selection of files (Sundeep Mediratta)
  * Added support for scripts (Sundeep Mediratta)
  * Updates the desktop icons when the icon theme has changed (Artyom Zorin)
  * Now adds new icons to the main screen (Sergio Costas)
  * Added hotkey to show/hide hidden files in the desktop (Sergio Costas)
  * Added support for dual GPUs (Sergio Costas)
  * Improved readability (Ivailo Iliev)
  * Now doesn't maximize a minimized window when closing a popup menu (Sergio Costas)
  * Keep selected a new file created from templates (Sergio Costas)

* Version 0.14.0
  * Now RETURN key in "New folder" and "Rename" only works when the "OK" button is enabled
  * Now doesn't use 100% of CPU when an external drive has been mounted by another user

* Version 0.13.0
  * added support for fractional zoom
  * fixed bug when closing Gedit without saving
  * ensures that new icons are added in the right corner always
  * shows the destination of a DnD operation
  * fix bug when showing drives
  * don't show an error when aborting a DnD operation

* Version 0.12.0
  * Don't fail if there is no TEMPLATES folder
  * Support Ctrl+A for 'select all'
  * Use "Home" as the name of the user's personal folder
  * Show mounted drives in the desktop
  * Re-read the desktop on error
  * Custom icons support
  * Detect changes in the size of the working area
  * Preserves the drop place for remote places
  * Better detection for focus loss

* Version 0.11.0 (2020/04/17)
  * Copy files instead of move when using DnD into another drive
  * Removed flicker when a file is created or removed
  * Fix DnD for Chrome and other programs
  * Template support
  * Allow to choose the align corner for the icons
  * Added "Select all" option
  * Added support for preview
  * Creates folders in the place where the mouse cursor is

* Version 0.10.0 (2020/02/22)
  * Added 'tiny' icon size
  * Doesn't allow to use an existing name when renaming or creating a new folder
  * Fixed the DnD positioning (finally)

* Version 0.9.1 (2020/02/06)
  * Now "Delete permanently" works again

* Version 0.9.0 (2020/01/31)
  * Fix bug that prevented it to work with Gnome Shell 3.30

* Version 0.8.0 (2020/01/19)
  * Fix memory leak when using the rubber band too fast
  * Add finally full support for multimonitor and HiDPI combined
  * Better precision in DnD

* Version 0.7.0 (2019/12/09)
  * Don't show ".desktop" in enabled .desktop files
  * Appearance more consistent with Nautilus
  * Allows to permanently delete files
  * When clicking on a text script, honors "executable-text-activation" setting and, if set, asks what to do
  * Honors "show-image-thumbnails" setting
  * .desktop files are now launched with the $HOME folder as the current folder
  * Allows to run script files with blank spaces in the file name
  * Shows an error if Nautilus is not available in the system
  * Shows an error if a file or folder can't be permanently deleted
  * Added note about configuration

* Version 0.6.0 (2019/10/29)
  * Fix icon distribution in the desktop
  * Show the "Name" field in the .desktop files
  * Better wrap of the names
  * Show a tooltip with the filename
  * Show a hand mouse cursor on "single click" policy
  * Add "delete permanently" option
  * Shift + Delete do "delete permanently"
  * Better detection of screen size change
  * Show symlink emblem also in .desktop files and in files with preview
  * Fix "symlink in all icons" bug
  * Ensure that all the emblems fit in the icon

* Version 0.5.0 (2019/10/15)
  * Fix right-click menu in trash not showing sometimes
  * Fix opening a file during New folder operation
  * Changed license to GPLv3 only

* Version 0.4.0 (2019/10/04)
  * Fix Drag'n'Drop in some special cases
  * Don't relaunch the desktop process when disabling and enabling fast
  * Temporary fix for X11 size

* Version 0.3.0 (2019/09/17)
  * Separate Wayland and X11 paths
  * When a file is dropped from another window, it is done at the cursor
  * Fixed bug when dragging several files into a Nautilus window

* Version 0.2.0 (2019/08/19)
  * Shows the full filename if selected
  * Use theme color for selections
  * Sends debug info to the journal
  * Now kills fine old, unneeded processes
  * Allows to launch the desktop app as standalone
  * Ensures that the desktop is kept at background when switching workspaces
  * Honors the Scale value (for retina-like monitors)
  * Hotkeys
  * Check if the desktop folder is writable by others
  * Now the settings window doesn't block the icons
  * Don't show hidden files

* Version 0.1.0 (2019/08/13)
  * First semi-working version version
  * Has everything supported by Desktop Icons, plus Drag'n'Drop
