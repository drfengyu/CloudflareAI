import UnityPy, os
DATA = r"D:\Github\民间改版学习\Windows64_v1.0.5\Windows_v1.0.5\tstd2_Data"
env = UnityPy.load(os.path.join(DATA, "level11"))
for o in env.objects:
    if o.type.name != "Tilemap": continue
    tm=o.read(); go=tm.m_GameObject.deref_parse_as_object()
    print("TM",o.path_id,go.m_Name)
    for cp in go.m_Component:
        p=cp.component
        try:
            c=p.deref_parse_as_object()
            print("  ",type(c).__name__, {k:getattr(c,k,None) for k in ("m_Enabled","m_SortingOrder","m_OrderInLayer","m_SortingLayerID","m_SortingLayer") if hasattr(c,k)})
        except Exception as e:
            print("  ERR",p.m_PathID,e)
