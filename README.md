# Gtk4 DING Desktop Icons New Generation

## What is it?

Gtk4 Desktop Icons NG is an extension and a program together for the GNOME Shell that renders icons on the desktop. It is a fork from DING.

Desktop Icons NG (DING) by Sergio Costas itself is a fork/rewrite of the official 'Desktop Icons' extension, orignially by Carlos Soriano.

This new Gtk4 extension was originally submitted upstream to the DING project as a merge request. It was not merged for quite some time with development continuing on both branches simultaneously. The branches started diverging significantly, and further, the new commit's in gtk3-DING branch were not easily adaptable to changes already made in the gtk4 branch. That has since made it very difficult to rebase and merge all the new changes to the Gtk3 branch. A mutual decision was therefore made to continue independent development of both branches. Important bug fixes from branches are still backported and forward-ported between them. Therefore there are two extensions available, the classic stable Gtk3 DING and this newer, less tested Gtk4 branch.

This fork of DING is ported to use the Gtk4 toolkit. This, and the original DING can both be installed together, but only one can be activated at a time in the extension Manager. They use different install directories and GSettings schemas, therefore preferences set in one will not carrry through to the other. This is to avoid trampling on the stable branch and isolate errors from this branch.

Other than using the Gtk4 toolkit, it in addition it has several new features, fixes and enhancemnts.

**NEW FEATURES**

- [x] Can Make Links on the Desktop on Drag and Drop from Nautilus. Pressing the Alt button on drag modifies the drop to ask the user to Copy, Move or Make Links at the destination.

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

- [x] Other than the UUID of the extension, changed the application ID, the Dbus object paths and GSetting schemas for the application. This is to differentiate it from the gtk-3 desktop icons NG extension. Both can be installed simultaneously on the same system. However both should not be run at the same time, only one extension should be active. This lets users test the extension, report problems that need fixing, and revert to the original gtk3 DING if does not work for them.

- [x] For Gnome 42, allow use of 'unlock-dialog' in session mode for the extension, so that it is not relaunched every time.

- [x] Re-organization, New Folder structure to avoid confusion and facilitate review.

- [x] Update to work with Gnome 43 and File 43, Files 44alpha.

- [x] More Reliable parsing of string URI lists with old Nautilus with GLib.Uri.

- [x] Give visual feedback and prevent smoothly dropping special files if selected, on Nautilus windows by doing local drops by accepting but not reading drop data.

- [x] Use native TextEncoder and TextDecoder objects in GJS instead of ByteArray imports.

- [x] Use CSS to unhighlight Drop Target.

- [x] Use native libadwaita prefrences window from gnome-extensions if possible to maintain UI consistency.

- [X] Add a preferences option to place new icons on the non primary display if multiple monitors are connected. If a second monitor is connected, new icons can now be placed on the secondary monitors first, not the Primary Display.

- [x] Trashed files are put back to the same position on the desktop if undo action is selected from the right click 'copy, paste, undo, redo' sub menu on the desktop.

- [x] Integration with Gsconnect extension. If Gsconnect extension is installed, right click menus allow sending files directly from the desktop using Gsconnect to a paired mobile device.

- [x] Allows dropping Favorite Apps from the Dock to the Desktop to make .desktop files on Desktop. The advantage is that files can then be dropped directly on the icon to launch them.

- [x] If the app in the dock is a favorite, dragging and dropping from desktop removes it from the favorites. Like 'REMOVE'. If the app in the dock is a favorite, pressing the control key while dropping results in removing it from the favorites, and creating a new .desktop file for the app on the desktop in the dropped position. Analogous to 'MOVE'. Pressing the shift key while dropping results in creating a new .desktop file for the app on the desktop in the dropped position without removing it from the favorites if it is in he favorites. This can make shortcuts for running apps that are not in the favorites. Analogous to 'COPY'

- [x] Improved workspace switching with gestures - icons appear on all the workspaces while switching make it seem that Desktop is on all windows.

