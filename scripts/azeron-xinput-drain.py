#!/usr/bin/env python3
"""
Drain Azeron XInput endpoint to prevent device firmware lockup on Linux.

When an Azeron device is in Xbox Joystick (XInput) mode, the firmware generates
gamepad reports on USB Interface 0. On Linux, no driver claims this interface,
so the STM32's TX FIFO fills up and the firmware freezes — even hardware buttons
stop working.

This script claims Interface 0 via libusb and continuously reads from its IN
endpoint, preventing the TX buffer from filling up.

The Azeron Software app (v1.5.7+) does this automatically while running. This
standalone script is only needed if the device locks up WITHOUT the app open.

Usage:
    sudo python3 scripts/azeron-xinput-drain.py

Requirements:
    pip install pyusb
    libusb must be installed (libusb-1.0-0 / libusb1 / libusb)
"""

import sys

try:
    import usb.core
    import usb.util
except ImportError:
    sys.exit("pyusb not installed. Run: pip install pyusb")

AZERON_VENDOR_ID = 0x16D0
XINPUT_INTERFACE = 0
ENDPOINT_IN = 0x81
READ_SIZE = 64
TIMEOUT_MS = 100

dev = usb.core.find(idVendor=AZERON_VENDOR_ID)
if not dev:
    sys.exit("Azeron device not found")

# If a kernel driver (e.g. xpad) is already bound, it's draining the endpoint
if dev.is_kernel_driver_active(XINPUT_INTERFACE):
    sys.exit("Interface 0 already has a kernel driver — no drain needed")

try:
    usb.util.claim_interface(dev, XINPUT_INTERFACE)
except usb.core.USBError as e:
    sys.exit(f"Failed to claim interface {XINPUT_INTERFACE}: {e}")
print("Draining Interface 0 — device should not lock up in XInput mode. Ctrl+C to stop.")

try:
    while True:
        try:
            dev.read(ENDPOINT_IN, READ_SIZE, timeout=TIMEOUT_MS)
        except usb.core.USBTimeoutError:
            pass
except KeyboardInterrupt:
    pass
finally:
    usb.util.release_interface(dev, XINPUT_INTERFACE)
    print("\nReleased Interface 0")
