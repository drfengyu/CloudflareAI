"""Crop transparent margins out of exported maps while keeping world data aligned.

Only scenes whose start, events, NPCs and non-world transitions all remain
inside the cropped cells are processed.  Scenes with detached art or far-away
doors are left untouched.  World-map boundary exits are clamped to the new edge.
"""

from __future__ import annotations

import base64
import json
import math
import os

from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
ASSETS = os.path.join(ROOT, "public", "game-assets", "kongming")
PUBLIC = os.path.join(ROOT, "public", "game-assets")
SCENES = os.path.join(ASSETS, "scenes.json")


def outside(m: dict, x: float, y: float) -> float:
    return max(m["x"] - x, x - (m["x"] + m["w"] - 1), m["y"] - y, y - (m["y"] + m["h"] - 1), 0)


def crop_mask(mask: str, old_w: int, old_h: int, l: int, t: int, r: int, b: int) -> str:
    raw = base64.b64decode(mask)
    bits = [bool(raw[i >> 3] & (1 << (i & 7))) for i in range(old_w * old_h)]
    new_w, new_h = r - l, b - t
    out = bytearray(math.ceil(new_w * new_h / 8))
    for row in range(new_h):
        src = (t + row) * old_w + l
        dst = row * new_w
        for col in range(new_w):
            if bits[src + col]:
                idx = dst + col
                out[idx >> 3] |= 1 << (idx & 7)
    return base64.b64encode(bytes(out)).decode("ascii")


def main() -> None:
    scenes = json.load(open(SCENES, encoding="utf-8"))
    cropped = 0
    skipped = 0
    for scene in scenes:
        m = scene.get("map")
        if not m or scene["level"] == 172:
            continue
        path = os.path.join(PUBLIC, m["src"].lstrip("/"))
        im = Image.open(path).convert("RGBA")
        box = im.getbbox()
        if box is None:
            continue
        scale = m["scale"]
        l = math.floor(box[0] / scale)
        t = math.floor(box[1] / scale)
        r = math.ceil(box[2] / scale)
        b = math.ceil(box[3] / scale)
        if l == 0 and t == 0 and r == m["w"] and b == m["h"]:
            continue
        nm = {"x": m["x"] + l, "y": m["y"] + (m["h"] - b), "w": r - l, "h": b - t}
        worst = 0.0
        if scene.get("start"):
            worst = max(worst, outside(nm, *scene["start"]))
        for tr in scene.get("transitions", []):
            if tr["scene"] != "大地图":
                worst = max(worst, outside(nm, *tr["pos"]))
        for ev in scene.get("events", []):
            worst = max(worst, outside(nm, *ev["pos"]))
        for npc in scene.get("npcs", []):
            worst = max(worst, outside(nm, *npc["pos"]))
        if worst > 0.75:
            skipped += 1
            continue
        px = (l * scale, t * scale, r * scale, b * scale)
        im.crop(px).save(path, optimize=True)
        if m.get("fg"):
            fg_path = os.path.join(PUBLIC, m["fg"].lstrip("/"))
            if os.path.exists(fg_path):
                Image.open(fg_path).convert("RGBA").crop(px).save(fg_path, optimize=True)
        old_w, old_h = m["w"], m["h"]
        if scene.get("blockedMask"):
            scene["blockedMask"] = crop_mask(scene["blockedMask"], old_w, old_h, l, t, r, b)
        m["x"], m["y"], m["w"], m["h"] = nm["x"], nm["y"], nm["w"], nm["h"]
        for tr in scene.get("transitions", []):
            if tr["scene"] != "大地图":
                continue
            x, y = tr["pos"]
            tr["pos"] = [
                min(max(x, m["x"] + 0.5), m["x"] + m["w"] - 0.5),
                min(max(y, m["y"] + 0.5), m["y"] + m["h"] - 0.5),
            ]
        cropped += 1
    with open(SCENES, "w", encoding="utf-8") as fh:
        json.dump(scenes, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"cropped {cropped} maps, skipped {skipped}")


if __name__ == "__main__":
    main()
