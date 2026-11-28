"""Erase baked static NPC figures from a painted town map.

Towns ship a few idle villagers painted into the layer-0 map art.  They have no
dialogue anchor in the web port, so they read as dead sprites standing in the
street.  Two refill modes keep the art looking untouched:

* ``offset`` -- the ground repeats every 32 px, so copy a same-phase cell block
  from a clean neighbour (stone roads, grass, sand).
* ``ramp``   -- the figure straddles a terrain edge (grass over sand), so the
  edge is rebuilt column by column by interpolating between the edge height on
  the left and right side of the hole.

Usage:
    python erase_map_figures.py 11 <map.png>
"""
import sys

from PIL import Image

# (box, mode, label); box is (x0, y0, x1, y1) half-open.
TARGETS = {
    11: [  # 徐州
        ((253, 698, 289, 733), ("ramp",), "武 店前老翁"),
        ((358, 213, 385, 254), ("offset", (32, 0)), "石道上的女子"),
        ((480, 818, 512, 868), ("offset", (-32, 0)), "城门口的女子"),
        ((702, 626, 734, 672), ("offset", (0, 64)), "宿 店右侧绿衣人"),
    ],
}


def classify(rgb):
    r, g, b = rgb
    mx, mn = max(rgb), min(rgb)
    if g > r + 6 and g > b + 16 and g >= 90 and mx - mn >= 20:
        return "grass"
    if r > 180 and 85 <= g <= 205 and b < 100:
        return "dirt"
    if mx - mn < 20 and 80 <= r <= 200:
        return "stone"
    if b > 168 and b > g and g > 138 and r < 150:
        return "water"
    if mx < 45:
        return "black"
    return "other"


def edge_between(px, x, y0, y1):
    """Return the row where the terrain changes going down column x, else None."""
    top = classify(px[x, y0 - 1])
    for y in range(y0 - 1, y1 + 2):
        if classify(px[x, y]) != top:
            return y
    return None


def erase_offset(img, box, off):
    x0, y0, x1, y1 = box
    dx, dy = off
    w, h = x1 - x0, y1 - y0
    src = img.crop((x0 + dx, y0 + dy, x0 + dx + w, y0 + dy + h))
    img.paste(src, (x0, y0))
    return w * h


def sample_phase(px, x, y, want, size):
    """Grab the texture colour one tile away (32 px = one repeat) that matches ``want``."""
    w, h = size
    for dx, dy in ((0, -32), (0, 32), (-32, 0), (32, 0)):
        nx, ny = x + dx, y + dy
        if 0 <= nx < w and 0 <= ny < h and classify(px[nx, ny]) == want:
            return px[nx, ny]
    return None


def erase_ramp(img, box):
    x0, y0, x1, y1 = box
    px = img.load()
    left = edge_between(px, x0 - 2, y0, y1)
    right = edge_between(px, x1 + 1, y0, y1)
    if left is None or right is None:
        return erase_offset(img, box, (-32, 0))
    base_edge = int(round((left + right) / 2))
    for x in range(x0, x1):
        jitter = (x * 5 + 3) % 5 - 2
        edge = base_edge + jitter
        top_col = px[x, y0 - 1]
        bot_col = px[x, y1]
        for y in range(y0, y1):
            want = "grass" if y < edge else "dirt"
            col = sample_phase(px, x, y, want, img.size)
            if col is None:
                col = top_col if y < edge else bot_col
            px[x, y] = col
    return (x1 - x0) * (y1 - y0)


def main(level, path):
    img = Image.open(path).convert("RGB")
    for box, mode, label in TARGETS[level]:
        if mode[0] == "offset":
            erase_offset(img, box, mode[1])
        else:
            erase_ramp(img, box)
        print(f"  {label}: {mode[0]}")
    img.save(path, optimize=True)
    print("done", level)


if __name__ == "__main__":
    main(int(sys.argv[1]), sys.argv[2])
