import UnityPy, os, json, re, math, sys, traceback, base64
from UnityPy.helpers.TypeTreeGenerator import TypeTreeGenerator
from UnityPy.classes import PPtr
from PIL import Image

DATA = r"D:\Github\民间改版学习\Windows64_v1.0.5\Windows_v1.0.5\tstd2_Data"
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT_DATA = os.path.join(ROOT, "data")
OUT_MAPS = os.path.join(ROOT, "public", "kongming", "maps")
os.makedirs(OUT_DATA, exist_ok=True)
os.makedirs(OUT_MAPS, exist_ok=True)

gen = TypeTreeGenerator("2022.2.11f1")
gen.load_local_dll_folder(os.path.join(DATA, "Managed"))
env_cache = {}

def env_for(fn):
    if fn in env_cache:
        return env_cache[fn]
    e = UnityPy.load(os.path.join(DATA, fn))
    e.typetree_generator = gen
    env_cache[fn] = e
    return e

def class_of(o):
    mb = o.parse_monobehaviour_head()
    s = mb.m_Script.deref_parse_as_object()
    return (s.m_Namespace + "." if s.m_Namespace else "") + s.m_ClassName

def pname(p, origin=None):
    try:
        if getattr(p, "m_PathID", 0) == 0:
            return None
        obj = p.deref_parse_as_object()
        n = getattr(obj, "m_Name", "")
        return n if n else None
    except Exception:
        return None

def primitive(v):
    if isinstance(v, (str, int, float, bool)) or v is None:
        return v
    return str(v)

def conv(v, depth=0):
    if depth > 6:
        return primitive(v)
    if isinstance(v, PPtr):
        return pname(v)
    if isinstance(v, (str, int, float, bool)) or v is None:
        return v
    if isinstance(v, (list, tuple)):
        return [conv(x, depth + 1) for x in v]
    if hasattr(v, "__dict__"):
        out = {}
        for k, val in v.__dict__.items():
            if k in ("object_reader", "serializationData", "__node__", "m_Script", "m_GameObject"):
                continue
            if k.startswith("m_") and k not in ("m_Name",):
                if isinstance(val, PPtr):
                    out[k] = pname(val)
                    continue
                if k in ("m_Children", "m_Father", "m_Component"):
                    continue
            out[k] = conv(val, depth + 1)
        return out
    return primitive(v)

def read_class(fn, cls_name):
    e = env_for(fn)
    rows = []
    for o in e.objects:
        if o.type.name != "MonoBehaviour":
            continue
        try:
            cls = class_of(o)
        except Exception:
            continue
        if cls != cls_name:
            continue
        try:
            rows.append((o.path_id, o.read()))
        except Exception:
            continue
    return rows

def statlist(obj):
    if obj is None:
        return [0] * 7
    try:
        vals = [0] * 7
        for st in getattr(obj, "stats", []):
            t = int(getattr(st, "type", 0))
            if 0 <= t < 7:
                vals[t] = int(getattr(st, "value", 0))
        return vals
    except Exception:
        return [0] * 7

def field(d, name, default=None):
    return getattr(d, name, default)

# ---------- content ----------
content = {"characters": [], "battleCharacters": [], "battles": [], "equipment": [],
           "items": [], "shops": [], "chapters": [], "skills": [], "formations": [],
           "exp": None, "hpLevels": [], "enemySkills": [], "awards": [], "start": None}

