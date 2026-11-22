import UnityPy, os
from UnityPy.helpers.TypeTreeGenerator import TypeTreeGenerator
DATA = r"D:\Github\民间改版学习\Windows64_v1.0.5\Windows_v1.0.5\tstd2_Data"
gen = TypeTreeGenerator("2022.2.11f1"); gen.load_local_dll_folder(os.path.join(DATA, "Managed"))
env = UnityPy.load(os.path.join(DATA, "level1")); env.typetree_generator=gen
rows=[]
for o in env.objects:
    if o.type.name!="MonoBehaviour": continue
    try:
        mb=o.parse_monobehaviour_head(); s=mb.m_Script.deref_parse_as_object()
        cls=(s.m_Namespace+"." if s.m_Namespace else "")+s.m_ClassName
        if "TextMeshPro" not in cls: continue
        obj=o.read(); txt=str(getattr(obj,"m_text",None) or "")
        if len(txt)<25: continue
        go=mb.m_GameObject.deref_parse_as_object(); name=getattr(go,'m_Name','')
        tr=None
        for cp in go.m_Component:
            c=cp.component.deref_parse_as_object()
            if type(c).__name__=="Transform": tr=c
        rows.append((txt,name,getattr(tr,'m_LocalPosition',None),getattr(go,'m_IsActive',None),o.path_id))
    except Exception: pass
for r in rows:
    print("###",r[3],r[1],r[4]); print(repr(r[0]))
    print("pos",r[2])
