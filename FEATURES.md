
**NEW FEATURES**
- [x] Based on libadwaita, Gtk4 toolkit's.

- [x] Can Make Links on the Desktop on Drag and Drop from Nautilus. Pressing the Alt button on drag modifies the drop to ask the user to Copy, Move or Make Links at the destination. This unfortunately does not work in X11 as pressing the button does not modify the drop Gdk.DragAction. Shift forces a move, Control forces Copy in both Wayland and X11.

- [x] Links are checked just before launching them, in case they got broken in the background with no recent desktop refresh. If they are broken the icon is updated to the broken link icon, and the error dialog is popped up correctly. The reverse is also true, if a broken link resolves correctly as the target re-appeared, the link is opened and the icon updated to the correct icon.

- [x] Copied files retain the dropped position.

- [x] Merged all changes from branch more-asyncness, by Marco Trevisan, that was submitted upstream to the gtk3 branch, to this Gtk4 branch to use async functions for everything.

- [x] Make DBus Proxies asynchronously, so the extension starts at once and does not hang till DBus services respond to requests.

- [x] Prevent Flashing Icons - Use async await promises to update the entire fileList icon widgets prior to placing on desktop. Do the same for stack Top Marker Folders.

- [x] Use Promises to detect when icons have been placed on the desktop, so that in draw desktop, it is clear that all the icons are placed on the desktop and desktop drawing is complete. This allows queuing code that can only be executed when icon placing is complete and the desktop draw is done.

- [x] Optimize refreshMenus after Icons are placed on Grid to point to the correct fileItem with the above promise. Also remake the menu as the old menu does not scroll and malfunctions. Same for do rename popup. No longer uses callback from fileItem to call these functions. Directly use Promises made above to update the menus and rename popups after icons are placed on grid. Stack top marker menus are also repositioned.

- [x] When Dock in in intelligent hide or auto hide mode, all menus and rename popups can be popped up under the dock, the dock does not detect them as it ignores DING completely. Updated the code to detect dock or any other object is likely in auto hide mode by detecting usableArea margins are set. Then popups the menu in the correct position so that they do not go under the dock or other auto hide object on the desktop.

- [x] Add eslintrc.json file and lint folder containing eslint rules for GJS/Gnome files eslintrc-gjs.yml and eslintrc-shell.yml for linting.

- [x] The entire project and all .js files are now scanned and corrected with eslint. All formatting is fixed and errors from eslint resolved, should follow GJS/Gnome guidelines.

- [x] Other than the UUID of the extension, changed the application ID, the DBus object paths and GSetting schemas for the application. This is to differentiate it from the gtk-3 desktop icons NG extension. Both can be installed simultaneously on the same system. However both should not be run at the same time, only one extension should be active. This lets users test the extension, report problems that need fixing, and revert to the original gtk3 DING if does not work for them.

- [x] For Gnome 42 and newer, allow use of 'unlock-dialog' in session mode for the extension, so that it is not relaunched every time.

- [x] Re-organization, New Folder structure to avoid confusion and facilitate review.

- [x] Update to work with Gnome 43, 44 and File 43, Files 44. There is now a maintenance branch for up to gnome 44, the latest is version 67. All the newer versions work with gnome 45, 46 since gtk4-ding version 68.

- [x] More Reliable parsing of string URI lists with old Nautilus with GLib.Uri.

- [x] Give visual feedback and prevent smoothly dropping special files if selected, on Nautilus windows by doing local drops and by accepting but not reading drop data.

- [x] Use native TextEncoder and TextDecoder objects in GJS instead of ByteArray imports.

- [x] Use CSS to un highlight Drop Target.

- [x] Use native libadwaita preferences window. Same look if launched from extensions manager or if needed, launch natively if unable to launch from extension manager.

- [X] Add a preferences option to place new icons on the non primary display if multiple monitors are connected. If a second monitor is connected, new icons can now be placed on the secondary monitors first, not the Primary Display.

