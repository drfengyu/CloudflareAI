import json
import os
from concurrent.futures import ProcessPoolExecutor

import UnityPy
from UnityPy.helpers.TypeTreeGenerator import TypeTreeGenerator

DATA = r"D:\Github\民间改版学习\Windows64_v1.0.5\Windows_v1.0.5\tstd2_Data"
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))

_gen = None


def generator():
    global _gen
    if _gen is None:
        _gen = TypeTreeGenerator("2022.2.11f1")
        _gen.load_local_dll_folder(os.path.join(DATA, "Managed"))
    return _gen


def scan(level):
    try:
        e = UnityPy.load(os.path.join(DATA, f"level{level}"))
        e.typetree_generator = generator()
    except Exception:
        return level, None
    art = []
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
            w = int(sp.m_Rect.width)
            h = int(sp.m_Rect.height)
            if w < 32 or h < 32:
                continue
            art.append(
                {
                    "name": go.m_Name,
                    "w": w,
                    "h": h,
                    "ppu": float(sp.m_PixelsToUnits),
                    "x": round(float(tr.m_LocalPosition.x), 3),
                    "y": round(float(tr.m_LocalPosition.y), 3),
                }
            )
        except Exception:
            pass
    return level, art


if __name__ == "__main__":
    with ProcessPoolExecutor(max_workers=12) as ex:
        results = dict(ex.map(scan, range(1, 168)))
    p = os.path.join(ROOT, "data", "desktop_scene_art.json")
    with open(p, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=1)
    print("written", p)
    for level, art in sorted(results.items()):
        if art:
            print(level, [(a["name"], a["w"], a["h"]) for a in art][:6])
