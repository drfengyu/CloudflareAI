-- 第五章 武陵金旋
Talk(0, string.format("啊？你不是%s将军吗？怎么到这儿来了？", GeneralName()))
Talk(0, "伙计们，冲上去！")
if Battle() == 1 then
    SetCameraFreeMode({-2, -7})
    MoveTo({{-2, -7}})
    Talk(0, "我是金旋！放吊桥！")
    Talk(0, "怎么回事？快放吊桥！")
    Talk(-100, "巩志出现在城角。")
    FinishEvents("15071_1")
    Talk(1, "金旋，汝不顺天时自取灭亡。吾已率百姓归顺刘皇叔矣。")
    Talk(0, "啊呀呀！哪一个去把这家伙的首级取来！")
    Talk(1, "要取的当是汝的首级！")
    Talk(-100, "巩志弯弓搭箭，一箭射中金旋的咽喉。巩志杀了金旋。")
    SetActive(false)
    Fade(true, .5)
    Fade(false)
    TeamQuickMoveTo({-2, -7}, 1, true)
    Talk(1, "将军，我已经杀了金旋，请过来吧。")
    Talk(1, "放吊桥！")
    SetCameraTeamMode()
    FinishEvents("15071", "15100_3")
end
do return end