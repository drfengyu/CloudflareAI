import UnityPy, os, json
from UnityPy.helpers.TypeTreeGenerator import TypeTreeGenerator

DATA = r"D:\Github\民间改版学习\Windows64_v1.0.5\Windows_v1.0.5\tstd2_Data"
VER = "2022.2.11f1"
gen = TypeTreeGenerator(VER)
gen.load_local_dll_folder(os.path.join(DATA, "Managed"))
env = UnityPy.load(os.path.join(DATA, "level4"))
env.typetree_generator = gen

for o in env.objects:
    if o.type.name != "Tilemap":
        continue
    d = o.read()
    print("TILEMAP", o.path_id, "origin", d.m_Origin, "size", d.m_Size, "tiles", len(d.m_Tiles))
    print("spriteArray", len(d.m_TileSpriteArray), "assetArray", len(d.m_TileAssetArray))
    for i, e in enumerate(d.m_TileSpriteArray[:8]):
        p = e.m_Data
        print(" spriteIdx", i, p.m_FileID, p.m_PathID)
    for pos, tile in d.m_Tiles[:5]:
        print(" cell", pos.x, pos.y, "idx", tile.m_TileIndex, "spriteIdx", tile.m_TileSpriteIndex, "flags", tile.m_AllTileFlags, "collider", tile.m_ColliderType)
    # first sprite
    for i, e in enumerate(d.m_TileSpriteArray):
        if e.m_Data.m_PathID:
            try:
                sp = e.m_Data.deref_parse_as_object()
                print("SPRITE", i, getattr(sp,"m_Name",""), sp.m_Rect, "tex", sp.m_Texture.m_FileID, sp.m_Texture.m_PathID)
            except Exception as ex:
                print("sprite err", ex)
            break
    break
