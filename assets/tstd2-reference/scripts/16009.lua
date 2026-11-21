-- 第六章 襄阳山洞孟达
MoveTo({ { 1, 114 } })
ChangeDirection(1)
TeamChangeDirection(0)
if TalkAsk(0, "我和张松乃生死之交，愿随贵军征讨西蜀。") then
    Talk(0, "愿效犬马之劳。")
else
    :: NO ::
    if not TalkAsk(0, "未得命令，不知可否？") then
        goto NO
    end
end
AddRole({ 123 })
FinishCurrentEvent()
do return end