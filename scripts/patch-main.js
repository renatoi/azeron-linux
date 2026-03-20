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
  'e.app.setLoginItemSettings({openAtLogin:r,path:e.app.getPath("exe"),args:o?["--minimized"]:[]}),',
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

// Patch 9: Pad HID write buffers to 65 bytes
// On Windows, the HID driver automatically pads short writes to the report size.
// On Linux (hidraw) and macOS (IOKit IOHIDDeviceSetReport), writes are sent as-is.
// The Azeron device ignores short reports, so we must pad to 65 bytes (1 report ID + 64 data).
// Text protocol write:
patch(
  "fix-hid-write-padding-text",
  "const i=[0,...n.slice(r,Math.min(r+64+1,o))];try{r+=e.write(Buffer.from(i))-1}",
  "const i=[0,...n.slice(r,Math.min(r+64+1,o))];while(i.length<65)i.push(0);try{r+=e.write(Buffer.from(i))-1}",
  { platforms: ["linux", "darwin"] }
);
// Binary protocol write:
patch(
  "fix-hid-write-padding-binary",
  "const o=[0,...t.slice(n,Math.min(n+64+1,r))];try{n+=e.write(Buffer.from(o))-1}",
  "const o=[0,...t.slice(n,Math.min(n+64+1,r))];while(o.length<65)o.push(0);try{n+=e.write(Buffer.from(o))-1}",
  { platforms: ["linux", "darwin"] }
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

// Patch 10c: Drain XInput endpoint to prevent device firmware lockup
// When an Azeron device is in Xbox Joystick (XInput) mode, the firmware generates
// gamepad reports on USB Interface 0. On Linux, no driver claims Interface 0
// (xpad doesn't recognize the VID:PID, usbhid won't touch class 255), so nothing
// polls the IN endpoint. The STM32's TX FIFO fills up and the firmware blocks,
// freezing the entire device — even hardware buttons stop working.
// Fix: After HID open, use the bundled node-usb (libusb) to claim Interface 0 and
// start an async poll loop that drains XInput reports. This prevents the TX FIFO
// from filling up. Cleanup is chained through i.close() to release on disconnect.
//
// Readable source for the XInput drain IIFE:
//
//   (()=>{
//     try {
//       var _usb = require("usb"),
//           _ud = _usb.getDeviceList().find(d => d.deviceDescriptor.idVendor === 5840);
//       if (!_ud) return;
//       _ud.open();
//       var _if = _ud.interface(0);
//       // If a kernel driver (e.g. xpad) is already bound, it's draining the
//       // endpoint — no action needed. Only drain when Driver=[none].
//       try { if (_if.isKernelDriverActive()) { _ud.close(); return; } } catch(e) {}
//       _if.claim();
//       var _ep = _if.endpoints.find(e => e.direction === "in");
//       if (!_ep) { _if.release(); _ud.close(); return; }
//       _ep.startPoll(2, 64);
//       _ep.on("data", function(){});
//       _ep.on("error", function(){});
//       var _dc = i.close.bind(i);
//       i.close = function() {
//         try { _ep.stopPoll(); } catch(e) {}
//         try { _if.release(); } catch(e) {}
//         try { _ud.close(); } catch(e) {}
//         return _dc();
//       };
//       ys.info("XInput drain active on Interface 0");
//     } catch(e) {
//       ys.info("XInput drain skipped: " + e.message);
//     }
//   })()
//
{
  const xinputDrain = '(()=>{'
    + 'try{'
    +   'var _usb=require("usb"),'
    +       '_ud=_usb.getDeviceList().find(function(d){return d.deviceDescriptor.idVendor===5840});'
    +   'if(!_ud)return;'
    +   '_ud.open();'
    +   'var _if=_ud.interface(0);'
    +   'try{if(_if.isKernelDriverActive()){_ud.close();return}}catch(e){}'
    +   '_if.claim();'
    +   'var _ep=_if.endpoints.find(function(e){return e.direction==="in"});'
    +   'if(!_ep){try{_if.release()}catch(e){}try{_ud.close()}catch(e){}return}'
    +   '_ep.startPoll(2,64);'
    +   '_ep.on("data",function(){});'
    +   '_ep.on("error",function(){});'
    +   'var _dc=i.close.bind(i);'
    +   'i.close=function(){'
    +     'try{_ep.stopPoll()}catch(e){}'
    +     'try{_if.release()}catch(e){}'
    +     'try{_ud.close()}catch(e){}'
    +     'return _dc()'
    +   '};'
    +   'ys.info("XInput drain active on Interface 0")'
    + '}catch(e){'
    +   'ys.info("XInput drain skipped: "+e.message)'
    + '}'
    + '})()';

  patch(
    "fix-xinput-drain",
    'ys.info("HID Being opened!")',
    'ys.info("HID Being opened!"),' + xinputDrain,
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

// Patch 12: Gracefully handle HID open failure
// When the device can't be opened (e.g. missing udev rules, permissions, or the USB
// interface layout changed due to Xbox Joystick mode), new Ol.HID(path) throws.
// Without a try-catch, the uncaughtException handler calls app.exit(), crashing the app.
// Fix: catch the error, log it, clear the selected device, and restart device polling
// so the app stays running and retries when the issue is resolved.
patch(
  "fix-hid-open-crash",
  'i=new Ol.HID(o.path),ys.info("HID Being opened!")',
  'try{i=new Ol.HID(o.path)}catch(_he){ys.error("Failed to open HID device: "+_he.message);o=void 0;d();return}ys.info("HID Being opened!")'
);

// Patch 12b: Async HID writes to prevent UI freezing on Linux
// On Linux, node-hid's synchronous write() goes through hidraw which can block
// when the device firmware is busy (e.g., processing XInput data). This blocks
// the Electron event loop and freezes the UI every time the app pings or retries.
// Fix: After opening the HID device, monkey-patch i.write() to use a second fd
// opened on the same hidraw path with fs.write() (libuv thread pool). The patched
// write() returns buffer.length synchronously to satisfy the caller's offset
// arithmetic. On close, the extra fd is cleaned up before calling the original close.
// If setup fails (permissions, etc.), the original synchronous write is preserved.
{
  // Readable source for the async writer IIFE:
  //
  //   (()=>{
  //     try {
  //       var _fs = require("fs"),
  //           _fd = _fs.openSync(o.path, _fs.constants.O_WRONLY),
  //           _closed = false,
  //           _oc = i.close.bind(i);          // save original close
  //
  //       i.write = function(b) {
  //         if (_closed) throw new Error("device closed");
  //         _fs.write(_fd, b, function(e) {   // async via libuv thread pool
  //           if (e && !_closed) ys.error("async hid write error: " + e.message);
  //         });
  //         return b.length;                  // satisfy caller's offset arithmetic
  //       };
  //
  //       i.close = function() {
  //         if (!_closed) {
  //           _closed = true;
  //           try { _fs.closeSync(_fd); }
  //           catch(e) { ys.error("async hid close error: " + e.message); }
  //         }
  //         return _oc();                     // call original close
  //       };
  //     } catch(_ae) {
  //       ys.error("async-hid-writer init failed: " + _ae.message);
  //       // original sync i.write() is preserved as fallback
  //     }
  //   })()
  //
  const asyncWriter = '(()=>{'
    + 'try{'
    +   'var _fs=require("fs"),'
    +       '_fd=_fs.openSync(o.path,_fs.constants.O_WRONLY),'
    +       '_closed=!1,'
    +       '_oc=i.close.bind(i);'
    +   'i.write=function(b){'
    +     'if(_closed)throw new Error("device closed");'
    +     '_fs.write(_fd,b,function(e){'
    +       'if(e&&!_closed)ys.error("async hid write error: "+e.message)'
    +     '});'
    +     'return b.length'
    +   '};'
    +   'i.close=function(){'
    +     'if(!_closed){'
    +       '_closed=!0;'
    +       'try{_fs.closeSync(_fd)}'
    +       'catch(e){ys.error("async hid close error: "+e.message)}'
    +     '}'
    +     'return _oc()'
    +   '}'
    + '}catch(_ae){'
    +   'ys.error("async-hid-writer init failed: "+_ae.message)'
    + '}'
    + '})()';

  // This patch runs AFTER patch 12 (crash fix), which wraps the HID open in
  // try-catch. We search for the end of the catch block + the log statement.
  patch(
    "fix-async-hid-writes",
    'return}ys.info("HID Being opened!")',
    'return}' + asyncWriter + ',ys.info("HID Being opened!")',
    { platforms: ["linux"] }
  );
}

// Patch 13: Quit app when all windows are closed (Linux convention)
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

// Patch 13: Fix linked game file picker for Linux
// The "Select associated app" dialog only shows .exe and .url files.
// On Linux, executables have no extension, so show all files instead.
patch(
  "fix-linked-game-file-filter",
  'filters:[{name:"Executable Files",extensions:["exe","url"]}]',
  'filters:[{name:"All Files",extensions:["*"]}]',
  { platforms: ["linux"] }
);

// Patch 14: Fix tasklist in system report for Linux
// The diagnostics report calls execSync("tasklist") which is Windows-only.
// Replace with "ps aux" which provides equivalent process listing on Linux.
patch(
  "fix-linked-game-report-tasklist",
  '(0,Xa.execSync)("tasklist").toString()',
  '(0,Xa.execSync)("ps aux").toString()',
  { platforms: ["linux"] }
);

// Patch 15: Fix tasklist in get-process-list IPC handler for Linux
// The IPC handler that populates the UI with running processes calls "tasklist".
// Replace with "readlink /proc/[0-9]*/exe" which resolves each process's
// executable symlink — no truncation, no argument confusion, handles spaces.
// n.slice(5) removed (no header to skip). Only shows processes the user
// has permission to read (own + root), which is the relevant set for game linking.
patch(
  "fix-linked-game-list-tasklist",
  '(0,Xa.exec)("tasklist",((e,n)=>{if(e)return void ys.info(`Failed to get active process list: ${e}`);const r=(e=>{const t=e.split("\\n"),n=[];for(const e of t){const t=e.trim().split(/\\s+/);if(t.length>0){const e=t[0].toLowerCase();n.includes(e)||n.push(e)}}return n.slice(5)})(n);t.webContents.send(rt,r)})',
  '(0,Xa.exec)("readlink /proc/[0-9]*/exe 2>/dev/null || true",((e,n)=>{if(e)return void ys.info(`Failed to get active process list: ${e}`);const r=(e=>{const t=e.split("\\n"),n=[];for(const e of t){const t=e.trim();if(t){const e=require("path").basename(t).toLowerCase();e&&!n.includes(e)&&n.push(e)}}return n})(n);t.webContents.send(rt,r)})',
  { platforms: ["linux"] }
);

// Patch 16: Fix tasklist in linked game monitoring loop for Linux
// The 3-second monitoring loop calls "tasklist" to detect running linked games.
// Replace with "ps -eo args=". The existing r.includes(n) string search
// still works since process names appear in the full args output.
// Game monitoring uses ps -eo args= (full command line) for robust detection
// of wrapped games (Proton, Wine, launchers) where the game name appears in
// the arguments. This intentionally differs from the file picker (Patch 15)
// which uses readlink for clean, human-readable executable names.
patch(
  "fix-linked-game-monitor-tasklist",
  '(0,Xa.exec)("tasklist",((e,n)=>{if(e)return void ys.info(`Monitoring error: ${e}`)',
  '(0,Xa.exec)("ps -eo args=",((e,n)=>{if(e)return void ys.info(`Monitoring error: ${e}`)',
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
