import UnityPy, os, json
from UnityPy.helpers.TypeTreeGenerator import TypeTreeGenerator
D=r'D:\Github\民间改版学习\Windows64_v1.0.5\Windows_v1.0.5\tstd2_Data'
g=TypeTreeGenerator('2022.2.11f1'); g.load_local_dll_folder(os.path.join(D,'Managed'))
e=UnityPy.load(os.path.join(D,'level4')); e.typetree_generator=g
for o in e.objects:
    if o.type.name!='MonoBehaviour': continue
    mb=o.parse_monobehaviour_head(); s=mb.m_Script.deref_parse_as_object(); cls=(s.m_Namespace+'.' if s.m_Namespace else '')+s.m_ClassName
    if cls not in ('Tstd2.SceneManagement.SceneData','Tstd2.GamePlay.NPC','Tstd2.Lua.QuestEvent','Tstd2.SceneManagement.TransitionPoint','Tstd2.GamePlay.MapChest','Tstd2.GamePlay.TeamMove','Tstd2.GamePlay.ShopItemsBySceneMono','Tstd2.GamePlay.ParametersBySceneMono','Tstd2.GamePlay.StoneFormationMono'): continue
    try:
        d=o.read()
        print('\n###', cls, o.path_id)
        for k,v in d.__dict__.items():
            if k in ('object_reader','serializationData','m_Script'): continue
            print(k, '=', repr(v)[:600])
    except Exception as ex:
        print('ERR',cls,o.path_id,ex)
