-- 第四章 回东吴的船
if HasCurrentEvent() then
    Talk(0, "要有了火药，什么石头都会炸飞。")
elseif not HasItem(5004, 1) or not HasItem(5006, 1) then
    Talk(0, "有了硝石和老树枝就能造出火药，可是，城中只有一颗老树。")
else
    Talk(0, "有了它们就能造出火药来。")
    RemoveItem(5004, 1)
    RemoveItem(5006, 1)
    AddItem(5007, 1, true)
    FinishCurrentEvent()
end
do return end