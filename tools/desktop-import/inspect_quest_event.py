import UnityPy, os
from UnityPy.helpers.TypeTreeGenerator import TypeTreeGenerator
DATA = r"D:\Github\民间改版学习\Windows64_v1.0.5\Windows_v1.0.5\tstd2_Data"
gen = TypeTreeGenerator("2022.2.11f1"); gen.load_local_dll_folder(os.path.join(DATA, "Managed"))
env = UnityPy.load(os.path.join(DATA, "level11")); env.typetree_generator = gen
for o in env.objects:
    if o.type.name != "MonoBehaviour": continue
    try:
        mb=o.parse_monobehaviour_head(); s=mb.m_Script.deref_parse_as_object()
        cls=(s.m_Namespace+"." if s.m_Namespace else "")+s.m_ClassName
        if cls != "Tstd2.Lua.QuestEvent": continue
        obj=o.read()
        eid=str(getattr(obj,"eventId","")).strip()
        if eid not in ("11005","11004","11011","13","11"): continue
        print("EVENT",eid, "go", getattr(getattr(mb.m_GameObject.deref_parse_as_object(),'m_Name',''),'__str__',lambda:'' )())
        print(" names type",type(getattr(obj,"names",None)))
        for nm in getattr(obj,"names",[]):
            print("  NM", type(nm), nm.__dict__ if hasattr(nm,'__dict__') else repr(nm))
        for k,v in obj.__dict__.items():
            if k in ("object_reader","serializationData","__node__"): continue
            print("  ",k, repr(v)[:300])
    except Exception as e:
        pass
