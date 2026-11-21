-- 第三章 诸葛家诸葛均
if not HasCurrentEvent() then
    Talk(1, "备久慕先生，今得瞻道貌，实为万幸。")
    Talk(0, "将军莫非刘皇叔，欲见家兄否？")
    Talk(1, "先生非孔明耶？")
    Talk(0, "吾乃其弟诸葛均。家兄为崔州平相约，出外闲游去矣。")
    Talk(1, "何处闲游？")
    Talk(0, "往来莫测，不知去所。")
    Talk(1, "数日之后当再至。")
    Talk(0, "只恐徒劳再三。若家兄回来，吾即赴新野报与将军。")
else
    Talk(0, "若家兄回来，吾即赴新野报与将军。")
end
FinishCurrentEvent()
do return end