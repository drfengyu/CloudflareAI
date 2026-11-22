"""Normalise exported NPC walking textures into 64x64 field sprites."""

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "data" / "npc_textures"
STATIC = ROOT / "public" / "game-assets" / "kongming" / "units_field"
WALK = ROOT / "public" / "game-assets" / "kongming" / "units_field_walk"


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


def frames(im: Image.Image) -> list[Image.Image]:
    if im.width >= 552 and im.height >= 60:
        xs = [32 + 40 * i for i in range(8)]
    elif im.width >= 320 and im.height >= 36:
        xs = [40 * i for i in range(8)]
    else:
        return [cell(im)] * 8
    return [cell(im.crop((x, 0, x + 40, im.height))) for x in xs]


def main() -> None:
    STATIC.mkdir(parents=True, exist_ok=True)
    WALK.mkdir(parents=True, exist_ok=True)
    count = 0
    for path in sorted(SRC.glob("*.png")):
        im = Image.open(path).convert("RGBA")
        cells = frames(im)
        cells[0].save(STATIC / path.name)
        strip = Image.new("RGBA", (64 * 8, 64), (0, 0, 0, 0))
        for i, frame in enumerate(cells):
            strip.alpha_composite(frame, (i * 64, 0))
        strip.save(WALK / path.name)
        count += 1
    print(f"wrote {count} NPC field sprites and walking strips")


if __name__ == "__main__":
    main()
