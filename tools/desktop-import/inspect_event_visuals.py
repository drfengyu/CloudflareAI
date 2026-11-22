import UnityPy, os
from UnityPy.helpers.TypeTreeGenerator import TypeTreeGenerator
DATA = r"D:\Github\民间改版学习\Windows64_v1.0.5\Windows_v1.0.5\tstd2_Data"
gen = TypeTreeGenerator("2022.2.11f1"); gen.load_local_dll_folder(os.path.join(DATA, "Managed"))
env = UnityPy.load(os.path.join(DATA, "level11")); env.typetree_generator = gen

def go_of(o):
    try: return o.m_GameObject.deref_parse_as_object()
    except: return None

def dump_go(go, depth=0, seen=None):
    seen = seen or set()
    if id(go) in seen or depth>3: return
    seen.add(id(go))
    tr=None; comp=[]
    for p in getattr(go,"m_Component",[]):
        try:
            c=p.deref_parse_as_object()
            comp.append(type(c).__name__)
            if type(c).__name__=="Transform": tr=c
        except Exception: comp.append("?")
    print("  "*depth, "GO", getattr(go,"m_Name",""), "path", go.object_reader.path_id, comp)
    if tr:
        p=getattr(tr,"m_LocalPosition",None)
        if p: print("  "*depth, " pos", round(float(p.x),2), round(float(p.y),2))
        for cp in getattr(tr,"m_Children",[]):
            child=cp.deref_parse_as_object(); cgo=go_of(child)
            if cgo: dump_go(cgo, depth+1, seen)

for pid in [94, 448]:
    o=next((x for x in env.objects if x.path_id==pid),None)
    print("=== GO path",pid)
    if o: dump_go(o.read())
