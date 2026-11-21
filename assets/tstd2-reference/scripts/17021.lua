-- 第七章 渡口 辛畀
Talk(0, "没有渡航书不能乘船。")
if HasItem(5020) then
    if TalkAsk(-100, "是否使用渡航书？") then
        Talk(0, "嗯！确实是渡航书，是汝等攻陷陈仓的吗？却过不去我这一关。")
        if Battle() == 1 then
            FinishCurrentEvent()
        end
    end
end
do return end