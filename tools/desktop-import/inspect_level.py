import UnityPy, os, sys, json, collections
from UnityPy.helpers.TypeTreeGenerator import TypeTreeGenerator

DATA = r"D:\Github\民间改版学习\Windows64_v1.0.5\Windows_v1.0.5\tstd2_Data"
VER = "2022.2.11f1"
gen = TypeTreeGenerator(VER)
gen.load_local_dll_folder(os.path.join(DATA, "Managed"))
level = sys.argv[1] if len(sys.argv) > 1 else "level4"
env = UnityPy.load(os.path.join(DATA, level))
env.typetree_generator = gen

skip = {"CanvasRenderer","RectTransform","Canvas","Animator","SpriteRenderer","AudioSource","BoxCollider2D","CircleCollider2D","PolygonCollider2D","Camera","TilemapRenderer","Grid","Transform","GameObject"}
counts = collections.Counter(o.type.name for o in env.objects)
print("TYPES", json.dumps(dict(counts.most_common()), ensure_ascii=False))

for o in env.objects:
    if o.type.name in skip:
        continue
    try:
        d = o.read()
        cls = o.type.name
        if o.type.name == "MonoBehaviour":
            mb = o.parse_monobehaviour_head()
            script = mb.m_Script.deref_parse_as_object()
            cls = (script.m_Namespace + "." if script.m_Namespace else "") + script.m_ClassName
        attrs = {}
        for k, v in getattr(d, "__dict__", {}).items():
            if k in ("object_reader","m_GameObject","m_Script","m_Enabled","m_Name","serializationData","__node__"):
                continue
            attrs[k] = str(v)[:400]
        print(json.dumps({"id":o.path_id,"type":o.type.name,"class":cls,"name":getattr(d,"m_Name",""),"fields":attrs}, ensure_ascii=False))
    except Exception as e:
        print("ERR", o.path_id, o.type.name, e)
