-- 第六章 建宁 雷同
if TalkAsk(0, string.format("%s将军您的谋略名不虚传，在下佩服愿在帐下效力。", GeneralName())) then
    Talk(0, "多谢。")
    AddRole({119})
    FinishCurrentEvent()
else
    Talk(0, "那太遗憾了。")
end
do return end