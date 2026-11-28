"""把 NPC 贴图里的人物统一放大到 32 px 高，与玩家角色一致。

桌面版 NPC 用的是 `moveSpriteRes` 40×40 纹理，人物本体只有 22~26 px；
玩家队伍贴图的人物体本是 32 px，两者同一张地图上会明显一大一小。
这里按最近邻把 NPC 人物缩放到 32 px 高，脚底对齐帧内 y=61，
帧仍保持 64×64，前端可以继续用 64 帧绘制。
"""

from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "public" / "game-assets" / "kongming"
WALK_DIR = ASSETS / "npc_walk"
STATIC_DIR = ASSETS / "units_field"

TARGET_H = 32
FOOT_Y = 61
CELL = 64


def fit(frame: Image.Image) -> Image.Image:
    box = frame.getbbox()
    if not box:
        return frame
    crop = frame.crop(box)
    k = TARGET_H / crop.height
    w = max(1, round(crop.width * k))
    crop = crop.resize((w, TARGET_H), Image.NEAREST)
    out = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
    out.alpha_composite(crop, ((CELL - w) // 2, FOOT_Y - (TARGET_H - 1)))
    return out


def fix_strip(path: Path) -> None:
    im = Image.open(path).convert("RGBA")
    if im.width % 8:
        print("跳过（帧数不是 8）:", path.name, im.size)
        return
    fw = im.width // 8
    strip = Image.new("RGBA", (CELL * 8, CELL), (0, 0, 0, 0))
    for i in range(8):
        frame = im.crop((i * fw, 0, (i + 1) * fw, im.height))
        strip.alpha_composite(fit(frame), (i * CELL, 0))
    strip.save(path)
    print("条带", path.name, im.size, "->", strip.size)


def main() -> None:
    for p in sorted(WALK_DIR.glob("*.png")):
        fix_strip(p)
    for p in sorted(STATIC_DIR.glob("npc-*.png")):
        im = Image.open(p).convert("RGBA")
        fit(im).save(p)
        print("静态", p.name, im.size, "-> 64x64")


if __name__ == "__main__":
    main()
