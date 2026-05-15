#!/bin/bash
# .rpm postuninstall — combines electron-builder's default (drop
# update-alternatives symlink) with removal of the Azeron udev rule.
# Variables in ${...} are substituted by electron-builder before install.
#
# RPM scriptlet arg: $1 = remaining install count after the operation.
#   0 = full uninstall, 1 = upgrade (new version still installed).
# Gate the udev-rule removal on $1=0 so an upgrade doesn't wipe the
# rule that the new package's %post just installed.

# --- electron-builder default ---------------------------------------------

# Delete the link to the binary
if type update-alternatives >/dev/null 2>&1; then
    update-alternatives --remove '${executable}' '/usr/bin/${executable}'
else
    rm -f '/usr/bin/${executable}'
fi

# --- Azeron udev rules ----------------------------------------------------

if [ "$1" = "0" ]; then
    UDEV_DST='/etc/udev/rules.d/99-azeron.rules'

    if [ -f "$UDEV_DST" ]; then
        rm -f "$UDEV_DST"
        if command -v udevadm >/dev/null 2>&1; then
            udevadm control --reload-rules || true
        fi
    fi
fi

exit 0
