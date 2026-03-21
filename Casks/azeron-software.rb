cask "azeron-software" do
  version "1.5.6"
  sha256 "c2fc080ea4522fe3332171100b902e6b015aab93fe8ae0588c4dcc09fcfa9da1"

  url "https://github.com/renatoi/azeron-linux/releases/download/v#{version}/azeron-software-#{version}-arm64-mac.zip"
  name "Azeron Software"
  desc "Configuration tool for Azeron keypads (unofficial)"
  homepage "https://github.com/renatoi/azeron-linux"

  depends_on macos: ">= :sonoma"
  depends_on arch: :arm64

  app "azeron-software.app"
end
