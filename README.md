# Azeron Software for Linux

Unofficial Linux repackage of the [Azeron](https://azeron.eu) keypad configuration software (v1.5.6). Provides full feature parity with the Windows version — button remapping, profile management, thumbstick calibration, LED control, and firmware updates.

## Supported Devices

- Azeron Classic / Compact
- Azeron Cyborg
- Azeron Cyborg II
- Azeron Cyro / Cyro Lefty
- Azeron Keyzen

## Prerequisites

**Arch Linux:**

```bash
sudo pacman -S --needed hidapi libusb dfu-util
```

`dfu-util` is only required for firmware updates.

## Installation

### Option A: AppImage (any distro)

Download the AppImage from the [releases page](https://github.com/renatoi/azeron-linux/releases), make it executable, and run:

```bash
chmod +x azeron-software-1.5.6-x86_64.AppImage
./azeron-software-1.5.6-x86_64.AppImage
```

### Option B: makepkg (Arch Linux)

```bash
git clone https://github.com/renatoi/azeron-linux.git
cd azeron-linux
makepkg -si
```

This builds and installs the package in one step. It also installs udev rules automatically.

## Udev Rules

The Azeron device communicates via HID, which requires permission to access `/dev/hidraw*`. If you installed via `makepkg -si`, the udev rules are already in place. Otherwise, install them manually:

```bash
sudo cp assets/99-azeron.rules /etc/udev/rules.d/
sudo udevadm control --reload-rules
sudo udevadm trigger
```

**Re-plug your Azeron device** after installing the rules.

## Building from Source

### Quick start

```bash
sudo pacman -S --needed hidapi libusb nodejs npm p7zip
git clone git@github.com:renatoi/azeron-linux.git
cd azeron-linux
bash scripts/setup.sh
npm run build
```

The setup script installs npm dependencies, rebuilds `node-hid` for Linux, applies Linux patches, and installs udev rules. Build output goes to the `output/` directory.

### Manual steps

If you prefer to run each step yourself:

```bash
# 1. Install system and npm dependencies
sudo pacman -S --needed hidapi libusb nodejs npm
npm install

# 2. Install app dependencies and rebuild node-hid for Electron 30
cd app
npm install node-hid@2.2.0
cd ..
npx @electron/rebuild -f -w node-hid -m app -v 30.0.9

# 3. Apply Linux patches
node scripts/patch-main.js

# 4. Build packages (AppImage + pacman)
npm run build
```

### Patches

`node scripts/patch-main.js` applies 8 targeted string replacements to the minified `main-process.js`. The script fails with an error if any search string is not found, which signals that an upstream update changed something that needs attention.

| Patch | Description |
|-------|-------------|
| fix-platform-string | Fix `e.Linux="Linux"` to lowercase `"linux"` |
| fix-tray-icon | Resolve tray icon path using `process.resourcesPath` |
| fix-app-root-path | Use `process.execPath` for reliable root path detection |
| disable-auto-updater | Disable S3 auto-update (no Linux builds on their CDN) |
| fix-dfu-util-name | Replace `dfu-util-static` with system `dfu-util` |
| fix-login-items-1/2/3 | Skip `setLoginItemSettings` on Linux (unsupported API) |

### Running in development mode

```bash
npm start -- --no-sandbox
```

## Checking for Updates

The update script checks the Azeron S3 feed for new releases and compares against the version recorded in `build-manifest.json`:

```bash
# Check only
bash scripts/check-update.sh

# Check, download, rebuild, and repackage automatically
bash scripts/check-update.sh --apply
```

With `--apply`, the script will:
1. Download the new installer and verify its SHA-512 checksum
2. Extract the Electron app from the NSIS installer
3. Replace `app/dist`, `app/node_modules`, and firmware files
4. Rebuild `node-hid` for Linux
5. Apply all Linux patches (fails loudly if a patch no longer matches)
6. Update `build-manifest.json` with the new version
7. Build AppImage and pacman packages

If any step fails, it reports all errors at the end.

## Troubleshooting

### Device not detected

1. Check that the device shows up on USB:
   ```bash
   lsusb -d 16d0:
   ```
2. Verify udev rules are installed and reloaded (see above).
3. Check hidraw permissions:
   ```bash
   ls -l /dev/hidraw*
   ```
   Devices should have `crw-rw-rw-` permissions after udev rules are applied.

### "cannot open device with path /dev/hidrawN"

This is a permission error. Install the udev rules and re-plug the device.

### App crashes on launch

Try running with `--no-sandbox`:

```bash
./azeron-software-1.5.6-x86_64.AppImage --no-sandbox
```

Or set the environment variable:

```bash
ELECTRON_DISABLE_SANDBOX=1 ./azeron-software-1.5.6-x86_64.AppImage
```

### Firmware updates

Firmware updates require `dfu-util` installed on the system. The device enters DFU mode (STM32 bootloader at `0483:df11`) during the update. The udev rules already grant access to this bootloader device.

## How It Works

The official Azeron Software is an Electron app that communicates with the keypad via USB HID reports. The device exposes 5 USB interfaces; interface 4 (`hidraw`) is used for configuration. The app sends commands using either a text-based protocol (legacy firmware) or a binary protocol (modern firmware like the Cyborg II).

This project extracts the original app from the Windows installer, rebuilds the native `node-hid` module for Linux, and applies minimal patches for platform compatibility. No protocol reimplementation is needed — the original app logic runs as-is.

## Project Structure

```
azeron-linux/
  app/
    dist/                 # Webpack bundles (unpatched; patched during build)
    src/resources/        # Tray icon, proving-ground profiles
    package.json          # App metadata and dependencies
  assets/
    99-azeron.rules       # Udev rules for device access
  build/
    icon.png              # App icon
  firmware/               # Firmware binaries for all Azeron models
  scripts/
    patch-main.js         # Linux compatibility patches
    setup.sh              # Automated setup script
    check-update.sh       # Check for new Azeron releases + auto-update
  build-manifest.json     # Tracks upstream version and checksum
  package.json            # Build config (electron-builder)
  PKGBUILD                # Arch Linux / AUR build recipe
```

## Credits

- [Azeron](https://azeron.eu) for the original software and hardware
- [noreza](https://github.com/Caedis/noreza) — Linux input mapper for Azeron (alternative approach)
- [azeron-cli](https://github.com/cozyGalvinism/azeron-cli) — early Rust-based protocol reverse engineering

## License

This is an unofficial repackage for personal use. The original Azeron Software is proprietary. Firmware binaries are property of Azeron LTD.
