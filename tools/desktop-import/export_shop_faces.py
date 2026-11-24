"""导出桌面版店铺事件自带的 48×48 店主头像。

店铺的 `QuestEvent.names[i].profile` 直接引用场景资源里的 Sprite，
而不是 `resources.assets` 里 96×96 的武将立绘。徐州六间店铺分别是：
`蔡`、`武器店老板`、`费诗`、`陈宫（2）`、`蒋琬`，因此按原始贴图单独导出。
"""
from pathlib import Path
import UnityPy

ROOT = Path(r"D:\Github\民间改版学习\Windows64_v1.0.5\Windows_v1.0.5\tstd2_Data")
OUT = Path(__file__).resolve().parents[2] / "public" / "game-assets" / "kongming" / "shopfaces"
SOURCES = {
    "蔡": "sharedassets4.assets",
    "武器店老板": "sharedassets5.assets",
    "费诗": "sharedassets6.assets",
    "陈宫（2）": "sharedassets8.assets",
    "蒋琬": "sharedassets9.assets",
}


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, asset in SOURCES.items():
        env = UnityPy.load(str(ROOT / asset))
        found = False
        for obj in env.objects:
            if obj.type.name != "Texture2D":
                continue
            data = obj.read()
            if data.m_Name != name:
                continue
            image = data.image
            if image is None:
                raise RuntimeError(f"{asset} 中的 {name} 无法解码")
            image.save(OUT / f"{name}.png", optimize=True)
            print(f"{name}: {image.width}x{image.height} <- {asset}")
            found = True
            break
        if not found:
            raise RuntimeError(f"{asset} 中找不到 Texture2D {name}")


if __name__ == "__main__":
    main()
