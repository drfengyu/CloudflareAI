-- 第六章 襄阳庞统居
if HasEvent("16005SO") then
    Talk(0, "怎么，没有凤雏吗？")
else
    Talk(0, "真烦人！！！")
    if HasItem(5012) then
        if TalkAsk(0, "嗯？你们拿了什么好东西，把它给我。") then
            RemoveItem(5012, 1)
            Talk(0, "此城民众被强盗惊吓，昨夜又有年轻女子被抢走。强盗们住在西北方向的森林深处。")
            FinishEvents("16005SO")
        else
            Talk(0, "哼！一群小气鬼。")
        end
    end
end
do return end