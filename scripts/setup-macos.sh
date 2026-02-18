#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== Azeron macOS Setup (arm64) ==="

if ! xcode-select -p >/dev/null 2>&1; then
  echo "Xcode Command Line Tools not found. Installing..."
  xcode-select --install || true
  echo "Re-run this script after the installation completes."
  exit 1
fi

if ! command -v brew >/dev/null 2>&1; then
  echo "Homebrew is required. Install from https://brew.sh and re-run."
  exit 1
fi

echo "Checking Homebrew packages..."
BREW_MISSING=()
for pkg in node dfu-util libusb hidapi python@3; do
  brew ls --versions "$pkg" >/dev/null 2>&1 || BREW_MISSING+=("$pkg")
done

if [ ${#BREW_MISSING[@]} -gt 0 ]; then
  echo "Installing missing packages: ${BREW_MISSING[*]}"
  brew install "${BREW_MISSING[@]}"
else
  echo "All brew dependencies present."
fi

echo "Installing npm dependencies..."
cd "$PROJECT_DIR"
npm install

echo "Rebuilding node-hid for Electron arm64..."
cd "$PROJECT_DIR/app"
npm install node-hid@2.2.0
cd "$PROJECT_DIR"
ELECTRON_VERSION=$(node -p "require('./package.json').devDependencies.electron")
npx @electron/rebuild -f -w node-hid -m app -v "$ELECTRON_VERSION"

echo "Applying macOS patches..."
AZERON_PATCH_TARGET=darwin node "$PROJECT_DIR/scripts/patch-main.js"

echo ""
echo "=== macOS setup complete ==="
echo "Run 'npm run build:mac' to produce a dmg/zip (arm64)."
echo "Run 'npm start' to launch the app locally."
