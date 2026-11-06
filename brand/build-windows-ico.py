"""Builds src-tauri/icons/icon.ico (Windows: exe, shortcuts, taskbar, title bar, installer).

Every frame is rendered straight from SVG at its own size, so nothing is
downscaled and each size stays crisp. 16-32 px use the simplified mascot,
40 px and up the full mascot. No tile: Windows icons sit on the taskbar or
desktop as a shape, like other Windows apps.

    pip install cairosvg pillow
    python brand/build-windows-ico.py
"""
import io
import struct
from pathlib import Path

import cairosvg
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
BRAND = ROOT / "brand"
OUT = ROOT / "src-tauri" / "icons" / "icon.ico"

SMALL = (16, 20, 24, 32)
LARGE = (40, 48, 64, 96, 128, 256)


def render(svg_text: str, size: int) -> Image.Image:
    png = cairosvg.svg2png(bytestring=svg_text.encode(), output_width=size, output_height=size)
    return Image.open(io.BytesIO(png)).convert("RGBA")


tiny = (BRAND / "kipple-icon-tiny-light.svg").read_text()
# Same crop as the tiny icon so the mascot fills the frame at every size.
full = (BRAND / "kipple-mascot-light.svg").read_text().replace(
    'viewBox="0 0 100 100"', 'viewBox="9 9 82 82"', 1
)



def bmp_entry(img: Image.Image) -> bytes:
    """32-bit DIB, the classic format every Windows tool (rc.exe, NSIS) reads."""
    w, h = img.size
    header = struct.pack("<IiiHHIIiiII", 40, w, h * 2, 1, 32, 0, 0, 0, 0, 0, 0)
    b, g, r, a = img.split()[2], img.split()[1], img.split()[0], img.split()[3]
    pixels = Image.merge("RGBA", (b, g, r, a)).transpose(Image.FLIP_TOP_BOTTOM).tobytes()
    mask_row = ((w + 31) // 32) * 4
    return header + pixels + bytes(mask_row * h)  # empty AND mask, alpha does the work


def png_entry(img: Image.Image) -> bytes:
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


frames = [render(tiny, s) for s in SMALL] + [render(full, s) for s in LARGE]
# Windows convention: BMP below 256 px, PNG for the 256 px frame.
blobs = [png_entry(f) if f.size[0] >= 256 else bmp_entry(f) for f in frames]

out = struct.pack("<HHH", 0, 1, len(frames))
offset = 6 + 16 * len(frames)
for f, blob in zip(frames, blobs):
    w = f.size[0] % 256  # 0 means 256
    out += struct.pack("<BBBBHHII", w, w, 0, 0, 1, 32, len(blob), offset)
    offset += len(blob)
OUT.write_bytes(out + b"".join(blobs))
print("wrote", OUT, [f.size[0] for f in frames])
