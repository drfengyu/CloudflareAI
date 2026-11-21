-- 第七章 天水 夏侯楙
-- 如果已经攻打安定，传输到安定吉平居
-- 如果已经见过吉平，再战直接死亡
if Battle() == 100 then
    if HasEvent("17008") and not HasEvent("17011") then
        FinishCurrentEvent()
        ChangeScene(0, "安定吉平居", "开场", false)
    else
        BackToTitle()
    end
end
do return end