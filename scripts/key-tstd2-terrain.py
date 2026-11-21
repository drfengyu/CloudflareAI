# 桌面版地形条带是 24bpp 无透明通道；把天空底色抠成透明，运行时才能叠在战场上。
# 用法：python scripts/key-tstd2-terrain.py
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "assets" / "tstd2-reference" / "terrain"
OUT = ROOT / "public" / "trial" / "tstd2" / "terrain"

NAME_MAP = {
    "城": "city", "城关": "pass", "墓": "tomb", "密道": "tunnel", "寨": "camp",
    "山": "mountain", "岩山": "rock", "峡谷": "canyon", "平地": "plain", "森": "forest",
    "洞窟": "cave", "洞窟桃": "cave-peach", "洞窟紫": "cave-purple", "洞窟绿": "cave-green",
    "洞窟蓝": "cave-blue", "洞窟赤": "cave-red", "洞窟黄": "cave-yellow", "海": "sea",
    "石阵": "stone-array", "荒地": "wasteland",
}

SKY = {(96, 208, 224), (160, 255, 240)}

for source in SRC.glob("*.png"):
    out_name = NAME_MAP.get(source.stem)
    if not out_name:
        continue
    image = Image.open(source).convert("RGBA")
    pixels = list(image.getdata())
    key = SKY if out_name != "sea" else {(160, 255, 240)}
    image.putdata([(r, g, b, 0) if (r, g, b) in key else (r, g, b, a) for r, g, b, a in pixels])
    image.save(OUT / f"{out_name}.png")

print(f"keyed {len(NAME_MAP)} terrain strips -> {OUT}")
