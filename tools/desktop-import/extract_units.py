"""Extract the missing battle unit strips from sharedassets0 into public/kongming/units."""
import UnityPy, os, re

ROOT = r"D:\Github\民间改版学习\Windows64_v1.0.5\Windows_v1.0.5\tstd2_Data"
OUT = os.path.join(os.path.dirname(__file__), "..", "..", "public", "kongming", "units")
os.makedirs(OUT, exist_ok=True)

env = UnityPy.load(os.path.join(ROOT, "sharedassets0.assets"))
count = 0
for obj in env.objects:
    if obj.type.name != "Texture2D":
        continue
    data = obj.read()
    name = data.m_Name
    if not re.fullmatch(r"[0-9A-F]{2}", name):
        continue
    path = os.path.join(OUT, name + ".png")
    if os.path.exists(path):
        continue
    img = data.image
    if not img:
        continue
    img.save(path, optimize=True)
    count += 1
print("extracted", count, "->", OUT)
