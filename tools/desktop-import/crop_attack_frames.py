"""Slice the desktop battle attack frames out of each unit texture.

`Character.AttackSprites` reads 64x64 frames from x=424 onwards and plays them
right-to-left (the last frame is played first).  The exported unit PNG keeps
the whole strip, so the browser can use the original 64x64 frames directly.
"""

from pathlib import Path
import json

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "public" / "game-assets" / "kongming" / "units"
DST = ROOT / "public" / "game-assets" / "kongming" / "units_attack"
MANIFEST = ROOT / "lib" / "kongming" / "attack-frames.json"


def main() -> None:
    DST.mkdir(parents=True, exist_ok=True)
    manifest: dict[str, int] = {}
    for path in sorted(SRC.glob("*.png")):
        im = Image.open(path).convert("RGBA")
        if im.width < 424 + 64:
            continue
        count = (im.width - 424) // 64
        if count <= 0:
            continue
        model = path.stem
        for index in range(count):
            frame = im.crop((424 + index * 64, 0, 424 + (index + 1) * 64, 64))
            frame.save(DST / f"{model}-{index}.png")
        manifest[model] = count

    MANIFEST.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print(f"wrote {len(manifest)} attack strips to {DST}")


if __name__ == "__main__":
    main()
