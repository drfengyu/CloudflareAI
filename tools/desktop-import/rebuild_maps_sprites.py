"""Rebuild field maps from the scene's layer-0 SpriteRenderer art.

The desktop scenes keep the whole painted map as one or more large
SpriteRenderer pieces on sorting layer 0.  The Tilemaps in the same scene
only hold collision / small decorative overlays and are not the real map
picture.  Drawing only the tilemaps produced broken buildings with floating
shop signs, so this tool composites the layer-0 art in world space using the
same cell bounds / scale as scenes.json.
"""
import json
import os
import sys
from concurrent.futures import ProcessPoolExecutor

import UnityPy
from PIL import Image
from UnityPy.helpers.TypeTreeGenerator import TypeTreeGenerator

DATA = r"D:\Github\民间改版学习\Windows64_v1.0.5\Windows_v1.0.5\tstd2_Data"
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SCENES = os.path.join(ROOT, "public", "game-assets", "kongming", "scenes.json")
OUT_MAPS = os.path.join(ROOT, "public", "game-assets", "kongming", "maps")

_gen = None


def generator():
    global _gen
    if _gen is None:
        _gen = TypeTreeGenerator("2022.2.11f1")
        _gen.load_local_dll_folder(os.path.join(DATA, "Managed"))
    return _gen


def load_scene(level):
    e = UnityPy.load(os.path.join(DATA, f"level{level}"))
    e.typetree_generator = generator()
    return e


def layer0_sprites(e):
    out = []
    for o in e.objects:
        if o.type.name != "GameObject":
            continue
        try:
            go = o.read()
        except Exception:
            continue
        tr = sr = None
        for cp in go.m_Component:
            try:
                c = cp.component.deref_parse_as_object()
                if type(c).__name__ == "Transform":
                    tr = c
                elif type(c).__name__ == "SpriteRenderer":
                    sr = c
            except Exception:
                pass
        if not tr or not sr or not sr.m_Enabled:
            continue
        try:
            if int(sr.m_SortingLayer) != 0:
                continue
            sp = sr.m_Sprite.deref_parse_as_object()
            if not sp:
                continue
            img = sp.image.convert("RGBA")
            if not img or img.width < 4:
                continue
            ppu = float(sp.m_PixelsToUnits) or 16.0
        except Exception:
            continue
        # transform scale can stretch the art
        lx = float(tr.m_LocalScale.x)
        ly = float(tr.m_LocalScale.y)
        if lx == 0 or ly == 0:
            continue
        out.append(
            {
                "name": go.m_Name,
                "img": img,
                "w": img.width,
                "h": img.height,
                "ppu": ppu,
                "px": float(sp.m_Pivot.x),
                "py": float(sp.m_Pivot.y),
                "x": float(tr.m_LocalPosition.x),
                "y": float(tr.m_LocalPosition.y),
                "sx": lx,
                "sy": ly,
                "flipx": bool(getattr(sr, "m_FlipX", False)),
                "flipy": bool(getattr(sr, "m_FlipY", False)),
            }
        )
    return out


def render_level(level, meta, out_path):
    e = load_scene(level)
    sprites = layer0_sprites(e)
    if not sprites:
        return None, []
    mx = meta["x"]
    my = meta["y"]
    mw = meta["w"]
    mh = meta["h"]
    scale = meta["scale"]
    W = int(mw * scale)
    H = int(mh * scale)
    # Some maps are downsized in scenes.json; still cap huge assets.
    if W * H > 24_000_000:
        return None, sprites
    canvas = Image.new("RGBA", (W, H), (0, 0, 0, 255))
    for s in sprites:
        world_w = s["w"] / s["ppu"] * abs(s["sx"])
        world_h = s["h"] / s["ppu"] * abs(s["sy"])
        left = s["x"] - s["px"] * world_w * (1 if s["sx"] > 0 else -1)
        # Pivot is in sprite-local space; for a flipped axis mirror the anchor.
        if s["sx"] < 0:
            left = s["x"] - (1 - s["px"]) * world_w
        bottom = s["y"] - s["py"] * world_h * (1 if s["sy"] > 0 else -1)
        if s["sy"] < 0:
            bottom = s["y"] - (1 - s["py"]) * world_h
        ox = int(round((left - mx) * scale))
        oy = int(round(((my + mh) - (bottom + world_h)) * scale))
        pw = max(1, int(round(world_w * scale)))
        ph = max(1, int(round(world_h * scale)))
        img = s["img"]
        if s["flipx"]:
            img = img.transpose(Image.FLIP_LEFT_RIGHT)
        if s["flipy"]:
            img = img.transpose(Image.FLIP_TOP_BOTTOM)
        img = img.resize((pw, ph), Image.NEAREST)
        if img.mode != "RGBA":
            img = img.convert("RGBA")
        canvas.alpha_composite(img, (ox, oy))
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    canvas.save(out_path, optimize=True)
    return out_path, sprites


def worker(args):
    level, meta = args
    out = os.path.join(OUT_MAPS, f"level{level}.png")
    try:
        path, sprites = render_level(level, meta, out)
        names = [s["name"] for s in sprites]
        return level, path is not None, len(sprites), names[:8]
    except Exception as ex:
        return level, False, 0, ["ERROR: " + repr(ex)]


def is_full_art(art):
    """Name-based rule for scenes whose layer-0 art is the actual whole map.

    Indoor rooms ship their walls/floors in Tilemaps and place only a cropped
    backdrop on layer 0, so those must keep the tilemap renderer.  Towns, caves
    and the world map ship one painted SpriteRenderer per map; their tilemaps
    only contain colliders / a few overlays, which is why tilemap-only renders
    lose walls and float shop signs.
    """
    if not art:
        return False
    for a in art:
        name = a["name"]
        if name in ("Map Pic",):
            continue
        if name.startswith("Map"):
            return True
        if name in ("全地图",):
            return True
        if any(k in name for k in ("徐州", "宛城", "山洞", "村", "城", "地洞")):
            return True
    return False


def main(levels=None, preview=None, full_only=False):
    data = json.load(open(SCENES, encoding="utf-8"))
    metas = {int(s["level"]): s["map"] for s in data if s.get("map")}
    art = json.load(open(os.path.join(ROOT, "data", "desktop_scene_art.json"), encoding="utf-8"))
    art = {int(k): v for k, v in art.items()}
    jobs = [(lv, metas[lv]) for lv in sorted(metas) if levels is None or lv in levels]
    if full_only:
        jobs = [(lv, meta) for lv, meta in jobs if is_full_art(art.get(lv))]
    if preview:
        for lv, meta in jobs:
            path, sprites = render_level(lv, meta, preview.format(level=lv))
            print(lv, path, [s["name"] for s in sprites])
        return
    ok = fail = 0
    with ProcessPoolExecutor(max_workers=max(1, min(12, (os.cpu_count() or 4)))) as ex:
        for level, good, n, names in ex.map(worker, jobs):
            if good:
                ok += 1
            else:
                fail += 1
            print(level, good, n, names)
    print("done", ok, "ok", fail, "without layer0 art")


if __name__ == "__main__":
    args = sys.argv[1:]
    if args and args[0].startswith("--levels="):
        lv = {int(x) for x in args[0].split("=", 1)[1].split(",")}
        main(levels=lv, preview=os.path.join(ROOT, "tmp-map-{level}.png"))
    elif args and args[0] == "--full":
        main(full_only=True)
    else:
        main()
