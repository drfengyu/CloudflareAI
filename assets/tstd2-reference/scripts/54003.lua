-- 新野建成初期 中小孩
if HasEvent("13013") then
    Talk(0, "卧龙先生睡觉时，不能唤醒须耐心等待。")
elseif HasEvent("13011") then
    Talk(0, "快跑吧，逃命吧！")
else
    Talk(0, "卧龙先生睡觉时，不能唤醒须耐心等待。");
end
do return end 