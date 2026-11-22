import UnityPy, os, json
from UnityPy.helpers.TypeTreeGenerator import TypeTreeGenerator

DATA = r"D:\Github\民间改版学习\Windows64_v1.0.5\Windows_v1.0.5\tstd2_Data"
OUT = r"C:\Users\Drfen\Doubao\chats\2026-11-22\new-chat\cloudai-work\data\desktop_parameters.json"

gen = TypeTreeGenerator("2022.2.11f1")
gen.load_local_dll_folder(os.path.join(DATA, "Managed"))


class Reader:
    def __init__(self, data, offset=0):
        self.data = data
        self.pos = offset

    def align(self, n=4):
        while self.pos % n:
            self.pos += 1

    def i32(self):
        v = int.from_bytes(self.data[self.pos:self.pos + 4], "little")
        self.pos += 4
        return v

    def string(self):
        n = self.i32()
        raw = self.data[self.pos:self.pos + n]
        self.pos += n
        self.align()
        return raw.decode("utf-8", "replace")


def class_of(o):
    mb = o.parse_monobehaviour_head()
    s = mb.m_Script.deref_parse_as_object()
    return (s.m_Namespace + "." if s.m_Namespace else "") + s.m_ClassName


def parse_parameters(raw):
    r = Reader(raw, 32)
    count = r.i32()
    infos = []
    for _ in range(count):
        scene = r.string()
        n = r.i32()
        infos.append({"sceneName": scene, "parameters": [r.string() for _ in range(n)]})
    return infos


rows = []
for fn, path_id in [("level4", 2185), ("level8", 2207)]:
    env = UnityPy.load(os.path.join(DATA, fn))
    env.typetree_generator = gen
    for o in env.objects:
        if o.type.name != "MonoBehaviour" or o.path_id != path_id:
            continue
        infos = parse_parameters(o.get_raw_data())
        rows.append({"level": fn, "infos": infos})
        print("FOUND", fn, len(infos))
        break

with open(OUT, "w", encoding="utf-8") as f:
    json.dump(rows, f, ensure_ascii=False, indent=1)
print("rows", len(rows), "->", OUT)
