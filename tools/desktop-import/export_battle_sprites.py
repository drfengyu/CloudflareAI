"""从桌面原版 `units/<model>.png` 条带导出战斗用帧。

条带布局（`Character.cs`）：
- `MoveSprites` 2×4，源矩形 `Rect(40 + 40*(j + 2*i), 0, 32, 32)`；
  行 3（j=6/7）为朝右，战斗待机/前进用这一行；敌方在网页端水平镜像。
- `DeadSprite` 为 `Rect(360, 0, 64, 64)`，Unity y 从底部算，
  PNG 裁切 y = 图片高 - 64。
- 只有 552px 宽的完整条带才含移动/死亡帧，48/60px 小图跳过。

输出：
- `units_battle/<model>-0.png` / `-1.png`：32×32 朝右前进帧。
- `units_dead/<model>.png`：64×64 阵亡帧。
- `battle-sprites.json`：可用模型索引，供网页端回退。
"""
from __future__ import annotations

import json
from pathlib import Path

from PIL import Image

ROOT = Path(r"D:\Github\cloudai")
SRC = ROOT / "public/game-assets/kongming/units"
OUT_READY = ROOT / "public/game-assets/kongming/units_battle"
OUT_DEAD = ROOT / "public/game-assets/kongming/units_dead"
INDEX = ROOT / "lib/kongming/battle-sprites.json"

# MoveSprites 行 3（朝右）的两帧。
READY_INDICES = (6, 7)


def main() -> None:
    OUT_READY.mkdir(parents=True, exist_ok=True)
    OUT_DEAD.mkdir(parents=True, exist_ok=True)
    ready_models: list[str] = []
    dead_models: list[str] = []

    for path in sorted(SRC.glob("*.png")):
        model = path.stem
        image = Image.open(path).convert("RGBA")
        width, height = image.size
        if width < 40 + 40 * READY_INDICES[-1] + 32:
            continue
        y = height - 32
        frames = [
            image.crop((40 + 40 * i, y, 72 + 40 * i, y + 32))
            for i in READY_INDICES
        ]
        if any(frame.getchannel("A").getbbox() is None for frame in frames):
            continue
        for n, frame in enumerate(frames):
            frame.save(OUT_READY / f"{model}-{n}.png")
        ready_models.append(model)

        dead = image.crop((360, height - 64, 424, height))
        if dead.getchannel("A").getbbox() is not None:
            dead.save(OUT_DEAD / f"{model}.png")
            dead_models.append(model)

    INDEX.write_text(
        json.dumps({"ready": ready_models, "dead": dead_models}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"ready {len(ready_models)} -> {OUT_READY}")
    print(f"dead  {len(dead_models)} -> {OUT_DEAD}")
    print(f"index -> {INDEX}")


if __name__ == "__main__":
    main()
