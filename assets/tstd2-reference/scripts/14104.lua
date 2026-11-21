-- 第四章 赤壁之战
SetTeamActive(false)
SetCameraFollowNPC(1)
Fade(false)
MoveToAsync({ { 89, -27 } }, 2)
MoveToAsync({ { 91, -27 } }, 3)
MoveTo({ { 90, -26 } }, 1)
Talk(0, "神灵啊，保佑我们得胜吧！")
MoveToAsync({ { 89, -20 } }, 2)
MoveToAsync({ { 91, -20 } }, 3)
MoveTo({ { 90, -19 } }, 1)
Delay(.5)
if Battle() ~= 0 then
    Rest(0, false, true)
    SetActive(false, 4)
    PlayAudio(0, "Battle2")
    MoveTo({ { 90, -16 } }, 0)
    Talk(-100, "徐晃杀出抵住凌统，曹军夺路望北而走。")
    Talk(-100, "不到十里，喊声起处，一彪军出，来将高呼，吾乃东吴甘宁是也。")
    Talk(-100, "两员曹将挺枪来迎，被甘宁先后劈于马下。")
    Talk(-100, "合淝路口被陆逊封住，曹军只得向乌林逃窜。")
    SetSpeed(7, -1, 0)
    SetSpeed(7, -1, 1)
    SetSpeed(7, -1, 2)
    SetSpeed(7, -1, 3)
    MoveToAsync({ { 89, -4 } }, 2)
    MoveToAsync({ { 91, -4 } }, 3)
    MoveTo({ { 90, 0 } }, 0)
    MoveTo({ { 68, -19 } }, 1)
    Talk(0, "众将听令，子龙带三千军马，渡江径取乌林小路，四更过后，曹军必来。")
    Talk(0, "翼德去葫芦口埋伏，见曹军造饭烟起杀出。")
    Talk(1, "军师却不委用关某，此是何意？")
    Talk(0, "今曹操兵败，必走华容道。若令足下去，必放他过去。")
    Talk(1, "愿立军令状。")
    Talk(0, "若如此，汝可在山上放烟引他来。")
    Talk(-100, "云长引兵而去。")
    -----
    Fade(true, .5)
    SetPosition({ 107, -11 }, 0)
    SetPosition({ 107, -16 }, 3)
    ChangeDirection(2, 0)
    ChangeDirection(2, 3)
    SetCameraFollowNPC(0)
    Fade(false, .5)
    PlayAudio(0, "Battle2")
    MoveToAsync({ { 77, -11 } }, 0)
    MoveTo({ { 77, -12 } }, 3)
    Battle(1)
    PlayAudio(0, "Battle2")
    MoveTo({ { 72, -11 } }, 0)
    Fade(true, .5)
    FinishCurrentEvent()
end
do return end