-- 鲁城 茶具
if not HasCurrentEvent() then
    Talk(0, "嗯，嗯，是这样的呀，明白了。")
    Talk(0, "刘备军乃仁义之师，承蒙不弃，愿将此套茶具送予贵军。")
    AddItem(5052, 1)
    FinishCurrentEvent()
else
    Talk(0, "茶具能派上用场吧。")
end
do return end