"""导出桌面原版店铺店主 Sprite（level4~9）。

店主是独立 GameObject（老板/老板娘），SpriteRenderer 指向 sharedassets 的 Sprite。
网页端按原版站立坐标绘制，事件触发点仍用 Event 的 pos。
"""
from __future__ import annotations

import json
from pathlib import Path

import UnityPy
from PIL import Image

ROOT = Path(r"D:\Github\民间改版学习\Windows64_v1.0.5\Windows_v1.0.5\tstd2_Data")
OUT = Path(r"D:\Github\cloudai\public\game-assets\kongming\shopkeepers")
DATA = Path(r"D:\Github\cloudai\lib\kongming\shop-npcs.json")
OUT.mkdir(parents=True, exist_ok=True)

# level -> (图像文件名, GO 名)
SHOPS = {4: ("innkeeper", "老板娘"), 5: ("shopkeeper", "老板"), 6: ("shopkeeper", "老板"),
         7: ("clerk", "老板"), 8: ("trainer", "老板"), 9: ("editor", "老板")}


def transform_pos(env, go_id: int):
    for obj in env.objects:
        if obj.type.name == "Transform":
            d = obj.read_typetree()
            if d.get("m_GameObject", {}).get("m_PathID") == go_id:
                p = d["m_LocalPosition"]
                return round(float(p["x"]), 3), round(float(p["y"]), 3)
    return None


def main() -> None:
    items = {}
    for level, (label, go_name) in SHOPS.items():
        env = UnityPy.load(str(ROOT / f"level{level}"))
        go_id = None
        for obj in env.objects:
            if obj.type.name == "GameObject":
                d = obj.read_typetree()
                if str(d.get("m_Name") or "") == go_name:
                    go_id = obj.path_id
                    break
        if go_id is None:
            print("missing GO", level, go_name)
            continue
        sr = None
        for obj in env.objects:
            if obj.type.name == "SpriteRenderer":
                d = obj.read_typetree()
                if d.get("m_GameObject", {}).get("m_PathID") == go_id and d.get("m_Enabled"):
                    sr = d
                    break
        if not sr or sr.get("m_Sprite", {}).get("m_PathID", 0) == 0:
            print("missing sprite", level, go_name)
            continue
        fid, pid = sr["m_Sprite"]["m_FileID"], sr["m_Sprite"]["m_PathID"]
        path = list(env.files.values())[0].externals[fid - 1].path
        ext = UnityPy.load(str(ROOT / path))
        for obj in ext.objects:
            if obj.path_id == pid and obj.type.name == "Sprite":
                sprite = obj.read()
                img = sprite.image.convert("RGBA")
                if img.size != (32, 32):
                    img = img.resize((32, 32), Image.NEAREST)
                fn = f"{label}-{level}.png"
                img.save(OUT / fn)
                pos = transform_pos(env, go_id)
                items[str(level)] = {
                    "image": f"/game-assets/kongming/shopkeepers/{fn}",
                    "pos": pos,
                    "name": go_name,
                }
                print(level, go_name, pos, img.size, fn, obj.read_typetree().get("m_Name"))
                break
    DATA.write_text(json.dumps(items, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("data", DATA)


if __name__ == "__main__":
    main()
