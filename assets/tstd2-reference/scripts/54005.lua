-- 新野建成初期 下女子
if HasEvent("13013") then
    Talk(0, "我们在此建工具库。");
elseif HasEvent("13011") then
    Talk(0, "快！赶紧逃呀！")
else 
    Talk(0, "我们在此建工具库。");
end
do return end 