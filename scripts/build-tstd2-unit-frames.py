# 将桌面版单位条带按透明像素切帧，生成运行时动画帧清单。
# 用法：python scripts/build-tstd2-unit-frames.py
from __future__ import annotations

import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "public" / "trial" / "tstd2" / "units"
OUT = ROOT / "components" / "trial" / "tstd2-unit-frames.json"


def is_visible(px) -> bool:
    r, g, b, a = px
    return a >= 20


def split_frames(path: Path) -> list[dict[str, int]]:
    image = Image.open(path).convert("RGBA")
    width, height = image.size
    pixels = image.load()

    visible_columns = [False] * width
    for x in range(width):
        for y in range(height):
            if is_visible(pixels[x, y]):
                visible_columns[x] = True
                break

    runs: list[tuple[int, int]] = []
    start = None
    gap = 0
    for x, visible in enumerate(visible_columns):
        if visible:
            if start is None:
                start = x
            gap = 0
        elif start is not None:
            gap += 1
            if gap >= 2:
                runs.append((start, x - gap))
                start = None
    if start is not None:
        runs.append((start, width - 1))

    frames: list[dict[str, int]] = []
    for x0, x1 in runs:
        ys = [
            y
            for x in range(x0, x1 + 1)
            for y in range(height)
            if is_visible(pixels[x, y])
        ]
        if not ys:
            continue
        y0, y1 = min(ys), max(ys)
        if x1 - x0 + 1 < 3 or y1 - y0 + 1 < 8:
            continue
        frames.append({"x": x0, "y": y0, "w": x1 - x0 + 1, "h": y1 - y0 + 1})
    return frames


payload = {}
for path in sorted(SRC.glob("*.png")):
    payload[path.stem] = split_frames(path)

OUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
counts = {key: len(value) for key, value in payload.items()}
print(f"{len(payload)} strips, frames min={min(counts.values())} max={max(counts.values())}")
print("21:", payload.get("21"))
