-- 第三章 荆州小村2
Delay(.5)
Talk(0, "谁呀，哎......\n快去告诉大家！")
MoveTo({ { -10, -6 } }, 0, false, true)
MoveTo({ { -8, -6 }, }, 1, false, false)
ChangeDirection(3, 0)
ChangeDirection(2, 1)
Delay(.2)
if Battle() == 1 then
    FinishCurrentEvent()
end
do return end