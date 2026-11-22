import json
import os
import sys

import UnityPy
from UnityPy.helpers.TypeTreeGenerator import TypeTreeGenerator

DATA = r"D:\Github\民间改版学习\Windows64_v1.0.5\Windows_v1.0.5\tstd2_Data"
level = int(sys.argv[1])
target = sys.argv[2] if len(sys.argv) > 2 else None
env = UnityPy.load(os.path.join(DATA, f"level{level}"))
gen = TypeTreeGenerator("2022.2.11f1")
gen.load_local_dll_folder(os.path.join(DATA, "Managed"))
env.typetree_generator = gen


def cls_name(obj):
    mb = obj.parse_monobehaviour_head()
    s = mb.m_Script.deref_parse_as_object()
    return (s.m_Namespace + "." if s.m_Namespace else "") + s.m_ClassName


for o in env.objects:
    if o.type.name != "MonoBehaviour":
        continue
    try:
        if cls_name(o) != "Tstd2.Lua.QuestEvent":
            continue
        d = o.read()
        eid = str(getattr(d, "eventId", "")).strip()
        go = d.m_GameObject.deref_parse_as_object()
    except Exception:
        continue
    if target and eid != target:
        continue
    print("EVENT", eid, "GO", go.m_Name)
    for cp in getattr(go, "m_Component", []):
        try:
            raw = cp.component.deref_parse_as_object()
        except Exception:
            continue
        rd = getattr(raw, "object_reader", None)
        if rd is None:
            print(" component", type(raw).__name__)
            continue
        try:
            cn = cls_name(rd)
        except Exception:
            cn = type(raw).__name__
        print(" component", cn, "pid", rd.path_id, "enabled", getattr(raw, "m_Enabled", None))
        if cn.endswith("NPC") or cn == "NPC":
            print(json.dumps(rd.read_typetree(), ensure_ascii=False)[:2000])
        elif cn.endswith("SpriteRenderer") or "SpriteRenderer" in cn:
            tree = rd.read_typetree()
            print(json.dumps({k: tree.get(k) for k in ("m_Sprite", "m_Color", "m_FlipX", "m_Enabled", "m_SortingOrder")}, ensure_ascii=False))
            sp_ref = tree.get("m_Sprite", {})
            print(" sprite ref", sp_ref)
        if cn.endswith("QuestInteractiveName"):
            print(json.dumps(rd.read_typetree(), ensure_ascii=False)[:2000])
