"""Resolve the actual walking texture for NPC events that have no CharacterData.

Any NPC component without `characterData` still points at `moveSpriteRes`, a
Texture2D holding 8 frames (40x40 each).  The desktop uses that texture as the
field sprite, so export it and attach a stable `npc-*` model id to the event
instead of drawing a placeholder circle.
"""

import json
import os
import re
import sys

import UnityPy
from UnityPy.helpers.TypeTreeGenerator import TypeTreeGenerator

DATA = r"D:\Github\民间改版学习\Windows64_v1.0.5\Windows_v1.0.5\tstd2_Data"
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "data", "npc_textures")
TARGET_LEVELS = [4, 5, 6, 10, 11, 12, 16, 24, 25, 38, 48, 54, 58, 75, 110, 121, 124, 133, 137, 143, 144, 161, 162, 171]

gen = TypeTreeGenerator("2022.2.11f1")
gen.load_local_dll_folder(os.path.join(DATA, "Managed"))


def cls_name(obj):
    mb = obj.parse_monobehaviour_head()
    s = mb.m_Script.deref_parse_as_object()
    return (s.m_Namespace + "." if s.m_Namespace else "") + s.m_ClassName


def slug(name: str) -> str:
    cleaned = re.sub(r"[^0-9A-Za-z\u4e00-\u9fff_-]+", "", name)
    return cleaned or "npc"


texture_cache = {}
event_rows = {}
texture_rows = {}

for level in TARGET_LEVELS:
    path = os.path.join(DATA, f"level{level}")
    if not os.path.exists(path):
        continue
    env = UnityPy.load(path)
    env.typetree_generator = gen
    serialized = next(iter(env.files.values()))
    externals = [x.name for x in getattr(serialized, "externals", [])]
    for o in env.objects:
        if o.type.name != "MonoBehaviour":
            continue
        try:
            if cls_name(o) != "Tstd2.Lua.QuestEvent":
                continue
            d = o.read()
            eid = str(getattr(d, "eventId", "")).strip()
            if not eid:
                continue
            go = d.m_GameObject.deref_parse_as_object()
        except Exception:
            continue
        for cp in getattr(go, "m_Component", []):
            try:
                raw = cp.component.deref_parse_as_object()
            except Exception:
                continue
            rd = getattr(raw, "object_reader", None)
            if rd is None:
                continue
            try:
                if cls_name(rd) != "NPC":
                    continue
                tree = rd.read_typetree()
            except Exception:
                continue
            char_ref = tree.get("characterData", {})
            if char_ref.get("m_PathID"):
                continue
            sprite_ref = tree.get("moveSpriteRes", {})
            file_id = int(sprite_ref.get("m_FileID", 0))
            path_id = int(sprite_ref.get("m_PathID", 0))
            if not path_id:
                continue
            if file_id == 0:
                asset_path, tex_env = path, env
                asset_name = f"level{level}"
            else:
                asset_name = externals[file_id - 1]
                if asset_name.startswith("Library/"):
                    continue
                asset_path = os.path.join(DATA, asset_name)
                if not os.path.exists(asset_path):
                    continue
                tex_env = texture_cache.get(asset_name)
                if tex_env is None:
                    tex_env = UnityPy.load(asset_path)
                    texture_cache[asset_name] = tex_env
            obj = next((x for x in tex_env.objects if x.path_id == path_id), None)
            if obj is None or obj.type.name != "Texture2D":
                continue
            texture_name = getattr(obj.read(), "m_Name", "") or f"tex{path_id}"
            model = f"npc-{slug(texture_name)}"
            event_rows[eid] = {"model": model, "texture": texture_name, "asset": asset_name, "path": path_id}
            if model not in texture_rows:
                os.makedirs(OUT, exist_ok=True)
                obj.read().image.save(os.path.join(OUT, f"{model}.png"))
                texture_rows[model] = {"asset": asset_name, "path": path_id, "texture": texture_name}
            break

with open(os.path.join(ROOT, "data", "desktop_npc_textures.json"), "w", encoding="utf-8") as f:
    json.dump({"events": event_rows, "textures": texture_rows}, f, ensure_ascii=False, indent=1)
print("events", len(event_rows), "textures", len(texture_rows))
for k, v in list(event_rows.items())[:20]:
    print(k, v["model"], v["texture"], v["asset"], v["path"])
