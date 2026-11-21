-- 第六章 新野宫殿 进入第六章
Fade(true, .5)
TeamQuickMoveTo({ -4, 0 }, 1, true)
StartChapter(6)
AddRole({199}, false)
Fade(false, .3)
Talk(1, "平定了荆州各郡，从此有了立业之本，当广罗人才以图大业。")
SetActive(true, 0)
MoveTo({ { -5, 1 } }, 0)
ChangeDirection(3, 0)
Talk(2, "刘皇叔，水镜先生有要事相商。")
Talk(0, string.format("请回复先生，%s将军即刻前去。", GeneralName()))
MoveTo({ { -5, -14 } }, 0, false)
Talk(0, string.format("劳烦%s将军去会水镜先生。", GeneralName()))
Rest(0, false, true)
RemoveRole({ 104 })
Talk(1, "荆州新复，百废待兴，我在此辅助主公。")
SetActive(true, 1)
MoveTo({ { -4, 0 }, { -3, 0 }, { -3, 1 } }, 1, true)
ChangeDirection(3, 1)
FinishCurrentEvent()
do return end