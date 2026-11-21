-- 景帝墓3轮盘
local events = EventParameters()
local currentPosition = TeamPosition()
local nextDirection = tonumber(events[TeamDirection()])
print(nextDirection)
if nextDirection == 0 then
    -- down
    currentPosition[1] = currentPosition[1] - 1
    print(currentPosition)
elseif nextDirection == 1 then
    -- up
    currentPosition[1] = currentPosition[1] + 1
elseif nextDirection == 2 then
    -- left
    currentPosition[0] = currentPosition[0] - 1
else
    -- right
    currentPosition[0] = currentPosition[0] + 1
end
print(currentPosition[0] )
print(currentPosition[1] )
TeamMoveTo({ currentPosition }, false)
do return end