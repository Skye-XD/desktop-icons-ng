#!/bin/bash

echo 'Checking apparmor status..'

if systemctl status apparmor > /dev/null ; then
    echo 'Reloading apparmor rules...';
    systemctl restart apparmor;
else
    echo 'Apparmor not running, skipping'
fi