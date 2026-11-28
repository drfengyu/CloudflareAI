"""Find event NPCs that only appear once their script runs.

`SetActive(true, 0)` as the first statement of `<id>.lua` means the GameObject
is disabled on scene load and is switched on by the event itself (Zhang Fei in
Xu Zhou: appear at (2,-14), walk to the trigger cell, then talk).  Drawing such
an NPC from the start puts it on its destination cell before the scene plays.

Output: lib/kongming/event-spawn.json  { "<level>": ["11005", ...] }
"""
import json
import os
import re

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SCENES = os.path.join(ROOT, "public", "game-assets", "kongming", "scenes.json")
LUA = os.path.join(ROOT, "public", "game-assets", "kongming", "lua.json")
OUT = os.path.join(ROOT, "lib", "kongming", "event-spawn.json")

SPAWN = re.compile(r"^\s*(?:--[^\n]*\n\s*)*SetActive\s*\(\s*true\s*,\s*0\s*\)", re.I)


def main():
    scenes = json.load(open(SCENES, encoding="utf-8"))
    lua = json.load(open(LUA, encoding="utf-8"))
    out = {}
    for sc in scenes:
        lv = sc.get("level")
        ids = []
        for ev in sc.get("events", []):
            eid = ev.get("id")
            if not eid:
                continue
            body = lua.get(f"{eid}.lua")
            if not isinstance(body, str):
                continue
            if SPAWN.match(body):
                ids.append(eid)
        if ids:
            out[str(lv)] = ids
    json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, sort_keys=True, indent=1)
    print("levels", len(out), "events", sum(len(v) for v in out.values()))
    for k, v in list(out.items())[:12]:
        print(k, v[:8])


if __name__ == "__main__":
    main()
