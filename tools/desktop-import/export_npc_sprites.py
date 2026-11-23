"""从桌面版场景中导出 NPC 行走数据与通用 NPC 贴图。

桌面版 `NPC.MoveSprites` 从 moveSpriteRes 的 40px 网格切 2×4 帧：
  Rect(40 * (j + 2*i), 0, 32, 32)
通用的 320×40 贴图因此是「一行八帧」；本脚本统一整理成 8 帧 64×64
条带，网页端按玩家同一套 36px 显示框渲染，避免 NPC 尺寸忽大忽小。
"""
from __future__ import annotations

import json
import os
import re
import struct
from pathlib import Path

import UnityPy
from PIL import Image

ROOT = Path(r"D:\Github\民间改版学习\Windows64_v1.0.5\Windows_v1.0.5\tstd2_Data")
SCENES = Path(r"public/game-assets/kongming/scenes.json")
OUT_STRIP = Path(r"public/game-assets/kongming/npc_walk")
OUT_JSON = Path(r"lib/kongming/npc-motion.json")
OUT_STRIP.mkdir(parents=True, exist_ok=True)


def safe_name(name: str) -> str:
    return re.sub(r"[^0-9A-Za-z\u4e00-\u9fff_-]+", "_", name)


def load_external(path: str):
    key = path
    if key not in _EXTERNALS:
        _EXTERNALS[key] = UnityPy.load(str(ROOT / path))
    return _EXTERNALS[key]


_EXTERNALS = {}
_SCRIPTS = None


def script_class(fid: int, pid: int) -> str | None:
    global _SCRIPTS
    if fid <= 0:
        return None
    # 场景里 m_Script 的 fileID 1 指向 globalgamemanagers.assets。
    if _SCRIPTS is None:
        _SCRIPTS = UnityPy.load(str(ROOT / "globalgamemanagers.assets"))
    for obj in _SCRIPTS.objects:
        if obj.path_id == pid and obj.type.name == "MonoScript":
            try:
                return obj.read_typetree().get("m_ClassName")
            except Exception:
                return None
    return None


def export_generic(texture, name: str) -> str | None:
    """把桌面版 320×40 的 8 帧 NPC 图导出成 512×64 标准条带。"""
    if texture.size != (320, 40):
        return None
    strip = Image.new("RGBA", (512, 64), (0, 0, 0, 0))
    for i in range(8):
        frame = texture.crop((40 * i, 0, 40 * i + 32, 32))
        strip.paste(frame, (i * 64 + 16, 32))
    label = safe_name(name)
    path = OUT_STRIP / f"{label}.png"
    strip.save(path)
    return label


def as_int(b: bytes, off: int) -> int:
    return struct.unpack_from("<i", b, off)[0]


def as_float(b: bytes, off: int) -> float:
    return struct.unpack_from("<f", b, off)[0]


def main() -> None:
    scenes = json.loads(SCENES.read_text(encoding="utf-8"))
    levels = sorted({s["level"] for s in scenes})
    motion: dict[str, dict[str, dict]] = {}

    for level in levels:
        f = ROOT / f"level{level}"
        if not f.exists():
            continue
        env = UnityPy.load(str(f))
        objects = list(env.objects)
        go_names: dict[int, str] = {}
        positions: dict[int, tuple[float, float]] = {}
        transforms: dict[int, dict] = {}
        for obj in objects:
            if obj.type.name == "GameObject":
                d = obj.read_typetree()
                go_names[obj.path_id] = str(d.get("m_Name") or "")
            elif obj.type.name == "Transform":
                transforms[obj.path_id] = obj.read_typetree()

        for obj in objects:
            if obj.type.name != "MonoBehaviour":
                continue
            b = obj.get_raw_data()
            if len(b) < 128:
                continue
            sfid, spid = struct.unpack_from("<iq", b, 16)
            if script_class(sfid, spid) != "NPC":
                continue
            go_id = struct.unpack_from("<q", b, 4)[0]
            go_name = go_names.get(go_id, "")
            m = re.match(r"^(\d+)", go_name)
            if not m:
                continue
            event_id = m.group(1)

            # 找这个 GameObject 的 Transform 位置。
            pos = None
            for tr in transforms.values():
                if tr.get("m_GameObject", {}).get("m_PathID") == go_id:
                    lp = tr.get("m_LocalPosition", {})
                    pos = [float(lp.get("x", 0)), float(lp.get("y", 0))]
                    break

            area = [as_int(b, 92), as_int(b, 96)]
            speed = as_float(b, 84)
            wait = as_float(b, 88)
            count = as_int(b, 104)
            dirs = [as_int(b, 108 + 4 * i) for i in range(count)] if count < 10 else [0, 1, 2, 3]

            texture = None
            tex_name = None
            tex_fid, tex_pid = struct.unpack_from("<iq", b, 48)
            if tex_fid > 0:
                ext_path = obj.assets_file.externals[tex_fid - 1].path
                ext = load_external(ext_path)
                for ext_obj in ext.objects:
                    if ext_obj.path_id == tex_pid and ext_obj.type.name == "Texture2D":
                        d = ext_obj.read()
                        texture = d.image
                        tex_name = ext_obj.read_typetree().get("m_Name")
                        break

            model = None
            strip = None
            if tex_name and (Path("public/game-assets/kongming/units_field_walk") / f"{tex_name}.png").exists():
                model = tex_name
            elif texture is not None and tex_name:
                strip = export_generic(texture, tex_name)
            if model is None and strip is None:
                continue

            item = {
                "speed": round(speed, 3),
                "wait": round(wait, 3),
                "area": area,
                "dirs": dirs,
                "base": pos or [0.0, 0.0],
            }
            if model:
                item["model"] = model
            if strip:
                item["strip"] = strip
            motion.setdefault(str(level), {})[event_id] = item

    OUT_JSON.write_text(
        json.dumps(motion, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print("levels", len(motion), "npcs", sum(len(v) for v in motion.values()))
    print("strips", len(list(OUT_STRIP.glob("*.png"))), "json", OUT_JSON)


if __name__ == "__main__":
    main()
