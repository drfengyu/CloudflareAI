from rebuild_maps import render_map
import os
ROOT=r"C:\Users\Drfen\Doubao\chats\2026-11-22\new-chat\cloudai-work"
for level in (11,12,3):
    out,n,names=render_map(level, skip_block=True, out_path=os.path.join(ROOT,f"tmp-level{level}-noblock.png"))
    print(level,n,names)
