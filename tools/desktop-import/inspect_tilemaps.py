import UnityPy, os
from UnityPy.helpers.TypeTreeGenerator import TypeTreeGenerator
DATA = r"D:\Github\民间改版学习\Windows64_v1.0.5\Windows_v1.0.5\tstd2_Data"
gen = TypeTreeGenerator("2022.2.11f1"); gen.load_local_dll_folder(os.path.join(DATA, "Managed"))
for level in (11,12,3):
    print("==== level",level)
    env = UnityPy.load(os.path.join(DATA, f"level{level}")); env.typetree_generator = gen
    for o in env.objects:
        if o.type.name != "Tilemap": continue
        tm=o.read()
        go=None
        try: go=tm.m_GameObject.deref_parse_as_object()
        except: pass
        name=getattr(go,"m_Name","") if go else ""
        print("tilemap",o.path_id,name,"tiles",len(tm.m_Tiles))
        if go:
            for cp in go.m_Component:
                try:
                    c=cp.deref_parse_as_object(); t=type(c).__name__
                    if t in ("TilemapRenderer","Transform"):
                        print("  ",t, {k:getattr(c,k,None) for k in ("m_SortingOrder","m_OrderInLayer","m_LocalPosition")})
                except Exception: pass
