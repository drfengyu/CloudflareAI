import UnityPy, os, json
from UnityPy.helpers.TypeTreeGenerator import TypeTreeGenerator
DATA = r"D:\Github\民间改版学习\Windows64_v1.0.5\Windows_v1.0.5\tstd2_Data"
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
gen = TypeTreeGenerator("2022.2.11f1"); gen.load_local_dll_folder(os.path.join(DATA, "Managed"))
env = UnityPy.load(os.path.join(DATA, "resources.assets")); env.typetree_generator=gen

def cls_of(o):
    mb=o.parse_monobehaviour_head(); s=mb.m_Script.deref_parse_as_object()
    return (s.m_Namespace+"." if s.m_Namespace else "")+s.m_ClassName

def ref_name(p):
    if not p or getattr(p,"m_PathID",0)==0: return None
    try: return getattr(p.deref_parse_as_object(),"m_Name","") or None
    except Exception: return None

rows={}
for o in env.objects:
    if o.type.name!="MonoBehaviour": continue
    try:
        if cls_of(o)!="Tstd2.Battle.BattleInfo": continue
        b=o.read()
        enemies=[]
        for p in getattr(b,"enemies",[]):
            try:
                d=p.deref_parse_as_object()
                cd=d.characterData.deref_parse_as_object() if d.characterData else None
                enemies.append({
                    "name": getattr(d,"m_Name","") or "",
                    "tag": getattr(d,"tag","") or "",
                    "maxHp": int(getattr(d,"maxHp",-1)),
                    "hp": int(getattr(d,"hp",-1)),
                    "maxMp": int(getattr(d,"maxMp",0)),
                    "atk": int(getattr(d,"atk",-1)),
                    "def": int(getattr(d,"def",-1)),
                    "character": getattr(cd,"m_Name","") if cd else None,
                    "model": ref_name(getattr(cd,"modelTexture",None)) if cd else None,
                    "enemySkills": ref_name(getattr(d,"enemySkills",None)),
                    "award": ref_name(getattr(d,"award",None)),
                    "skills": [ref_name(x) for x in getattr(d,"skills",[])],
                })
            except Exception:
                enemies.append(None)
        rows[getattr(b,"m_Name","") or o.path_id]=enemies
    except Exception:
        pass

with open(os.path.join(ROOT,"data","desktop_enemies.json"),"w",encoding="utf-8") as f:
    json.dump(rows,f,ensure_ascii=False,separators=(",",":"))
print("battles",len(rows), "车胄", rows.get("1-车胄战"))
