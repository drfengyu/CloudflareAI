"""Erase baked static NPC figures from a painted town map.

Towns ship a few idle villagers painted into the layer-0 map art.  They have no
dialogue anchor in the web port, so they read as dead sprites standing in the
street.  The map art is built from 32 px cells, so each figure box is refilled
by copying a same-phase cell block from a clean neighbour.

Usage:
    python erase_map_figures.py 11 <map.png>
"""
import sys

from PIL import Image

# (box, (dx, dy), label) - box is (x0, y0, x1, y1) half-open, offset is in px.
TARGETS = {
    11: [  # 徐州
        ((253, 693, 289, 735), (-32, -32), "武 店前老翁"),
        ((358, 213, 385, 254), (32, 0), "石道上的女子"),
        ((480, 818, 512, 868), (-32, 0), "城门口的女子"),
        ((702, 626, 734, 672), (0, 64), "宿 店右侧绿衣人"),
    ],
}


def erase(img, box, off):
    x0, y0, x1, y1 = box
    dx, dy = off
    w, h = x1 - x0, y1 - y0
    src = img.crop((x0 + dx, y0 + dy, x0 + dx + w, y0 + dy + h))
    img.paste(src, (x0, y0))
    return w * h


def main(level, path):
    img = Image.open(path).convert("RGB")
    total = 0
    for box, off, label in TARGETS[level]:
        total += erase(img, box, off)
        print(f"  {label}: offset {off}")
    img.save(path, optimize=True)
    print("done", level, total, "px")


if __name__ == "__main__":
    main(int(sys.argv[1]), int(sys.argv[2]) if sys.argv[2].isdigit() else sys.argv[2])



