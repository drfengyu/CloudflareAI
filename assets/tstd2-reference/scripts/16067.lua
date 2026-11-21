-- 第六章 巴关 刘巴
if HasEvent("16066") then
    if Battle(0) == 1 then
        FinishCurrentEvent()
        ChangeScene(0, "巴关关卡", "巴关", true)
    end
else
    Talk(-100, "后面火起。")
    if Battle(1) == 1 then
        FinishCurrentEvent()
        ChangeScene(0, "巴关关卡", "巴关", true)
    end
end
do return end