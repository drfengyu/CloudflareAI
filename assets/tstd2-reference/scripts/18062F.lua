-- 第八章 前往洛阳方向的船
TeamMoveTo({{10, 76}}, true)
BoatMoveTo{{10, 71}, {9, 71}}
SetEvent("18062T", 1)
SetEvent("18062F", 0)
SetPosition({10, 76})
ChangeDirection(1)
do return end