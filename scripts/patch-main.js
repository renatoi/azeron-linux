#!/usr/bin/env node

// Patches the minified main-process.js for Linux compatibility.
// Each patch is an exact string replacement with verification.

const fs = require("fs");
const path = require("path");

const MAIN_JS = path.join(__dirname, "..", "app", "dist", "main-process.js");
const targetArg = (process.argv.find((a) => a.startsWith("--platform=")) || "").split("=")[1];
const patchTarget =
  (process.env.AZERON_PATCH_TARGET || targetArg || process.platform).toLowerCase();
const isLinux = patchTarget.startsWith("linux");
const isMac = patchTarget === "darwin" || patchTarget === "mac" || patchTarget === "osx";

let code = fs.readFileSync(MAIN_JS, "utf8");
const original = code;

const patches = [];
const skipped = [];

function patch(name, search, replace, { platforms } = {}) {
  if (platforms && !platforms.includes(patchTarget) && !platforms.includes("all")) {
    skipped.push(name);
    return;
  }
  if (!code.includes(search)) {
    if (code.includes(replace)) {
      console.log(`PATCH SKIP: "${name}" already applied`);
      return;
    }
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

console.log(`Applying patches for target: ${patchTarget}${isLinux ? " (linux)" : isMac ? " (macos)" : ""}`);

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

// Patch 8: Force x11/xwayland on Linux to fix fractional scaling on Wayland (issue #1)
// On Wayland with fractional scaling, the Electron app renders at wrong scale.
// Forcing x11 via ozone-platform switch makes it use xwayland instead, which handles
// scaling correctly. The flag is harmless on X11 sessions (it's already x11).
// Injected before e.app.requestSingleInstanceLock() so it takes effect early.
patch(
  "fix-wayland-scaling",
  "let uu;e.app.requestSingleInstanceLock()",
  'let uu;e.app.commandLine.appendSwitch("ozone-platform","x11");e.app.requestSingleInstanceLock()',
  { platforms: ["linux"] }
);

// Patch 9: Pad HID write buffers to 65 bytes for Linux hidraw
// On Windows, the HID driver automatically pads short writes to the report size.
// On Linux hidraw, writes are sent as-is. The Azeron device ignores short reports.
// The app constructs [0, ...data] arrays without padding. We pad them to 65 bytes.
// Text protocol write:
patch(
  "fix-hid-write-padding-text",
  "const i=[0,...n.slice(r,Math.min(r+64+1,o))];try{r+=e.write(Buffer.from(i))-1}",
  "const i=[0,...n.slice(r,Math.min(r+64+1,o))];while(i.length<65)i.push(0);try{r+=e.write(Buffer.from(i))-1}"
);
// Binary protocol write:
patch(
  "fix-hid-write-padding-binary",
  "const o=[0,...t.slice(n,Math.min(n+64+1,r))];try{n+=e.write(Buffer.from(o))-1}",
  "const o=[0,...t.slice(n,Math.min(n+64+1,r))];while(o.length<65)o.push(0);try{n+=e.write(Buffer.from(o))-1}"
);

// Patch 10: Fix profile activation on Linux
// On Linux, SWITCH_PROFILE causes the device to USB disconnect and reconnect to apply
// the new profile's HID configuration. The app's existing disconnect/reconnect handling
// will detect the device reappearing and re-open it. No queue matcher changes needed.
// The USB reset in patch 10b ensures the config interface works after reconnect.
// We just need to remove the profile activation from the queue since the device will
// disconnect and the queue would never get a response. Instead, send fire-and-forget.
patch(
  "fix-profile-activation",
  'e.ipcMain.handle(sn,((e,t)=>{n.add((()=>{i.switchProfile(+t.profileId)}),{id:sn,sMatcher:[Is.PROFILE_INDEX],bMatcher:e=>gi(e).type===Yo.SWITCH_PROFILE})}))',
  'e.ipcMain.handle(sn,((e,t)=>{i.switchProfile(+t.profileId)}))',
  { platforms: ["linux"] }
);

// Patch 10b: USB reset before HID open
// On Linux, after a profile switch the device does a USB disconnect/reconnect.
// After reconnect, the vendor-specific config interface (if04) is unresponsive until
// a USB device reset (USBDEVFS_RESET ioctl) is sent. We do this before every HID open
// to ensure the config interface is always ready.
//
// The USB reset uses python3+fcntl since Node.js has no built-in ioctl support.
// The spawnSync call passes the Python code directly (no shell escaping needed).
{
  // Build the Python code as a JS string. When inserted into main-process.js:
  // - \n becomes newline (Python needs real newlines for indentation)
  // - \\d becomes \d (Python regex digit class)
  const pyLines = [
    "import fcntl,os,re,subprocess",
    "try:",
    " o=subprocess.check_output(['lsusb','-d','16d0:12f7']).decode()",
    " m=re.search('Bus (\\\\d+) Device (\\\\d+):',o)",
    " if m:",
    "  p='/dev/bus/usb/'+m.group(1)+'/'+m.group(2)",
    "  fd=os.open(p,os.O_WRONLY)",
    "  fcntl.ioctl(fd,21780,0)",
    "  os.close(fd)",
    "except:",
    " pass"
  ].join("\\n");
  const usbReset = '(()=>{try{require("child_process").spawnSync("python3",["-c","' + pyLines + '"])}catch(_ue){}})()';

  patch(
    "fix-usb-reset-on-connect",
    'i=new Ol.HID(o.path),ys.info("HID Being opened!")',
    usbReset + ',i=new Ol.HID(o.path),ys.info("HID Being opened!")',
    { platforms: ["linux"] }
  );
}

// Patch 11: Silence console log spam in production
// The Console transport is set to "debug" which floods stdout with JSON logs.
// Change to "error" so only actual errors appear in the terminal when run from CLI.
patch(
  "silence-console-logs",
  'new Zi.transports.Console({level:"debug",handleExceptions:!0})',
  'new Zi.transports.Console({level:process.env.AZERON_LOG_LEVEL||"error",handleExceptions:!0})'
);

// Patch 12: Quit app when all windows are closed (Linux convention)
// The app has no "window-all-closed" handler, so it keeps running after the window closes.
// On Linux, node-hid's read thread does a blocking read() on hidraw. During shutdown,
// the NAPI finalizer waits ~30s for that read to finish, then crashes (SIGABRT).
// No JS-level exit (app.quit, process.exit, etc.) can avoid this because the read
// thread blocks the event loop. Fix: spawn a detached "kill -9" process which
// bypasses the blocked event loop entirely. The kernel releases all fds on death.
patch(
  "fix-quit-on-window-close",
  'e.app.on("quit"',
  'e.app.on("window-all-closed",(()=>{require("child_process").spawn("kill",["-9",String(process.pid)],{detached:true,stdio:"ignore"}).unref()})),e.app.on("quit"',
  { platforms: ["linux"] }
);



if (code === original) {
  console.log("No changes made (patches may have already been applied)");
  process.exit(0);
}

// Write patched file
fs.writeFileSync(MAIN_JS, code);
console.log(`Successfully applied ${patches.length} patches:`);
patches.forEach((p) => console.log(`  - ${p}`));
if (skipped.length) {
  console.log(`Skipped ${skipped.length} patches (not for ${patchTarget}):`);
  skipped.forEach((p) => console.log(`  - ${p}`));
}
