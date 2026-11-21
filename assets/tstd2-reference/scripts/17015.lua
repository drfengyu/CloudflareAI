-- 第七章 安定城前 姜维
SetActive(true, 0)
if Battle() == 1 then
    MoveToAsync({{-13, 14}, {-13, 16}}, 0)
    TeamMoveTo({{-17, 17}, {-13, 17}}, false)
    TeamChangeDirection(0)
    Talk(1, "汝已无路可逃！")
    Talk(0, "事到如今，只有战死！")
    SetActive(true, 1)
    MoveTo({{-17, 16}, {-14, 16}}, 1)
    Talk(2, "吾儿住手！")
    Talk(1, "且慢！姜维汝曾立志复兴汉室，此时当归顺汉军。")
    Talk(-100, "姜维寻思良久，滚鞍下马请降。")
    Talk(-100, "孔明忙下车而迎。")
    Talk(1, "（执其手）吾自出茅庐以来，遍求贤者，欲传授平生之学，恨未得其人。今遇伯约吾愿足矣。")
    Talk(-100, "姜维大喜拜谢。")
    Talk(1, "进驻安定城。")
    FinishCurrentEvent()
    ChangeScene(0, "安定宫殿", "开场", false)
end
do return end