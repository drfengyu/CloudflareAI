"""Extract 84x84 character portraits from desktop resources by Chinese profile name."""
import UnityPy, os, json, re

ROOT = r"D:\Github\民间改版学习\Windows64_v1.0.5\Windows_v1.0.5\tstd2_Data"
HERE = os.path.dirname(__file__)
OUT = os.path.abspath(os.path.join(HERE, "..", "..", "public", "kongming", "faces"))
os.makedirs(OUT, exist_ok=True)
content = json.load(open(os.path.join(HERE, "..", "..", "data", "desktop_content.json"), encoding="utf-8"))
profiles = {c.get("profile") for c in content["characters"] if c.get("profile")}
profiles |= {"大众脸", "兵士"}
for assets in ("resources.assets", "sharedassets0.assets"):
    env = UnityPy.load(os.path.join(ROOT, assets))
    for obj in env.objects:
        if obj.type.name != "Texture2D":
            continue
        data = obj.read()
        name = data.m_Name
        if name not in profiles:
            continue
        path = os.path.join(OUT, name + ".png")
        if os.path.exists(path):
            continue
        img = data.image
        if img is None:
            continue
        # portraits are square-ish; unit strips are wide
        if img.width > img.height * 1.6:
            continue
        img.save(path, optimize=True)
print("faces", len(os.listdir(OUT)))
