cask "azeron-software" do
  version "1.5.6"
  sha256 "d155d2e5138bd49c916db3c9bba0f9a350ceff1ba111bd0fef054dd582318bb0"

  url "https://github.com/renatoi/azeron-linux/releases/download/v#{version}/azeron-software-#{version}-arm64-mac.zip"
  name "Azeron Software"
  desc "Configuration tool for Azeron keypads (unofficial)"
  homepage "https://github.com/renatoi/azeron-linux"

  depends_on macos: ">= :sonoma"
  depends_on arch: :arm64

  app "azeron-software.app"
end
