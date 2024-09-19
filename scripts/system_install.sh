#!/bin/bash

rm -rf .build
mkdir .build
meson setup --prefix=/usr --localedir=share/locale ./ .build
ninja -C .build install

rm -rf .build