-- 第六章 葭萌关 马岱
if HasEvent("16022") then
    if TalkAsk(0, "马超是吾堂兄，我愿随兄效力。") then
        Talk(0, "愿效犬马之劳。")
        AddRole({122})
        FinishCurrentEvent()
    else
        Talk(0, "那太遗憾了。")
    end
else
    Talk(0, "不相信你们能消灭曹操。")
end
do return end