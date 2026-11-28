from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
MAPS = ROOT / "public" / "game-assets" / "kongming" / "maps"
GLYPH = Path(__file__).resolve().parent / "assets" / "coupon-glyph.png"

# Xu Zhou coupon room entrance (map cells (7,-2)); the plaque sits on the ridge,
# its bottom edge touching the eave like the 武 shop sign next door.
SIGN = (595, 460, 627, 492)


def make_coupon_town_sign() -> None:
    base = Image.open(MAPS / "level11.png").convert("RGBA")
    draw = ImageDraw.Draw(base)
    x0, y0, x1, y1 = SIGN
    # dark wooden frame, then the pale plaque face, same palette as the shops
    draw.rectangle((x0, y0, x1 - 1, y1 - 1), fill=(24, 19, 16, 255))
    draw.rectangle((x0 + 2, y0 + 2, x1 - 3, y1 - 3), fill=(233, 209, 198, 255))

    glyph = Image.open(GLYPH).convert("RGBA")
    glyph = glyph.crop(glyph.getbbox())
    mask = glyph.getchannel("A")
    # 3:4 glyph at 18x24 so the strokes survive the downscale
    mask = mask.resize((18, 24), Image.Resampling.LANCZOS).point(lambda v: 255 if v > 110 else 0)
    base.paste((24, 19, 16, 255), (x0 + 7, y0 + 4), mask)
    base.save(MAPS / "level11.png", optimize=True)
    print("sign at", SIGN)


if __name__ == "__main__":
    make_coupon_town_sign()
