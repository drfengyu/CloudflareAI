import UnityPy, os, json

DATA = r"D:\Github\民间改版学习\Windows64_v1.0.5\Windows_v1.0.5\tstd2_Data"
OUT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "data", "lua_pack.json"))
env = UnityPy.load(os.path.join(DATA, "resources.assets"))
for o in env.objects:
    if o.type.name != "TextAsset":
        continue
    d = o.read()
    if getattr(d, "m_Name", "") == "lua":
        text = getattr(d, "m_Script", "")
        print("lua text size", len(text), text[:100])
        j = json.loads(text.lstrip("\ufeff"))
        items = {}
        for kv in j.get("keyValues", []):
            raw = kv.get("value", [])
            if isinstance(raw, list):
                data = bytes(raw).decode("utf-8", errors="replace")
            else:
                data = str(raw)
            items[kv["key"]] = data
        print("keys", len(items), "chars", sum(len(v) for v in items.values()))
        with open(OUT, "w", encoding="utf-8") as f:
            json.dump(items, f, ensure_ascii=False, indent=1)
        break
