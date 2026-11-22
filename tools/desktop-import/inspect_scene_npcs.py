import UnityPy, os
from UnityPy.helpers.TypeTreeGenerator import TypeTreeGenerator
DATA = r"D:\Github\民间改版学习\Windows64_v1.0.5\Windows_v1.0.5\tstd2_Data"
gen = TypeTreeGenerator("2022.2.11f1"); gen.load_local_dll_folder(os.path.join(DATA, "Managed"))
env = UnityPy.load(os.path.join(DATA, "level11")); env.typetree_generator = gen

def go_of(obj):
    try: return obj.m_GameObject.deref_parse_as_object()
    except: return None

def comps(go):
    out=[]
    for p in getattr(go,"m_Component",[]):
        try:
            c=p.deref_parse_as_object(); out.append(type(c).__name__)
        except Exception: out.append("?")
    return out

for o in env.objects:
    if o.type.name != "MonoBehaviour": continue
    try:
        mb=o.parse_monobehaviour_head(); s=mb.m_Script.deref_parse_as_object()
        cls=(s.m_Namespace+"." if s.m_Namespace else "")+s.m_ClassName
        if cls != "Tstd2.GamePlay.NPC": continue
        obj=o.read(); go=go_of(obj)
        print("NPC", o.path_id, "go", getattr(go,"m_Name",""), "layer", getattr(go,"m_Layer",None))
        for k,v in obj.__dict__.items():
            if k.startswith("m_") and k not in ("m_Name",): continue
            print(" ",k,repr(v)[:200])
        t=None
        for p in getattr(go,"m_Component",[]):
            c=p.deref_parse_as_object()
            if type(c).__name__=="Transform": t=c
        if t:
            for chp in t.m_Children:
                ch=chp.deref_parse_as_object(); cgo=go_of(ch)
                print("  child", getattr(cgo,"m_Name",""), comps(cgo))
                for cp in getattr(cgo,"m_Component",[]):
                    c=cp.deref_parse_as_object()
                    if type(c).__name__ in ("SpriteRenderer","Animator","SpriteRenderer"):
                        print("    ",type(c).__name__, c.__dict__.keys())
                        if type(c).__name__=="SpriteRenderer":
                            print("     sprite", getattr(c.m_Sprite.deref_parse_as_object(),"m_Name","") if c.m_Sprite else None)
    except Exception as e:
        pass
