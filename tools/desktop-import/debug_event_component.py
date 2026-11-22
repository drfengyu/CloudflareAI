import UnityPy, os
from UnityPy.helpers.TypeTreeGenerator import TypeTreeGenerator
DATA = r"D:\Github\民间改版学习\Windows64_v1.0.5\Windows_v1.0.5\tstd2_Data"
gen = TypeTreeGenerator("2022.2.11f1"); gen.load_local_dll_folder(os.path.join(DATA, "Managed"))
e=UnityPy.load(os.path.join(DATA,"level11")); e.typetree_generator=gen
o=next(x for x in e.objects if x.path_id==448)
d=o.read()
go=d.m_GameObject.deref_parse_as_object()
for cp in go.m_Component:
    c=cp.component
    print("PPtr",c.m_PathID)
    try:
        obj=c.deref_parse_as_object(); print(" obj",type(obj), getattr(obj,'object_reader',None))
        if hasattr(obj,'object_reader'):
            mb=obj.object_reader.parse_monobehaviour_head(); s=mb.m_Script.deref_parse_as_object(); print(" class",s.m_Namespace,s.m_ClassName)
    except Exception as ex: print(" err",ex)
