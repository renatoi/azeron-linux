cask "azeron-software" do
  version "1.5.6"
  sha256 "5c5cdec69b2c94061b0c79035599b063d93352f2b0881ae0e47df96b3bd06a31"

  url "https://github.com/renatoi/azeron-linux/releases/download/v#{version}/azeron-software-#{version}-arm64-mac.zip"
  name "Azeron Software"
  desc "Configuration tool for Azeron keypads (unofficial)"
  homepage "https://github.com/renatoi/azeron-linux"

  depends_on macos: ">= :sonoma"
  depends_on arch: :arm64

  app "Azeron Software.app"
end
