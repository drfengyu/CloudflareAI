import UnityPy, os
from UnityPy.helpers.TypeTreeGenerator import TypeTreeGenerator
DATA = r"D:\Github\民间改版学习\Windows64_v1.0.5\Windows_v1.0.5\tstd2_Data"
gen = TypeTreeGenerator("2022.2.11f1"); gen.load_local_dll_folder(os.path.join(DATA, "Managed"))
env = UnityPy.load(os.path.join(DATA, "level0")); env.typetree_generator = gen
for o in env.objects:
    if o.type.name != "MonoBehaviour": continue
    try:
        mb=o.parse_monobehaviour_head(); s=mb.m_Script.deref_parse_as_object()
        cls=(s.m_Namespace+"." if s.m_Namespace else "")+s.m_ClassName
        if "TextMeshProUGUI" not in cls: continue
        obj=o.read(); t=getattr(obj,"m_text","")
        if t: print(repr(t), "go", getattr(getattr(mb,"m_GameObject",None),"m_Name",""), "pid", o.path_id)
    except Exception:
        pass
