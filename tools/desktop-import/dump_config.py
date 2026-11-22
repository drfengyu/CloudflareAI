import UnityPy, os, json
from UnityPy.helpers.TypeTreeGenerator import TypeTreeGenerator
D=r'D:\Github\民间改版学习\Windows64_v1.0.5\Windows_v1.0.5\tstd2_Data'
g=TypeTreeGenerator('2022.2.11f1'); g.load_local_dll_folder(os.path.join(D,'Managed'))
e=UnityPy.load(os.path.join(D,'sharedassets0.assets')); e.typetree_generator=g
o=[o for o in e.objects if o.path_id==357][0]
d=o.read()
for k,v in d.__dict__.items():
 if k in ('object_reader','serializationData','__node__'): continue
 if k in ('characters','npcCharacters','alternateCharacters'):
  print(k, [(p.m_FileID,p.m_PathID, p.deref_parse_as_object().m_Name) for p in v])
 else: print(k, repr(v)[:300])
