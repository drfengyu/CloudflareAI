-- 战斗并且设置标志
if Battle() == 1 then
    local events = EventParameters()
    for k, v in pairs(events) do
        print(v)
        FinishEvents(v)
    end
end
do return end