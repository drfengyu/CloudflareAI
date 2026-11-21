-- 第八章 五丈原 司马懿
if Battle(0) == 100 then
    TeamMoveTo({{-11, 85}}, false)
    SetActive(true, 0)
    MoveTo({{-11, 82}, {-10, 82}, {-10, 85}}, 0)
    ChangeDirection(2, 0)
    Talk(0, "孔明被杀！全军出击！消灭汉军！")
    if Battle(1) == 1 then
        FinishCurrentEvent()
    end
else
    ChangeScene(0, "黄石公居", "休息", false)
end
do return end