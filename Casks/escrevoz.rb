cask "escrevoz" do
  version "0.10.3"
  sha256 "3ac445f98c7a59320ac60db0619af2f985a48a4b418e5deda424ee313cf4d362"

  url "https://github.com/LimaJoota/escrevoz/releases/download/v#{version}/Escrevoz_#{version}_aarch64.dmg"
  name "Escrevoz"
  desc "Ditado por voz de graça e sem internet"
  homepage "https://github.com/LimaJoota/escrevoz"

  depends_on arch: :arm64
  depends_on :macos

  app "Escrevoz.app"

  # The app has no paid Apple notarization yet, so Gatekeeper would block the first launch.
  # shortcut: assumes the default /Applications appdir, until the app is notarized.
  postflight_steps do
    run "/usr/bin/xattr", args: ["-dr", "com.apple.quarantine", "/Applications/Escrevoz.app"], must_succeed: false
  end
end
