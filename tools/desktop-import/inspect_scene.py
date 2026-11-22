import UnityPy, os, sys, collections, json
from UnityPy.helpers.TypeTreeGenerator import TypeTreeGenerator

DATA = r"D:\Github\民间改版学习\Windows64_v1.0.5\Windows_v1.0.5\tstd2_Data"
VER = "2022.2.11f1"
gen = TypeTreeGenerator(VER)
gen.load_local_dll_folder(os.path.join(DATA, "Managed"))

scene = sys.argv[1] if len(sys.argv) > 1 else "level1"
env = UnityPy.load(os.path.join(DATA, scene))
env.typetree_generator = gen
counts = collections.Counter()
rows = []
for o in env.objects:
    counts[o.type.name] += 1
    if o.type.name == "MonoBehaviour":
        try:
            mb = o.parse_monobehaviour_head()
            script = mb.m_Script.deref_parse_as_object()
            cls = (script.m_Namespace + "." if script.m_Namespace else "") + script.m_ClassName
            counts["MB:" + cls] += 1
            d = o.read()
            rows.append({"path_id": o.path_id, "class": cls, "name": getattr(d, "m_Name", ""), "fields": list(getattr(d, "__dict__", {}).keys())})
        except Exception:
            counts["MB:ERR"] += 1
print(json.dumps(dict(counts.most_common()), ensure_ascii=False, indent=1))
print(json.dumps(rows[:80], ensure_ascii=False, indent=1))
