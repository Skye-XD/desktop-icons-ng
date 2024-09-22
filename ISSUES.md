## KNOWN ISSUES

- [x] FIXED - UNLIMITED WORKSPACES TO THE RIGHT- with Meta.WindowType.DESKTOOP, window on all workspaces and minimal shell overrides - ~~auto-move-windows from gnome extensions patches the gnome shell workspace tracker that breaks Gtk4 DING gnome shell override to the same functions in the shell. This can still result in unlimited workspaces, and makes an empty workspace to the right of the current workspace if it only has the DING window. The only correct solution is to enable gtk4-DING first and then auto-move-windows, but this is not a viable long term solution. The best recommended action is to completely disable auto-move-windows extension. Highly recommend smart-auto-move-windows from EGO that works perfectly with Gtk4-DING, with even better functionality and more features thant the alod auto-move-windows, and appears to do so without patching/overriding the Gnome Shell.~~

- [x] ~~On X11, in latest Ubuntu and Fedora, Gtk.GestureClick.get_current_event_state() button click returns wrong state, crashing the Program. Works perfectly on Wayland on all distributions tried, worked on older version of Manjaro on X, but the newer releases of Manjaro and ArchLinux also have this bug. This appears to be doe to an error in GJS, reported upstream [here](https://gitlab.gnome.org/GNOME/gjs/-/issues/507). Reported upstream [here](https://discourse.gnome.org/t/gtk4-eventcontroller-gestureclick-returns-incorrect-state-gdk-modifiertype-on-mouse-button-press-in-x11/9710) in Gnome Discourse and [here](https://bugs.launchpad.net/ubuntu/+source/gjs/+bug/1975544) on Ubuntu Launchpad. I have deviced a workaround to make this work under X11 for now till the bug is fixed upstream. Please feel free to fix and propose MR's to make this work properly. This is the first time this code has run on X11 in the last 8 months while many features were added to the main branch! Therefore be advised, X11 branch may have bugs. Specefically Gtk.Double Click time may be a problem as I had to do some hardcoding to make double clicks work.~~
This is now fixed 4/5/2023 with [!829 in GJS](https://gitlab.gnome.org/GNOME/gjs/-/merge_requests/829). Should be able to use regular code with no workarounds with the newer versions of GJS

- [x] ~~Gdk.Display.get_default().get_app_launch_context() when used in launch() to launch a desktop file crashes GJS. Likely problem in GJS. Current workaround is not to use the context, set to null, till fixed upstream.~~ This is now fixed in latest GJS and enabled in the latest release.

- [x] ~~Dragged Icon sets the wrong offset for the cursor and defaults to 0,0 with Gtk.DragSource.set_icon in Wayland. This works perfectly in X11 and the correct offset is set. Again problem in Gtk4 on Wayland, But reported and issue in Gtk4 [here](https://gitlab.gnome.org/GNOME/gtk/-/issues/2341), however drag and drop otherwise works perfectly till fixed upstream.~~
Issue is now fixed in Version 33 of the extension on Gnome 44 after upstream fixes.

- [ ] Gtk.DropTargetAsync - doing a read_async() followed by read_finish() on the drop dumps core. So cannot elect to read a particular mime type. Currently have to use read_value_async() followed by read_value_finish(). This restricts us to reading default String.$gtype on drops from Nautilus/Files. Although this works, it is not ideal. The issue is reported upstream [here](https://gitlab.gnome.org/GNOME/gjs/-/issues/522) in GJS.

- [ ] Application keyboard shortcut accelerators stop working after a submenu of a menu is closed, work perfectly if only the menu is closed. Bug reported [here](https://discourse.gnome.org/t/gtk4-eventcontroller-gestureclick-returns-incorrect-state-gdk-modifiertype-on-mouse-button-press-in-x11/9710) in Gnome Discourse, no clear solution. Current workaround is to destroy the menu once closed. Keyboard accelerators then work again normally.

- [x] ~~Nesting submenus do not work, crash GJS, currently use sliding submenus with Gio.Menu. Bug reported [here](https://discourse.gnome.org/t/gtk4-gtk-popovermenu-new-from-model-full-fails-in-gjs/9603) in Gnome Discourse, and [fix](https://gitlab.gnome.org/GNOME/gtk/-/merge_requests/4668) was committed upstream. Wait till widely available in distributions prior to using option for nesting submenus, currently use sliding submenus.~~ Fixed upstream but sliding menus look good anyway...

- [x] ~~Gtk.DropTargetAsync(), in X11, does not set Gtk.StateFlags.NORMAL on the widget once the drag is finished. Current workaround is to set it manually with Widget.set_state_flags(Gtk.StateFlags.NORMAL, true) explicitly on drag end. It works perfectly on Wayland without a workaround.~~ This is no longer relevant or necessary, use CSS to un highlight drop target.

- [x] ~~Reading a text drop on the desktop stopped working as dropactor.read_value_finish(result) does not seem to return the text dropped from Gnome 43 onwards :-(. Also see above- cannot read mime type directly from Gtk.DropTargetAsync.~~ Works with firefox, Chrome uses a different mechanism...

- [x] ~~GNOME shortcuts allow an application window to be lowered, and they use the lower() method, sending the application window below the DING window. This is now detected by connecting to restacked signal to send the DING window back to the lowest position. Unfortunately results in flashing of icons. This needs to be fixed in GNOME shell to either not allowing an application window to be lowered with the lower() call, or if allowing lowering, to to it intelligently to reposition above the DING window.~~ This is now resolved, the window is of type DESKTOP and managed by the window manager. This workaround is no longer necessary.

- [ ] Gtk.Widget.compute_point() return incorrect local coordinates immediately after grid resizing, resulting in all icons shifting to the left by one column. It works perfectly after that, if a new file is touched to the desktop now, all icons shift back to the correct position. ~~Currently fixed with a hack Enum.StoredCoordiantes.REDISPLAY used immediately after resize of grids to forcibly shift all icons to the right.~~ It appears that the object stores and uses the second last margin applied for computing coordinates, not the last margin. ~~Setting the margin twice currently insures that the correct margin is always used to compute the coordinates.~~ Currently reverted to old method of calculating coordinates in coordiantesGlobalToLocal in desktopGrid.js. Unclear where this bug is coming from, needs to be investigated at a deeper level with C code...

If this extension does not work for you, just deactivate it in extensions manager, and you can use the classic DING Gtk3 extension.

Please report errors, and if you can fix it, please do so. See Contributing below.

## THEME ISSUES

SINCE APRIL 16, 2023, venison 35, GTK4-DING IS A LIBADWAITA APPLICATION. ONLY DEFAULT LIBADWAITA THEME WILL WORK, GTK THEMES WILL NOT EXCEPT ICONS AND SELECTION/BACKGROUND COLORS. HOPEFULLY THERE WILL BE NO MORE ISSUES. PLEASE SEE BELOW FOR PREVIOUS VERSIONS.

The most common issues users have reported so far pertains to issues with user installed themes. This sheds light and clarifies the issues. The most common issue is a white opaque window with no background image with icons on it, and desktop menus not changing to dark mode on Gnome theme changes.

The extension has two parts, the extension itself that runs in the shell, and a pure Gtk4 program that runs outside the gnome shell and renders all the icons on the desktop. For example, when you see the preferences window, it is actually a libadwaita window spawned by the Gnome shell. The right click menus are true Gtk4 application menus and do not belong to the shell. Themes just applied to the shell will not apply to the application.

In gnome tweaks, apply a them with the corresponding name to "Applications" or "Legacy Applications" as well. DING application window will respect that application theme. Most good, well designed, comprehensive themes have a Gtk theme a corresponding to the shell theme with the same name. This is true of most major distributions. The application and extension is regularly checked on default Ubuntu, Manjaro and by extension ArchLinux, and intermittently on the latest Fedora, and most themes works well.

Themes so set will be immediately applied to the running DING on making the change.

If downloaded themes are applied, then they have to be designed for gtk4 as well, meaning they have to have correct .css files in a gtk4 folder, depending on the $XDG theme folder specification for your distribution, these are ~/.theme/"themename"/gtk4, ~/.local/share/themes/"themename"/gtk4 or the corresponding system /user/share/themes/"themename"/gtk4, /etc/themes/ folder. Older, gtk3 and gtk2 themes in the gtk3 and gtk2 folders in those locations will not work on the app.

If a downloaded theme messes up the DING window, but works perfectly with the default distribution themes with no user themes applied, then there is a problem with the downloaded user themes. This can be confirmed by moving the css files out from the gtk4 folder of the theme and restarting the extension.

Downloaded user themes css files in the the Users local folder, ~/.themes, ~/.local/share/themes, take precedence over all default system installed and application installed css files, and can thus create problems by overriding the application installed css file. This is the most common cause for the desktop icons window to become opaque. Fixing application css file at this point will not help. In that case you can fix the .css file in the gtk4 folder of the ~.themes/"themename"/gtk4 or ask the theme author for a fix.

If despite all the above you feel fixing the .css in the gtk4-DING application or extension would help, please feel free to contribute a fix, see Contributing below, or create an issue with the suggestion for the fix.

**DARK MODE ISSUES**

SINCE APRIL 16, 2023, venison 35, GTK4-DING IS A LIBADWAITA APPLICATION. HOPEFULLY THERE WILL BE NO MORE ISSUES. DARK MODE SHOULD BE AUTOMATIC WITH LIBADWAITA. PLEASE SEE BELOW FOR PREVIOUS VERSIONS.

Gnome allows Global Dark mode in Settings. This mode does not automatically apply to Gtk4 Applications like DING, it only works on libadwaita applications and the Gnome Shell. Previously, a specefic dark theme needed to be applied to the "legacy" gtk applications in gnome tweaks to enable dark mode for menus etc. in gtk4-DING.

Good, Modern Gtk Application Themes have a dark "variant" built into the theme itself, without necessarily being named "dark" theme. Gtk4-DING now detects the change in Gnome Settings to dark mode, and then applies it to global Gtk settings for the user. This is a boolean setting and affects all Gtk applications of the user.

As Gtk4-DING now detects the change, it reloads the dark variant of the current Gtk theme automatically and applies it, so now Gtk4-DING should switch to dark-mode automatically on making the setting change in Gnome Settings, even from the shortcut menus in the top right corner with Gnome 43.  The theme has to have a dark "variant" description in the css files for the themes for this to work properly. The default Adwaita theme does have this variant built in. If other Gtk applications have the ability to detect and react to the change made by Gtk4-DING to the global gtk settings for the user, they should be able to reload their themes as well.

The other option is to install extensions that automatically toggle legacy application Gtk themes with changes in dark mode theme for the gnome shell. There are several on gnome.extensions.org, some examples are [Legacy-gtk3-theme-scheme-auto-switcher](https://extensions.gnome.org/extension/4998/legacy-gtk3-theme-scheme-auto-switcher/) and [Lightdark-theme-switcher](https://extensions.gnome.org/extension/4968/lightdark-theme-switcher/)

## CHOOSING DEFAULT TERMINAL

Glib is (at least for now, till a better spec appears) launching xdg-terminal-exec to execute the default terminal for programs that need to be launched in the a "Terminal". See discussion on GLib issues.
The Gnome Dconf key that specified the default terminal is depreciated.
A good synopsis of the pros-and-cons and issues in [this comment](https://gitlab.gnome.org/GNOME/glib/-/issues/338#note_1745989) and on the [complicated file structure](https://github.com/ublue-os/main/issues/211#issuecomment-1551600704).
Then newer specification that is supposed to better - [xdg-default-apps](https://gitlab.freedesktop.org/xdg/xdg-specs/-/issues/54#note_868443) spec. However this is not yet implemented, and appears stalled.
However xdg-terminal-exec is a shell script and is not installed on all distributions.
So, to let user launch their own default terminal application, gtk4-ding -
A. will attempt to work like xdg-terminal-exec if it is not installed.
* Look for $XDG_CONFIG_HOME/xdg-terminals.list, else for $XDG_CONFIG_DIRS/xdg-terminals.list. If this exists, try and open the first terminal in the list.
* If $XDG_USER_DATA or $XDG_SYSTEM_DATA files have xdg-terminal folder with valid .desktop files, execute one of them.
* If the depreciated dconf key for the default terminal still exists, launch the terminal specified there.
B. If there is a valid xdg-terminal-exec binary, just execute that as GLib calls will do that. This allows a user to "hard code" a terminal by hacking xdg-terminal-exec.

Easiest way of setting the terminal is .confg/terminal.list - one line, the name of the .desktop file to be launched.

gtk4-ding now monitors all files and folders that define the terminal to be used and will automatically show the correct terminal that will be launched in the right click menu.

## DEFAULT APPLICATIONS, DEFAULT FILE MANAGER ISSUES

**No application installed to open "XXXX" type of file**

This error message is generated by Gtk4-DING if it cannot find an application to open a file type. Gtk4-DING uses a mime type to figure out what application to launch. Not only should the application be installed, and the binary  be available, it must have a proper .desktop file installed, and the .desktop file should have that mime type listed properly in it. Further it must be registered with xdg-utils as a handler for the that particular mime-type. Most main stream distributions do this automatically by installing the appropriate files and packages.

For example, to open a Folder, not only should Nautilus be installed, but the .desktop file for Nautilus has to be installed as well. The .desktop file for Nautilus will have an entry, MimeType=inode/directory in there.

Furthermore the mime-type database for the desktop should have Nautilus listed as an application to open Folders. This can be checked by- 

$ xdg-mime query default inode/directory

OR

$ gio mime inode/directory

Should return org.gnome.Nautilus.desktop among other applications that can open folders.

The default system mime types 'database' is installed usually as /usr/share/applications/mimeinfo.cache. Any new application installed usually puts an entry in there, regarding the mime type of the files it can handle and open.

Vscode is notorious for putting itself before Nautilus for mime type 'inode/directory', making it the default file manager to open folders. (Talk to the Vscode packagers about that! Don't complain here).

The system mimetype database in typical Unix/Linux fashion can be easily overridden by the user mimeinfo database in the Uses home folder $XDG location for mimeinfo.cache. Gtk4-DING can easily set any default application to open a mime type for the user through the right click menu, 'Open With...'

Also, therefore, the distribution packages for xdg-utils/gio, have to be installed for DING to work properly.

Please check with the distribution if you are getting this error.

Further information is available here on Archwiki, but applies to all linux distributions-

[The xdg-mime applications](https://wiki.archlinux.org/title/XDG_MIME_Applications)

[xdg-utils](https://wiki.archlinux.org/title/Xdg-utils)

**Nautilus is not istalled, No default file Manager, Vscode opens folders..**

See No Application installed above...

## APPARMOR ISSUES

gtk4-ding uses gnome-desktop-4.0 library to render thumbnails of images, pdf and other file formats which have xdg-thumbnailers installed and configured in the appropriate system folders. Internally gnome-desktop-4.0 uses bubblewrap, the binary bwrap for security to launch the thumbnailer executables.

bubblewrap uses userns  -user namespaces- privileges to make a container to sandbox the executables.

userns privilges are viewed as a security concern, and some distributions can turn this off on a systemwide basis, or allow it to be tweaked by app-armor policy on a per application basis. userns restrictons and App-armor profile for bwrap (the binary program) currently breaks bubblewrap functionality on Ubuntu as userns restrictions and app-armor are enabled by default. See the reasons this was done [here](https://ubuntu.com/blog/ubuntu-23-10-restricted-unprivileged-user-namespaces). This [wiki page](https://gitlab.com/apparmor/apparmor/-/wikis/unprivileged_userns_restriction) contains more details if anyone's interested.

The options available are-

1. Disable thumbnailing option in preferences to stop all error messages in logs.
2. Ignore the error messages in logs, gtk4-ding will still render thumbnails of all common image types and pdf files if Cairo and lib-poppler providing Poppler are installed. xdg-thumbnailers configured and installed on the system will still not work to render thumbnails through the gnome-desktop library for special file types like appimage, mp4, ffmpeg etc. Generic icons for the format will be shown.
3. Disable AppArmor if you so wish, and/or allow systemwide userns through systemctrl. These are, after all, not enabled by default on Archlinux, Manjaro and many other distributions.
4. If not concerned about the security implications of userns with bubblewrap, enable userns apparmor profile fow bwrap as [detailed here](https://etbe.coker.com.au/2024/04/24/ubuntu-24-04-bubblewrap/). The app-armor team actively discourages this.
5. The AppArmor team  has a new bwrap profile that allows for userns for bwrap but not for any executed child, this is the __BEST__ generic solution. The new bwrap profile can be found [here](https://gitlab.com/apparmor/apparmor/-/blob/ebeb89cbce9b0ff3df43d28df983545e7a85bfd3/profiles/apparmor/profiles/extras/bwrap-userns-restrict). This profile is currently available in the apparmor-profile packages in Ubuntu SRU, noble proposed updated. It is however, still experimental, and the developors want it tested to make sure it does not break FlatPak functionality.
6. Install gtk4-ding in the system folders, /usr/share... etc., with the included AppArmor profile for gtk4-ding that specifically allows userns for gtk4-ding. AppArmor profile for $HOME folder local install was not written for possible security implications, but you can-
7. Write a AppArmor profile based on above for the local install at .local/share/gnome-shell/extensions/gtk4-ding@smedius.gitlab.com/app/ding.js. Just be careful that ding.js is not replaced by a malicius program downloaded from the internet that names itself ding.js in that location - it will have userns priviliges.
