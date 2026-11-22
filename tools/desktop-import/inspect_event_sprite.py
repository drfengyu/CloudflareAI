import UnityPy, os
DATA = r"D:\Github\民间改版学习\Windows64_v1.0.5\Windows_v1.0.5\tstd2_Data"
env = UnityPy.load(os.path.join(DATA, "level11"))
for pid in [94,448,132,130]:
    o=next((x for x in env.objects if x.path_id==pid),None)
    if not o: continue
    if o.type.name!="SpriteRenderer": continue
    sr=o.read(); sp=sr.m_Sprite.deref_parse_as_object() if sr.m_Sprite else None
    print("SR",pid,"sprite",getattr(sp,'m_Name',None),"go",sr.m_GameObject.deref_parse_as_object().m_Name)
# list SpriteRenderer components on event GOs
for goid in [94,448]:
    go=next(x for x in env.objects if x.path_id==goid).read()
    for cp in go.m_Component:
        pp=cp.component
        o=next(x for x in env.objects if x.path_id==pp.m_PathID)
        if o.type.name=="SpriteRenderer":
            sr=o.read(); sp=sr.m_Sprite.deref_parse_as_object() if sr.m_Sprite else None
            print("GO",go.m_Name,"SR",pp.m_PathID,"sprite",getattr(sp,'m_Name',None), "size", getattr(sp,'m_Rect',None))
            if sp:
                tex=sp.m_RD.texture.deref_parse_as_object(); print(" tex",tex.m_Name)
