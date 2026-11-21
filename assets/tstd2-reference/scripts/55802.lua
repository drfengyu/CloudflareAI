-- 襄阳 中中年人
if HasEvent("16005") then
    Talk(0, "真厉害呀！")
elseif HasEvent("16000") then
    Talk(0, "强盗的首领叫廖化，本领高强，请多加小心。")
else
    Talk(0, "从襄阳城西南的渡口坐船，就能到夷陵城北面的渡口。")
end
do return end 