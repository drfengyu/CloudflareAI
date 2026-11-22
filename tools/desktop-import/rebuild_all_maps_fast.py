import os
import sys
from multiprocessing import Pool

sys.path.insert(0, os.path.dirname(__file__))
from rebuild_maps import render_map

DATA = r"D:\Github\民间改版学习\Windows64_v1.0.5\Windows_v1.0.5\tstd2_Data"


def work(level):
    if not os.path.exists(os.path.join(DATA, f"level{level}")):
        return (level, "missing")
    try:
        r = render_map(level, skip_block=False)
        return (level, r[1] if r else 0)
    except Exception as e:
        return (level, f"ERR {e}")


if __name__ == "__main__":
    levels = [i for i in range(172) if os.path.exists(os.path.join(DATA, f"level{i}"))]
    with Pool(12) as p:
        for level, result in p.imap_unordered(work, levels, chunksize=1):
            print(level, result, flush=True)
    print("DONE")
