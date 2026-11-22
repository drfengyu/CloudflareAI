import UnityPy, os, json
from UnityPy.helpers.TypeTreeGenerator import TypeTreeGenerator
DATA = r"D:\Github\民间改版学习\Windows64_v1.0.5\Windows_v1.0.5\tstd2_Data"
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
gen = TypeTreeGenerator("2022.2.11f1"); gen.load_local_dll_folder(os.path.join(DATA, "Managed"))
res = UnityPy.load(os.path.join(DATA, "resources.assets")); res.typetree_generator=gen

def cls_of(o):
    mb=o.parse_monobehaviour_head(); s=mb.m_Script.deref_parse_as_object()
    return (s.m_Namespace+"." if s.m_Namespace else "")+s.m_ClassName

def go_of(o):
    try: return o.m_GameObject.deref_parse_as_object()
    except: return None

def comps(go):
    out=[]
    for cp in getattr(go,"m_Component",[]):
        try: out.append(cp.component.deref_parse_as_object())
        except: pass
    return out

def model_name(npc):
    try:
        cd=npc.characterData.deref_parse_as_object()
        tex=cd.modelTexture.deref_parse_as_object()
        return getattr(tex,"m_Name",None)
    except Exception: return None

rows={}
for level in range(172):
    fn=f"level{level}"
    if not os.path.exists(os.path.join(DATA,fn)): continue
    e=UnityPy.load(os.path.join(DATA,fn)); e.typetree_generator=gen
    for o in e.objects:
        if o.type.name!="MonoBehaviour": continue
        try:
            cls=cls_of(o)
            if cls!="Tstd2.Lua.QuestEvent": continue
            d=o.read(); eid=str(getattr(d,"eventId","")).strip()
            if not eid: continue
            go=go_of(d)
            npc=None
            for cp in getattr(go,"m_Component",[]):
                try:
                    obj=cp.component.deref_parse_as_object()
                    rd=getattr(obj,"object_reader",None)
                    if rd is None: continue
                    mb=rd.parse_monobehaviour_head(); s=mb.m_Script.deref_parse_as_object()
                    if (s.m_ClassName or "") == "NPC":
                        npc=obj; break
                except Exception:
                    pass
            if npc is None: continue
            m=model_name(npc)
            if m: rows[eid]=m
        except Exception: pass
with open(os.path.join(ROOT,"data","desktop_event_models.json"),"w",encoding="utf-8") as f:
    json.dump(rows,f,ensure_ascii=False,separators=(",",":"))
print("events",len(rows))
print({k:rows[k] for k in list(rows)[:20]})
