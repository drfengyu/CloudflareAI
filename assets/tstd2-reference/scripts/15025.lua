-- 第五章 南郡庞统拿锦囊
if not HasCurrentEvent() then
    Talk(0, "以刘备军之现有力量，很难战胜猛将吕布。")
    Talk(0, "吾有一计，藏于锦囊，可在战吕布时使用。")
    AddItem(5010, 1, true)
    Talk(1, "士元先生，刘皇叔广招贤士，其德天下闻名。请先生出山，辅佐刘皇叔如何？")
    Talk(0, "多谢先生好意，待时机成熟，我定会来皇叔帐下效力。")
    FinishCurrentEvent()
else
    Talk(-100, "孔明辞别庞统。")
end
do return end