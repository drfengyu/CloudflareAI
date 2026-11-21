-- 第六章 水镜先生居
if not HasCurrentEvent() then
    Talk(0, string.format("%s将军，凤雏先生现在在襄阳城。", GeneralName()))
    Talk(0, "请他出山辅佐皇叔，此其时也。但要带上这酒才能见到他。")
    AddItem(5012, 1, true)
    FinishCurrentEvent()
else
    Talk(0, "见到襄阳的凤雏先生了吗？")
end
do return end