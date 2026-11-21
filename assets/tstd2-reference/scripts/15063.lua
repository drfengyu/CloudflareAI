-- 第五章 桂阳赵范
SetTeamActive(false)
SetCameraFollowNPC(1)
Fade(false)
MoveToAsync({ { -4, -15 } }, 0)
MoveTo({ { -4, -16 } }, 1)
ChangeDirection(0, 0)
Delay(.3)
Talk(0, "哈哈哈......\n孔明，上当了吧！")
Talk(0, "陈应，鲍隆，把孔明收拾了！")
SetActive(true, 2)
SetActive(true, 3)
MoveToAsync({ { -5, -16 } }, 2)
MoveTo({ { -3, -16 } }, 3)
ChangeDirection(2, 3)
ChangeDirection(3, 2)
Talk(0, "孔明，你也有今天，去死吧！")
SetActive(true, 4)
MoveTo({ { -4, -17 } }, 4)
Talk(2, "孔明先生，我来助你。")
if Battle() == 1 then
    SetActive(false, 0)
    SetActive(false, 2)
    SetActive(false, 3)
    ChangeDirection(0, 1)
    SetActive(true, 5)
    SetActive(true, 6)
    SetActive(true, 7)
    MoveToAsync({ { -5, -17 } }, 5)
    MoveToAsync({ { -3, -17 } }, 6)
    MoveTo({ { -4, -18 } }, 7)
    ChangeDirection(3, 5)
    ChangeDirection(2, 6)
    Talk(3, "军师，平安无事吧。")
    Talk(3, "嗯？你是吕布，你要把我们军师怎样？")
    Talk(2, "我只是救了孔明先生，并无非礼之举。")
    Talk(3, "哼！还敢狡辩，小心！")
    Talk(1, "张飞休得无礼。")
    Talk(2, "孔明先生，我非常敬佩贵军之战力，再三考虑之后，我请求归顺贵军。")
    Talk(1, "将军神勇，此乃主公之洪福也。")
    Talk(2, "先生率军西征武陵时，末将愿请兵一支，驻防桂阳，以解先生后顾之忧。")
    Talk(1, "如此甚好，有吕布将军守城，我就可以放心进兵了。")
    Talk(2, "后方的防御，请交给我吧。")
    Fade(true, .5)
    AddCurrentCharacterFromTempById(104)
    ClearTempCharacters()
    SetTeamActive(true)
    SetCameraTeamMode()
    TeamQuickMoveTo({ -4, 0 }, 1, true)
    FinishCurrentEvent()
    Fade(false, .3)
    FinishEvents("15063", "15100_2")
else
    SetCameraTeamMode()
    SetTeamActive(true)
end
do return end