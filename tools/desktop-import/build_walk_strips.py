"""Build 8-frame walking strips from the desktop unit textures.

Each exported texture starts with eight walk frames on a 40px pitch
(content x=40+40*i, width about 32), followed by attack / mount art.
Normalise every frame into a 64x64 bottom-aligned cell so the renderer can
animate with a simple 64px viewBox step.
"""

from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "public" / "game-assets" / "kongming" / "units"
DST = ROOT / "public" / "game-assets" / "kongming" / "units_field_walk"


def cell(frame: Image.Image) -> Image.Image:
    box = frame.getbbox()
    if box:
        frame = frame.crop(box)
    scale = min(1.0, 48 / max(frame.width, frame.height))
    if scale < 1.0:
        frame = frame.resize(
            (max(1, round(frame.width * scale)), max(1, round(frame.height * scale))),
            Image.NEAREST,
        )
    out = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    out.alpha_composite(frame, ((64 - frame.width) // 2, max(0, 62 - frame.height)))
    return out


def main() -> None:
    DST.mkdir(parents=True, exist_ok=True)
    for path in sorted(SRC.glob("*.png")):
        im = Image.open(path).convert("RGBA")
        strip = Image.new("RGBA", (64 * 8, 64), (0, 0, 0, 0))
        if im.width >= 552 and im.height >= 60:
            for i in range(8):
                x0 = 32 + 40 * i
                frame = im.crop((x0, 0, x0 + 40, im.height))
                strip.alpha_composite(cell(frame), (i * 64, 0))
        else:
            frame = cell(im)
            for i in range(8):
                strip.alpha_composite(frame, (i * 64, 0))
        strip.save(DST / path.name)
    print(f"wrote {len(list(DST.glob('*.png')))} walking strips to {DST}")


if __name__ == "__main__":
    main()
