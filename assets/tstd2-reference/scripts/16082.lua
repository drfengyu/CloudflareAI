-- 第六章 绵竹关 张任
if HasItem(5018) then
    if TalkAsk(-100, "是否使用火药壶？") then
        Talk(0, "绵竹关的北门被大火包围了。")
        if Battle() == 1 then
            FinishCurrentEvent()
            ChangeScene(0, "大地图", "绵竹关", true)
        end
    end
end
do return end