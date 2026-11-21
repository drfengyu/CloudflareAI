-- 第二章 去白马坡的船 
if HasEvent("12001") then
    TeamMoveTo({ { 66, 87 } }, true)
    BoatMoveTo({ { 66, 86 }, { 87, 86}, { 87, 74 } })
    SetEvent("12002T", 0)
    SetEvent("12002F", 1)
    QuickMoveTo(66, 87, 0)
end

do return end