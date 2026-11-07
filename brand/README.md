# Kipple brand assets

Hand-drawn SVG, colors taken from the app theme (`#D9573B` light accent, `#F07A5F` dark accent, ink `#23211E`, cream `#F6F1EA`).

| File | Use |
| --- | --- |
| `kipple-icon-{light,dark}.svg` | App icon on a rounded tile, 48 px and up |
| `kipple-icon-tiny-{light,dark}.svg` | Simplified mascot without tile, for 16–32 px (tray, taskbar, favicon) |
| `kipple-mascot-{light,dark}.svg` | Mascot without tile, full detail |
| `kipple-logo-{light,dark}.svg` | Mascot + wordmark lockup |
| `kipple-wordmark-{light,dark}.svg` | Wordmark only (drawn with strokes, no font) |
| `kipple-icon-1024.png` | Source for `npx tauri icon` |

Regenerating Tauri icons: `npx tauri icon brand/kipple-icon-1024.png`, then delete the generated `android/`, `ios/` and `64x64.png`, and rebuild `icon.ico` with `python brand/build-windows-ico.py` (needs `pip install cairosvg pillow`).

The Windows icon (`icon.ico`: exe, shortcuts, taskbar, Start menu, title bar, installer) is the mascot without the tile, like other Windows apps. Each of its frames (16, 20, 24, 32, 40, 48, 64, 96, 128, 256) is rendered straight from SVG at that size so it stays crisp: 16–32 px from `kipple-icon-tiny-light.svg`, 40 px and up from `kipple-mascot-light.svg`. macOS and Linux keep the tiled icon.

## Windows installer art

`src-tauri/installer/*.bmp` (NSIS sidebar and header, WiX banner and dialog) are generated from these SVGs by `python brand/build-installer-art.py` (needs `pip install cairosvg pillow`). The silent auto-update (`/S`) shows no pages, so the art only appears on a first install from the downloaded `setup.exe`.
