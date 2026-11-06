# Kipple Setup

The branded window for the first install (`Install-Kipple-<version>.exe` in a release).

- A tiny Tauri app: `ui/index.html` is the whole interface (plain HTML/CSS/JS, no build step; opened in a browser it plays a demo of the screens), `src-tauri/src/main.rs` does the work.
- The regular NSIS `setup.exe` of the main app is embedded inside it and run silently (`/S /D=<folder>`), exactly like the auto-updater runs it. So there is one installer for installs and updates, and updates never touch this window.
- Without WebView2 the window can't draw, so it runs the classic NSIS wizard instead.
- Built in CI by `setup-app/build.sh` after the main `tauri build`.
