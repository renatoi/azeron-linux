#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
MANIFEST="$PROJECT_DIR/build-manifest.json"
FEED_URL="https://azeron-public.s3.amazonaws.com/keypad-builds/latest.yml"
TMPDIR="/tmp/azeron-update-$$"
ERRORS=()
PATCH_TARGET="${AZERON_PATCH_TARGET:-linux}"

error() {
    ERRORS+=("$1")
    echo "ERROR: $1" >&2
}

cleanup() {
    rm -rf "$TMPDIR"
}
trap cleanup EXIT

# Parse current manifest
CURRENT_VERSION=$(grep -oP '"version":\s*"\K[^"]+' "$MANIFEST")
CURRENT_SHA512=$(grep -oP '"sha512":\s*"\K[^"]+' "$MANIFEST")

echo "=== Azeron Update Check ==="
echo "Current build: v$CURRENT_VERSION"
echo ""

# Fetch upstream latest.yml
echo "Fetching upstream version info..."
LATEST_YML=$(curl -sfL "$FEED_URL") || {
    error "Failed to fetch $FEED_URL"
    exit 1
}

UPSTREAM_VERSION=$(echo "$LATEST_YML" | grep -oP '^version:\s*\K\S+')
UPSTREAM_SHA512=$(echo "$LATEST_YML" | grep -oP '^sha512:\s*\K\S+')
UPSTREAM_DATE=$(echo "$LATEST_YML" | grep -oP "^releaseDate:\s*'\K[^']+" || echo "unknown")
UPSTREAM_FILE=$(echo "$LATEST_YML" | grep -oP '^path:\s*\K\S+')
UPSTREAM_URL="https://azeron-public.s3.amazonaws.com/keypad-builds/$UPSTREAM_FILE"

echo "Upstream:      v$UPSTREAM_VERSION (released $UPSTREAM_DATE)"
echo ""

if [ "$CURRENT_VERSION" = "$UPSTREAM_VERSION" ] && [ "$CURRENT_SHA512" = "$UPSTREAM_SHA512" ]; then
    echo "UP TO DATE - no action needed."
    exit 0
fi

if [ "$CURRENT_VERSION" = "$UPSTREAM_VERSION" ]; then
    echo "WARNING: Same version but different checksum. Azeron may have re-released."
    echo "  Ours:     $CURRENT_SHA512"
    echo "  Upstream: $UPSTREAM_SHA512"
fi

echo "UPDATE AVAILABLE: v$CURRENT_VERSION -> v$UPSTREAM_VERSION"
echo ""

if [ "${1:-}" != "--apply" ]; then
    echo "Run with --apply to download and rebuild automatically:"
    echo "  bash scripts/check-update.sh --apply"
    exit 2  # exit 2 = update available (0 = up to date, 1 = error)
fi

# --- Auto-update mode ---
echo "=== Downloading v$UPSTREAM_VERSION ==="
mkdir -p "$TMPDIR"
INSTALLER="$TMPDIR/$UPSTREAM_FILE"

curl -Lo "$INSTALLER" "$UPSTREAM_URL" || {
    error "Failed to download $UPSTREAM_URL"
    exit 1
}

# Verify checksum
echo "Verifying checksum..."
EXPECTED_HEX=$(echo "$UPSTREAM_SHA512" | base64 -d | xxd -p | tr -d '\n')
ACTUAL_HEX=$(sha512sum "$INSTALLER" | awk '{print $1}')

if [ "$EXPECTED_HEX" != "$ACTUAL_HEX" ]; then
    error "Checksum mismatch!"
    echo "  Expected: $EXPECTED_HEX"
    echo "  Got:      $ACTUAL_HEX"
    exit 1
fi
echo "Checksum OK."

# Extract
echo ""
echo "=== Extracting ==="
7z x -o"$TMPDIR/extract" "$INSTALLER" -y > /dev/null || {
    error "Failed to extract NSIS installer"
    exit 1
}

7z x -o"$TMPDIR/app" "$TMPDIR/extract/\$PLUGINSDIR/app-64.7z" -y > /dev/null || {
    error "Failed to extract app-64.7z"
    exit 1
}

npx --yes @electron/asar extract "$TMPDIR/app/resources/app.asar" "$TMPDIR/asar" || {
    error "Failed to extract app.asar"
    exit 1
}

# Update app source
echo ""
echo "=== Updating app source ==="
rm -rf "$PROJECT_DIR/app/dist" "$PROJECT_DIR/app/package.json"
cp -r "$TMPDIR/asar/dist" "$PROJECT_DIR/app/dist"
cp "$TMPDIR/asar/package.json" "$PROJECT_DIR/app/package.json"

# Preserve node_modules but reinstall node-hid
rm -rf "$PROJECT_DIR/app/node_modules"
cp -r "$TMPDIR/asar/node_modules" "$PROJECT_DIR/app/node_modules"

