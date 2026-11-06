#!/usr/bin/env bash
# Builds Kipple Setup (the branded first-install window) around the NSIS setup.exe
# that `tauri build` just produced for the main app. Run from the repo root in CI (Windows, bash).
# Output: Install-Kipple-<version>.exe in the repo root.
set -euo pipefail

VERSION=$(node -p "require('./src-tauri/tauri.conf.json').version")
NSIS=$(ls src-tauri/target/release/bundle/nsis/*-setup.exe | head -n 1)

mkdir -p setup-app/src-tauri/payload
cp "$NSIS" setup-app/src-tauri/payload/kipple-setup.exe
node -e "const f='setup-app/src-tauri/tauri.conf.json',fs=require('fs'),c=JSON.parse(fs.readFileSync(f));c.version='$VERSION';fs.writeFileSync(f,JSON.stringify(c,null,2))"

(cd setup-app && npx tauri build --no-bundle)

cp setup-app/src-tauri/target/release/Kipple-Setup.exe "Install-Kipple-$VERSION.exe"
echo "Built Install-Kipple-$VERSION.exe around $(basename "$NSIS")"
