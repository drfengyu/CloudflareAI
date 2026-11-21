-- 第六章 涪水 吴兰
if TalkAsk(0, "我叫吴兰，早就敬服刘备军的神力，愿效力于刘军。") then
    Talk(0, "我将尽微薄之力。")
    AddRole({121})
    FinishCurrentEvent()
else
    Talk(0, "那太遗憾了，再等下一次机会吧。")
end
do return end