- [x] Trashed files are put back to the same position on the desktop if undo action is selected from the right click 'copy, paste, undo, redo' sub menu on the desktop.

- [x] Integration with GSconnect extension. If GSconnect extension is installed, right click menus allow sending files directly from the desktop using GSconnect to a paired mobile device.

- [x] Allows dropping Favorite Apps from the Dock to the Desktop to make .desktop files on Desktop. The advantage is that files can then be dropped directly on the icon to launch them.

- [x] If the app in the dock is a favorite, dragging and dropping from desktop removes it from the favorites. Like 'REMOVE'. If the app in the dock is a favorite, pressing the control key while dropping results in removing it from the favorites, and creating a new .desktop file for the app on the desktop in the dropped position. Analogous to 'MOVE'. Pressing the shift key while dropping results in creating a new .desktop file for the app on the desktop in the dropped position without removing it from the favorites if it is in he favorites. This can make shortcuts for running apps that are not in the favorites. Analogous to 'COPY'

- [x] Improved workspace switching with gestures - icons appear on all the workspaces while switching make it seem that Desktop is on all windows.

- [x] Enable opening files, by dragging the icon and dropping on the app icon on the Dock. Checked on Dash to Dock and Dash to Panel and Ubuntu Dock. Submitted patch to Dash-to-Panel upstream - that has already been merged, makes this work even on Dash to Panel when the panel icons are animated.

- [x] Drag and drop files from desktop to the Trash Icon on Dash to Dock directly.

- [x] Drag and drop files to Mounted Volumes and davs:// mounted Volumes on Dash to Dock to copy files.

- [x] Display thumbnail for GIMP files if one exists, usually if the File was opened or created in local GIMP install.

- [x] Lookup GIMP files for snap and flatpack install as well. Also optimizes the thumbnail lookup code to make fewer lookups, and not execute unnecessary code.

- [x] Detect Change to Dark Mode in Gnome Global Settings, reload dark variant of current theme (for correctly formatted themes with a valid dark-variant) to display correct widgets in correct theme css and vice versa without restarting the app. WITH LIBADWAITA, THIS IS NO LONGER NECESSARY.

- [x] Detect Gtk Theme Changes to update currently applied theme, update selection color and rubber band color in real time to show new colors and themes without restarting the app.

- [x] Link targets are now monitored, if a link is broken it is updated immediately on the Desktop.

- [x] When files are dropped on the Dock, now a check is done to make sure the application in the Dock can actually open the file prior to launching it. If it is unable to open the files, an error message is shown.

- [x] When files are dropped on a .desktop file on the Desktop, a check is done prior to launching the app to make sure the app can open the dropped file, similar to above and an error shown if it does not open files of this type.

- [x] New app-chooser dialog - same dialog as Gnome Files, uses Gtk4 and libadwaita, to allow opening a desktop file with a different application. Now includes a switch to set the new application as the default for the file type.

- [x] New Drag Navigation - dragging an icon over a folder icon or a drive icon, and then hovering over it will open that location in Gnome Files. The drag can then be completed in the Files window with further navigation into sub folders using drag navigation built into Gnome Files.

- [x] New - when multiple icons are dragged, form a bunch of icons as a drag-icon rather than a single icon.

- [x] New - Deal with appimage files, if executable launch them, otherwise show an error.

- [x] New Drag Navigation on Dock - dragging an icon over the Gnome Files icon on the dock or mounted drives, and hovering over it for 2 seconds will open a Gnome Files Window to drop/copy/move file into, with further drag navigation possible into the sub folders in the opened Gnome Files Window. The opening is triggered by the middle of the left edge of the dragged icon.

- [x] New - Set the correct cursor with current action on Drop on Gnome Shell Actors like the Dock. Improve Gnome Shell Drop.

- [X] New - tool tips are now positioned correctly to not go under the dash or make it auto hide, or go over any gnome shell actors on the edge of the screen.

