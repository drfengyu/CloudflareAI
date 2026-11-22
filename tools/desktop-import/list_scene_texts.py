import UnityPy, os
from UnityPy.helpers.TypeTreeGenerator import TypeTreeGenerator
DATA = r"D:\Github\民间改版学习\Windows64_v1.0.5\Windows_v1.0.5\tstd2_Data"
gen = TypeTreeGenerator("2022.2.11f1"); gen.load_local_dll_folder(os.path.join(DATA, "Managed"))
for level in (1,2):
    env = UnityPy.load(os.path.join(DATA, f"level{level}")); env.typetree_generator=gen
    print("LEVEL",level)
    for o in env.objects:
        if o.type.name!="MonoBehaviour": continue
        try:
            mb=o.parse_monobehaviour_head(); s=mb.m_Script.deref_parse_as_object()
            cls=(s.m_Namespace+"." if s.m_Namespace else "")+s.m_ClassName
            if "TextMeshPro" in cls or cls.endswith(".Text"):
                obj=o.read()
                print(cls, "go",getattr(mb.m_GameObject.deref_parse_as_object(),'m_Name',''), "text=",repr(getattr(obj,"m_text",None))[:300], "name=",getattr(obj,"m_Name",None))
        except Exception as e: pass
