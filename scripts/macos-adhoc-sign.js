// electron-builder afterSign hook — applies an adhoc signature with entitlements
// and a stable bundle identifier so macOS TCC has something to track.
//
// Without this, electron-builder leaves the app linker-signed-only with
// Identifier=Electron, no entitlements, no sealed resources — which on
// macOS 26 (Tahoe) prevents the system from auto-prompting for Input
// Monitoring when the app first tries to open a HID device.
//
// This is NOT a substitute for a real Developer ID + notarization. It
// produces an adhoc build that the user still has to:
//   - dequarantine: xattr -d com.apple.quarantine /Applications/azeron-software.app
//   - or right-click -> Open the first time
// But once trusted, the entitlements + hardened runtime + sealed resources
// give TCC a stable identity to bind the Input Monitoring grant to.

const { execFileSync } = require("child_process");
const path = require("path");

exports.default = async function macosAdhocSign(context) {
  if (context.electronPlatformName !== "darwin") return;
  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  const entitlements = path.join(context.packager.info.projectDir, "build", "entitlements.mac.plist");
  const identifier = context.packager.appInfo.id; // com.azeron.software per package.json

  console.log(`[macos-adhoc-sign] re-signing ${appPath}`);
  console.log(`[macos-adhoc-sign] identifier=${identifier}`);
  console.log(`[macos-adhoc-sign] entitlements=${entitlements}`);

  execFileSync(
    "codesign",
    [
      "--force",
      "--deep",
      "--options", "runtime",
      "--identifier", identifier,
      "--entitlements", entitlements,
      "--sign", "-",
      appPath,
    ],
    { stdio: "inherit" }
  );

  // Verify (codesign -dv writes to stderr; let it stream to the terminal)
  console.log("[macos-adhoc-sign] verification:");
  execFileSync("codesign", ["-dv", "--verbose=2", appPath], { stdio: "inherit" });
};
