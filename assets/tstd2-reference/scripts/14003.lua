-- 第四章 新野后期宫殿
if HasEvent("14002") then
    Talk(2, "十万曹军已被击溃。")
    Talk(-100, "刘备大喜，犒赏三军。")
    MoveTo({ { -4, -4 }, { -3, -4 }, { -3, 1 } }, 0)
    ChangeDirection(2, 0)
    Delay(.2)
    Talk(1, "刘使军，荆州刘表病情恶化，请您赶快前往荆州城。")
    Delay(.2)
    MoveTo({ { -3, -4 }, { -4, -4 }, { -4, -10 } }, 0)
    Talk(0, "速往荆州。")
    RemoveRole({104}, true)
    AddRole({101})
    FinishCurrentEvent()
    Delay(.5)
    Talk(2, "主公宜劝刘表立刘琦为荆州之主，吾在此守城。")
else
    Talk(0, "此乃剑印，付与军师。请军师聚集将士听令。")
end
do return end