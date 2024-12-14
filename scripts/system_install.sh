#!/bin/bash

rm -rf .build
mkdir .build
meson setup --prefix=/usr  ./ .build
ninja -C .build install

rm -rf .build