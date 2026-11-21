-- 第六章 襄阳山洞孟达
if HasCurrentEvent() then
    Talk(0, "地图就在里面的宝箱里。")
else
    Talk(0, "汝等何人？请自回。")
    if HasItem(5013) then
        if TalkAsk(-100, "是否使用张松的信？") then
            Talk(0, "...... ......")
            Talk(0, "失礼了，请过去吧。")
            MoveTo({ { 0, 114 } })
            ChangeDirection(3)
            FinishCurrentEvent()
        end
    end
end
do return end