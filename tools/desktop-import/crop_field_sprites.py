"""Extract the first walking frame from each desktop unit texture.

The exported unit PNG is a packed strip: the eight walking frames occupy
x=40..351 with a 40px pitch, followed by attack / mount artwork. Showing the
whole strip (or its first 64px) leaves the character outside the viewport,
so normalise one frame into a 64x64 bottom-aligned sprite.
"""

from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "public" / "game-assets" / "kongming" / "units"
DST = ROOT / "public" / "game-assets" / "kongming" / "units_field"


def first_group(im: Image.Image) -> tuple[int, int] | None:
    alpha = im.getchannel("A")
    width, height = im.size
    runs: list[tuple[int, int]] = []
    start = None
    prev = None
    for x in range(min(width, 360)):
        occupied = any(alpha.getpixel((x, y)) > 0 for y in range(height))
        if occupied:
            if start is None:
                start = x
            elif x != prev + 1:
                runs.append((start, prev))
                start = x
            prev = x
    if start is not None:
        runs.append((start, prev))
    for a, b in runs:
        if b - a + 1 >= 8:
            return a, b
    return None


def main() -> None:
    DST.mkdir(parents=True, exist_ok=True)
    for path in sorted(SRC.glob("*.png")):
        im = Image.open(path).convert("RGBA")
        group = first_group(im)
        if group:
            a, b = group
            box = im.crop((a, 0, b + 1, im.height)).getbbox()
            if box:
                frame = im.crop((a + box[0], box[1], a + box[2], box[3]))
            else:
                frame = im
        else:
            frame = im

        scale = min(1.0, 48 / max(frame.width, frame.height))
        if scale < 1.0:
            frame = frame.resize(
                (max(1, round(frame.width * scale)), max(1, round(frame.height * scale))),
                Image.NEAREST,
            )

        out = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
        x = (64 - frame.width) // 2
        y = 62 - frame.height
        out.alpha_composite(frame, (x, max(0, y)))
        out.save(DST / path.name)

    print(f"wrote {len(list(DST.glob('*.png')))} field sprites to {DST}")


if __name__ == "__main__":
    main()
