import UnityPy, os, sys
from UnityPy.helpers.TypeTreeGenerator import TypeTreeGenerator
DATA = r"D:\Github\民间改版学习\Windows64_v1.0.5\Windows_v1.0.5\tstd2_Data"
level = int(sys.argv[1]) if len(sys.argv) > 1 else 12
env = UnityPy.load(os.path.join(DATA, f"level{level}"))
gen = TypeTreeGenerator("2022.2.11f1")
gen.load_local_dll_folder(os.path.join(DATA, "Managed"))
env.typetree_generator = gen
objs = {o.path_id: o for o in env.objects}

def cls_of(o):
    mb = o.parse_monobehaviour_head()
    s = mb.m_Script.deref_parse_as_object()
    return (s.m_Namespace + "." if s.m_Namespace else "") + s.m_ClassName

def comps(go):
    out = []
    for cp in getattr(go, "m_Component", []):
        try:
            out.append(cp.component.deref_parse_as_object())
        except Exception:
            pass
    return out

for o in env.objects:
    if o.type.name != "MonoBehaviour":
        continue
    try:
        cls = cls_of(o)
    except Exception:
        continue
    if cls != "Tstd2.Lua.QuestEvent":
        continue
    d = o.read()
    eid = str(getattr(d, "eventId", "")).strip()
    go = d.m_GameObject.deref_parse_as_object()
    print(f"EVENT {eid} GO={go.m_Name}")
    for c in comps(go):
        name = type(c).__name__
        if name == "SpriteRenderer":
            sp = c.m_Sprite.deref_parse_as_object() if c.m_Sprite else None
            tex = sp.m_RD.texture.deref_parse_as_object() if sp and sp.m_RD else None
            print(f"  SpriteRenderer sprite={getattr(sp,'m_Name',None)} tex={getattr(tex,'m_Name',None)} rect={getattr(sp,'m_Rect',None)}")
        elif name in ("UnknownObject", "MonoBehaviour"):
            rd = getattr(c, "object_reader", None)
            try:
                mb = rd.parse_monobehaviour_head()
                sc = mb.m_Script.deref_parse_as_object()
                cname = (sc.m_Namespace + "." if sc.m_Namespace else "") + sc.m_ClassName
            except Exception as e:
                cname = f"? {e}"
            print(f"  {name} class={cname}")
            if cname.endswith(".NPC"):
                try:
                    cd = c.characterData.deref_parse_as_object() if c.characterData else None
                    tex = cd.modelTexture.deref_parse_as_object() if cd else None
                    print(f"    NPC model={getattr(tex,'m_Name',None)}")
                except Exception as e:
                    print("    NPC read failed", e)
        elif name == "BoxCollider2D":
            print(f"  Collider size={getattr(c,'m_Size',None)} offset={getattr(c,'m_Offset',None)}")
        else:
            print(f"  {name}")
    print()
