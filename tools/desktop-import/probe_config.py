import UnityPy, os
from UnityPy.helpers.TypeTreeGenerator import TypeTreeGenerator
D=r'D:\Github\民间改版学习\Windows64_v1.0.5\Windows_v1.0.5\tstd2_Data'
g=TypeTreeGenerator('2022.2.11f1'); g.load_local_dll_folder(os.path.join(D,'Managed'))
e=UnityPy.load(os.path.join(D,'level1')); e.typetree_generator=g
for o in e.objects:
    if o.type.name != 'MonoBehaviour': continue
    mb=o.parse_monobehaviour_head(); s=mb.m_Script.deref_parse_as_object(); cls=(s.m_Namespace+'.' if s.m_Namespace else '')+s.m_ClassName
    if cls != 'Tstd2.Manager.GameManager': continue
    d=o.read()
    print('fields', list(d.__dict__.keys()))
    print('ptr', d.initConfig.m_FileID, d.initConfig.m_PathID, d.initConfig.assetsfile.name)
    print('init fields', list(mb.__dict__.keys()))
