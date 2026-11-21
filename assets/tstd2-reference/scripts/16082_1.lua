-- 第六章 绵竹关山洞 紫虚真人 
if HasCurrentEvent() then
    if HasItem(5018) then
        Talk(0, "请记住，一进绵竹关北门，就会发现许多柴草。在那里使用火药壶大功可成矣。")
    else
        Talk(0, "啊，火药壶拿来了吗？")
    end
else
    if TalkAsk(0, string.format("阁下是刘备军的%s将军吗", GeneralName())) then
        Talk(0, "久慕大名，幸会。贵军攻绵竹，只能火攻北门。火药壶藏在此山洞中，快去取来。")
        FinishCurrentEvent()
    else
        Talk(0, "难道是我弄错了吗？")
    end
end
do return end