for fn in ["resources.assets", "sharedassets0.assets"]:
    for cls, key in [
        ("Tstd2.Characters.CharacterData", "characters"),
        ("Tstd2.Characters.BattleCharacterData", "battleCharacters"),
        ("Tstd2.Battle.BattleInfo", "battles"),
        ("Tstd2.Inventory.Equipment", "equipment"),
        ("Tstd2.Inventory.ConsumableItem", "items"),
        ("Tstd2.Settings.ShopItemsData", "shops"),
        ("Tstd2.Settings.ChapterData", "chapters"),
        ("Tstd2.Skills.Skill", "skills"),
        ("Tstd2.Skills.Formation", "formations"),
        ("Tstd2.Settings.HpLevelData", "hpLevels"),
        ("Tstd2.Settings.EnemySkills", "enemySkills"),
        ("Tstd2.Settings.Award", "awards"),
    ]:
        for pid, d in read_class(fn, cls):
            try:
                if cls.endswith("CharacterData"):
                    row = {
                        "id": int(field(d, "id", 0)), "name": field(d, "characterName", ""),
                        "style": field(d, "styleName", ""), "source": fn,
                        "critRate": int(field(d, "critRatio", 0)), "critPower": float(field(d, "critTimes", 1)),
                        "fixedHp": int(field(d, "fixedHp", 0)),
                        "weapon": int(field(d, "weaponTypes", 0)), "terrain": int(field(d, "terrainTypes", 0)),
                        "readyX": int(field(d, "readyX", 0)),
                        "stats": statlist(field(d, "stat")),
                        "hpLevel": pname(field(d, "levelData")),
                        "skills": [pname(x) for x in getattr(d, "learnableSkills", [])],
                        "profile": pname(field(d, "profile")),
                        "modelTexture": pname(field(d, "modelTexture")),
                    }
                    content[key].append(row)
                elif cls.endswith("BattleCharacterData"):
                    content[key].append({
                        "name": field(d, "m_Name", ""), "tag": field(d, "tag", ""),
                        "maxHp": int(field(d, "maxHp", -1)), "hp": int(field(d, "hp", -1)),
                        "maxMp": int(field(d, "maxMp", 0)),
                        "character": pname(field(d, "characterData")),
                        "atk": int(field(d, "atk", -1)), "def": int(field(d, "def", -1)),
                        "enemySkills": pname(field(d, "enemySkills")), "award": pname(field(d, "award")),
                        "skills": [pname(x) for x in getattr(d, "skills", [])],
                        "formations": [pname(x) for x in getattr(d, "formations", [])],
                        "attackTargets": [pname(x) for x in getattr(d, "attackTargets", [])],
                        "specialSkillOff": bool(field(d, "isSpecialSkillNotWork", 0)),
                    })
                elif cls.endswith("BattleInfo"):
                    content[key].append({
                        "name": field(d, "m_Name", ""), "id": int(field(d, "id", 0)),
                        "type": int(field(d, "battleType", 0)), "terrain": int(field(d, "terrainType", 0)),
                        "property": int(field(d, "terrainProperty", 0)),
                        "cityDef": float(field(d, "cityDefenseNum", 1)), "hasCityDef": bool(field(d, "IsHasCityDef", 1)),
                        "money": int(field(d, "money", 0)), "exp": int(field(d, "exp", 0)),
                        "startAttack": int(field(d, "startAttackType", 0)),
                        "formation": pname(field(d, "formation")),
                        "enemies": [pname(x) for x in getattr(d, "enemies", [])],
                        "random": bool(field(d, "isRandom", 0)), "randomNum": int(field(d, "randomNum", 5)),
                        "auto": bool(field(d, "isAuto", 0)),
                        "scripts": conv(getattr(d, "scripts", [])) if isinstance(getattr(d, "scripts", []), list) else [],
                    })
                elif cls.endswith("Equipment"):
                    content[key].append({
                        "id": int(field(d, "id", 0)), "name": field(d, "m_Name", ""),
                        "equipType": int(field(d, "equipType", 0)),
                        "attackCount": int(field(d, "attackCount", 1)),
                        "weaponType": int(field(d, "weaponType", 0)),
                        "stats": statlist(field(d, "statList")),
                        "description": field(d, "description", ""), "price": int(field(d, "price", 0)),
                    })
                elif cls.endswith("ConsumableItem"):
                    content[key].append({
                        "id": int(field(d, "id", 0)), "name": field(d, "m_Name", ""),
                        "cost": int(field(d, "cost", 1)), "costPercent": int(field(d, "costPercentage", 100)),
                        "damageCoef": float(field(d, "damageCoefficient", 1)),
                        "damageType": int(field(d, "damageType", 0)), "valueType": int(field(d, "valueType", 0)),
                        "useScope": int(field(d, "useScope", 0)), "targetScope": int(field(d, "targetScope", 0)),
                        "heal": bool(field(d, "targetIsOurSide", 0)), "resurrect": bool(field(d, "isResurrect", 0)),
                        "text": field(d, "text", ""), "description": field(d, "description", ""),
                        "price": int(field(d, "price", 0)),
                    })
                elif cls.endswith("ShopItemsData"):
                    content[key].append({"name": field(d, "m_Name", ""), "items": [pname(x) for x in getattr(d, "items", [])]})
                elif cls.endswith("ChapterData"):
                    content[key].append({
                        "id": int(field(d, "id", 0)), "order": field(d, "chapterOrder", ""),
                        "name": field(d, "chapterName", ""),
                        "hpList": [int(x) for x in getattr(d, "hpList", [])],
                        "str": int(field(d, "str", 0)), "ler": int(field(d, "ler", 0)), "spd": int(field(d, "spd", 0)),
                        "attack": int(field(d, "attack", 0)), "defense": int(field(d, "defense", 0)),
                        "exp": int(field(d, "exp", 0)), "money": int(field(d, "money", 0)),
                        "solidRatio": int(field(d, "solidRatio", 0)),
                        "changeTo": pname(field(d, "changeToCharacterData")),
                        "stay": [pname(x) for x in getattr(d, "notLeaveTeamCharacters", [])],
                        "generals": [pname(x) for x in getattr(d, "generals", [])],
                    })
                elif cls.endswith("Skill"):
                    content[key].append({
                        "id": int(field(d, "id", 0)), "name": field(d, "m_Name", ""),
                        "skillName": field(d, "skillName", ""), "lv": int(field(d, "lv", 1)),
                        "cost": int(field(d, "cost", 0)), "hitRate": float(field(d, "hitRate", -1)),
                        "damageCoef": float(field(d, "damageCoefficient", 1)),
                        "damageType": int(field(d, "damageType", 0)), "valueType": int(field(d, "valueType", 0)),
                        "property": int(field(d, "property", 0)),
                        "useScope": int(field(d, "useScope", 0)), "targetScope": int(field(d, "targetScope", 0)),
                        "heal": bool(field(d, "targetIsOurSide", 0)), "resurrect": bool(field(d, "isResurrect", 0)),
                        "text": field(d, "text", ""), "normalText": field(d, "normalText", ""),
                        "buffs": conv(getattr(d, "buffs", [])),
                    })
                elif cls.endswith("Formation"):
                    content[key].append({
                        "id": int(field(d, "id", 0)), "name": field(d, "m_Name", ""),
                        "formationName": field(d, "formationName", ""), "cost": int(field(d, "cost", 0)),
                        "useScope": int(field(d, "useScope", 0)),
                        "useTerrain": int(field(d, "useTerrainProperty", 0)),
                        "positions": conv(getattr(d, "positions", [])),
                        "flatMags": conv(getattr(d, "flatMags", [])),
                        "nonFlatMags": conv(getattr(d, "nonFlatMags", [])),
                        "teamBuffs": conv(getattr(d, "teamBuffs", [])),
                    })
                elif cls.endswith("HpLevelData"):
                    content[key].append({"name": field(d, "m_Name", ""), "lv1": int(field(d, "lv1", 250)), "deltas": [int(x) for x in getattr(d, "deltas", [])]})
                elif cls.endswith("EnemySkills"):
                    content[key].append({"name": field(d, "m_Name", ""), "maxMp": int(field(d, "maxMp", 0)),
                                         "skills": [pname(x) for x in getattr(d, "skills", [])],
                                         "formations": [pname(x) for x in getattr(d, "formations", [])]})
                elif cls.endswith("Award"):
                    content[key].append({"name": field(d, "m_Name", ""), "money": int(field(d, "money", 0)),
                                         "exp": int(field(d, "exp", 0)),
                                         "items": [pname(x) for x in getattr(d, "items", [])]})
            except Exception:
                traceback.print_exc()

