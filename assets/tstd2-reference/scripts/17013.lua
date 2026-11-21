-- 第七章 南安华佗居 华佗
Talk(0, "多谢贵军搭救，不知何人需要医治？")
if HasItem(5019) then
    if TalkAsk(-100, "是否使用介绍信？") then
        Talk(1, "此乃吉平先生手书。")
        Talk(0, "... ...")
        Talk(0, "请孔明先生宽心，姜母之疾定能药到病除。")
        MoveTo({{2, -4}, {5, -4}, {5, -11}})
        FinishCurrentEvent()
    end
end
do return end