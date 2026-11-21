-- 马良居 马良
if HasEvent("15100") then
    Talk(0, string.format("%s将军，军情紧急，应先去桂阳城平定吕布叛乱。", GeneralName()))
elseif HasEvent("15043_1") then
    Talk(0, "将军，请赶快救救荆州的百姓吧。")
else
    Talk(-100, "孔明与马良叙礼，然后问保守荆襄之策。")
    Talk(0, "可令公子刘琦在荆州养病，以安民心，然后南征南部四郡，以为根本，此久远之计也。")
    Talk(1, "四郡之中，当先取何郡？")
    Talk(0, "零陵最近，可先取之。然后南取桂阳。若得手，可挥军西取武陵，长沙最后。")
    FinishEvents("15043_1")
end
do return end 