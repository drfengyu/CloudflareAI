import UnityPy, os
DATA = r"D:\Github\民间改版学习\Windows64_v1.0.5\Windows_v1.0.5\tstd2_Data"
env = UnityPy.load(os.path.join(DATA, "resources.assets"))
for pid in [839, 217, 1285]:
    o=next((x for x in env.objects if x.path_id==pid),None)
    print("=== res",pid,o.type.name if o else None)
    if o:
        try:
            obj=o.read(); print("name",getattr(obj,"m_Name",""),type(obj).__name__)
            print({k:repr(v)[:150] for k,v in obj.__dict__.items() if not k.startswith("m_") or k in ("m_Name","m_Sprite","m_RD")})
        except Exception as e: print("err",e)
