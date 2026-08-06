Adw. Desktop Icons

Libadwaita/Gtk4 port of Desktop Icons NG with multiple fixes and new features.

Latest update: Gtk.Widget tree initiation is deferred and is now created lazily once an icon is placed on the grid, reducing memory pressure from icons that can never be displayed. Fixed memory leak in metrics backend, in the app, cleaned up and refactored destruction and all fileItem code.

GNOME 50 support has been refreshed again with a Mutter 50 cursor fix, updated Sushi quick-preview support via the newer Nautilus Previewer 2 D-Bus interface, and improved Today widget dragging and timezone handling. 
Now has a widget layer that can run widgets- like KDE desklets, they are little HTML display apps that run in Webkit. Icons cover this layer, layers can be moved up or down for editing. Widgets can be snapped to a grid to maintain row/column alignment or free positioned.

Widgets are discovered automatically at startup from specific directories. You can install them manually by downloading the widget folder you want from the GitLab `widgets` directory and placing it in `$XDG_DATA_HOME/com.desktop.ding/widgets/` (typically `~/.local/share/com.desktop.ding/widgets/`). You can also use the Add Widget dialog's `Download Latest` button to automatically fetch and install the current widget set from the repository.

Icons can be positioned anywhere on desktop or are snapped to a grid. Can make links on the Desktop. GSconnect Integration, can send files to connected devices. Drag and Drop support on to Dock, Dash, or from Dock, Dash to the Desktop.

Updated and modified code base, uses Gio menus. All functions are asynchronous where possible. It is ported to ESM modules, supports Gnome 45 and higher.

Translations available in-
[ar, az, be, bg, bn, ca, cs, da, de, el, eo, es, et  eu, fa, fi, fr, fur, ga, gl, he, hi, hr, hu, id, it, ja, ka, kab, kk, ko, ky, lv, lt, mi, ms, nb, nb_NO, nl, oc, pl, pt_BR, pt, ro, ru, sk, sl, sq, sv, ta, tl, tr, th, uk, ur, zh-Hans, zh-Hant, zh_CN, zh_TW]

Translated using LibreTranslate, machine translation, not every string is verified manually. Although most strings in languages should be correct, errors are possible.

