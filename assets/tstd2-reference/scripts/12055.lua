-- 第二章 荥阳关
Talk(0, "荥阳太守王植对您毫无敌意，请过关。")
Talk(1, "若如此，烦将军准吾等在此住宿。")
Talk(0, "容吾去准备。")
MoveToAsync({ { -10, 0 } }, -1, false)
TeamMoveTo({ { -10, -1 } }, false)
MoveToAsync({ { -10, 6 }, { -9, 6 } }, -1, false)
TeamMoveTo({ { -10, 6 } }, false)
ChangeDirection(2)
Talk(0, "且请在此暂歇一宿，明日登途未迟。")
FinishCurrentEvent()
do return end