- [x] Enable opening files, by dragging the icon and dropping on the app icon on the Dock. Checked on Dash to Dock and Dash to Panel and Ubuntu Dock. Submitted patch to Dash-to-Panel upstream - that has already been merged, makes this work even on Dash to Panel when the panel icons are animated.

- [x] Drag and drop files from desktop to the Trash Icon on Dash to Dock directly.

- [x] Drag and drop files to Mounted Volumes and davs:// mounted Volumes on Dash to Dock to copy files.

- [x] Display thumbnail for GIMP files if one exists, usually if the File was opened or created in local GIMP install.

- [x] Lookup GIMP files for snap and flatpack install as well. Also optimizes the thumbnail lookup code to make fewer lookups, and not execute unnecessarly code.

- [x] Detect Change to Dark Mode in Gnome Global Settings, reload dark variant of current theme (for correctly formatted themes with a valid dark-variant) to display correct widgets in correct theme css and vice versa without restarting the app.

- [x] Detect Gtk Theme Changes to update currently applied theme, update selection color and rubber band color in real time to show new colors and themes without restarting the app.

- [x] Link targets are now monitored, if a link is broken it is updated immediately on the Desktop.

- [x] When files are dropped on the Dock, now a check is done to make sure the application in the Dock can actually open the file prior to launching it. If it is uable to open the files, an error message is shown.

**FIXES**

- [x] Fix Gtk4 Icon Rendering Code to at least render generic correct icons at the correct size.

- [x] Fix Drag and Drop. Need to add drag and drop controllers to DesktipIconItem.js.

- [x] Fix Rectangle Selection in Gtk4. Fixed by using Gtk.Overlay.

- [x] Fix clipboard. Fixed. Use new Gdk4 clipboard object, remove old dbus code and St. library clipboard code from extension.js

- [x] Fix DbusUtils Nautilus Wayland window handle. Can successfully get Wayland window handle via asynchronous call, using a promise with Gtk4. This is passed to Nautilus. Reset on callback from the Dbus call.

- [x] Cosmetic Fixes to Boxes as Padding and spacing is gone in Gtk4 and need to use other methods.

- [x] Composite Emblem Icons using Gtk4

- [x] Set custom icons using Gtk4 methods and calls.

- [x] Make Gtk4 Icons skinny, not tiles so that there is space around them to initiate selection rectangles.

- [x] Use Gtk Application keyboard accelerators for functions, Shortcuts are shown in Gio.Menus.

- [x] All menus are Gio.Menus.

- [x] Thumbnail.js GnomeDesktop.DesktopThumbnailFactory is Gtk3, will not work with current code. Till that is ported, thumbnail.js is launched as a separate Gtk Application, ding and thumbnail.js exchange thumbnail information over dbus. This is the last thing to complete this port. This is done for Gnome 40, Gnome 41.

- [x] GnomeDesktop4 is now available in some distros on Gnome 41. Others have it in Gnome 42 (eg Ubuntu Jammy). This branch now checks to see which version is available. If GnomeDesktop4 is available, it uses it directly to render thumbnails. If not available, it launches a helper app that uses Gtk3 and GnomeDesktop3, communicates with it over Dbus to render thumbnails.

- [x] Fix - the desktop is not highlighted with a green rectangle on Drag and Drop.

- [x] Fix - Rename popups and fileItem right click menus work correctly even if the desktop is refreshed while they are open. Rename popups and the right click menus are re positioned to point to the correct fileItem and both menus always operate on the correct file/fileItem. This also applies to stacktopItems, if they move the right click menu updates and moves with them.

- [x] Fix - Selection is kept even if the desktop is refreshed.

- [x] Fix - Keyboard accelerators work even after Gtk.PopoverMenu sub-menus are shown and dismissed. This seems to be a bug in Gtk4, accelerators don't work after a submenu is shown and dismissed, the fix is a little bit of a kludge, but gets the job done till this is fixed upstream.

