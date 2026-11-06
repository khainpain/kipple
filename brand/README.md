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

Regenerating Tauri icons: `npx tauri icon brand/kipple-icon-1024.png`, then delete the generated `android/`, `ios/` and `64x64.png`, and rebuild `icon.ico` so the 16/24/32 px frames use `kipple-icon-tiny-light.svg` (the full icon is too detailed at those sizes).
