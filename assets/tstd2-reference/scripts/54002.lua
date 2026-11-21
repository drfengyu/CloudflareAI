-- 新野建成初期 左下小孩
if HasEvent("13013") then
    Talk(0, "我们在此建立武器库。");
elseif HasEvent("13011") then
    Talk(0, "伊籍先生在殿内等您。")
else 
    Talk(0, "我们在此建立武器库。");
end
do return end 