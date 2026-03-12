cask "azeron-software" do
  version "1.5.6"
  sha256 "74069d06435b04be421aa652eeeec6e5c58442c1251486ffb2c1cd972b23ac59"

  url "https://github.com/renatoi/azeron-linux/releases/download/v#{version}/azeron-software-#{version}-arm64-mac.zip"
  name "Azeron Software"
  desc "Configuration tool for Azeron keypads (unofficial)"
  homepage "https://github.com/renatoi/azeron-linux"

  depends_on macos: ">= :sonoma"
  depends_on arch: :arm64

  app "azeron-software.app"
end
