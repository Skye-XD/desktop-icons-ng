# Gtk4/libadwaita DING Desktop Icons New Generation


<p style="text-align: center;">
    <a href="https://extensions.gnome.org/extension/5263/gtk4-desktop-icons-ng-ding/" style="margin-left: 20px">
        <img src="/media/Screenshot.png" width="800px"/>
    </a>
</p>

## What is it?

Gtk4 Desktop Icons NG is an extension and a program together for the GNOME Shell that renders icons on the desktop. It is a fork from DING.

Desktop Icons NG (DING) by Sergio Costas itself is a fork/rewrite of the official 'Desktop Icons' extension, originally by Carlos Soriano.

This new Gtk4 extension was originally submitted upstream to the DING project as a merge request. It was not merged for quite some time with development continuing on both branches simultaneously. The branches started diverging significantly, and further, the new commit's in gtk3-DING branch were not easily adaptable to changes already made in the gtk4 branch. That has since made it very difficult to rebase and merge all the new changes to the Gtk3 branch. A mutual decision was therefore made to continue independent development of both branches. Important bug fixes from branches are still back ported and forward-ported between them. Therefore there are two extensions available, the classic Gtk3 DING and this newer, l Gtk4/libadwaita branch.

This fork of DING is ported to use the Gtk4 toolkit, and now has been ported to libadwaita. This, and the original DING can both be installed together, but only one can be activated at a time in the extension Manager. They use different install directories and GSettings schemas, therefore preferences set in one will not carrry through to the other. This is to avoid trampling on the stable branch and isolate errors from this branch.

Other than using the Gtk4 toolkit, and now libadwaita, it in addition it has several new features, fixes and enhancements. New Features and fixes are listed in FEATURES.md in this folder.

All known issues are listed in ISSUES.md. All issues are tracked on the GitLab web site.

## Requirements

* GNOME Shell >= 40
* Nautilus >= 3.38
* File-roller >= 3.38 or Gnome AutoAr (including gir1.2 files)
* Desktop folder already created
* GJS (Nix OS specifically needs this installed separately)
* For X11 xprop should be installed and executable, will work even without it, however things will work better and be more seamless without emulation if it is available.

## Installation

<p style="text-align: left;">
    <a href="https://extensions.gnome.org/extension/5263/gtk4-desktop-icons-ng-ding/" style="margin-left: 20px">
        <img src="/media/svg/Gnome_logo.svg" width="120px"/>
    </a>
</p>
<p style="text-align: left;">
The extension can be installed from [extensions.gnome.org](https://extensions.gnome.org/extension/5263/gtk4-desktop-icons-ng-ding/).
</p>

This should work out of the box for <b><u>Debian, Fedora</b></u>

<p style="text-align: left;">
For <b><u>Arch Linux</b></u>, (and if needed, <b><u>Manjaro</b></u>), it is available in AUR [here](https://aur.archlinux.org/packages/gnome-shell-extension-gtk4-desktop-icons-ng). Default install from extensions.gnome.org should also work.
</p>
<p style="text-align: left;">
For <b><u>Manjaro</b></u>, a native maintained build is available in the Manjaro Repository that can be installed directly with pacman and other tools. [Download](https://software.manjaro.org/package/gnome-shell-extension-gtk4-desktop-icons-ng) from Manjaro Community Repository available.
</p>

For <b><u>Nix OS</b></u>, please see additional manual installation instructions in the section below.

<b><u>Ubuntu</b></u> requires manual installation, see instructions below.

For <b><u>Slackware Linux</b></u>, it is available in GFS [here](https://reddoglinux.ddns.net/linux/gnome/45.x/source/_extensions/gnome-shell-extension-desktop-icons-ng/). Default install from extensions.gnome.org should also work.

## Manual installation

The easiest way of installing DING is to run the `scripts/local_install.sh` script from the source directory (after changing directory to the source directory). The script assumes that it is being called from the base of the source directory. It performs the build steps specified in the next sections.

If there are special steps to build and install the extension and app on your repository, please submit an MR to this Readme.md to help other users on the same distribution. Some NIX Os users very very helpful in doing that. Also local_install.sh in the scripts directory does read /etc/lsb-release, and any variables set there are imported into the script. Any variations necessary to install the extension and app can then be easily coded based on those variables at the end of the script. (See the Ubuntu example there already). I will be happy to include all changes necessary for your distribution in that script. Please submit an MR for that.

<b><u>Ubuntu</b></u>

In Ubuntu Jammy and probably later, the Ubuntu session is locked and only the default Ubuntu extensions run. Ubuntu runs it's own Desktop Icon Extension. Therefore, installing the extension from extensions.gnome.org will not work directly. The install script provided in the repository bypasses this and installs this as a manually installed extension. The default Desktop Icons extension that ships with Ubuntu then needs to be deactivated, and the manually installed one activated.

The other way to update to the newest one in Ubuntu is to install the "gnome-session" package, to enable the use of a standard gnome shell session, and in that session install the following extensions from extensions.gnome.org:

* This Extension
* Dash to dock
* Appindicator and KstatusNotifierItem support

That will allow the experience similar to the original Ubuntu desktop, but with the most recent versions of the extensions, without the default Ubuntu Desktop Icons Extension.

<b><u>Nix OS</b></u>

Manual Fix to enable extension (tested in NixOS 23.05, GNOME 44.2, gtk4-ding extension version 38). We need to add the following in the configs:

Install gjs-

```
environment.systemPackages = with pkgs; [
  gjs
];
``````
Expose schema of nautilus-


```
services.xserver.desktopManager.gnome.extraGSettingsOverridePackages = with pkgs; [
  gnome.nautilus
  #gnome.mutter # should not be needed
  #gtk4 # should not be needed
];
``````

Logout and log back in. Enable the extension manually. For some reason, home-manager configs cannot enable the extension using dconf.settings.

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

## Contributing

Fixes are welcome. Please post fixes and new ideas with an MR at GitLab. All issues there as well. Posting issues at org.gnome.extensions review of the extension web site helps no one, those issues are not tracked, and unlikely fixed.

There are ESLint rules in the repository, if able, please run ESLint on all contributions so that they follow GJS/Gnome guidelines. The ESLint.json is in the repository. The eslint-gjs.yml and eslint-shell.yml files are in the lint folder of the repository.

Translations are welcome, the project uses gettext/ngetext, there are PO/POT files in the repository. You can help translate Gtk4 Desktop Icons NG on [Hosted Weblate](https://hosted.weblate.org/projects/gtk4-desktop-icons-ng/gtk4-ding-pot/). Translations are only accepted from that web site, it is crowd sourced and translations need to be approved and voted on if anonymous, they are less likely to have mistakes. The site also uses machine translation engines. Also direct translations accepted to PO/POT files in the past have broken the app and extension, the Weblate web sites creates clean PO/POT files that don't break gtk4-ding.
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
