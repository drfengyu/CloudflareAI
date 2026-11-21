-- 第八章 前往洛阳方向的船
TeamMoveTo({{9, 71}}, true)
BoatMoveTo{{10, 71}, {10, 76}}
SetEvent("18062T", 0)
SetEvent("18062F", 1)
SetPosition({9, 71})
ChangeDirection(2)
do return end