#!/usr/bin/env bash
set -euo pipefail

if [[ "$#" -ne 3 ]]; then
  cat >&2 <<'EOF'
Usage: scripts/render_homebrew_cask.sh <version> <aarch64-dmg-sha256> <x64-dmg-sha256>

Example:
  scripts/render_homebrew_cask.sh 0.1.12 <arm_sha256> <intel_sha256> > Casks/typr-oss.rb
EOF
  exit 64
fi

version="$1"
arm_sha="$2"
intel_sha="$3"

cat <<EOF
cask "typr-oss" do
  arch arm: "aarch64", intel: "x64"

  version "$version"
  sha256 arm:   "$arm_sha",
         intel: "$intel_sha"

  url "https://github.com/juanmaramos/typr-oss/releases/download/v#{version}/Typr%20OSS_#{version}_#{arch}.dmg"
  name "Typr OSS"
  desc "AI notepad for meetings, notes, and follow-up work"
  homepage "https://github.com/juanmaramos/typr-oss"

  livecheck do
    url :url
    strategy :github_latest
  end

  app "Typr OSS.app"

  zap trash: [
    "~/Library/Application Support/com.typr.oss",
    "~/Library/Caches/com.typr.oss",
    "~/Library/Logs/com.typr.oss",
    "~/Library/Preferences/com.typr.oss.plist",
    "~/Library/Saved Application State/com.typr.oss.savedState",
  ]
end
EOF
