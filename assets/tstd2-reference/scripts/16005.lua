-- 第六章 廖化森林深处
if HasEvent("16005_1") then
    Talk(0, "好厉害的将军，敢问尊姓大名？")
    Talk(-1, string.format("我是刘备军的%s。", GeneralName()))
    Talk(0, "那么请收我为部下吧。")
    Talk(-1, "快放这些女人回家。")
    ::NO::
    if not TalkAsk(0, "马上就放她们回家，请收我们为部下？") then
        goto NO
    end
    AddRole({124})
    SetActive(false, 0)
    MoveTo({{64, 27}, {64, 26}}, 1)
    Talk(-2, "多亏恩人搭救，我可以回到哥哥身边了。")
    MoveTo({{64, 23}, {61, 23}, {61, 17}}, 1)
    MoveTo({{63, 27}, {64, 27}, {64, 26}}, 2)
    Talk(-2, "承蒙搭救，非常感谢。")
    MoveTo({{64, 23}, {61, 23}, {61, 17}}, 2)
    MoveTo({{66, 27}, {64, 27}, {64, 26}}, 3)
    Talk(-2, "那位奇人貌似酒徒，却可能是位大人物。")
    MoveTo({{64, 23}, {61, 23}, {61, 17}}, 3)
    FinishCurrentEvent()
else
    if TalkAsk(0, "你们是在找强盗的城寨吗？") then
        Talk(0, "那你们就去死吧！")
        if Battle() == 1 then
            FinishEvents("16005_1")
        end
    else
        Talk(0, "那还是赶快走开的好。")
    end
end
do return end