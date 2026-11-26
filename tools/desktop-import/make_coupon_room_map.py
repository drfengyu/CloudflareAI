from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
MAPS = ROOT / "public" / "game-assets" / "kongming" / "maps"
GLYPH = Path(__file__).resolve().parent / "assets" / "coupon-glyph.png"


def make_coupon_room_map() -> None:
    """Derive the coupon-room map from the original weapon shop.

    The original `level5.png` carries a small "武" plaque and a long shop
    banner that also reads "武".  The coupon room keeps the same 18x17 counter
    layout but replaces both signs with the "券" glyph used in Xu Zhou.
    """
    base = Image.open(MAPS / "level5.png").convert("RGBA")

    glyph = Image.open(GLYPH).convert("RGBA")
    glyph = glyph.crop(glyph.getbbox())
    mask = glyph.getchannel("A")

    # Small plaque at (32,32) on the top-left wall.
    draw = ImageDraw.Draw(base)
    draw.rectangle((32, 32, 63, 63), fill=(24, 19, 16, 255))
    draw.rectangle((34, 34, 61, 61), fill=(233, 209, 198, 255))
    base.paste((24, 19, 16, 255), (39, 37), mask.resize((18, 24), Image.Resampling.NEAREST))

    # Long banner inside the shop; its paper area is (68,96)-(189,113).
    draw.rectangle((68, 96, 189, 113), fill=(233, 209, 198, 255))
    base.paste((24, 19, 16, 255), (122, 96), mask.resize((14, 18), Image.Resampling.NEAREST))

    # The second long banner on the right still reads "武器"; repaint it too.
    draw.rectangle((388, 96, 505, 113), fill=(233, 209, 198, 255))
    base.paste((24, 19, 16, 255), (440, 96), mask.resize((14, 18), Image.Resampling.NEAREST))

    base.save(MAPS / "level172.png")


if __name__ == "__main__":
    make_coupon_room_map()
