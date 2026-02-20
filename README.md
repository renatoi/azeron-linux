# Azeron Software for Linux and macOS

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
sudo pacman -S --needed hidapi libusb python usbutils dfu-util
```

**Debian / Ubuntu:**

```bash
sudo apt install libhidapi-hidraw0 libusb-1.0-0 python3 usbutils dfu-util
```

**Fedora:**

```bash
sudo dnf install hidapi libusb1 python3 usbutils dfu-util
```

**openSUSE:**

```bash
sudo zypper install libhidapi-hidraw0 libusb-1_0-0 python3 usbutils dfu-util
```

**macOS (Apple Silicon):**

```bash
brew install node dfu-util libusb hidapi python@3
```

`dfu-util` is only required for firmware updates.

## Installation

Releases are built automatically — a weekly CI job checks for new upstream Azeron versions and publishes updated packages to the [releases page](https://github.com/renatoi/azeron-linux/releases).

### Option A: AppImage (any distro)

Download the latest `.AppImage` from the [releases page](https://github.com/renatoi/azeron-linux/releases), make it executable, and run:

```bash
chmod +x azeron-software-*-x64.AppImage
./azeron-software-*-x64.AppImage
```

### Option B: .deb (Debian / Ubuntu)

Download the latest `.deb` from the [releases page](https://github.com/renatoi/azeron-linux/releases) and install:

```bash
sudo dpkg -i azeron-software-*-amd64.deb
```

### Option C: .rpm (Fedora / openSUSE)

Download the latest `.rpm` from the [releases page](https://github.com/renatoi/azeron-linux/releases) and install:

```bash
sudo rpm -i azeron-software-*-x86_64.rpm
```

### Option D: AUR (Arch Linux)

```bash
yay -S azeron-software
```

### Option E: makepkg (Arch Linux, from source)

```bash
git clone https://github.com/renatoi/azeron-linux.git
cd azeron-linux
makepkg -si
```

This builds and installs the package in one step. It also installs udev rules automatically.

### Option F: Homebrew (macOS, Apple Silicon)

```bash
brew install --cask renatoi/azeron-linux/azeron-software
```

Or download the latest `.zip` from the [releases page](https://github.com/renatoi/azeron-linux/releases), extract, and drag to Applications. Gatekeeper will prompt on first launch; right-click -> Open to trust the build.

> **Note:** Only Apple Silicon (arm64) is supported.

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

Install build dependencies for your distro:

**Arch Linux:**

```bash
sudo pacman -S --needed hidapi libusb nodejs npm p7zip
```

**Debian / Ubuntu:**

```bash
sudo apt install libhidapi-dev libusb-1.0-0-dev nodejs npm p7zip-full
```

**Fedora:**

```bash
sudo dnf install hidapi-devel libusb1-devel nodejs npm p7zip
```

**macOS (Apple Silicon):**

```bash
brew install node dfu-util libusb hidapi python@3
```

Then clone and build:

```bash
git clone https://github.com/renatoi/azeron-linux.git
cd azeron-linux
bash scripts/setup.sh
npm run build
```

The setup script installs npm dependencies, rebuilds `node-hid` for Linux, applies Linux patches, and installs udev rules. Build output goes to the `output/` directory.

### Manual steps

If you prefer to run each step yourself:

```bash
# 1. Install system and npm dependencies (see Quick start above for your distro)
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

`node scripts/patch-main.js` applies targeted string replacements to the minified `main-process.js`. The script fails with an error if any search string is not found, which signals that an upstream update changed something that needs attention. Patches can be platform-conditional — set `AZERON_PATCH_TARGET=darwin` for macOS builds.

