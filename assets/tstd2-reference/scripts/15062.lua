-- 第五章 桂阳赵范
if TeamCharactersCount() >= 1 and TeamCharactersHasRole(1, { 104 }) then
    MoveTo({ { -1, -13 } }, 0)
    Talk(0, "孔明先生，刚才我的部将冒犯贵军，失礼了。在下特备一桌薄酒，为孔明先生接风。")
    Talk(1, "谢赵将军。")
    Talk(2, "军师，此必是赵范所设圈套。")
    Talk(1, "料也无妨，主公一向很重仁义，吾等不能失礼。")
    AddTempCharacterById(104)
    RemoveRole({ 104 }, false)
    SetActive(true, 1)
    SetCameraFollowNPC(1)
    MoveToAsync({ { -1, -3 } }, 0)
    MoveTo({ { -1, -4 } }, 1)
    Fade(true)
    SetCameraFreeMode({ -1, -4 })
    ChangeScene(0, "桂阳宫殿", "桂阳宫殿", true)
else
    SetActive(true, 2)
    SetActive(true, 3)
end
do return end