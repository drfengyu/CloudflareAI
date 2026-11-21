-- 五丈原 左上老人
if not HasCurrentEvent() then
    Talk(0, "噢！终于盼到了贵军。此戟乃我家祖传珍宝，请将军收下吧。")
    AddItem(1208, 1, true)
    FinishCurrentEvent()
else
    Talk(0, "两军相逢，勇者胜！")
end
do return end