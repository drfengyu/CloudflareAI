-- 第七章 汉中宫殿 
Talk(-100, "汉中既定，大饷士卒，开仓赈济，军民大悦。")
SetActive(true, 0)
MoveTo({ {-5, -1} }, 0)
Talk(0, "曹操自立为大魏皇帝，汉献帝已遇害。")
MoveTo({ {-5, -14} }, 0, true)
Talk(-100, "刘备闻知，痛哭终日，令百官掛孝遥望设祭。")
Talk(-100, "孔明率百官上表，请刘皇叔即皇帝位。")
Talk(1, "（勃然变色）吾虽景帝之后，并未有德泽以布于民。今一旦自立为帝，与篡窃何异。")
Talk(2, "臣自出茅庐，德遇大王，相随至今，言听计从。今幸大王有两川之地，不负臣夙昔之言。")
Talk(2, "今文武官僚，咸欲奉大王为帝，灭魏兴刘，共图功名。若大王坚持不肯，众官皆有怨心，不久必尽散。")
Talk(1, "非吾推阻，恐天下人议论耳。")
Talk(2, "圣人云：名不正，则言不顺。今大王名正言顺，有何可议？岂不闻天与弗取，反受其咎。")
Talk(1, "陷吾于不义，皆卿等也。")
Talk(2, "王上既允所请，便可筑祭壇，择吉日，恭行登基大礼。")
Fade(true, .5)
ChangeScene(2, "", "开场", false)
SetActive(false, 0)
Talk(-100, "刘备乃于建安二十六年四月丙午登基汉帝，改元章武元年。")
Rest(0, false)
Fade(false, .5)
Talk(1, "曹魏大军压境，请军师安排荆州益州之防务。")
Talk(2, "宜请关羽张飞二位将军镇守。")
Talk(1, "云长任荆州牧，翼德任益州牧，加紧防范，不得有误。")
Rest(0, false, true)
RemoveRole({102, 103})
SetActive(true, 1)
SetActive(true, 2)
MoveToAsync({{-5, 0}}, 1)
MoveTo({{-3, 0}}, 2)
ChangeDirection(1, 1)
ChangeDirection(1, 2)
Talk(3, "遵命！")
MoveTo({{-5, -14}}, 1, true)
Talk(4, "得令！")
MoveTo({{-3, -14}}, 2, true)
Talk(1, "封诸葛亮为丞相，平北大都督。择日起兵，出师伐魏，北定中原，兴复汉室。")
Talk(1, "即刻出师伐魏！")
FinishCurrentEvent()
do return end