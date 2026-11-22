import UnityPy, os, json
from UnityPy.helpers.TypeTreeGenerator import TypeTreeGenerator
D=r'D:\Github\民间改版学习\Windows64_v1.0.5\Windows_v1.0.5\tstd2_Data'
g=TypeTreeGenerator('2022.2.11f1'); g.load_local_dll_folder(os.path.join(D,'Managed'))
for fn in ['sharedassets0.assets','resources.assets']:
 e=UnityPy.load(os.path.join(D,fn)); e.typetree_generator=g
 for o in e.objects:
  if o.type.name!='MonoBehaviour': continue
  try:
   mb=o.parse_monobehaviour_head(); s=mb.m_Script.deref_parse_as_object(); cls=(s.m_Namespace+'.' if s.m_Namespace else '')+s.m_ClassName
   if cls!='Tstd2.Settings.GameConfig': continue
   print('FOUND',fn,o.path_id, 'name', o.peek_name())
   d=o.read()
   print('name',getattr(d,'m_Name',''),'isTest',getattr(d,'isTest',None),'lv',getattr(d,'lv',None),'chars',[(x.m_Data.m_FileID,x.m_Data.m_PathID) for x in getattr(d,'characters',[])])
  except Exception as ex: print('ERR',fn,o.path_id,ex)