# ExpData
for fn in ["sharedassets0.assets", "resources.assets"]:
    rows = read_class(fn, "Tstd2.Settings.ExpData")
    for pid, d in rows:
        try:
            content["exp"] = {"name": field(d, "m_Name", ""), "levels": [
                {"exp": int(field(lv, "exp", 0)), "next": int(field(lv, "next", 0)),
                 "skills": [pname(x) for x in getattr(lv, "skills", [])],
                 "formations": [pname(x) for x in getattr(lv, "formations", [])]} for lv in getattr(d, "deltas", [])]}
        except Exception:
            pass

# InitConfig
try:
    e = env_for("sharedassets0.assets")
    cfg = None
    for o in e.objects:
        if o.type.name == "MonoBehaviour" and o.path_id == 357:
            cfg = o.read()
    if cfg:
        content["start"] = {
            "characters": [pname(x) for x in cfg.characters],
            "npcCharacters": [pname(x) for x in cfg.npcCharacters],
            "alternateCharacters": [pname(x) for x in cfg.alternateCharacters],
            "adviserIndex": int(cfg.adviserIndex), "lv": int(cfg.lv), "maxMp": int(cfg.maxMp),
            "exp": int(cfg.exp), "money": int(cfg.money), "meetEnemyRatio": int(cfg.meetEnemyRatio),
            "defaultFormation": pname(cfg.defaultFormation),
            "inventory": conv(cfg.inventory),
            "formations": [pname(x) for x in cfg.formations],
            "skills": [pname(x) for x in cfg.skills],
            "hpColors": conv(cfg.hpColors),
            "exps": pname(cfg.exps), "chapter": pname(cfg.chapter),
        }