Corrections, verification of translated strings, and new translations are welcome, all translations are on Weblate. You can help translate Adw. Desktop Icons NG on [Hosted Weblate](https://hosted.weblate.org/projects/gtk4-desktop-icons-ng/gtk4-ding-pot/).

Multiple fixes and new features-
* Add Widget dialog now includes a `Download Latest` button to automatically fetch and install the current widget set.
* New media player/display widget in horizontal or vertical available for download. Multiple rendering fixes for the old widgets, please re-install.
* Media widgets are now pinnable and include on-widget MPRIS controls for Previous, Play/Pause, Next, volume slider, +/- volume buttons, and mouse-wheel volume.
* New Sticky Note widget with rich-text editing, checklist support, links, note colors, and floating/pinned window support.
* Floating widget handling is improved with better overlay controls, focus retention, and more reliable redraw/reload behavior when moving widgets between desktop and pinned windows.
* Add widget grid, improve widget chrome to stay on screen, multiple fixes to widget rendering to redisplay when desktop geometry changes, animates with icons on geometry changes.
* Use GSK to draw instead of Cairo, optimizes GPU/CPU use.
* Fixes to widget positioning, keyboard modifier selection of icons with arrow keys.
* Fixes overview animation.
* All widgets have been updated. Re-install from the widgets folder on GitLab Website, or use the Add Widget dialog's `Download Latest` button to install them automatically.
* Widgets can now run backend processes for host side compute work. Added demo new metrics widget and Today(Calendar) view widget. Added helper classes for backend and widget for widget authors.
* The program no explicitly asks for your permission prior to installing and running a widget and records this choice so you are not asked again.
* Multiple fixes for the new widgets.
* Widgets on desktop- little display desklets for Gnome. Demo widgets for weather and world clock available on Gitlab repo in the widgets subfolder.
* Users can override CSS with their own CSS.
* Uses LibreTranslate to automatically translate into 54 languages.
* Right long click- launches shell background menu directly.
* Animate margin changes with Adw.Animation. Respects global Gtk4/Gnome allow/disallow animation settings.
* Improve search UI, files found containing the text in label are selected, non-selected files lose opacity an are dimmed so that found files are evident to the eye on a desktop with a large bunch of icons.. (Sundeep Mediratta)
* Enable Gnome 49, use new API
* Fixes, read xdg-terminals.list from correct system conf dirs.
* Set localized default desktop name
* Resizable open with dialog
* Fix custom icons size
* Update to more direct error message
* Change name to Adw. Desktop Icons, version 100 :)
* Feature complete shortcut manager with editable keybindings for app actions.
* New About dialog and redesigned preferences. Proper credits and acknowledgements
* Right click menu now displays and activates actions for .desktop files.
* Added global hotkey accelerator to display or hide desktop icons.
* New ShortCutsManager that displays Adw.Window and widgets for shortcuts.
* Complete rewrite of the app, major clean up and restructuring.
* Add a .desktop icon with actions for app, can be displayed in dock for windows, launcher, menus etc with right click actions, including hiding all windows
* Show a shortcuts window for the application to list all available shortcuts.
* Improve multi-monitor support, saves monitor positon with icon position, allow to change fractional scaling in app if a second monitor connected at different zoom level.
* Fix dd-term focus loss isssue.
* App rewritten as Adw.Application GObject subclass, better css handling, use Adw.Stylemanager, better icons and emblems for stackTop items.
* Integrate ptyxis, replaces gnome-terminal on some distributions. Open ptyxis properly.
* Modern emblems like Gnome Files, allow multiple emblems
* Emblem for encrypted pdf, zip, 7z files
* Allow setting any user folder as the Desktop folder following xdg-sepecifications and updating the xdg-files and vice versa in the running program.
* Proper app icon, image and app name in Notifications.
* Proper integration for AppImage files, treat them like .desktop files. Integration with AppImageLauncher. Prefer that to open AppImage files if available.
* For Gnome 47, change highlighting and rubber band selection colors with accent-colors in Gnome Settings.
* Selection rectangle with rounded corners, similar to Gnome Files aesthetic.
* The stock gnome shell background menu can now be shown from the Gtk4 DING desktop right click menu. All shell settings can be accessed from that menu.
* Icons can be placed on any arbitrary position. Make a mess! - icons can overlap each other etc. Neat people can keep the default behavior and have the icons always snapped to a grid. Controlled in preferences, tweaks, 'Snap to grid'. Affects the shape of icons and drag and drop behavior as well. Free positioning has trapezoidal icons, drop only works with direct overlap. Grid positioning has rectangular icons, and drag and drop works on overlap with the grid holding the icon. This behavior is consistent with other desktop environments.
* Icons on background on overview, improved gesture switching icons appear to be on all work spaces on the background with workspace switching, with no flashing.
* Support for dragging icons onto the dock - Drag icons from desktop to and drop over application icon to open them with the app. Works with Dash to Dock and Dash to Panel.
* Support for dragging icons from desktop directly to Trash on Dash to Dock, or to mounted volumes on the dock, to copy them directly.
* Set the correct cursor with proposed action on drop on dock.
* Drag Navigation on Dock - dragging an icon over the Gnome Files icon on the dock or mounted drives, and hovering over it for 1/2 seconds will open a Gnome Files Window. Behavior can be changed in preferences.
* Drag Navigation - dragging an icon over a folder icon or a drive icon, and then hovering over it for one and half seconds will open that location in Gnome Files.
* Sets correct hovering behavior during drag and drop on the Dock, enables scrolling in the dock to icons when they are hidden.
* Drag and drop Favorite apps from Dash to Dock, Dash to Panel directly to Desktop. Pressing shift, ctr or alt while doing this will copy or move the app to Desktop, allowing launching from the desktop. Just dropping an app from the dock to the desktop will remove from Dash/Dock.
* Follows xdg-terminal-exec to display the correct terminal in right click menus, and will launch the correct terminal, even if xdg-terminal-exec is not installed.
* Shows the correct file manager in the right click menu and give the user the option to change the file manager.
* Gio menus, menus display all keyboard shortcuts.
* Uses Gtk4 AlertDialog, uses asynchronous promises for dialog's, shows button to launch URL for help and troubleshooting information.
* Automatically zip Folders if mailing them.
* Tool tips are now positioned correctly to not go under the dash or make it auto hide, or go over/under any gnome shell actors on the edge of the screen.
* Right Click Menus will not go under the dock.
* Make Links on Desktop with Alt button on Wayland. Shift, Ctr or Alt button control the effect, move, copy, drop or link. (Linking may not work on X11)
* Copied/dropped/pasted files retain dropped position. Undo action after trashing or moving files puts icons back in the old position.
* Better multi monitor support, preference to place icons on non primary monitor.
* GSconnect extension integration, can send files from desktop directly to connected mobile device.
* Accessibility support with screen readers
* Deals correctly with appimage files on desktop.
* Display GIMP thumbnails, even for snap and flatpack installs.
* Lazy Gtk.Widget tree creation and further refactoring and cleanup of all icon code.

Please see Readme for full details of new features. Works best on Wayland. However your mileage may vary on X11. Multiple bugs fixed on X11.

Please report all issues on the Gitlab link below, this page is not monitored. All known issues as well as all the features are detailed there.
