-- 第二章 汜水关
Talk(0, "是在白马坡斩颜良诛文丑的关羽吗？")
Talk(1, "正是。")
Talk(0, "将军神勇，海内皆知。今天借此良機，在镇国寺为你设宴洗尘，敬请将军光临。")
Talk(1, "非常感谢。")
MoveToAsync({ { -10, 2 } }, -1, false)
TeamMoveTo({ { -10, 1 } }, false)
MoveToAsync({ { 0, 2 }, { 0, 1 } }, -1, false)
TeamMoveTo({ { -10, 2 }, { 0, 2 } }, false)
MoveToAsync({ { 8, 1 }, { 8, 2 } }, -1, true)
TeamMoveTo({ { 0, 1 }, { 8, 1 }, { 8, 2 } }, false)
ChangeScene(0, "镇国寺", "镇国寺", true)
FinishCurrentEvent()
do return end