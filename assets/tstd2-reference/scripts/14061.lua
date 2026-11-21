-- 第四章 前往东吴的船
if HasItem(5008, 1) then
    TeamMoveTo({ { 25, -51 } }, true)
    BoatMoveTo({ { 25, -57 }, { 84, -57}, { 84, -58 } })
    TeamMoveTo({{84, -59}}, true)
    FinishCurrentEvent()
end
do return end