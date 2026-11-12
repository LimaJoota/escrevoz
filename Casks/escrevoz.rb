cask "escrevoz" do
  version "0.10.1"
  sha256 "ae28f8cf4ecbfb17f553bb4475285ca40cbf3aacf18a360b553e63b8d5e8e42b"

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
