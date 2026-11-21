-- 第五章 拿兵符襄阳夏侯惇战
MoveTo({{14, 0}})
Talk(0, "什么，刘备军进得城来，快把他们赶出去。")
if Battle() == 1 then
    FinishCurrentEvent()
end
do return end