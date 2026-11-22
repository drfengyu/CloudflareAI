import UnityPy, os
DATA = r"D:\Github\民间改版学习\Windows64_v1.0.5\Windows_v1.0.5\tstd2_Data"
env = UnityPy.load(os.path.join(DATA, "level11"))
for pid in [94, 448]:
    go=next(x for x in env.objects if x.path_id==pid).read()
    print("GO",go.m_Name)
    for cp in go.m_Component:
        p=cp.component; o=next(x for x in env.objects if x.path_id==p.m_PathID)
        t=o.type.name
        if t=="MonoBehaviour":
            try:
                mb=o.parse_monobehaviour_head(); s=mb.m_Script.deref_parse_as_object()
                t=(s.m_Namespace+"." if s.m_Namespace else "")+s.m_ClassName+" ("+s.m_Name+")"
            except Exception as e: t="MB?"+str(e)
        print(" ",p.m_PathID,t)