- [X] New - About pane if preferences page that shows the correct version of the extension and web links to gitlab website.

- [x] New - Translation link in about window.

- [x] New - Correctly hover over Dock in drag and drop to enable highlighting of the app icon and scrolling for hidden ones.

- [x] Port to ESM imports, support Gnome 45

- [x] Use the new make_desktop() method introduced in mutter, if available, for deeper and seamless integration with Gnome shell with no need for monkey patching.

- [x] New - Correctly set gtk4-ding window to Meta.WindowType.DESKTOP on X11 with xprop.

- [x] Launches the correct terminal app, GLib now uses xdg-terminal-exec, the extension uses that if installed. If it is not installed, it mimics xdg-terminal-exec and will launch the correct terminal set by the user. The terminal configured by the user will be shown correctly in the right click menu.

- [x] Animates overview.

- [x] Uses new version name in extension to be independent of EGO. Passed to the program directly over the command line.

- [x] Can now email folders from the desktop, will zip them into files first.

- [x] Uses rectangular icons now like Nautilus. Style can be switched to the old style with show drop target deselected.

- [x] Now shows the correct file manager used for folders in right click menu, and gives the user ability to change it if multiple file managers are available.

- [x] Place icons at any arbitrary position. This MR lets the user place an icon at any arbitrary position on the desktop. This is independent of the underlying grid. New files on the desktop, and their icons are still assigned to a grid and snap to a position on grid.
The functionality is controlled on preferences with a new boolean setting. Activating snap to grid, which is the default, continues the default behavior. Inactivating this enables the new functionality.
When 'cleaning up' with arrange icons, or setting keep arranged, keep stacked, icons are snapped to grid overriding any free positioning.
With this functionality, icons can actually partially overlap each other if placed so by the user. Clicking on the exposed part of the icon will raise the icon to the top of the pile of overlapping icons.
Highlighting the drop grid does not make sense with this new functionality and does not occur. The boolean switch to show drop target grid highlighting is greyed out if this new functionality is selected, ie if snap to grid is turned off.
The shape of the icons is also changed now on the new boolean setting. If snap to grid is selected, the icons are rectangular with grid drag and drop behavior, dropping anywhere on the grid will accomplish the drop. With free positioning, the icons are trapezoidal, and drag and drop is only accomplished if the actual icon trapezoids overlap each other.
The application functionality and behavior is consistent with the two other very popular OS desktop environments, and the settings switches between those two behaviors based on the users preferences.

- [x] Uses new Gtk.AlertDialog for dialogs, can show a button to launch a URL for help and troubleshooting information.

**FIXES**

- [x] Fix Gtk4 Icon Rendering Code to at least render generic correct icons at the correct size.

- [x] Fix Drag and Drop. Need to add drag and drop controllers to DesktopIconItem.js.

- [x] Fix Rectangle Selection in Gtk4. Fixed by using Gtk.Overlay.

- [x] Fix clipboard. Fixed. Use new Gdk4 clipboard object, remove old DBus code and St. library clipboard code from extension.js

- [x] Fix DbusUtils Nautilus Wayland window handle. Can successfully get Wayland window handle via asynchronous call, using a promise with Gtk4. This is passed to Nautilus. Reset on callback from the DBus call.

- [x] Cosmetic Fixes to Boxes as Padding and spacing is gone in Gtk4 and need to use other methods.

- [x] Composite Emblem Icons using Gtk4

- [x] Set custom icons using Gtk4 methods and calls.

- [x] Make Gtk4 Icons skinny, not tiles so that there is space around them to initiate selection rectangles.

- [x] Use Gtk Application keyboard accelerators for functions, Shortcuts are shown in Gio.Menus.

- [x] All menus are Gio.Menus.

