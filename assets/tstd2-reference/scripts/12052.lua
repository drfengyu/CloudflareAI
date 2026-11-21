-- 第二章 关羽掛印封金
if HasEvent("12051") then
    Talk(0, "站住，汝乃何人？")
    Talk(1, "吾乃关羽，开门！")
    Talk(0, "无公文不能开。")
    Talk(1, "若如此，汝比颜良文丑如何？")
    Talk(0, "在下不敢。")
    FinishEvents("12052")
else
    Talk(0, "这里是宛城。")
end
do return end