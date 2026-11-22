import UnityPy, os
from UnityPy.helpers.TypeTreeGenerator import TypeTreeGenerator
DATA = r"D:\Github\民间改版学习\Windows64_v1.0.5\Windows_v1.0.5\tstd2_Data"
gen = TypeTreeGenerator("2022.2.11f1"); gen.load_local_dll_folder(os.path.join(DATA, "Managed"))
env = UnityPy.load(os.path.join(DATA, "resources.assets")); env.typetree_generator=gen
for pid in [1055,894,895]:
    o=next((x for x in env.objects if x.path_id==pid),None)
    print("=== BCD",pid)
    if not o: continue
    obj=o.read()
    print(type(obj).__name__, getattr(obj,'m_Name',''))
    for k,v in obj.__dict__.items():
        if k in ("object_reader","__node__","serializationData"): continue
        print(" ",k,repr(v)[:250])
    cd=obj.characterData
    if cd:
        c=cd.deref_parse_as_object()
        print(" characterData",c.m_Name, "id",getattr(c,'id',None),"model",getattr(c,'modelTexture',None))
