import UnityPy, os, sys, json
from UnityPy.helpers.TypeTreeGenerator import TypeTreeGenerator
DATA = r"D:\Github\民间改版学习\Windows64_v1.0.5\Windows_v1.0.5\tstd2_Data"
level = int(sys.argv[1]) if len(sys.argv) > 1 else 12
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
    for cp in getattr(go, "m_Component", []):
        try:
            raw = cp.component.deref_parse_as_object()
        except Exception:
            continue
        rd = getattr(raw, "object_reader", None)
        if rd is None:
            continue
        try:
            cn = cls_name(rd)
        except Exception:
            continue
        if cn != "NPC":
            continue
        print("EVENT", eid, "NPC pid", getattr(raw, "path_id", None))
        try:
            tree = rd.read_typetree()
            print(json.dumps(tree, ensure_ascii=False, indent=1)[:3000])
        except Exception as e:
            print("read failed", e)
        break
