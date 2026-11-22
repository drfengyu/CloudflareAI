import UnityPy, os, base64
from UnityPy.helpers.TypeTreeGenerator import TypeTreeGenerator
from PIL import Image
from UnityPy.classes import PPtr

DATA = r"D:\Github\民间改版学习\Windows64_v1.0.5\Windows_v1.0.5\tstd2_Data"
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT_MAPS = os.path.join(ROOT, "public", "game-assets", "kongming", "maps")
os.makedirs(OUT_MAPS, exist_ok=True)

gen = TypeTreeGenerator("2022.2.11f1")
gen.load_local_dll_folder(os.path.join(DATA, "Managed"))
env_cache = {}
tile_img_cache = {}

def env_for(fn):
    if fn in env_cache: return env_cache[fn]
    e = UnityPy.load(os.path.join(DATA, fn)); e.typetree_generator = gen
    env_cache[fn] = e
    return e

def class_of(o):
    mb = o.parse_monobehaviour_head(); s = mb.m_Script.deref_parse_as_object()
    return (s.m_Namespace + "." if s.m_Namespace else "") + s.m_ClassName

def pname(p):
    try:
        if getattr(p, "m_PathID", 0) == 0: return None
        obj = p.deref_parse_as_object(); n = getattr(obj, "m_Name", "")
        return n if n else None
    except Exception: return None

def get_gameobject(d):
    try: return d.m_GameObject.deref_parse_as_object()
    except Exception: return None

def sprite_image(sp):
    try: return sp.image.convert("RGBA")
    except Exception: return None

def tilemap_info(tm):
    go = get_gameobject(tm)
    name = getattr(go, "m_Name", "") if go else ""
    order, layer, enabled = 0, 1, True
    if go:
        for cp in go.m_Component:
            try:
                c = cp.component.deref_parse_as_object()
                if type(c).__name__ == "TilemapRenderer":
                    order = int(getattr(c, "m_SortingOrder", 0))
                    layer = int(getattr(c, "m_SortingLayer", 1))
                    enabled = bool(getattr(c, "m_Enabled", 1))
            except Exception: pass
    return name, order, layer, enabled

def render_map(level, skip_block=True, out_path=None):
    e = env_for(f"level{level}")
    tilemaps = []
    for o in e.objects:
        if o.type.name == "Tilemap": tilemaps.append(o.read())
    if not tilemaps: return None
    minx = miny = 1e9; maxx = maxy = -1e9
    for tm in tilemaps:
        for cell, tile in tm.m_Tiles:
            minx = min(minx, cell.x); maxx = max(maxx, cell.x)
            miny = min(miny, cell.y); maxy = max(maxy, cell.y)
    if minx == 1e9: return None
    minx -= 1; maxx += 1; miny -= 1; maxy += 1
    wcells = int(maxx - minx + 1); hcells = int(maxy - miny + 1)
    scale = 32 if max(wcells, hcells) <= 80 else (24 if max(wcells, hcells) <= 130 else 16)
    W = wcells * scale; H = hcells * scale
    if W * H > 12_000_000:
        scale = 12; W = wcells * scale; H = hcells * scale
    layers = []
    for tm in tilemaps:
        name, order, layer, enabled = tilemap_info(tm)
        if not enabled: continue
        if skip_block and ("Block" in name or "碰撞" in name): continue
        layers.append((layer, order, int(getattr(tm, 'object_reader').path_id), name, tm))
    layers.sort(key=lambda x: (x[0], x[1], x[2]))
    img = Image.new("RGBA", (W, H), (10, 12, 16, 255))
    for _,_,_,name,tm in layers:
        for cell, tile in tm.m_Tiles:
            try:
                asset = tm.m_TileAssetArray[tile.m_TileIndex].m_Data.deref_parse_as_object()
                sp = asset.m_Sprite.deref_parse_as_object()
                key = (sp.object_reader.path_id, scale)
                tile_img = tile_img_cache.get(key)
                if tile_img is None:
                    src = sprite_image(sp)
                    if src is None: continue
                    size = max(1, int(round(scale * src.width / 32))), max(1, int(round(scale * src.height / 32)))
                    tile_img = src.resize(size, Image.LANCZOS)
                    pivot = getattr(sp, "m_Pivot", None)
                    px = float(pivot.x) if pivot else 0.5; py = float(pivot.y) if pivot else 0.5
                    tile_img_cache[key] = (tile_img, size, px, py)
                tile_img, size, px, py = tile_img_cache[key]
                cx = (float(cell.x) - minx) * scale + scale / 2
                cy = (maxy - float(cell.y)) * scale + scale / 2
                left = int(round(cx - size[0] * px)); top = int(round(cy - size[1] * (1 - py)))
                img.alpha_composite(tile_img, (left, top))
            except Exception: pass
    out = out_path or os.path.join(OUT_MAPS, f"level{level}.png")
    img.save(out, optimize=True)
    return out, len(layers), [x[3] for x in layers]

if __name__ == "__main__":
    out, n, names = render_map(11, skip_block=True, out_path=os.path.join(ROOT, "tmp-level11-noblock.png"))
    print(out, n, names)
