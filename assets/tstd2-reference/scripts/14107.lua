-- 第四章 赤壁之战
-- NPC 曹操0，张飞1，兵士2，关羽3
SetCameraFollowNPC(0)
Delay(.3)
Talk(0, "好，过了华容道，向洛阳前进。")
ChangeDirection(2, 0)
MoveTo({ { 44, -14 } })
Fade(true, .5)
SetPosition({ 43, -1 })
ChangeDirection(0, 0)
Fade(false, .5)
----- 张飞部分
Talk(-100, "在此歇息，埋锅造饭。")
Talk(-100, "曹操坐于疏林之下。")
Talk(0, "（仰面大笑）若孔明在此埋伏一彪军马，我等纵然脱得性命，也不免重伤矣。")
Talk(-100, "正说间四下火烟骤起，山口一军摆开，为首乃燕人张翼德。")
SetActive(true, 1)
MoveTo({ { 43, -2 } }, 1)
Talk(1, "（横矛立马）操贼哪里去？")
Talk(-100, "曹军诸将尽皆胆寒，许褚骑无鞍马战张飞，张辽徐晃也来夹攻。")
AddTempCharacterById(103)
Battle()
ClearTempCharacters()
Talk(-100, "曹操拨马走脱，众将各自脱身，但多已带伤。")
Fade(true, .5)
SetActive(false, 1)
SetPosition({ 36, 6 })
Fade(false, .5)
----- 兵士部分
SetActive(true, 2)
MoveTo({ { 41, -2 }, { 41, 1 }, { 39, 1 }, { 39, 4 }, { 36, 4 }, { 36, 5 } }, 2)
Talk(2, "小路投华容道，地窄路险，却比大路近五十里，但山边有数处烟起。")
Talk(0, "岂不闻兵书有云，虚则实之，实则虚之。")
Talk(0, "诸葛亮多谋，使人于山僻烧烟，使吾不走小路，他却伏兵于大路，吾偏不中他计。")
Talk(-100, "曹操遂勒兵走华容道。")
Talk(-100, "此时，人皆饥倒，马尽困乏，只有三百余骑随后，并无衣甲军械整齐者。")
Fade(true, .5)
SetActive(false, 2)
SetPosition({ 31, 14 })
Fade(false, .5)
----- 关羽部分
Talk(0, "（在马上扬鞭大笑）若孔明在此伏一旅之师，吾等皆束手受缚矣......")
Talk(-100, "言未毕，一声炮响，两边校刀手摆开。")
Talk(-100, "为首大将关云长，提青龙刀，跨赤兔马，截住去路。")
SetActive(true, 3)
MoveTo({ { 30, 14 } }, 3)
ChangeDirection(3, 3)
Talk(-100, "曹军见了，亡魂丧胆，面面相觑。")
Battle(1)
SetActive(true, 4)
MoveTo({ { 31, 13 } }, 4)
ChangeDirection(1, 3)
Talk(-100, "关羽乃重义之人，想起当日曹操之恩，如何不动心。")
Talk(-100, "又见曹军惶惶，皆欲垂泪，愈发心中不忍，于是勒马回头，令众军四散摆开，放曹操与众将过去。")
-- 进入第五章
StartChapter(5)
Rest(0, false)
RemoveRole({ 133 }, true)
AddRole({135 }, false)
FinishEvents("14101", "15000")
Fade(true, 2)
Delay(.2)
ChangeScene(0, "江夏宫殿", "开场", false)
do return end