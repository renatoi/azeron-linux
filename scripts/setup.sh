#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== Azeron Linux Setup ==="

# Check dependencies
echo "Checking system dependencies..."
MISSING=()
command -v dfu-util >/dev/null 2>&1 || MISSING+=("dfu-util")
pacman -Q hidapi >/dev/null 2>&1 || MISSING+=("hidapi")
pacman -Q libusb >/dev/null 2>&1 || MISSING+=("libusb")

if [ ${#MISSING[@]} -gt 0 ]; then
    echo "Installing missing packages: ${MISSING[*]}"
    sudo pacman -S --needed "${MISSING[@]}"
fi

# Install build dependencies
echo "Installing npm dependencies..."
cd "$PROJECT_DIR"
npm install

# Rebuild node-hid for Linux + Electron 30
echo "Rebuilding node-hid native module for Electron 30..."
npx @electron/rebuild -f -w node-hid -m app

# Apply Linux patches
echo "Applying Linux patches to main-process.js..."
node scripts/patch-main.js

# Install udev rules
if [ ! -f /etc/udev/rules.d/99-azeron.rules ]; then
    echo "Installing udev rules (requires sudo)..."
    sudo cp assets/99-azeron.rules /etc/udev/rules.d/99-azeron.rules
    sudo udevadm control --reload-rules
    sudo udevadm trigger
    echo "Udev rules installed. You may need to re-plug your Azeron device."
else
    echo "Udev rules already installed."
fi

echo ""
echo "=== Setup complete ==="
echo "Run 'npm start' to launch the app"
echo "Run 'npm run build' to build packages"
