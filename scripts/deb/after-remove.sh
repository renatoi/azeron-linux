#!/bin/bash
# .deb postrm — combines electron-builder's default (drop update-alternatives
# symlink) with removal of the Azeron udev rule. Variables in ${...} are
# substituted by electron-builder before install.
#
# dpkg invokes postrm with $1 in {remove, purge, upgrade, failed-upgrade,
# abort-install, abort-upgrade, disappear}. Gate the udev-rule removal on
# remove/purge so an upgrade — where this script runs after files are
# unpacked, before the new postinst — doesn't undo the new package's setup
# if the new postinst then fails.

# --- electron-builder default ---------------------------------------------

# Delete the link to the binary
if type update-alternatives >/dev/null 2>&1; then
    update-alternatives --remove '${executable}' '/usr/bin/${executable}'
else
    rm -f '/usr/bin/${executable}'
fi

# --- Azeron udev rules ----------------------------------------------------

if [ "$1" = "remove" ] || [ "$1" = "purge" ]; then
    UDEV_DST='/etc/udev/rules.d/99-azeron.rules'

    if [ -f "$UDEV_DST" ]; then
        rm -f "$UDEV_DST"
        if command -v udevadm >/dev/null 2>&1; then
            udevadm control --reload-rules || true
        fi
    fi
fi

exit 0
