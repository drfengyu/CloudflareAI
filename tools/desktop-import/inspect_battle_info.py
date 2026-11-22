import UnityPy, os
from UnityPy.helpers.TypeTreeGenerator import TypeTreeGenerator
DATA = r"D:\Github\民间改版学习\Windows64_v1.0.5\Windows_v1.0.5\tstd2_Data"
gen = TypeTreeGenerator("2022.2.11f1"); gen.load_local_dll_folder(os.path.join(DATA, "Managed"))
env = UnityPy.load(os.path.join(DATA, "resources.assets")); env.typetree_generator=gen
o=next(x for x in env.objects if x.path_id==541)
obj=o.read()
print(type(obj).__name__, getattr(obj,'m_Name',''))
for k,v in obj.__dict__.items():
    if k in ("object_reader","__node__"): continue
    print(k,repr(v)[:400])
