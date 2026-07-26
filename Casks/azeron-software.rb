cask "azeron-software" do
  version "1.5.6"
  sha256 "3da5de9ae570ecd293c29b3c5c02bf8f1e8d1884cc00c7f7c8213b10eafcc912"

  url "https://github.com/renatoi/azeron-linux/releases/download/v#{version}/azeron-software-#{version}-arm64-mac.zip"
  name "Azeron Software"
  desc "Configuration tool for Azeron keypads (unofficial)"
  homepage "https://github.com/renatoi/azeron-linux"

  depends_on macos: ">= :sonoma"
  depends_on arch: :arm64

  app "azeron-software.app"
end
