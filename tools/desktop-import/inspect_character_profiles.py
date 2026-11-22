import UnityPy, os
DATA = r"D:\Github\民间改版学习\Windows64_v1.0.5\Windows_v1.0.5\tstd2_Data"
env = UnityPy.load(os.path.join(DATA, "resources.assets"))
for pid in [389, 459, 541, 140, 141]:
    o=next((x for x in env.objects if x.path_id==pid),None)
    print("=== resources pid",pid,o.type.name if o else None)
    if o:
        try:
            obj=o.read(); print(" name",getattr(obj,"m_Name",""), "type",type(obj).__name__)
            print(" dict", {k:repr(v)[:120] for k,v in obj.__dict__.items() if not k.startswith("m_") or k in ("m_Name","m_Sprite","m_text","m_Texture")})
        except Exception as e: print("err",e)