except Exception:
    traceback.print_exc()

with open(os.path.join(OUT_DATA, "desktop_content.json"), "w", encoding="utf-8") as f:
    json.dump(content, f, ensure_ascii=False, separators=(",", ":"))
print("CONTENT", {k: len(v) if isinstance(v, list) else bool(v) for k, v in content.items()})

# ---------- scenes ----------
def get_gameobject(d):
    try:
        return d.m_GameObject.deref_parse_as_object()
    except Exception:
        return None

def get_transform(d):
    go = get_gameobject(d)
    if go is None:
        return None
    try:
        for cp in go.m_Component:
            c = cp.component.deref_parse_as_object()
            if type(c).__name__ == "Transform":
                return c
    except Exception:
        return None
    return None

def pos_of(d):
    t = get_transform(d)
    if t is None:
        return [0, 0]
    p = getattr(t, "m_LocalPosition", None)
    return [round(float(p.x), 3), round(float(p.y), 3)] if p else [0, 0]

def go_layer(d):
    go = get_gameobject(d)
    return int(getattr(go, "m_Layer", 0)) if go else 0

def go_id(d):
    go = get_gameobject(d)
    try:
        return go.object_reader.path_id
    except Exception:
        return 0

def collider_rect(c):
    t = get_transform(c)
    if t is None:
        return None
    p = t.m_LocalPosition
    size = getattr(c, "m_Size", None)
    off = getattr(c, "m_Offset", None)
    if not size:
        return None
    w, h = float(size.x), float(size.y)
    if w <= 0 or h <= 0:
        return None
    ox = float(off.x) if off else 0
    oy = float(off.y) if off else 0
    cx, cy = float(p.x) + ox, float(p.y) + oy
    return [round(cx - w/2, 3), round(cy - h/2, 3), round(w, 3), round(h, 3)]

sprite_cache = {}
def sprite_image(sp):
    key = (getattr(sp, "m_Name", ""), sp.assets_file.name if hasattr(sp, "assets_file") else "", sp.m_Rect.x, sp.m_Rect.y)
    if key in sprite_cache:
        return sprite_cache[key]
    try:
        img = sp.image.convert("RGBA")
    except Exception:
        img = None
    sprite_cache[key] = img
    return img

