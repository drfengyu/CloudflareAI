-- 战斗并且设置标志
local battleCount = BattleCount()
local marker = true
for i = 0, battleCount - 1 do
    if Battle(i) ~= 1 then
        marker = false
        break
    end
end

if marker == 1 then
    local events = EventParameters()
    for k, v in pairs(events) do
        print(v)
        FinishEvents(v)
    end
end
do return end