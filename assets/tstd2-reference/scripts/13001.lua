-- 第三章 荆州宫殿
SwitchAudio(0, false)
Delay(.5)
Talk(-100, "随着时光的流逝，中原势力版图有了很大的变化。")
Talk(-100, "曹操挟天子以令诸侯，把自己的敌人逐一消灭了。")
Talk(-100, "即使是称雄北方的袁绍，在曹操面前亦遭到惨败。")
Fade(false)
SwitchAudio(0, true)
MoveTo({{-3, 1}})
ChangeDirection(2)
Talk(0, "报！主公，江夏有人图谋造反，劫掠百姓。")
MoveTo({{-3, -9}})
Talk(1, "逆贼又反，为祸不小。")
Talk(2, "不须兄长忧虑，备前往讨之。")
Talk(-100, "刘表大喜，命玄德出征。")
FinishCurrentEvent()
do return end