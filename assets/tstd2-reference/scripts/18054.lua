-- 第八章 五丈原 卖药小童
if TalkAsk(0, "我是过路卖药的，这种药不买点吗？1000金就可以了。") then
    if HasMoney(1000) then
        AddMoney(-1000)
        AddItem(5053, 1, true)
        Talk(0, "（小声咕哝）这药是从路边拾来的，赚了！赚了！")
        MoveTo({{-1, -13}})
        FinishCurrentEvent()
    else
        Talk(0, "将军你的钱不够啊！")
    end
end
do return end