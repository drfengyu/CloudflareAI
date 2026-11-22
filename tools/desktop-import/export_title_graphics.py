import UnityPy, os, json
DATA = r"D:\Github\民间改版学习\Windows64_v1.0.5\Windows_v1.0.5\tstd2_Data"
OUT = r"C:\Users\Drfen\Doubao\chats\2026-11-22\new-chat\cloudai-work\public\game-assets\kongming\ui"
os.makedirs(OUT, exist_ok=True)
env = UnityPy.load(os.path.join(DATA, "sharedassets0.assets"))
found = {}
for o in env.objects:
    if o.type.name != "Sprite": continue
    try:
        sp = o.read()
        name = getattr(sp, "m_Name", "")
        if name in ("Logo", "OP剑", "Capcom"):
            img = sp.image
            path = os.path.join(OUT, name.replace("剑", "sword") + ".png")
            img.save(path)
            found[name] = {"path": path, "size": img.size}
            print("SAVED", name, img.size, path)
    except Exception as e:
        print("ERR", o.path_id, e)
print(json.dumps(found, ensure_ascii=False))
