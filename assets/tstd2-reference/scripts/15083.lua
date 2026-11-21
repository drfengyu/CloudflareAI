-- 第五章 长沙收黄忠
if HasEvent("15083_1") then
    if HasItem(5011) then
        Talk(0, "果然是养由弓。请稍候，吾去办旧主之丧事。")
        MoveTo({{2, 4}, {2, 1}, {0, 1}, {0, -3}, {-4, -3}, {-4, -10}})
        Fade(true)
        Delay(1)
        Fade(false)
        SetPosition({0, 4})
        Talk(0, "吾愿已遂，愿为皇叔效力。")
        AddRole({108})
        FinishCurrentEvent()
    else
        Talk(0, "请助吾觅得养由弓随旧主安葬。")
    end
else
    Talk(0, "请将军自回，吾无心见客。")
    Talk(1, "老将军之忠心义气，名扬海内，文韬武略，威振天下。")
    Talk(0, "先生过奖矣。")
    Talk(1, "刘皇叔兴正义之师，思贤若渴，还望将军以社稷为重，出山辅佐。")
    Talk(0, "久慕贵军之名，然旧主一向待吾不薄，吾当了其生平之愿，觅得养由弓随旧主安葬。")
    FinishEvents("15083_1")
end
do return end