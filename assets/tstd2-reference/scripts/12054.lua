-- 第二章 汜水关
Delay(.2)
MoveToAsync({ { 4, 0 }, { 6, 0 } }, -1, false)
TeamMoveTo({ { 3, 0 }, { 1, 0 } })
MoveToAsync({ { 6, 2 }, { 5, 2 } }, -1, false)
TeamMoveTo({ { 1, 2 }, { 2, 2 } })
local flag = true
if TalkAsk(0, "久仰将军大名。今日得见，三生有幸。\n将军，请满上一怀？") then
    TeamAddHp(-.5, 1, 1)
    if TalkAsk(0, "如何，请将军再满上一杯") then
        TeamAddHp(-.5, 1, 1)
        if TalkAsk(0, "如何，请将军再满上一杯") then
            TeamAddHp(-.5, 1, 1)
            Talk(0, "中计了吧！关羽，无用之辈，拿命来！")
            flag = false
        end
    end
end
if flag then
    Talk(1, "吾料酒内必有麻药！")
    Talk(0, "天机泄露，左右快下手！")
end
if Battle() == 1 then
    FinishCurrentEvent()
end
do return end