def render_scene(level):
    fn = f"level{level}"
    e = env_for(fn)
    scene = {"level": level, "id": fn, "name": "", "map": None, "blockedMask": None,
             "boxes": [], "events": [], "npcs": [], "transitions": [], "destinations": [],
             "chests": [], "start": None}
    scene_data = None
    event_rows = []
    npc_rows = []
    tilemaps = []
    colliders = []
    dests = []
    # collect components
    for o in e.objects:
        try:
            if o.type.name == "MonoBehaviour":
                cls = class_of(o)
                if cls == "Tstd2.SceneManagement.SceneData":
                    scene_data = o.read()
                elif cls == "Tstd2.Lua.QuestEvent":
                    event_rows.append(o.read())
                elif cls == "Tstd2.GamePlay.NPC":
                    npc_rows.append(o.read())
                elif cls == "Tstd2.GamePlay.TeamMove":
                    scene["start"] = pos_of(o.read())
                elif cls == "Tstd2.GamePlay.MapChest":
                    d = o.read(); scene["chests"].append({
                        "id": field(d, "ID", ""), "pos": pos_of(d), "money": int(field(d, "money", 0)),
                        "items": [{"name": pname(s.item), "count": int(s.count)} for s in getattr(d, "itemSlots", [])],
                        "show": bool(field(d, "show", 1)), "refresh": bool(field(d, "refreshEvents", 0)),
                    })
                elif cls == "Tstd2.SceneManagement.TransitionPoint":
                    d = o.read(); scene["transitions"].append({
                        "pos": pos_of(d), "type": int(field(d, "transitionType", 0)),
                        "scene": field(d, "newSceneName", ""), "tag": field(d, "tag", ""),
                        "destTag": int(field(d, "transitionDestinationTag", 0)),
                        "when": int(field(d, "transitionWhen", 1)),
                    })
                elif cls == "Tstd2.SceneManagement.SceneTransitionDestination":
                    d = o.read(); dests.append({"pos": pos_of(d), "tag": field(d, "tag", ""), "destTag": int(field(d, "destinationTag", 0))})
            elif o.type.name == "Tilemap":
                tilemaps.append(o.read())
            elif o.type.name == "BoxCollider2D":
                c = o.read()
                if int(getattr(c, "m_Enabled", 0)) and not int(getattr(c, "m_IsTrigger", 1)) and go_layer(c) == 7:
                    colliders.append(c)
        except Exception:
            pass
    if scene_data is None:
        return None
    scene["name"] = field(scene_data, "sceneName", fn)
    scene["previous"] = field(scene_data, "previousSceneName", "")
    scene["isWorld"] = bool(field(scene_data, "isWorld", 0))
    scene["isCave"] = bool(field(scene_data, "isCave", 0))
    scene["terrain"] = int(field(scene_data, "terrainType", 0))
    scene["hasBoat"] = bool(field(scene_data, "hasBoat", 0))
    scene["destinations"] = dests

    # NPC visuals
    for d in npc_rows:
        scene["npcs"].append({"pos": pos_of(d), "character": pname(field(d, "characterData")),
                              "go": go_id(d), "dirs": conv(getattr(d, "directions", []))})

    # quest events
    for d in event_rows:
        scene["events"].append({
            "id": field(d, "eventId", "").strip(), "when": int(field(d, "when", 0)),
            "pos": pos_of(d), "go": go_id(d), "params": [str(x) for x in getattr(d, "parameters", [])],
            "names": conv(getattr(d, "names", [])),
            "show": field(d, "showCondition", ""), "hide": field(d, "hideCondition", ""),
            "chapter": pname(field(d, "chapter")), "battles": [pname(x) for x in getattr(d, "battleInfos", [])],
            "startHide": bool(field(d, "IsStartHide", 0)), "hideAfter": bool(field(d, "IsHideAfterFinish", 1)),
        })

    # collision: solid BoxCollider2D rectangles + tile collision bitmap
    rects = []
    blocked_cells = []
    for c in colliders:
        r = collider_rect(c)
        if r:
            rects.append(r)
    # blocked tilemaps
    for tm in tilemaps:
        try:
            go = get_gameobject(tm)
            is_collision = False
            for cp in go.m_Component:
                cc = cp.component.deref_parse_as_object()
                if type(cc).__name__ in ("TilemapCollider2D", "CompositeCollider2D"):
                    is_collision = True
            if not is_collision:
                continue
            for cell, tile in tm.m_Tiles:
                blocked_cells.append((int(cell.x), int(cell.y)))
        except Exception:
            pass
    scene["boxes"] = rects

    if not tilemaps:
        return scene

    # bounds
    minx = miny = 1e9; maxx = maxy = -1e9
    for tm in tilemaps:
        for cell, tile in tm.m_Tiles:
            minx = min(minx, cell.x); maxx = max(maxx, cell.x)
            miny = min(miny, cell.y); maxy = max(maxy, cell.y)
    if minx == 1e9:
        return scene
    minx -= 1; maxx += 1; miny -= 1; maxy += 1
    wcells = int(maxx - minx + 1); hcells = int(maxy - miny + 1)
    if blocked_cells:
        bits = bytearray((wcells * hcells + 7) // 8)
        for bx, by in blocked_cells:
            idx = int((maxy - by) * wcells + (bx - minx))
            if 0 <= idx < wcells * hcells:
                bits[idx >> 3] |= 1 << (idx & 7)
        scene["blockedMask"] = base64.b64encode(bytes(bits)).decode("ascii")
    scale = 32 if max(wcells, hcells) <= 80 else (24 if max(wcells, hcells) <= 130 else 16)
    W = wcells * scale; H = hcells * scale
    if W * H > 12_000_000:
        scale = 12
        W = wcells * scale; H = hcells * scale

    img = Image.new("RGBA", (W, H), (10, 12, 16, 255))
    for tm in tilemaps:
        for cell, tile in tm.m_Tiles:
            try:
                asset = tm.m_TileAssetArray[tile.m_TileIndex].m_Data.deref_parse_as_object()
                sp = asset.m_Sprite.deref_parse_as_object()
                tile_img = sprite_image(sp)
                if tile_img is None:
                    continue
                size = max(1, int(round(scale * tile_img.width / 32))), max(1, int(round(scale * tile_img.height / 32)))
                tile_img = tile_img.resize(size, Image.LANCZOS)
                pivot = getattr(sp, "m_Pivot", None)
                px = float(pivot.x) if pivot else 0.5
                py = float(pivot.y) if pivot else 0.5
                cx = (float(cell.x) - minx) * scale + scale / 2
                cy = (maxy - float(cell.y)) * scale + scale / 2
                left = int(round(cx - size[0] * px))
                top = int(round(cy - size[1] * (1 - py)))
                img.alpha_composite(tile_img, (left, top))
            except Exception:
                pass
    out = os.path.join(OUT_MAPS, f"level{level}.png")
    if not (os.path.exists(out) and os.path.getsize(out) > 0):
        img.save(out, optimize=True)
    scene["map"] = {"src": f"/kongming/maps/level{level}.png", "x": minx, "y": miny,
                    "w": wcells, "h": hcells, "scale": scale}
    return scene

scenes = []
for i in range(0, 172):
    if not os.path.exists(os.path.join(DATA, f"level{i}")):
        continue
    try:
        s = render_scene(i)
        if s:
            scenes.append(s)
            print("SCENE", i, s["name"], s["map"]["w"] if s.get("map") else 0, s["map"]["h"] if s.get("map") else 0, len(s["events"]), len(s["boxes"]))
    except Exception:
        print("ERR scene", i)
        traceback.print_exc()

# dedupe names
seen = {}
for s in scenes:
    n = s["name"]
    if n in seen:
        s["name"] = f"{n}#{s['level']}"
    seen[n] = 1

with open(os.path.join(OUT_DATA, "desktop_scenes.json"), "w", encoding="utf-8") as f:
    json.dump(scenes, f, ensure_ascii=False, separators=(",", ":"))
print("SCENES", len(scenes))
print("MAP FILES", len(os.listdir(OUT_MAPS)))
