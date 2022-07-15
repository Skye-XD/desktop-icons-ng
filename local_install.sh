#!/bin/bash

rm -rf ~/.local/share/gnome-shell/extensions/ding@rastersoft.com/*
rm -rf .build
mkdir .build
meson --prefix=$HOME/.local/ --localedir=share/gnome-shell/extensions/ding@rastersoft.com/locale .build
ninja -C .build install
rm -rf .build

if  ( cat /etc/lsb-release | grep -o 'Ubuntu 22.04 LTS' ); then
    echo "Installing for Ubuntu 22.04...."
    rm -rf ~/.local/share/gnome-shell/extensions/dingubuntu@rastersoft.com
    mv ~/.local/share/gnome-shell/extensions/ding@rastersoft.com ~/.local/share/gnome-shell/extensions/dingubuntu@rastersoft.com
    sed -i "s#ding@rastersoft#dingubuntu@rastersoft#" ~/.local/share/gnome-shell/extensions/dingubuntu@rastersoft.com/metadata.json
    echo "Completed"
fi
