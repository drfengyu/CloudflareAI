-- 第二章 回冀州的船 
if HasEvent("12001") then
    TeamMoveTo({ { 87, 74 } }, true)
    BoatMoveTo({ { 87, 77 }, { 66, 77 }, { 66, 87 } })
    SetEvent("12002F", 0)
    SetEvent("12002T", 1)
    QuickMoveTo(87, 74, 1)
end

do return end