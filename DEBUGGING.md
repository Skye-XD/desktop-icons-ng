## Internal architecture

The code is divided in two parts: a classic Gtk4 program that manages the whole desktop, ding.js in the app folder with it's supporting files, and a little extension (comprised only by the files 'extension.js', 'dingManager.js', 'gnomeShellOverride.js', 'visibleArea.js', 'desktopIconsIngegration.js' and 'emulateX11WindowType.js') that have these roles:

* Launch the desktop program at startup, relaunch it if it dies, and kill it if the extension is disabled.
* Identify the desktop windows and make them Meta.WindowType.Desktop under Wayland. On X11 the program automatically makes the window type Meta.WindowTypeDesktop using xprop. This leverages mutter to do the heavy lifting. This was recently accomplished after upstream merge in mutter that allowed a privileged process to change the window type on Wayland (December 2023 yay!).
* If the above fails, or on older versions of mutter without the ability to change window type, identifies, tracks sand keeps all type DESKTOP windows at the bottom of the windows stack, in all desktops, using signals. It effectively emulates window type 'DESKTOP' on both Wayland and X11. This is of course not as seamless and computationally efficient as the prior step.
* Detect changes in the desktop/monitors geometry and notify the main desktop program of them

These last three items are paramount in Wayland systems, because there an application can neither set its role as freely as in X11, nor get that information.

Of course, to avoid breaking the security model of Wayland, it is paramount to ensure that no other program can pose as gtk4-DING. In old versions, the process for identifying the window was quite convoluted, passing an UUID through STDIN and putting it in the window title. But since Gnome Shell 3.38 there is a new API that allows to check whether a window belongs to an specific process launched from an extension, which makes the code much cleaner and straightforward. These changes allow the privileged process in the extension to change some of the window properties only for it's own (gtk4-DING) windows.

For geometry changes, and if emulation is needed, the extension monitors all 'map' signals. When a window from the DING process previously launched is mapped, it knows that it is the desktop window. It stores that window object, sets it type Meta.WindowType.DESKTOP. If this fails, it sends it to the bottom of the stack, and connects to multiple signals:

* raised: it is called every time the window is sent to the front, so in the callback, the extension sends it again to the bottom.
* above: calls unmake_above().
* minimized: undoes the minimize action.
* position-changed: although the window doesn't have title bar, it still is possible to move it using Alt+F7, or pressing Super and dragging it with the mouse, so this callback returns the window to the right position every time the user tries to move it.
* unmanaged: called when the window disappears. It deletes the UUID, and waits for the desktop program to be killed (it will be relaunched again by the extension, and, of course, a new UUID will be used).
* restacked: if another window is pushed to the bottom of the stack with lower() (there is a GNOME shortcut action available to do this), and goes below the DING window, the DING window is lowered again below this window. This unfortunately gives flashing of icons, needs to be fixed in gnome shell so that shortcuts for lower use the tab list, to position the window above the DING window.
* For geometry changes, gets updates from the shell and sends it over DBus to the program to update window geometry and margins set by the shell.

It also monitors other signals to ensure that the desktop receives the focus only when there are no other windows in the current desktop, and to keep the icons in the right screen, no matter if the user changes to another virtual desktop.

The extension also sets the skip_taskbar property separately on the window to hide the window from the taskbar if necessary. (Meta.WindowType.DESKTOP property does automatically, if settable, makes window skip_taskbar)

In addition, both the window, and the application expose DBus interfaces and actions to each other to detect, track and allow drag and drop between limited, chosen shell actors to support drag and drop to and fro to the Dock.

## Integrating with other extensions

<b>Margins</b>

Other extensions can set margins with Gnome shell calls. gtk4-DING will track and set margins accordingly from the shell.

The issue however comes with 'intellihide' mode. No margin is set, the dock, and dock like margin extensions can slide over the icons on the desktop. Although this is OK with other windows, as at this point you are interacting with the 'intellihide' object, not with the underlying window. With gtk4-DING however, when you interact with any icon under the intellihide object, the object slides over the icons preventing interaction with the icons.

There is no central tracking for margins of intellihide objects in the Gnome Shell. A co-operative approach between extensions has so far been established to inform gtk4-ding to not put icons in an 'invisible' margin area. The file desktopIconsIntegration.js is extension independent and can be incorporated by any extension. Initializing the class in the file allows any extension to set 'invisible' margin areas that will be respected by gtk4-ding in addition to margins set by the gnome shell and prevent gtk4-ding from putting icons in that margin/area. This works currently with dash-to-dock, dash-to-panel and probably other extensions that incorporate this class.

<b>Transparency & 'Intellihide'</b>

Other extensions set transparency, and possibly intellihide behavior based on the window they are covering. gtk4-ding window extends across the entire monitor, edge to edge (yes, under the dock, dock-to-panel, and the top-bar as well). So any object on the margin above the desktop will always cover the gtk4-ding window.

To identify and exclude the gtk4-ding window from other overlapping windows for your object, and to set transparency and intellihide correctly, the following properties can be used on the Meta.Window
returned to see if it is the gtk4-desktop window-
* property Meta.WindowType.DESKTOP is true - with all the latest iterations of gtk4-ding with any language call. Same with get_window_type() on all latest versions of the extension and app.
* get_window_type() will return Meta.WindowType.Desktop in javascript shell code only, even with older version of gtk4-ding even if the property does not show Meta.WindowType.DESKTOP. This was accomplished by javascript overrides - not very pretty.
* In javascript shell code, the window has a javascript over-ride object, 'customJS_ding', ie window.customJS_ding will always return true.
* Will also have property skip_taskbar TRUE. Same for get_skip_taskbar() in any language.
* get_application_id() will return the app-id 'com.desktop.ding'.

Of all these methods, the first is the most important and should work with all newer versions of gtk4-ding, however is more generic as other windows can also be of type 'DESKTOP', and the last is the most specific.

## Launching the Desktop Icons application stand-alone

It is possible to launch the desktop icons application in stand-alone mode to do debugging and testing, but, of course, it will behave as a classic Gtk program: there will be a window with its title bar, and the background won't be transparent (it could be, but since the idea is to do debug, it is better this way). To do so, just launch 'app/ding.js' from the base repository directory. If it can't find the schemas file, just enter the 'schemas' folder and type 'glib-compile-schemas .', and retry.

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
  * -M: specifies which monitor is the primary index, Any new file icons are added there first.
  * -V: pass the gnome shell version to the program, used internally in the program for older versions of gnome to tailor behavior.
  * -v: Pass the program version shown in preferences, independent of the version on extensions.gnome.org.
  * -U: Pass the uuid to use as the gtk app-id.

Seen ding.js for all the possible command line parameters.