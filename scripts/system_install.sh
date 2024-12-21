#!/bin/bash

rm -rf .build
mkdir .build
meson setup ./ .build
ninja -C .build install

rm -rf .build