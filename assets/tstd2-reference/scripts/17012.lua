-- 第七章 南安 傅干
if TalkAsk(0, "不得入内！") then
    Talk(0, "不得再来。")
else
    if Battle() == 1 then
        FinishCurrentEvent()
    end
end
do return end