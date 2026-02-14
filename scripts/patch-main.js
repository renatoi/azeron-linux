#!/usr/bin/env node

// Patches the minified main-process.js for Linux compatibility.
// Each patch is an exact string replacement with verification.

const fs = require("fs");
const path = require("path");

const MAIN_JS = path.join(__dirname, "..", "app", "dist", "main-process.js");

let code = fs.readFileSync(MAIN_JS, "utf8");
const original = code;

const patches = [];

function patch(name, search, replace) {
  if (!code.includes(search)) {
    console.error(`PATCH FAILED: "${name}" - search string not found`);
    console.error(`  Looking for: ${search.substring(0, 100)}...`);
    process.exit(1);
  }
  const count = code.split(search).length - 1;
  if (count > 1) {
    console.error(`PATCH WARNING: "${name}" - search string found ${count} times, replacing all`);
  }
  code = code.split(search).join(replace);
  patches.push(name);
}

// Patch 1: Fix platform detection string
// Original: e.Linux="Linux" but process.platform returns "linux" (lowercase)
// This is a bug in the original Windows app that doesn't matter there
patch(
  "fix-platform-string",
  'e.Linux="Linux"',
  'e.Linux="linux"'
);

// Patch 2: Fix tray icon path - use PNG instead of ICO, resolve via app path
// The tray icon is in extraFiles, accessible relative to the executable directory.
// In a packaged Electron app, __dirname inside asar doesn't help for extraFiles.
// Use process.resourcesPath to find the app root (extraFiles are at resourcesPath/..)
patch(
  "fix-tray-icon",
  'new e.Tray("src/resources/tray.ico")',
  'new e.Tray(require("path").join(require("process").resourcesPath,"..","src","resources","tray.png"))'
);

// Patch 3: Fix app root path detection (ss function)
// Original: gets root by stripping exe name from app.getPath("module")
// On Linux, the exe name differs and getPath("module") may not contain "Azeron Software"
// Replace with path.dirname(process.execPath) which is reliable on all platforms
patch(
  "fix-app-root-path",
  'return e.app.getPath("module").replace(t,"")',
  'return require("path").dirname(require("process").execPath)+require("path").sep'
);

// Patch 4: Disable auto-updater
// No Linux builds exist on the S3 bucket, so auto-update would fail.
// Make autoUpdater.checkForUpdates a no-op by preventing setFeedURL
patch(
  "disable-auto-updater",
  'il.autoUpdater.allowDowngrade=!0,il.autoUpdater.setFeedURL({provider:"s3",bucket:"azeron-public",path:"keypad-builds",channel:e?"beta":"latest"}),il.autoUpdater.autoInstallOnAppQuit=!1,il.autoUpdater.autoDownload=!1',
  'il.autoUpdater.autoInstallOnAppQuit=!1,il.autoUpdater.autoDownload=!1'
);

// Patch 5: Replace dfu-util-static with system dfu-util
// The original bundles dfu-util-static.exe for Windows. On Linux, use system dfu-util.
// The path construction builds: firmware/<sep>dfu-util-static
// We change the binary name to just "dfu-util" and use system PATH lookup
patch(
  "fix-dfu-util-name",
  "dfu-util-static",
  "dfu-util"
);

// Patch 6: Fix setLoginItemSettings for Linux
// On Linux, setLoginItemSettings doesn't work the same way as Windows.
// Make it a no-op to prevent errors. Users can set up autostart via .desktop file.
// We wrap each call to be conditional on platform
patch(
  "fix-login-items-1",
  'Ps(Ss.AUTO_START,n),e.app.setLoginItemSettings({openAtLogin:n})',
  'Ps(Ss.AUTO_START,n),"linux"!==process.platform&&e.app.setLoginItemSettings({openAtLogin:n})'
);
patch(
  "fix-login-items-2",
  'Ps(Ss.AUTO_START_MINIMIZED,n),e.app.setLoginItemSettings({openAtLogin:!0,path:e.app.getPath("exe"),args:n?["--minimized"]:[]})',
  'Ps(Ss.AUTO_START_MINIMIZED,n),"linux"!==process.platform&&e.app.setLoginItemSettings({openAtLogin:!0,path:e.app.getPath("exe"),args:n?["--minimized"]:[]})'
);
patch(
  "fix-login-items-3",
  'e.app.setLoginItemSettings({openAtLogin:r,path:e.app.getPath("exe"),args:o?["--minimized"]:[]}),' ,
  '"linux"!==process.platform&&e.app.setLoginItemSettings({openAtLogin:r,path:e.app.getPath("exe"),args:o?["--minimized"]:[]}),'
);

if (code === original) {
  console.log("No changes made (patches may have already been applied)");
  process.exit(0);
}

// Write patched file
fs.writeFileSync(MAIN_JS, code);
console.log(`Successfully applied ${patches.length} patches:`);
patches.forEach((p) => console.log(`  - ${p}`));
