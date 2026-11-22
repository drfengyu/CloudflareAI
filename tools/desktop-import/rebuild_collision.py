import UnityPy, os, json, base64, math
from UnityPy.helpers.TypeTreeGenerator import TypeTreeGenerator

DATA = r"D:\Github\民间改版学习\Windows64_v1.0.5\Windows_v1.0.5\tstd2_Data"
ROOT = r"C:\Users\Drfen\Doubao\chats\2026-11-22\new-chat\cloudai-work"
SCENES = os.path.join(ROOT, "public", "game-assets", "kongming", "scenes.json")

gen = TypeTreeGenerator("2022.2.11f1")
gen.load_local_dll_folder(os.path.join(DATA, "Managed"))

def go_of(obj):
    try:
        return obj.m_GameObject.deref_parse_as_object()
    except Exception:
        return None

def comp_type(cp):
    try:
        return type(cp.component.deref_parse_as_object()).__name__
    except Exception:
        return "?"

def point_in_poly(px, py, poly):
    inside = False
    n = len(poly)
    j = n - 1
    for i in range(n):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if ((yi > py) != (yj > py)) and (px < (xj - xi) * (py - yi) / ((yj - yi) or 1e-9) + xi):
            inside = not inside
        j = i
    return inside

def load_level(level):
    fn = f"level{level}"
    path = os.path.join(DATA, fn)
    if not os.path.exists(path):
        return None
    env = UnityPy.load(path)
    env.typetree_generator = gen
    layers = []
    for o in env.objects:
        if o.type.name != "CompositeCollider2D":
            continue
        try:
            d = o.read()
            go = d.m_GameObject.deref_parse_as_object()
            name = getattr(go, "m_Name", "") or ""
            layer_id = int(getattr(go, "m_Layer", 0))
            comp = getattr(d, "m_CompositePaths", None)
            paths = getattr(comp, "m_Paths", None) if comp else None
        except Exception:
            continue
        if not paths:
            continue
        # TeamMove.colliderLayerMask = 128，只有 EnvBlock（layer 7）参与行走阻挡。
        if layer_id != 7:
            continue
        layer = []
        for p in paths:
            pts = [(float(v.x), float(v.y)) for v in p]
            if len(pts) >= 3:
                layer.append(pts)
        if layer:
            layers.append((name, layer))
    return layers

def inside_layer(px, py, layer):
    count = 0
    for poly in layer:
        if point_in_poly(px, py, poly):
            count += 1
    return count % 2 == 1

def main():
    import sys
    only = [int(a) for a in sys.argv[1:] if a.isdigit()]
    with open(SCENES, encoding="utf-8") as f:
        scenes = json.load(f)
    report = []
    for sc in scenes:
        if only and sc["level"] not in only:
            continue
        polys = load_level(sc["level"])
        if not polys or not sc.get("map"):
            continue
        m = sc["map"]
        w, h = int(m["w"]), int(m["h"])
        bits = bytearray((w * h + 7) // 8)
        blocked = 0
        for iy in range(h):
            y = m["y"] + h - 1 - iy + 0.5
            for ix in range(w):
                x = m["x"] + ix + 0.5
                hit = any(inside_layer(x, y, layer) for _, layer in polys)
                if hit:
                    idx = iy * w + ix
                    bits[idx >> 3] |= 1 << (idx & 7)
                    blocked += 1
        # merge with existing boxes-only mask? keep boxes separately; overwrite mask
        sc["blockedMask"] = base64.b64encode(bytes(bits)).decode("ascii")
        report.append((sc["level"], sc["name"], w, h, len(polys), blocked, round(blocked / (w * h), 3)))
    with open(SCENES, "w", encoding="utf-8") as f:
        json.dump(scenes, f, ensure_ascii=False, separators=(",", ":"))
    for r in report:
        print(r)

if __name__ == "__main__":
    main()
