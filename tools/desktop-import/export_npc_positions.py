"""Export the transform position of every scene NPC GameObject.

The web port places event NPCs at `QuestEvent.pos`, which is the cell the NPC
walks *to* in the original script.  Several NPCs start somewhere else and are
moved onto that cell by an event, so the initial draw position has to come from
the scene's own SpriteRenderer transform instead.

Output: public/game-assets/kongming/npc-positions.json  { "<level>": { "<id>": [x, y] } }
"""
import json
import os
import re
import sys
from concurrent.futures import ProcessPoolExecutor

import UnityPy
from UnityPy.helpers.TypeTreeGenerator import TypeTreeGenerator

DATA = r"D:\Github\民间改版学习\Windows64_v1.0.5\Windows_v1.0.5\tstd2_Data"
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "lib", "kongming", "npc-positions.json")

_gen = None


def generator():
    global _gen
    if _gen is None:
        _gen = TypeTreeGenerator("2022.2.11f1")
        _gen.load_local_dll_folder(os.path.join(DATA, "Managed"))
    return _gen


def read_level(level):
    e = UnityPy.load(os.path.join(DATA, f"level{level}"))
    e.typetree_generator = generator()
    out = {}
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
        if tr is None or sr is None:
            continue
        name = (go.m_Name or "").strip()
        m = re.match(r"^(\d{4,5})\b", name)
        if not m:
            continue
        try:
            if int(sr.m_SortingLayer) != 2:
                continue
            x = float(tr.m_LocalPosition.x)
            y = float(tr.m_LocalPosition.y)
        except Exception:
            continue
        out[m.group(1)] = [round(x, 2), round(y, 2)]
    return level, out


def worker(level):
    try:
        return read_level(level)
    except Exception:
        return level, {}


def main(levels):
    if os.path.exists(OUT):
        data = json.load(open(OUT, encoding="utf-8"))
    else:
        data = {}
    with ProcessPoolExecutor(max_workers=max(1, min(8, (os.cpu_count() or 4)))) as ex:
        for level, pos in ex.map(worker, levels):
            if pos:
                data[str(level)] = pos
    json.dump(data, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, sort_keys=True, indent=0)
    print("written", OUT, "levels", len(data))


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1].startswith("--levels="):
        lv = [int(x) for x in sys.argv[1].split("=", 1)[1].split(",")]
    else:
        lv = list(range(172))
    main(lv)

