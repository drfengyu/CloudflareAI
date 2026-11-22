import UnityPy, os
from UnityPy.helpers.TypeTreeGenerator import TypeTreeGenerator
DATA = r"D:\Github\民间改版学习\Windows64_v1.0.5\Windows_v1.0.5\tstd2_Data"
gen = TypeTreeGenerator("2022.2.11f1"); gen.load_local_dll_folder(os.path.join(DATA, "Managed"))
for fn in ["level0", "level1", "level2"]:
    try:
        env = UnityPy.load(os.path.join(DATA, fn)); env.typetree_generator = gen
    except Exception:
        continue
    print("===", fn)
    for o in env.objects:
        if o.type.name != "MonoBehaviour": continue
        try:
            mb=o.parse_monobehaviour_head(); s=mb.m_Script.deref_parse_as_object()
            cls=(s.m_Namespace+"." if s.m_Namespace else "")+s.m_ClassName
            if "Title" not in cls: continue
            print(o.path_id, cls, getattr(getattr(mb,"m_GameObject",None),"m_Name",""))
            try:
                obj=o.read()
                for k,v in obj.__dict__.items():
                    if k.startswith("m_") and k not in ("m_Name",): continue
                    print(" ", k, repr(v)[:300])
            except Exception as e:
                print(" read error", e)
        except Exception:
            pass
