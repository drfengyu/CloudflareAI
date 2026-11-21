-- 徐州宫殿 关羽
local teamPos = TeamPosition()
local x = teamPos[0] == -5 and -4 or teamPos[0] - 1
local dir = teamPos[0] == -5 and 2 or 3
local teamDir = dir == 3 and 2 or 3

SetActive(true, 0)
SetPosition({x, -12}, 0)
MoveTo({ { x, teamPos[1] } }, 0)
ChangeDirection(dir, 0)
TeamChangeDirection(teamDir)

if not TalkAsk(0, "兄长，讨伐袁术，吾愿为先锋，当先开路！") then
    :: Marker ::
    if not TalkAsk(0, "大哥，别那样说......") then
        goto Marker
    end
end
AddRole({ 102 });
FinishCurrentEvent()
do return end