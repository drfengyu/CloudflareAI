import UnityPy, os
from UnityPy.helpers.TypeTreeGenerator import TypeTreeGenerator
DATA = r"D:\Github\民间改版学习\Windows64_v1.0.5\Windows_v1.0.5\tstd2_Data"
gen = TypeTreeGenerator("2022.2.11f1"); gen.load_local_dll_folder(os.path.join(DATA, "Managed"))
env = UnityPy.load(os.path.join(DATA, "level0")); env.typetree_generator = gen
for pid in [2197, 2157, 2266, 1761, 1975, 1788, 1753, 1722]:
    o = next((x for x in env.objects if x.path_id == pid), None)
    print("=== pid", pid, o.type.name if o else None)
    if not o: continue
    try:
        obj=o.read()
        print("name", getattr(obj,"m_Name",""))
        for k,v in obj.__dict__.items():
            if k in ("object_reader","serializationData","__node__"): continue
            if k.startswith("m_") and k not in ("m_Name","m_Sprite","m_Texture","m_FontAsset","m_text"):
                continue
            print(" ", k, repr(v)[:200])
            if k == "m_Sprite" and hasattr(v, "deref_parse_as_object"):
                sp=v.deref_parse_as_object()
                print("   sprite", getattr(sp,"m_Name",""), sp.__dict__.keys())
    except Exception as e:
        print("err", e)
