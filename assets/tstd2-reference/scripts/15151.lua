-- 第五章 新野陈登
if TalkAsk(0, "新野已建成， 吾可向主公复命矣。 请给我新的使命。") then
    AddRole({128})
    FinishCurrentEvent()
else
    Talk(0, "诶......真遗憾。") 
end
do return end