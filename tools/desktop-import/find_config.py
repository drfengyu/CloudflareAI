import UnityPy, os
from UnityPy.helpers.TypeTreeGenerator import TypeTreeGenerator
D=r'D:\Github\民间改版学习\Windows64_v1.0.5\Windows_v1.0.5\tstd2_Data'
g=TypeTreeGenerator('2022.2.11f1'); g.load_local_dll_folder(os.path.join(D,'Managed'))
for fn in ['resources.assets']+[f'sharedassets{i}.assets' for i in range(172)]:
 p=os.path.join(D,fn)
 if not os.path.exists(p): continue
 e=UnityPy.load(p); e.typetree_generator=g
 for o in e.objects:
  if o.type.name!='MonoBehaviour' or o.path_id!=1234: continue
  try:
   mb=o.parse_monobehaviour_head(); s=mb.m_Script.deref_parse_as_object(); cls=(s.m_Namespace+'.' if s.m_Namespace else '')+s.m_ClassName
   d=o.read(); print(fn, o.path_id, cls, getattr(d,'m_Name',''))
  except Exception as ex: print(fn,o.path_id,'ERR',ex)