- [x] Thumbnail.js GnomeDesktop.DesktopThumbnailFactory is Gtk3, will not work with current code. Till that is ported, thumbnail.js is launched as a separate Gtk Application, ding and thumbnail.js exchange thumbnail information over DBus. This is the last thing to complete this port. This is done for Gnome 40, Gnome 41.

- [x] GnomeDesktop4 is now available in some distro's on Gnome 41. Others have it in Gnome 42 (eg Ubuntu Jammy). This branch now checks to see which version is available. If GnomeDesktop4 is available, it uses it directly to render thumbnails. If not available, it launches a helper app that uses Gtk3 and GnomeDesktop3, communicates with it over DBus to render thumbnails.

- [x] Fix - the desktop is not highlighted with a green rectangle on Drag and Drop.

- [x] Fix - Rename popups and fileItem right click menus work correctly even if the desktop is refreshed while they are open. Rename popups and the right click menus are re positioned to point to the correct fileItem and both menus always operate on the correct file/fileItem. This also applies to 'stacktopItems', if they move the right click menu updates and moves with them.

- [x] Fix - Selection is kept even if the desktop is refreshed.

- [x] Fix - Keyboard accelerators work even after Gtk.PopoverMenu sub-menus are shown and dismissed. This seems to be a bug in Gtk4, accelerators don't work after a submenu is shown and dismissed, the fix is a little bit of a kludge, but gets the job done till this is fixed upstream.

- [x] Fix - Window Transparency under X11.

- [x] Gtk4 does not allow window move even on X11. X11 windows are now managed by the extension in the same way as Wayland windows.

- [x] Leverages Gtk4 calls to translate coordinates. Fix Rubber band initiation by correcting the grid Global Rectangle, local to global and global to local coordinates. Fixes iconContainer and labelContainer global rectangles with the above calls as well so that they work with fractional scaling. Thanks to Sergio Costas for Pointing out that eventbox gives negative coordinates in margins. Fix for correcting getDistance(x, y) from Sergio Costas !348. Removed scale from desktopgrid.js. Removed zoom from desktopIconItem.js

- [x] Refactoring to avoid boolean parameters, make code more readable. Added eslint.json and GJS/Gnome eslintrc-gjs.yml and eslintrc-shell.yml for linting.

- [x] Refactoring to avoid multiple imports, preferences, desktopiconsutil, DBusUtils, Enums, FileUtils, PromiseUtils just imported once at DING startup. Preferences, desktopiconsUtil and DBusUtils are now classes. Extensive linting of Code, Header imports cleaned up to avoid importing the same thing twice. This facilitates, renaming, moving, re organizing of files into different folder, as the code will have to be changed in just one file to accommodate instead of editing multiple files.

- [x] Fix - always show new Icons on primary monitor on multi monitor setups. When primary monitor is switched during session, this tracks it as well.

- [x] Fix - Clean up addFiles to desktop, completely rewritten, more legible and understandable. Multiple fixes for more reliable placement of icons.

- [x] Fix - Desktop files from dock are copied/moved correctly with executable bit set and marked trusted, relative symlinks for file resolved for flatpacks.

- [x] Fix window displacement when dragging down on top bar.

- [x] Fix icons flickering when changing work spaces with swipe gesture.

- [x] All Preferences are now cached in native javascript instead of calling GioSSS code repeatedly. All preferences/settings monitoring code is now migrated to one place in preferences.js with all preferences/settings available globally from this file.

- [x] MR submitted upstream to Hide-top-bar extension and Transparent-top-bar (Adjustable Transparency), both merged make those extension work well with Gtk4-DING.

