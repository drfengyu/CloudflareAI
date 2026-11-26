#!/usr/bin/env python3
"""用桌面版 BuildSettings 的场景名作为 scenes.json 的规范名。

导出器的 SceneData.sceneName 在改版包里被复用/写错（例如 level7 的「役」
写成「武器店」、level18 的「城镇民房」写成「武器店#18」），导致
ChangeScene("役") / 民房传送点找不到场景。Unity 的 BuildSettings 场景列表
才是原版可加载的场景路径名，因此按 level 序号回填 name，并把旧名保存在
legacyName。
"""
import json
import os

import UnityPy

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCENES = os.path.join(ROOT, "public", "game-assets", "kongming", "scenes.json")
DATA = os.environ.get("TSTD2_DATA", r"D:\Github\民间改版学习\Windows64_v1.0.5\Windows_v1.0.5\tstd2_Data")


def main() -> None:
    env = UnityPy.load(os.path.join(DATA, "globalgamemanagers"))
    build = []
    for obj in env.objects:
        if obj.type.name == "BuildSettings":
            build = obj.read().scenes
    names = [os.path.basename(path).replace(".unity", "") for path in build]
    data = json.load(open(SCENES, encoding="utf-8"))
    changed = 0
    for scene in data:
        level = scene.get("level")
        if isinstance(level, int) and 0 <= level < len(names):
            old = scene["name"]
            new = names[level]
            if old != new:
                scene["legacyName"] = old
                scene["name"] = new
                changed += 1
    json.dump(data, open(SCENES, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"canonicalized {changed} / {len(data)} scenes")


if __name__ == "__main__":
    main()
