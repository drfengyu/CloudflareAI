-- 第二章 冀州刘备居
-- 重新设置队伍
TeamInitRoles({ 101, 128 }, {}, {})
Delay(.5)
Talk(-100, "一名男子来找刘备。")
MoveTo({{0, 1}, {1, 1}})
Talk(0, "刘皇叔，这里有关将军的信。")
Talk(1, "二弟，太好了!")
Talk(1, "... ...")
Talk(1, "嗯，已到城南了，我马上去接。")
Talk(0, "我陪您一起去吧。")
AddRole({115})
FinishCurrentEvent()
do return end