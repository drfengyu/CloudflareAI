import UnityPy, os
from UnityPy.helpers.TypeTreeGenerator import TypeTreeGenerator
DATA = r"D:\Github\民间改版学习\Windows64_v1.0.5\Windows_v1.0.5\tstd2_Data"
gen = TypeTreeGenerator("2022.2.11f1"); gen.load_local_dll_folder(os.path.join(DATA, "Managed"))
env = UnityPy.load(os.path.join(DATA, "level0")); env.typetree_generator = gen
for o in env.objects:
    if o.type.name not in ("Sprite", "Texture2D"): continue
    try:
        obj=o.read(); print(o.type.name, o.path_id, repr(getattr(obj,"m_Name","")))
    except Exception:
        pass
