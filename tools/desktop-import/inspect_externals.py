import UnityPy, os
DATA = r"D:\Github\民间改版学习\Windows64_v1.0.5\Windows_v1.0.5\tstd2_Data"
env = UnityPy.load(os.path.join(DATA, "level12"))
sf = next(iter(env.files.values()))
print("externals", getattr(sf, "externals", None))
print("name", sf.name)
