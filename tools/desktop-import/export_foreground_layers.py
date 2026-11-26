"""Export the original `Foreground` Tilemap as a transparent overlay.

The old map exporter flattened every tilemap into one image, so characters
always rendered on top of arches, roofs and tree canopies.  This script keeps
the same grid as the exported base map but renders only the original
`Foreground` layer, to be painted above actors in the web client.
"""

from __future__ import annotations

import json
import os

import UnityPy
from PIL import Image
from UnityPy.helpers.TypeTreeGenerator import TypeTreeGenerator

DATA = r"D:\Github\民间改版学习\Windows64_v1.0.5\Windows_v1.0.5\tstd2_Data"
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
MAPS = os.path.join(ROOT, "public", "game-assets", "kongming", "maps")
SCENES = os.path.join(ROOT, "public", "game-assets", "kongming", "scenes.json")

gen = TypeTreeGenerator("2022.2.11f1")
gen.load_local_dll_folder(os.path.join(DATA, "Managed"))


def render_foreground(level: int, meta: dict) -> Image.Image:
    env = UnityPy.load(os.path.join(DATA, f"level{level}"))
    env.typetree_generator = gen
    scale = int(meta["scale"])
    minx = int(meta["x"])
    miny = int(meta["y"])
    h = int(meta["h"])
    maxy = miny + h - 1
    width = int(meta["w"]) * scale
    height = h * scale
    img = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    cache: dict[tuple[int, int], tuple[Image.Image, tuple[int, int], float, float]] = {}

    for obj in env.objects:
        if obj.type.name != "Tilemap":
            continue
        tm = obj.read()
        try:
            name = tm.m_GameObject.deref_parse_as_object().m_Name
        except Exception:
            continue
        if name != "Foreground":
            continue
        for cell, tile in tm.m_Tiles:
            try:
                asset = tm.m_TileAssetArray[tile.m_TileIndex].m_Data.deref_parse_as_object()
                sp = asset.m_Sprite.deref_parse_as_object()
                key = (sp.object_reader.path_id, scale)
                cached = cache.get(key)
                if cached is None:
                    src = sp.image.convert("RGBA")
                    size = (
                        max(1, int(round(scale * src.width / 32))),
                        max(1, int(round(scale * src.height / 32))),
                    )
                    tile_img = src.resize(size, Image.Resampling.LANCZOS)
                    pivot = getattr(sp, "m_Pivot", None)
                    px = float(pivot.x) if pivot else 0.5
                    py = float(pivot.y) if pivot else 0.5
                    cached = (tile_img, size, px, py)
                    cache[key] = cached
                tile_img, size, px, py = cached
                cx = (float(cell.x) - minx) * scale + scale / 2
                cy = (maxy - float(cell.y)) * scale + scale / 2
                left = int(round(cx - size[0] * px))
                top = int(round(cy - size[1] * (1 - py)))
                img.alpha_composite(tile_img, (left, top))
            except Exception:
                continue
    return img


def main() -> None:
    with open(SCENES, encoding="utf-8") as fh:
        scenes = json.load(fh)
    changed = 0
    for scene in scenes:
        if scene["level"] == 172:
            continue
        path = os.path.join(DATA, f"level{scene['level']}")
        if not os.path.exists(path) or not scene.get("map"):
            continue
        meta = scene["map"]
        img = render_foreground(int(scene["level"]), meta)
        if img.getbbox() is None:
            continue
        name = f"level{scene['level']}-fg.png"
        img.save(os.path.join(MAPS, name), optimize=True)
        meta["fg"] = f"/kongming/maps/{name}"
        changed += 1
    with open(SCENES, "w", encoding="utf-8") as fh:
        json.dump(scenes, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"exported {changed} foreground layers")


if __name__ == "__main__":
    main()
