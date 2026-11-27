"""Trim the exporter's opaque one-cell border from scene maps.

`export_game.py` deliberately renders one extra tile around the tile bounds so
that tall tiles are not clipped.  That margin is filled with the opaque
background colour, so it shows up in the game as a black frame between the
screen edge and the walls, and makes every room look shifted inward.

This pass removes whole cells that are entirely background on each edge, then
updates the scene coordinates, blocked mask, foreground layer and doorway
transitions by the same amount.  A spawn point or NPC left outside the cropped
map is moved back inside; legacy event tiles that were already out of bounds
stay untouched, since removing the margin cannot make them reachable.
"""

from __future__ import annotations

import base64
import json
import math
import os

from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
ASSETS = os.path.join(ROOT, "public", "game-assets", "kongming")
MAPS = os.path.join(ASSETS, "maps")
SCENES = os.path.join(ASSETS, "scenes.json")
BG = (10, 12, 16, 255)


def resolve_asset(path: str) -> str:
    path = path.replace("/game-assets/kongming/", "/kongming/")
    return os.path.join(ASSETS, path.lstrip("/").replace("kongming/", "", 1))


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


def outside(m: dict, x: float, y: float) -> float:
    return max(
        m["x"] - x,
        x - (m["x"] + m["w"] - 1),
        m["y"] - y,
        y - (m["y"] + m["h"] - 1),
        0,
    )


def border_cells(im: Image.Image, scale: int) -> tuple[int, int, int, int]:
    w, h = im.size

    def col_clear(x: int) -> bool:
        return all(im.getpixel((x, y)) == BG for y in range(h))

    def row_clear(y: int) -> bool:
        return all(im.getpixel((x, y)) == BG for x in range(w))

    left_px = 0
    while left_px < w and col_clear(left_px):
        left_px += 1
    top_px = 0
    while top_px < h and row_clear(top_px):
        top_px += 1
    right_px = 0
    while right_px < w and col_clear(w - 1 - right_px):
        right_px += 1
    bottom_px = 0
    while bottom_px < h and row_clear(h - 1 - bottom_px):
        bottom_px += 1
    return left_px // scale, top_px // scale, right_px // scale, bottom_px // scale


def main() -> None:
    scenes = json.load(open(SCENES, encoding="utf-8"))
    cropped = 0
    skipped: list[int] = []
    for scene in scenes:
        m = scene.get("map")
        if not m or scene["level"] == 172:
            continue
        src = resolve_asset(m["src"])
        if not os.path.exists(src):
            continue
        im = Image.open(src).convert("RGBA")
        scale = int(m["scale"])
        l, t, r, b = border_cells(im, scale)
        # The exporter adds exactly one clear cell on every side.  Anything
        # larger means the map contains intentional empty space, so leave it.
        if not all(v >= 1 for v in (l, t, r, b)) or max(l, t, r, b) > 1:
            continue
        l = t = r = b = 1
        w_cells, h_cells = int(m["w"]), int(m["h"])
        if l + r >= w_cells or t + b >= h_cells:
            skipped.append(scene["level"])
            continue
        nm = {
            "x": int(m["x"]) + l,
            "y": int(m["y"]) + b,
            "w": w_cells - l - r,
            "h": h_cells - t - b,
        }
        # Legacy event coordinates can sit outside the drawn room (for example
        # the opening trigger of 荆州宫殿).  They were already unreachable
        # before the crop and removing the margin does not change that, so they
        # must not block an otherwise valid trim.
        if any(outside(nm, *npc["pos"]) > 0.75 for npc in scene.get("npcs", [])):
            skipped.append(scene["level"])
            continue
        if scene.get("start"):
            x, y = scene["start"]
            scene["start"] = [
                min(max(float(x), nm["x"] + 0.01), nm["x"] + nm["w"] - 1.01),
                min(max(float(y), nm["y"] + 0.01), nm["y"] + nm["h"] - 1.01),
            ]

        px = (l * scale, t * scale, (w_cells - r) * scale, (h_cells - b) * scale)
        im.crop(px).save(src, optimize=True)
        if m.get("fg"):
            fg_src = resolve_asset(m["fg"])
            if os.path.exists(fg_src) and Image.open(fg_src).size == (im.width, im.height):
                Image.open(fg_src).convert("RGBA").crop(px).save(fg_src, optimize=True)

        if scene.get("blockedMask"):
            scene["blockedMask"] = crop_mask(scene["blockedMask"], w_cells, h_cells, l, t, w_cells - r, h_cells - b)
        m["x"], m["y"], m["w"], m["h"] = nm["x"], nm["y"], nm["w"], nm["h"]
        for tr in scene.get("transitions", []):
            x, y = tr["pos"]
            tr["pos"] = [
                min(max(float(x), nm["x"] + 0.01), nm["x"] + nm["w"] - 1.01),
                min(max(float(y), nm["y"] + 0.01), nm["y"] + nm["h"] - 1.01),
            ]
        cropped += 1

    with open(SCENES, "w", encoding="utf-8") as fh:
        json.dump(scenes, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"cropped {cropped} maps, skipped {len(skipped)}: {skipped}")


if __name__ == "__main__":
    main()