- [x] Fix - Window Transparency under X11.

- [x] Gtk4 does not allow window move even on X11. X11 windows are now managed by the extension in the same way as Wayland windows.

- [x] Leverages Gtk4 calls to translate coordinates. Fix Rubber band initiation by correcting the grid Global Rectangle, local to global and global to local coordinates. Fixes iconContainer and labelContainer global rectangles with the above calls as well so that they work with fractional scaling. Thanks to Sergio Costas for Pointing out that eventbox gives negative coordinates in margins. Fix for correcting getDistance(x, y) from Sergio Costas !348. Removed scale from desktopgrid.js. Removed zoom from desktopIconItem.js

- [x] Refactoring to avoid boolean parameters, make code more readable. Added eslint.json and GJS/Gnome eslintrc-gjs.yml and eslintrc-shell.yml for linting.

- [x] Refactoring to avoid multiple imports, preferences, desktopiconsutil, DBusUtils, Enums, FileUtils, PromiseUtils just imported once at DING startup. Prefrences, desktopiconsUtil and DBusUtils are now classes. Extensive linting of Code, Header imports cleaned up to avoid importing the same thing twice. This facilitates, renaming, moving, reorgainizing of files into different folder, as the code will have to be changed in just one file to accomodate instead of editing multiple files.

- [x] Fix - always show new Icons on primary monitor on multi monitor setups. When primary monitor is switched during session, this tracks it as well.

- [x] Fix - Clean up addFiles to desktop, completely rewritten, more legible and understandable. Multiple fixes for more reliable placement of icons.

- [x] Fix - Desktop files from dock are copied/moved correctly with executable bit set and marked trusted, relative symlinks for file resolved for flatpacks.

- [x] Fix window displacement when dragging down on top bar.

- [x] Fix icons flickering when changing work spaces with swipe gesture.

- [x] All Preferences are now cached in native javascript instead of calling GioSSS code repeatedly. All preferences/settings monitoring code is now migrated to one place in preferences.js with all preferences/settings available globally from this file.

- [x] MR subnmitted upstream to Hide-top-bar extension and Transparent-top-bar (Adjustable Transparency), both merged make those extension work well with Gtk4-DING.

