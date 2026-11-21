-- 郑玄
if not HasEvent("11015T") then
    Talk(0, "皇叔近来可好？")
    Talk(1, "备欲投奔袁绍，烦请先生修书举荐。")
    Talk(0, "若如此，老夫的信还能帮上忙。")
    FinishEvents("11015T")
end
if not HasEvent("11015") then
    if not HasItem(5001) then  -- 是否有 地图
        Talk(0, "但是你好像还没拿地图吧。\n南面山洞藏着地图，把他拿来吧。")
    else
        Talk(0, "刘使君，这样如何?")
        Talk(1, "刘备看信。")
        Talk(0, "希望这封信能起作用。")
        AddItem(5002, 1) -- 获得 郑玄的信
        FinishCurrentEvent()
    end
else
    Talk(0, "后会有期。")
end
do return end 