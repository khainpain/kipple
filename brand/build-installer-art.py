"""Builds the branded installer images for Windows from the brand SVGs.

Outputs (24-bit BMP, the format NSIS and WiX expect) into src-tauri/installer/:
  nsis-sidebar.bmp  164x314  Welcome and Finish pages of the setup.exe (left strip)
  nsis-header.bmp   150x57   Top banner of the other setup.exe pages (left corner)
  wix-dialog.bmp    493x312  Welcome and Finish pages of the .msi (art in the left 164 px)
  wix-banner.bmp    493x58   Top banner of the other .msi pages (logo on the right, title text sits on the left)

Run: python brand/build-installer-art.py   (needs: pip install cairosvg pillow)
"""

import io
import math
import random
import re
from pathlib import Path

import cairosvg
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
BRAND = ROOT / "brand"
OUT = ROOT / "src-tauri" / "installer"

ACCENT = "#D9573B"
ACCENT_SOFT = "#F2A58F"
INK = "#23211E"
CREAM = "#F6F1EA"
PAPER = "#FFFDF9"
LINE = "#E9DFD3"


def inner(svg_file: str, recolor: dict | None = None) -> tuple[str, str]:
    """Returns (viewBox, inner markup) of a brand SVG, optionally swapping colors."""
    text = (BRAND / svg_file).read_text()
    view_box = re.search(r'viewBox="([^"]+)"', text).group(1)
    body = re.sub(r"^.*?<svg[^>]*>", "", text, flags=re.S)
    body = re.sub(r"</svg>\s*$", "", body)
    for old, new in (recolor or {}).items():
        body = body.replace(old, new)
    return view_box, body


def place(svg_file: str, x: float, y: float, w: float, h: float, recolor: dict | None = None) -> str:
    view_box, body = inner(svg_file, recolor)
    return (
        f'<svg x="{x}" y="{y}" width="{w}" height="{h}" viewBox="{view_box}" '
        f'preserveAspectRatio="xMidYMid meet">{body}</svg>'
    )


def card(cx: float, cy: float, w: float, h: float, angle: float, fill: str, accent_line: str | None, opacity: float) -> str:
    """A small tilted 'saved message' card: the kipple the mascot tames."""
    r = min(w, h) * 0.18
    lines = ""
    if accent_line:
        lw = w * 0.42
        lines += (
            f'<rect x="{-w / 2 + w * 0.14}" y="{-h / 2 + h * 0.28}" width="{lw}" height="{h * 0.14}" '
            f'rx="{h * 0.07}" fill="{accent_line}"/>'
        )
        lines += (
            f'<rect x="{-w / 2 + w * 0.14}" y="{-h / 2 + h * 0.56}" width="{w * 0.68}" height="{h * 0.14}" '
            f'rx="{h * 0.07}" fill="{LINE}"/>'
        )
    return (
        f'<g transform="translate({cx} {cy}) rotate({angle})" opacity="{opacity}">'
        f'<rect x="{-w / 2}" y="{-h / 2}" width="{w}" height="{h}" rx="{r}" fill="{fill}"/>{lines}</g>'
    )


def scatter(seed: int, box: tuple[float, float, float, float], count: int, avoid: tuple[float, float, float]) -> str:
    """Scattered cards around the mascot, never on top of it."""
    rnd = random.Random(seed)
    x0, y0, x1, y1 = box
    ax, ay, ar = avoid
    out, placed, tries = [], [], 0
    while len(placed) < count and tries < 4000:
        tries += 1
        w = rnd.uniform(22, 34)
        h = w * rnd.uniform(0.58, 0.7)
        cx, cy = rnd.uniform(x0 + w / 2, x1 - w / 2), rnd.uniform(y0 + h / 2, y1 - h / 2)
        if math.hypot(cx - ax, cy - ay) < ar + w * 0.55:
            continue
        if any(math.hypot(cx - px, cy - py) < (w + pw) * 0.62 for px, py, pw in placed):
            continue
        placed.append((cx, cy, w))
        kind = rnd.random()
        if kind < 0.45:
            out.append(card(cx, cy, w, h, rnd.uniform(-28, 28), PAPER, ACCENT, 1))
        elif kind < 0.75:
            out.append(card(cx, cy, w * 0.8, h * 0.8, rnd.uniform(-35, 35), ACCENT_SOFT, None, 0.55))
        else:
            out.append(card(cx, cy, w, h, rnd.uniform(-20, 20), PAPER, ACCENT_SOFT, 0.85))
    return "".join(out)


