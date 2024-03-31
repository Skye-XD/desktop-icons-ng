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

Other than using the Gtk4 toolkit, and now libadwaita, it in addition it has several new features, fixes and enhancements.

## Features and Fixes

New Features and fixes are listed in [FEATURES.md](https://gitlab.com/smedius/desktop-icons-ng/-/blob/main/FEATURES.md?ref_type=heads) in this folder.


## Issues

All issues are tracked on the GitLab web site. Please do a search through closed issues as well.

All known important issues are listed in [ISSUES.md](https://gitlab.com/smedius/desktop-icons-ng/-/blob/main/ISSUES.md?ref_type=heads) in this folder. 

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

## Contributing

Fixes are welcome. Please post fixes and new ideas with an MR at GitLab. All issues there as well. Posting issues at org.gnome.extensions review of the extension web site helps no one, those issues are not tracked, and unlikely fixed.

There are ESLint rules in the repository, if able, please run ESLint on all contributions so that they follow GJS/Gnome guidelines. The ESLint.json is in the repository. The eslint-gjs.yml and eslint-shell.yml files are in the lint folder of the repository.

**Internal architecture, integration with other extensions, debugging**

The internal architechture and integration with other extensions, as well as debugging is discussed in [DEBUGGING.md](https://gitlab.com/smedius/desktop-icons-ng/-/blob/main/DEBUGGING.md?ref_type=heads) in this folder.

**Translations**

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
