import os, sys
from multiprocessing import Pool
sys.path.insert(0, os.path.dirname(__file__))
from rebuild_maps import render_map

DATA = r"D:\Github\民间改版学习\Windows64_v1.0.5\Windows_v1.0.5\tstd2_Data"

def work(levels):
    out=[]
    for level in levels:
        if not os.path.exists(os.path.join(DATA, f"level{level}")):
            continue
        try:
            r=render_map(level, skip_block=False)
            out.append((level, r[1] if r else 0))
        except Exception as e:
            out.append((level, f"ERR {e}"))
    return out

if __name__ == "__main__":
    ranges=[]
    total=172
    step=43
    for i in range(0, total, step):
        ranges.append(list(range(i, min(i+step, total))))
    with Pool(len(ranges)) as p:
        results=p.map(work, ranges)
    for group in results:
        for level, n in group:
            print(level, n)
    print("DONE")
