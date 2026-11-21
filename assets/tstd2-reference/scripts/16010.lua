-- 第六章 新野宫殿
Talk(0, "得此地图，即可入蜀。")
SetActive(true, 0)
MoveTo({ { -5, 1 } }, 0)
ChangeDirection(3, 0)
Talk(1, "主公，西蜀来了使者求见。")
Talk(0, "军师，怎么办？")
Talk(2, "张松之计已成，快请使者入内。")
Talk(0, "快请使者。")
Talk(1, "知道了。")
SetActive(true, 1)
MoveTo({ { -5, -14 } }, 0, false)
MoveTo({ { -5, 1 } }, 1)
ChangeDirection(3, 1)
Talk(3, "吾乃西蜀法正，西蜀的葭萌关已被汉中军攻占。我主刘璋修书一封，请刘皇叔派军相助。")
Talk(-100, "玄德看毕大喜，设宴相待法正。")
Talk(3, "入蜀船只已备，我在襄阳城西南渡口恭候，告辞了。")
MoveTo({ { -5, -14 } }, 1, false)
Talk(0, "军师，如何是好？")
Talk(2, "荆州尚未安定，需云长、子龙留守。可命庞统为军师，张飞为大将，出兵西蜀。")
Talk(0, "照此部署，请庞统来。")
Fade(true, .5)
RemoveRole({ 102, 104, 106 })
TeamInitCurrentCharacters({ 105, 103 })
SetTeamCharactersCount(5)
InitTeamStatus()
TeamQuickMoveTo({ -4, 0 }, 1, true)
SetActive(true, 2)
SetActive(true, 3)
Fade(false, .5)
Talk(0, "此次出兵西蜀，以公之意，当复如何？")
Talk(4, "益州户口百万，土广财富，可资大业。")
Talk(4, "今幸得内助乃天赐也，今日不取，终被他人取之。主公幸熟思焉。")
Talk(0, "请士元先生与翼德率军出征，再到编成所选三员大将。")
FinishCurrentEvent()
do return end