| Patch | Platform | Description |
|-------|----------|-------------|
| fix-platform-string | all | Fix `e.Linux="Linux"` to lowercase `"linux"` |
| fix-tray-icon | all | Resolve tray icon path using `process.resourcesPath` |
| fix-app-root-path | all | Use `process.execPath` for reliable root path detection |
| disable-auto-updater | all | Disable S3 auto-update (no Linux/macOS builds on their CDN) |
| fix-dfu-util-name | all | Replace `dfu-util-static` with system `dfu-util` |
| fix-login-items-1/2/3 | all | Skip `setLoginItemSettings` on Linux (unsupported API) |
| fix-wayland-scaling | linux | Force x11/xwayland to fix fractional scaling on Wayland |
| fix-hid-write-padding-text/binary | linux | Pad HID writes to 65 bytes (Linux hidraw doesn't auto-pad like Windows/macOS) |
| fix-profile-activation | linux | Fire-and-forget profile switch (device does USB reconnect to apply) |
| fix-usb-reset-on-connect | linux | USB device reset before HID open (fixes config interface after reconnect) |
| silence-console-logs | all | Reduce console log level from debug to error |
| fix-quit-on-window-close | linux | Clean exit on window close (avoids node-hid NAPI crash on Linux) |

### Running in development mode

```bash
npm start -- --no-sandbox
```

## Checking for Updates

New upstream versions are detected and released automatically via GitHub Actions (weekly on Mondays). You can also check manually:

```bash
# Check only (exit code 0 = up to date, 2 = update available)
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
6. Update `build-manifest.json`, `package.json`, and `PKGBUILD` with the new version
7. Build AppImage and pacman packages

If any step fails, it reports all errors at the end.

## Known Limitations

**Auto-update and beta participation**: The Settings page in the app shows "Auto update enabled" and "Beta Version Opt In?" checkboxes. These do not work on Linux — the auto-updater has been disabled since there are no Linux builds on Azeron's update server. To check for updates, see the [Checking for Updates](#checking-for-updates) section below, or watch the [releases page](https://github.com/renatoi/azeron-linux/releases) for new versions.

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

### Verbose logging

To enable debug logs when troubleshooting:

```bash
AZERON_LOG_LEVEL=debug azeron-software
```

Valid levels: `error` (default), `warn`, `info`, `debug`.

### Firmware updates

Firmware updates require `dfu-util` installed on the system (`pacman -S dfu-util`, `apt install dfu-util`, or `dnf install dfu-util`). The device enters DFU mode (STM32 bootloader at `0483:df11`) during the update. The udev rules already grant access to this bootloader device.

## How It Works

The official Azeron Software is an Electron app that communicates with the keypad via USB HID reports. The device exposes 5 USB interfaces; interface 4 (`hidraw`) is used for configuration. The app sends commands using either a text-based protocol (legacy firmware) or a binary protocol (modern firmware like the Cyborg II).

This project extracts the original app from the Windows installer, rebuilds the native `node-hid` module for Linux, and applies minimal patches for platform compatibility. No protocol reimplementation is needed — the original app logic runs as-is.

## Project Structure

```
azeron-linux/
  .github/workflows/
    ci.yml                # CI: build validation on PRs (Linux + macOS)
    release.yml           # CI: weekly update check + build + release (Linux + macOS)
  Casks/
    azeron-software.rb    # Homebrew cask (macOS tap)
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
    patch-main.js         # Platform compatibility patches (Linux + macOS)
    setup.sh              # Automated setup script (Linux)
    setup-macos.sh        # Automated setup script (macOS)
    check-update.sh       # Check for new Azeron releases + auto-update
  build-manifest.json     # Tracks upstream version and checksum
  package.json            # Build config (electron-builder)
  PKGBUILD                # Arch Linux / AUR build recipe
```

## Credits

- [Azeron](https://azeron.eu) for the original software and hardware
- [noreza](https://github.com/Caedis/noreza) — Linux input mapper for Azeron (alternative approach)
- [azeron-cli](https://github.com/cozyGalvinism/azeron-cli) — early Rust-based protocol reverse engineering

## Disclaimer

THIS SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED. USE AT YOUR OWN RISK. The authors are not responsible for any damage to hardware, misconfiguration of devices, data loss, or any other harm resulting from the use of this software, including but not limited to failed firmware updates.

This project is not affiliated with, endorsed by, or sponsored by Azeron SIA. "Azeron" is a trademark of Azeron SIA. All trademarks belong to their respective owners.

## License

This is an unofficial repackage for personal and educational use, provided under fair use for interoperability purposes. The original Azeron Software is proprietary software by Azeron SIA. Firmware binaries are property of Azeron LTD. No proprietary source code has been modified or reverse-engineered — only minimal binary patches are applied to enable Linux platform compatibility.

If you are a representative of Azeron and have concerns about this project, please open an issue or contact the maintainer directly.
