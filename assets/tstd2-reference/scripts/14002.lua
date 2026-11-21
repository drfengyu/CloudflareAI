-- 第四章 博望坡曹仁战
Talk(0, "务必全歼敌军，不得留下一兵一卒。\n进攻！")
if Battle() == 1 then
    FinishCurrentEvent()
    if not HasRole(102) then
        AddRole({ 102 }, false)
    end
    if not HasRole(103) then
        AddRole({103}, false)
    end
    if not HasRole(115) then
        AddRole({115}, false)
    end
    if not HasRole(127) then
        AddRole({127}, false)
    end
end
do return end