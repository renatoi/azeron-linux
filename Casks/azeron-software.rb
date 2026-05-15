cask "azeron-software" do
  version "1.5.6"
  sha256 "ca50e40811be513b40271dd5a3d958d1de2778197a1d1f097afc62864ea64700"

  url "https://github.com/renatoi/azeron-linux/releases/download/v#{version}/azeron-software-#{version}-arm64-mac.zip"
  name "Azeron Software"
  desc "Configuration tool for Azeron keypads (unofficial)"
  homepage "https://github.com/renatoi/azeron-linux"

  depends_on macos: ">= :sonoma"
  depends_on arch: :arm64

  app "azeron-software.app"
end
