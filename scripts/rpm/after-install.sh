#!/bin/bash
# .rpm postinstall — combines electron-builder's default linux postinst
# (update-alternatives symlink, chrome-sandbox SUID, mime/desktop database
# refresh) with the Azeron-specific udev rule install. Variables in
# ${...} are substituted by electron-builder before this script lands in
# the .rpm (see node_modules/app-builder-lib/templates/linux/after-install.tpl).

# --- electron-builder default ---------------------------------------------

if type update-alternatives 2>/dev/null >&1; then
    # Remove previous link if it doesn't use update-alternatives
    if [ -L '/usr/bin/${executable}' -a -e '/usr/bin/${executable}' -a "`readlink '/usr/bin/${executable}'`" != '/etc/alternatives/${executable}' ]; then
        rm -f '/usr/bin/${executable}'
    fi
    update-alternatives --install '/usr/bin/${executable}' '${executable}' '/opt/${sanitizedProductName}/${executable}' 100 || ln -sf '/opt/${sanitizedProductName}/${executable}' '/usr/bin/${executable}'
else
    ln -sf '/opt/${sanitizedProductName}/${executable}' '/usr/bin/${executable}'
fi

# Check if user namespaces are supported by the kernel and working with a quick test:
if ! { [[ -L /proc/self/ns/user ]] && unshare --user true; }; then
    # Use SUID chrome-sandbox only on systems without user namespaces:
    chmod 4755 '/opt/${sanitizedProductName}/chrome-sandbox' || true
else
    chmod 0755 '/opt/${sanitizedProductName}/chrome-sandbox' || true
fi

if hash update-mime-database 2>/dev/null; then
    update-mime-database /usr/share/mime || true
fi

if hash update-desktop-database 2>/dev/null; then
    update-desktop-database /usr/share/applications || true
fi

# --- Azeron udev rules ----------------------------------------------------
# The .deb ships the udev rules at /opt/${sanitizedProductName}/udev/99-azeron.rules
# but they need to be at /etc/udev/rules.d/99-azeron.rules for the kernel to
# apply them. Without this, users hit "cannot open device with path
# /dev/hidraw*" because the default permission mask blocks non-root access
# (see issue #21).

UDEV_SRC='/opt/${sanitizedProductName}/udev/99-azeron.rules'
UDEV_DST='/etc/udev/rules.d/99-azeron.rules'

if [ -f "$UDEV_SRC" ]; then
    install -m 644 "$UDEV_SRC" "$UDEV_DST"
    if command -v udevadm >/dev/null 2>&1; then
        udevadm control --reload-rules || true
        udevadm trigger --subsystem-match=hidraw --subsystem-match=usb --action=change || true
    fi
    echo "Azeron udev rules installed at $UDEV_DST."
    echo "If your Azeron is currently connected, unplug and replug it for the rules to apply."
else
    echo "Warning: $UDEV_SRC not found; install udev rules manually from /opt/${sanitizedProductName}/udev/." >&2
fi

exit 0
