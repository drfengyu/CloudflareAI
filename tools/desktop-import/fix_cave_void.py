"""Repair cave maps exported with white where the original viewport was black.

Two kinds of white artifact exist in the imported Tilemap PNGs:

* a solid white rectangle covering one or more missing tile chunks;
* thin white seams/bands along the edge of a room, often split into
  tile-sized pieces by 1px non-white seams.

Both are background, not game art.  Textured white walls are made of many
small components and are left alone.  The script only touches scenes marked
``isCave``.
"""
import json
from collections import deque

from PIL import Image, ImageChops


def white_mask(im):
    r, g, b, a = im.split()
    cond = lambda v: 255 if v >= 250 else 0
    return ImageChops.multiply(
        ImageChops.multiply(r.point(cond), g.point(cond)),
        ImageChops.multiply(b.point(cond), a.point(cond)),
    ).point(cond)


def components(mask, scale):
    w, h = mask.size
    small = mask.resize((w // scale, h // scale), Image.BOX)
    small = small.point(lambda v: 255 if v >= 250 else 0)
    sw, sh = small.size
    data = list(small.getdata())
    seen = bytearray(sw * sh)
    out = []
    for i, value in enumerate(data):
        if value != 255 or seen[i]:
            continue
        queue = deque([i])
        seen[i] = 1
        n = 0
        minx, miny, maxx, maxy = sw, sh, 0, 0
        while queue:
            j = queue.popleft()
            n += 1
            y, x = divmod(j, sw)
            minx, miny = min(minx, x), min(miny, y)
            maxx, maxy = max(maxx, x), max(maxy, y)
            if x > 0 and data[j - 1] == 255 and not seen[j - 1]:
                seen[j - 1] = 1
                queue.append(j - 1)
            if x + 1 < sw and data[j + 1] == 255 and not seen[j + 1]:
                seen[j + 1] = 1
                queue.append(j + 1)
            if y > 0 and data[j - sw] == 255 and not seen[j - sw]:
                seen[j - sw] = 1
                queue.append(j - sw)
            if y + 1 < sh and data[j + sw] == 255 and not seen[j + sw]:
                seen[j + sw] = 1
                queue.append(j + sw)
        out.append(
            {
                "area": n * scale * scale,
                "bbox": (minx * scale, miny * scale, (maxx + 1) * scale, (maxy + 1) * scale),
                "pixels": None,
            }
        )
    return out


scenes = json.load(open("public/game-assets/kongming/scenes.json", encoding="utf-8"))
caves = [x for x in scenes if x.get("isCave")]
changed = []

for scene in caves:
    path = "public/game-assets" + scene["map"]["src"]
    im = Image.open(path).convert("RGBA")
    wmask = white_mask(im)

    # Phase 1: solid white rectangles.  One missing export chunk is far
    # larger than a tile; the 85% fill ratio protects textured white walls.
    boxes = []
    for comp in components(wmask, 4):
        box = comp["bbox"]
        bw, bh = box[2] - box[0], box[3] - box[1]
        ratio = comp["area"] / (bw * bh) if bw and bh else 0
        if comp["area"] >= 5000 and ratio >= 0.85 and bw >= 8 and bh >= 8:
            boxes.append(box)

    for box in boxes:
        pad = 12
        area_box = (
            max(0, box[0] - pad),
            max(0, box[1] - pad),
            min(im.width, box[2] + pad),
            min(im.height, box[3] + pad),
        )
        im.paste((0, 0, 0, 255), area_box, wmask.crop(area_box))

    # Phase 2: thin seams and bands that phase 1 cannot see.  They are long
    # (span over 100px) and composed of many tile-sized white fragments.
    wmask = white_mask(im)
    fill_small = Image.new("L", (im.width // 2, im.height // 2), 0)
    cleanup = 0
    for comp in components(wmask, 2):
        box = comp["bbox"]
        bw, bh = box[2] - box[0], box[3] - box[1]
        if comp["area"] >= 5000 and (bw > 100 or bh > 100):
            fill_small.paste(255, (box[0] // 2, box[1] // 2, box[2] // 2, box[3] // 2))
            cleanup += 1
    if cleanup:
        fill = fill_small.resize(im.size, Image.NEAREST)
        fill = ImageChops.multiply(fill, wmask)
        im.paste((0, 0, 0, 255), (0, 0, im.width, im.height), fill)

    if boxes or cleanup:
        im.save(path)
        changed.append((scene["level"], scene["name"], boxes, cleanup))

for level, name, boxes, cleanup in changed:
    print(level, name, "rects", boxes, "seams", cleanup)
print("changed", len(changed))