- [x] MR submitted to Dash to Dock [here](https://github.com/micheleg/dash-to-dock/pull/1890) for intellihide, and [here](https://github.com/micheleg/dash-to-dock/pull/1888) for Transparency, MR submitted to Dash to Panel [here](https://github.com/home-sweet-gnome/dash-to-panel/pull/1790) to make those extensions detect the Gtk4-DING window and correct intellihide and transparency behavior. These have not been merged yet. The MR branches can be downloaded and installed to have correctly working Dash to Dock and Dash to Panel with intellihide.

- [x] Updated css to set custom named program colors. --Updated now to libadwaita.

- [x] Updated css selectors specificity and apply specific Gtk4 methods to widgets, to prevent interference form user applied Gtk themes. --Updated now to libawaita.

- [x] Minimized use of Gtk.StyleContext as it is being depreciated, no only used to detect and set rubber band color. --updated now to libadwaita.

- [x] Fix Drag and Drop with X11 yet again. There were spurious icons on drag in X11, and dragItem would be set to null before the drag was completed. Alt key modifier unfortunately now does not work in X11.

- [x] When a  file is dragged to trash or to another folder on the desktop or a window in Gnome Files, right click undo action now restores the file to it's previous position.

- [x] Drag icon offset on Wayland now works correctly.

- [x] Fix Chrome App icons not showing correctly on some distributions.

- [x] Simplify folder structure, move everything into resources, fixes icons not showing from extension downloaded from extensions.gnome.org.

- [x] Fix errors with appImage files - no default application installed led to broken right click menu and app-chooser dialog.

- [x] Separate code for gnome shell drag and drop to a new class in gnomeShellDragDrop.js. Simplify DesktopManager.js.

- [x] Fix - Gnome shell creates a empty workspace to the right as it detects the DING window. This can lead to Unlimited Workspaces. ~~STILL DOES NOT WORK CORRECTLY WITH AUTO-MOVE-WINDOWS EXTENSION UNLESS THAT EXTENSION IS LOADED AFTER Gtk4 DING. (Sundeep Mediratta)~~ This is now fixed with making the window Meta.WindowType.DESKTOP.

- [x] Version 47 fixes the above problems with unlimited workspaces with auto-move-windows as well as the Shell. Window is Meta.WindowType.DESKTOP, and is_on_all_workspaces even on wayland vastly simplifying management with minimal gnome shell overrides.

- [x] Multiple fixes for regressions, fix for Ubuntu to work with old version of libadwaita.

- [x] Fix - Meta does not honor window.stick() after 3rd shell unlock. Desktop Window would not be on all desktops after 3rd unlock.

- [x] Fix - DING window actor thumbnail could be dragged and dropped in other extensions like workspace indicator. Prevent this showing icons only on one workspace.

- [x] Fix - multiple fixed to extension (<45) and dingManager (in >=45) in the disable code to prevent crashes on lock screen with a race condition between enable and disable - ensure all code is synchronous.

- [x] Fix - GnomeShellDrag code now identifies the actor under the cursor rather than off the left edge of the drag icon surface. Makes gnome shell drag and drop onto dock much more intuitive and natural.

- [x] Fix - Enforces gtk3 style of text wrap mode for icon labels. Removes unneeded manually inserted line break code, reportedly makes the icons look much better.

- [x] Fix - find file window loses focus.

- [x] Fix - Prevent rounded corners of desktop window

- [x] Fix - Gnome keybinding shortcuts to show desktop window can hide gtk4-Ding window on X11. Fixed the same shortcut not showing the windows back again on re-press. (Made the window Meta.WindowType.DESKTOP on X11)

- [x] ~~Fix - will not launch Nemo if it is not installed, option to use Nemo will be greyed out.~~ This has been superseded, and is no longer an option. A file manager, if installed can be automatically set by right clicking and choosing 'Open with...'.

- [x] Multiple code changes and renames in DBusUtils and elsewhere to make code more readable and maintainable. Use console log instead of log, no print statements.

- [x] Use correct locale name for Files and Terminal applications in right click menus.

- [x] Prevent jumping icons, retain the spacial order of icons on grid size changes.

- [x] Grid resize improvement in repositioning of icons.

- [x] Fix regression where console would not be launched as a fallback terminal if another one was configured incorrectly.