def sidebar_art(height: float = 314) -> str:
    """164 wide strip: cream top with flying cards around the mascot, terracotta foot with the wordmark."""
    w = 164
    foot = 92
    top = height - foot
    m = 96  # mascot size
    mx, my = (w - m) / 2, top / 2 - m / 2 - 2
    wm_w = 96
    wm_h = wm_w * 98 / 246
    return (
        f'<rect width="{w}" height="{height}" fill="{CREAM}"/>'
        + scatter(7, (4, 6, w - 4, top - 6), 9, (w / 2, my + m / 2, m * 0.5))
        + place("kipple-mascot-light.svg", mx, my, m, m)
        + f'<path d="M0 {top} Q {w * 0.5} {top - 14} {w} {top} V {height} H 0 Z" fill="{ACCENT}"/>'
        + place(
            "kipple-wordmark-light.svg",
            (w - wm_w) / 2,
            top + 14,
            wm_w,
            wm_h,
            {'stroke="#23211E"': f'stroke="{PAPER}"', f'fill="{ACCENT}"': f'fill="{INK}"'},
        )
        + f'<text x="{w / 2}" y="{top + 14 + wm_h + 20}" text-anchor="middle" '
        f'font-family="Segoe UI, Noto Sans, DejaVu Sans, sans-serif" font-size="11.5" font-weight="600" '
        f'letter-spacing="0.4" fill="{PAPER}" fill-opacity="0.92">Tame your kipple</text>'
    )


def sidebar_svg() -> str:
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="164" height="314" viewBox="0 0 164 314">{sidebar_art()}</svg>'


def header_svg() -> str:
    # NSIS draws its header on white, image in the left corner, page title to its right.
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" width="150" height="57" viewBox="0 0 150 57">'
        '<rect width="150" height="57" fill="#FFFFFF"/>'
        + place("kipple-mascot-light.svg", 8, 5, 47, 47)
        + place("kipple-wordmark-light.svg", 60, 15, 76, 76 * 98 / 246)
        + "</svg>"
    )


def wix_dialog_svg() -> str:
    # WiX Welcome/Finish: text is drawn from x~180, so the art lives in the left strip.
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" width="493" height="312" viewBox="0 0 493 312">'
        '<rect width="493" height="312" fill="#FFFFFF"/>'
        + sidebar_art(312)
        + "</svg>"
    )


def wix_banner_svg() -> str:
    # WiX draws the page title over the left part of the banner, so the logo sits on the right.
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" width="493" height="58" viewBox="0 0 493 58">'
        '<rect width="493" height="58" fill="#FFFFFF"/>'
        + place("kipple-mascot-light.svg", 440, 7, 44, 44)
        + "</svg>"
    )


def render(svg: str, scale: float) -> Image.Image:
    png = cairosvg.svg2png(bytestring=svg.encode(), scale=scale)
    img = Image.open(io.BytesIO(png)).convert("RGBA")
    bg = Image.new("RGBA", img.size, "#FFFFFF")
    return Image.alpha_composite(bg, img).convert("RGB")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, svg in {
        "nsis-sidebar": sidebar_svg(),
        "nsis-header": header_svg(),
        "wix-dialog": wix_dialog_svg(),
        "wix-banner": wix_banner_svg(),
    }.items():
        render(svg, 1).save(OUT / f"{name}.bmp")
        print("wrote", OUT / f"{name}.bmp")


if __name__ == "__main__":
    main()
