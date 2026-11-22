import UnityPy, os, sys, json, collections
from UnityPy.helpers.TypeTreeGenerator import TypeTreeGenerator

DATA = r"D:\Github\民间改版学习\Windows64_v1.0.5\Windows_v1.0.5\tstd2_Data"
OUT = os.path.join(os.path.dirname(__file__), "..", "..", "data", "desktop_scene_index.json")
VER = "2022.2.11f1"
gen = TypeTreeGenerator(VER)
gen.load_local_dll_folder(os.path.join(DATA, "Managed"))

interesting = {
    "Tstd2.GamePlay.SceneData",
    "Tstd2.GamePlay.MapChest",
    "Tstd2.GamePlay.TeamMove",
    "Tstd2.GamePlay.NPC",
    "NPC",
    "Tstd2.Lua.QuestEvent",
    "Tstd2.Lua.QuestInteractiveName",
    "Tstd2.SceneManagement.TransitionPoint",
    "Tstd2.GamePlay.ShopItemsBySceneMono",
    "Tstd2.GamePlay.ParametersBySceneMono",
    "Tstd2.GamePlay.StoneFormationMono",
}
result = []
for i in range(0, 172):
    name = f"level{i}"
    path = os.path.join(DATA, name)
    if not os.path.exists(path):
        continue
    try:
        env = UnityPy.load(path)
        env.typetree_generator = gen
        classes = collections.Counter()
        samples = {}
        for o in env.objects:
            if o.type.name != "MonoBehaviour":
                continue
            try:
                mb = o.parse_monobehaviour_head()
                script = mb.m_Script.deref_parse_as_object()
                cls = (script.m_Namespace + "." if script.m_Namespace else "") + script.m_ClassName
                if cls not in interesting:
                    continue
                classes[cls] += 1
                d = o.read()
                n = getattr(d, "m_Name", "")
                samples.setdefault(cls, []).append({"path_id": o.path_id, "name": n})
            except Exception:
                pass
        if classes:
            result.append({"level": i, "classes": dict(classes), "samples": samples})
            print(name, dict(classes), flush=True)
    except Exception as e:
        print("ERR", name, e, file=sys.stderr, flush=True)

with open(OUT, "w", encoding="utf-8") as f:
    json.dump(result, f, ensure_ascii=False, indent=1)
print("DONE", len(result), OUT)