- [x] MR submitted to Dash to Dock [here](https://github.com/micheleg/dash-to-dock/pull/1890) for intellihide, and [here](https://github.com/micheleg/dash-to-dock/pull/1888) for Transparency, MR submitted to Dash to Panel [here](https://github.com/home-sweet-gnome/dash-to-panel/pull/1790) to make those extensions detect the Gtk4-DING window and correct intellihide and transparency behaviour. These have not been merged yet. The MR branches can be downloaded and installed to have correctly working Dash to Dock and Dash to Panel with intellihide.

- [x] Updated css to set custum named program colors.

- [x] Updated css selectors speceficity and apply specefic Gtk4 methods to widgets, to prevent interference form user applied Gtk themes.

- [x] Minimized use of Gtk.StyleContext as it is being depriciated, no only used to detect and set rubberband color.

**KNOWN ISSUES**

- [ ] On X11, in latest Ubuntu and Fedora, Gtk.GestureClick.get_current_event_state() button click returns wrong state, crashing the Program. Works perfectly on Wayland on all distributions tried, worked on older version of Manjaro on X, but the newer releases of Manjaro and ArchLinux also have this bug. This appears to be doe to an error in GJS, reported upstream [here](https://gitlab.gnome.org/GNOME/gjs/-/issues/507). Reported upstream [here](https://discourse.gnome.org/t/gtk4-eventcontroller-gestureclick-returns-incorrect-state-gdk-modifiertype-on-mouse-button-press-in-x11/9710) in Gnome Discourse and [here](https://bugs.launchpad.net/ubuntu/+source/gjs/+bug/1975544) on Ubuntu Launchpad. I have deviced a workaround to make this work under X11 for now till the bug is fixed upstream. Please feel free to fix and propose MR's to make this work properly. This is the first time this code has run on X11 in the last 8 months while many features were added to the main branch! Therefore be advised, X11 branch may have bugs. Specefically Gtk.Double Click time may be a problem as I had to do some hardcoding to make double clicks work.

- [x] ~~Gdk.Display.get_default().get_app_launch_context() when used in launch() to launch a desktop file crashes GJS. Likely problem in GJS. Current workaround is not to use the context, set to null, till fixed upstream.~~ This is now fixed in latest GJS and enabled in the latest release.

- [ ] Dragged Icon sets the wrong offset for the cursor and defaults to 0,0 with Gtk.DragSource.set_icon in Wayland. This works perfectly in X11 and the correct offset is set. Again problem in Gtk4 on Wayland, But reported and issue in Gtk4 [here](https://gitlab.gnome.org/GNOME/gtk/-/issues/2341), however drag and drop otherwise works perfectly till fixed upstream.

- [ ] Gtk.DropTargetAsync - doing a read_async() followed by read_finish() on the drop dumps core. So cannot elect to read a particular mime type. Currently have to use read_value_async() followed by read_value_finish(). This restricts us to reading default String.$gtype on drops from Nautilus/Files. Although this works, it is not ideal. The issue is reported upstream [here](https://gitlab.gnome.org/GNOME/gjs/-/issues/522) in GJS.

- [ ] Application keyboard shortcut accelerators stop working after a submenu of a menu is closed, work perfectly if only the menu is closed. Bug reported [here](https://discourse.gnome.org/t/gtk4-eventcontroller-gestureclick-returns-incorrect-state-gdk-modifiertype-on-mouse-button-press-in-x11/9710) in Gnome Discourse, no clear solution. Current workaround is to destroy the menu once closed. Keyboard accelerators then work again normally.

- [ ] Nesting submenus do not work, crash GJS, currently use sliding submenus with Gio.Menu. Bug reported [here](https://discourse.gnome.org/t/gtk4-gtk-popovermenu-new-from-model-full-fails-in-gjs/9603) in Gnome Discourse, and [fix](https://gitlab.gnome.org/GNOME/gtk/-/merge_requests/4668) was committed upstream. Wait till widely available in distributions prior to using option for nesting submenus, currently use sliding submenus.

- [x] ~~Gtk.DropTargetAsync(), in X11, does not set Gtk.StateFlags.NORMAL on the widget once the drag is finished. Current workaround is to set it manually with Widget.set_state_flags(Gtk.StateFlags.NORMAL, true) explicitly on drag end. It works perfectly on Wayland without a workaround.~~ This is no longer relevent or necessary, use CSS to unhighlight droptarget.

If this extension does not work for you, just deactivate it in extensions manager, and you can use the classic DING Gtk3 extension.

Please report errors, and if you can fix it, please do so. See Contributing below.

**THEME ISSUES**

The most common issues users have reported so far pertains to issues with user installed themes. This sheds light and clarifies the issues. The most common issue is a white opaque window with no background image with icons on it, and desktop menus not changing to dark mode on Gnome theme changes.

The extension has two parts, the extension itself that runs in the shell, and a pure Gtk4 program that runs outside the gnome shell and renders all the icons on the desktop. For example, when you see the preferences window, it is actually a libadwaita window spawned by the Gnome shell. The right click menus are true Gtk4 application menus and do not belong to the shell. Themes just applied to the shell will not apply to the application.

In gnome tweaks, apply a them with the corresponding name to "Applications" or "Legacy Applications" as well. DING application window will respect that application theme. Most good, well designed, comprehensive themes have a Gtk theme a corresponding to the shell theme with the same name. This is true of most major distributions. The application and extension is regularly checked on default Ubuntu, Manjaro and by extension ArchLinux, and intermittently on the latest Fedora, and most themes works well.

Themes so set will be immediately applied to the running DING on making the change.

If downloaded themes are applied, then they have to be designed for gtk4 as well, meaning they have to have correct .css files in a gtk4 folder, depending on the $XDG theme folder specification for your distribution, these are ~/.theme/"themename"/gtk4, ~/.local/share/themes/"themename"/gtk4 or the corresponding system /user/share/thmes/"themename"/gtk4, /etc/themes/ folder. Older, gtk3 and gtk2 themes in the gtk3 and gtk2 folders in those locations will not work on the app.

If a downloaded theme messes up the DING window, but works perfectly with the default distribution themes with no user themes applied, then there is a problem with the downloaded user themes. This can be confirmed by moving the css files out from the gtk4 folder of the theme and restarting the extension.

Downloaded user themes css files in the the Users local folder, ~/.themes, ~/.local/share/themes, take precedence over all default system installed and application installed css files, and can thus create problems by overiding the application installed css file. This is the most common cause for the desktop icons window to become opaque. Fixing application css file at this point will not help. In that case you can fix the .css file in the gtk4 folder of the ~.themes/"themename"/gtk4 or ask the theme author for a fix.

If despite all the above you feel fixing the .css in the gtk4-DING application or extension would help, please feel free to contribute a fix, see Contributing below, or create an issue with the suggestion for the fix.

**DARK MODE ISSUES**

Gnome allows Global Dark mode in Settings. This mode does not automatically apply to Gtk4 Applications like DING, it only works on libAdwaita applications and the Gnome Shell. Previously, a specefic dark theme needed to be applied to the "legacy" gtk applications in gnome tweaks to enable dark mode for menus etc. in gtk4-DING.

Good, Modern Gtk Application Themes have a dark "variant" built into the theme itself, wihout neccessarily being named "dark" theme. Gtk4-DING now detects the change in Gnome Settings to dark mode, and then applies it to global Gtk settings for the user. This is a boolean setting and affects all Gtk applications of the user.

As Gtk4-DING now detects the change, it reloads the dark variant of the current Gtk theme automatically and applies it, so now Gtk4-DING should switch to dark-mode auotmatically on making the setting change in Gnome Settings, even from the shortcut menus in the top right corner with Gnome 43.  The theme has to have a dark "variant" description in the css files for the themes for this to work properly. The default Adwaita theme does have this variant built in. If other Gtk applications have the ability to detect and react to the change made by Gtk4-DING to the global gtk settings for the user, they should be able to reload their themes as well.

The other option is to install extensions that automatically toggle legacy application Gtk themes with changes in dark mode theme for the gnome shell. There are several on gnome.extensions.org, some examples are [Legacy-gtk3-theme-scheme-auto-switcher](https://extensions.gnome.org/extension/4998/legacy-gtk3-theme-scheme-auto-switcher/) and [Lightdark-theme-switcher](https://extensions.gnome.org/extension/4968/lightdark-theme-switcher/)

## Requirements

* GNOME Shell >= 40
* Nautilus >= 3.38
* File-roller >= 3.38 or Gnome AutoAr (including gir1.2 files)
* Desktop folder already created

## Installation

<p style="text-align: left;">
    <a href="https://extensions.gnome.org/extension/5263/gtk4-desktop-icons-ng-ding/" style="margin-left: 20px">
        <img src="/media/svg/Gnome_logo.svg" width="120px"/>
    </a>
</p>
<p style="text-align: left;">
The extension can be installed from [extensions.gnome.org](https://extensions.gnome.org/extension/5263/gtk4-desktop-icons-ng-ding/).
</p>
<p style="text-align: left;">
For Archlinux, (and if needed, Manjaro), it is available in AUR [here](https://aur.archlinux.org/packages/gnome-shell-extension-gtk4-desktop-icons-ng).
</p>
<p style="text-align: left;">
For Manjaro, a native maintained build is available in the Manjaro Repository that can be installed directly with pacman and other tools. [Download](https://software.manjaro.org/package/gnome-shell-extension-gtk4-desktop-icons-ng) from Manjaro Community Repository available.
</p>

## Manual installation

The easiest way of installing DING is to run the `scripts/local_install.sh` script from the source directory (after changing directory to the source directory). The script assumes that it is being called from the base of the source directory. It performs the build steps specified in the next section.

In Ubuntu Jammy and probably later, the Ubuntu session is locked and only the default Ubuntu extensions run. Ubuntu runs it's own Desktop Icon Extension. Therefore, installing the extension from extensions.gnome.org will not work directly. The install script provided in the repository bypasses this and installs this as a manually installed extension. The default Desktop Icons extension that ships with Ubuntu then needs to be deactivated, and the manually installed one activated.

The other way to update to the newest one in Ubuntu is to install the "gnome-session" package, to enable the use of a standard gnome shell session, and in that session install the following extensions from extensions.gnome.org:

* This Extension
* Dash to dock
* Appindicator and KstatusNotifierItem support

That will allow the experience similar to the original Ubuntu desktop, but with the most recent versions of the extensions, without the default Ubuntu Desktop Icons Extension.

## Internal architecture

The code is divided in two parts: a classic Gtk4 program that manages the whole desktop, and a little extension (comprised only by the files 'extension.js', 'gnomeShellOverride.js', 'visibleArea.js' and 'emulateX11WindowType.js') that have these roles:

* Launch the desktop program at startup, relaunch it if it dies, and kill it if the extension is disabled
* Identify the desktop windows and keep it at the bottom of the windows stack, in all desktops
* Detect changes in the desktop/monitors geometry and notify the main desktop program of them

These two last items are paramount in Wayland systems, because there an application can neither set its role as freely as in X11, nor get that information.

Of course, to avoid breaking the security model of Wayland, it is paramount to ensure that no other program can pose as DING. In old versions, the process for identifying the window was quite convoluted, passing an UUID through STDIN and putting it in the window title. But since Gnome Shell 3.38 there is a new API that allows to check whether a window belongs to an specific process launched from an extension, which makes the code much cleaner and straightforward.

The extension monitors all 'map' signals, and when a window from the DING process previously launched is mapped, it knows that it is the desktop window. It stores that window object, sends it to the bottom of the stack, and connects to three signals:

* raised: it is called every time the window is sent to the front, so in the callback, the extension sends it again to the bottom.
* position-changed: although the window doesn't have titlebar, it still is possible to move it using Alt+F7, or pressing Super and dragging it with the mouse, so this callback returns the window to the right possition every time the user tries to move it.
* unmanaged: called when the window disappears. It deletes the UUID, and waits for the desktop program to be killed (it will be relaunched again by the extension, and, of course, a new UUID will be used).

It also monitors other signals to ensure that the desktop receives the focus only when there are no other windows in the current desktop, and to keep the icons in the right screen, no matter if the user changes to another virtual desktop.

The extension also intercepts three Gnome Shell system calls, in order to hide the desktop windows from the tab switcher and the Activities mode. These are  Meta.Display.get_tab_list()', 'Shell.Global.get_window_actors()', and 'Meta.Workspace.list_windows()'.

## Launching the Desktop Icons application stand-alone

It is possible to launch the desktop icons application in stand-alone mode to do debugging and testing, but, of course, it will behave as a classic Gtk program: there will be a window with its titlebar, and the background won't be transparent (it could be, but since the idea is to do debug, it is better this way). To do so, just launch 'app/ding.js' from the base repository directory. If it can't find the schemas file, just enter the 'schemas' folder and type 'glib-compile-schemas .', and retry.

It accepts the following command line parameters:

* -P: specifies the working path. If not set, it will default to './', which means that all the other
files must be in the current path.
* -D: specifies a monitor. It is followed by another parameter in the form: X:Y:W:H:Z being each letter
      a number with, respectively:
  * X: the X coordinate of this monitor
  * Y: the Y coordinate of this monitor
  * W: the width in pixels of this monitor
  * H: the height in pixels of this monitor
  * Z: the zoom value for this monitor
  you can set several -D parameters in the same command line, one for each monitor. A single window
  will be created for each monitor. If no -D parameter is specified, it will create a single monitor
  with a size of 1280x720 pixels.
* -M: specifies which monitor is the primary index, to add there any new file icon.

## Build with Meson

The project uses a build system called [Meson](https://mesonbuild.com/). You can install in most Linux distributions as "meson". You also need "ninja" and xgettext.

It's possible to read more information in the Meson docs to tweak the configuration if needed.

For a regular use and local development these are the steps to build the project and install it:

```bash
meson --prefix=$HOME/.local/ --localedir=share/gnome-shell/extensions/gtk4-ding@smedius.gilab.com/locale .build
ninja -C .build install
```

It is strongly recommended to delete the destination folder ($HOME/.local/share/gnome-shell/extensions/gtk4-ding@smedius.gitlab.com) before doing this, to ensure that no old data is kept. It is also recommended to delete the local .build folder after the build is finished to clean up.

## Installing with Puppet

If you want to install it in several machines using puppet, you must first create an installation folder in your local machine using:

```bash
mkdir install_folder
meson --prefix=`pwd`/install_folder --localedir=share/locale .build
ninja -C .build
ninja -C .build install
rm -f install_folder/share/glib-2.0/schemas/gschemas.compiled
rm -rf .build
```

The content of the `install_folder` needs to be copied to the destination computers at /usr install folder. After doing that, run `sudo glib-compile-schemas /usr/share/glib-2.0/schemas` in each of the installed computers to update the schemas for that system.

## Export extension ZIP file for extensions.gnome.org

To create a ZIP file with the extension, just run:

```bash
./scripts/export-zip.sh
```

This will create the zip file `gtk4-ding@smedius.gitlab.com.zip` of the extension, following the publishing rules at extensions.gnome.org.

## Contributing

Fixes are welcome, specially to this newer and less tested Gtk4 version. Please file fixes and new ideas with an MR at GitLab.

There are ESLint rules in the repository, if able, please run ESLint on all contributions so that they follow GJS/Gnome guidelines. The ESLint.json is in the repository. The eslint-gjs.yml and eslint-shell.yml files are in the lint folder of the repository.

Translations are welcomed, the project uses gettext and there are PO/POT files in the repository. You can help translate Gtk4 Desktop Icons NG on [Hosted Weblate](https://hosted.weblate.org/projects/gtk4-desktop-icons-ng/gtk4-ding-pot/).
<p style="text-align: center;">
<a href="https://hosted.weblate.org/engage/gtk4-desktop-icons-ng/">
<img src="https://hosted.weblate.org/widgets/gtk4-desktop-icons-ng/-/gtk4-ding-pot/horizontal-auto.svg" alt="Translation status" />
</a></p>
<p style="text-align: center;">
<a href="https://hosted.weblate.org/engage/gtk4-desktop-icons-ng/">
<img src="https://hosted.weblate.org/widgets/gtk4-desktop-icons-ng/-/gtk4-ding-pot/287x66-white.png" alt="Translation status" />
</a>
</p>

## Source code and contacting the author

For the Gtk4 Desktop Icons NG (This repository)-

Sundeep Mediratta  
<https://gitlab.com/smedius/desktop-icons-ng>  
smedius@gmail.com

Sergio Costas is the author for the Original Desktop Icons NG. His project and contact information is here, however any errors in the Gtk4-Desktop
Icons are all mine, please do not spam him with problems from my fork.

Sergio Costas  
<https://gitlab.com/rastersoft/desktop-icons-ng>  
rastersoft@gmail.com
