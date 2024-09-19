#!/bin/bash

rm -rf ~/.local/share/gnome-shell/extensions/gtk4-ding@smedius.gitlab.com/*
rm -rf .build
mkdir .build
meson setup --prefix=$HOME/.local/ --localedir=share/gnome-shell/extensions/gtk4-ding@smedius.gitlab.com/locale ./ .build
ninja -C .build install
rm -rf .build

if [ -f /etc/lsb-release ]; then
    . /etc/lsb-release
fi

# Local Distribution specefic methods can be coded here

if  [ "$DISTRIB_ID" = "Ubuntu" ] && (($(bc <<< "$DISTRIB_RELEASE > 22"))); then
    echo "Installing Locally for Ubuntu Jammy and later...."
    rm -rf ~/.local/share/gnome-shell/extensions/gtk4-dingubuntu@smedius.gitlab.com
    mv ~/.local/share/gnome-shell/extensions/gtk4-ding@smedius.gitlab.com ~/.local/share/gnome-shell/extensions/gtk4-dingubuntu@smedius.gitlab.com
    sed -i "s#gtk4-ding@smedius#gtk4-dingubuntu@smedius#" ~/.local/share/gnome-shell/extensions/gtk4-dingubuntu@smedius.gitlab.com/metadata.json
    echo "Completed"
    echo "System install recommended for full functionality, please see AppArmor information on web site"
fi
