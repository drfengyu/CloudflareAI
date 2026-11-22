import UnityPy, os
DATA = r"D:\Github\民间改版学习\Windows64_v1.0.5\Windows_v1.0.5\tstd2_Data"
env = UnityPy.load(os.path.join(DATA, "level11"))
for o in env.objects:
    if o.type.name != "Tilemap": continue
    tm=o.read(); go=tm.m_GameObject.deref_parse_as_object()
    print("TM", go.m_Name)
    for cell,tile in list(tm.m_Tiles)[:3]:
        try:
            asset=tm.m_TileAssetArray[tile.m_TileIndex].m_Data.deref_parse_as_object()
            sp=asset.m_Sprite.deref_parse_as_object()
            print("  cell",cell,"tileidx",tile.m_TileIndex,"sprite",sp.m_Name, "color", getattr(tile,"m_Color",None))
            tex=sp.m_RD.texture.deref_parse_as_object()
            print("   texture",tex.m_Name,tex.m_Width,tex.m_Height)
            img=tex.image
            print("   mode",img.mode, "extrema", img.getextrema())
        except Exception as e: print("  err",e)