# Update firmware
echo "Updating firmware..."
cp "$TMPDIR/app/firmware/"*.bin "$TMPDIR/app/firmware/"*.hex "$PROJECT_DIR/firmware/" 2>/dev/null || true

# Copy update-notes and tray icon
cp "$TMPDIR/app/update-notes.json" "$PROJECT_DIR/app/" 2>/dev/null || true
cp "$TMPDIR/app/src/resources/tray.ico" "$TMPDIR/tray.ico" 2>/dev/null || true
if [ -f "$TMPDIR/tray.ico" ]; then
    # Convert ico to png if we have ImageMagick, otherwise keep existing png
    if command -v convert >/dev/null 2>&1; then
        convert "$TMPDIR/tray.ico" "$PROJECT_DIR/app/src/resources/tray.png" 2>/dev/null || true
    fi
fi

# Copy proving-ground-profiles
if [ -d "$TMPDIR/app/src/resources/proving-ground-profiles" ]; then
    rm -rf "$PROJECT_DIR/app/src/resources/proving-ground-profiles"
    cp -r "$TMPDIR/app/src/resources/proving-ground-profiles" "$PROJECT_DIR/app/src/resources/"
fi

# Rebuild node-hid
echo ""
echo "=== Rebuilding node-hid ==="
cd "$PROJECT_DIR/app"
npm install node-hid@2.2.0 2>&1 || {
    error "Failed to install node-hid"
}
cd "$PROJECT_DIR"

ELECTRON_VERSION=$(grep -oP '"electron":\s*"\K[^"]+' "$PROJECT_DIR/package.json")
npx @electron/rebuild -f -w node-hid -m app -v "$ELECTRON_VERSION" 2>&1 || {
    error "Failed to rebuild node-hid for Electron $ELECTRON_VERSION"
}

# Save unpatched backup (CI restores this before committing so committed source stays platform-neutral)
cp "$PROJECT_DIR/app/dist/main-process.js" "$PROJECT_DIR/app/dist/main-process.js.unpatched"

# Apply patches
echo ""
echo "=== Applying patches (target: $PATCH_TARGET) ==="
AZERON_PATCH_TARGET="$PATCH_TARGET" node "$PROJECT_DIR/scripts/patch-main.js" || {
    error "Patches failed - the new version may have changed. Manual patch updates needed."
}

# Remove Windows-only files
rm -f "$PROJECT_DIR/app/node_modules/ps-list/vendor/fastlist"*.exe 2>/dev/null || true
rm -rf "$PROJECT_DIR/app/dist/win-unpacked" 2>/dev/null || true

# Update manifest
echo ""
echo "=== Updating build manifest ==="
cat > "$MANIFEST" <<EOF
{
  "upstream": {
    "version": "$UPSTREAM_VERSION",
    "sha512": "$UPSTREAM_SHA512",
    "releaseDate": "$UPSTREAM_DATE",
    "url": "$UPSTREAM_URL"
  },
  "feed": "$FEED_URL",
  "patches": $(node -e "
    const fs = require('fs');
    const s = fs.readFileSync('$PROJECT_DIR/scripts/patch-main.js','utf8');
    const m = s.match(/patches\.push/g);
    console.log(m ? m.length : 'null');
  "),
  "buildDate": "$(date +%Y-%m-%d)"
}
EOF

# Update version in root package.json
sed -i "s/\"version\": \"$CURRENT_VERSION\"/\"version\": \"$UPSTREAM_VERSION\"/" "$PROJECT_DIR/package.json"

# Update PKGBUILD pkgver
if [ -f "$PROJECT_DIR/PKGBUILD" ]; then
    sed -i "s/^pkgver=.*/pkgver=$UPSTREAM_VERSION/" "$PROJECT_DIR/PKGBUILD"
    echo "Updated PKGBUILD pkgver to $UPSTREAM_VERSION"
fi

# Build
echo ""
echo "=== Building packages ==="
BUILD_TARGETS="${BUILD_TARGETS:-AppImage deb rpm pacman}"
npx electron-builder --linux $BUILD_TARGETS 2>&1 || {
    error "electron-builder failed"
}

# Report
echo ""
echo "==============================="
if [ ${#ERRORS[@]} -eq 0 ]; then
    echo "UPDATE COMPLETE: v$CURRENT_VERSION -> v$UPSTREAM_VERSION"
    echo ""
    echo "Output:"
    ls -lh "$PROJECT_DIR/output/azeron-software-"* 2>/dev/null
else
    echo "UPDATE FINISHED WITH ${#ERRORS[@]} ERROR(S):"
    for e in "${ERRORS[@]}"; do
        echo "  - $e"
    done
    exit 1
fi
