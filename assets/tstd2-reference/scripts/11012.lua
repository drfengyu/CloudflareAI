-- 徐州 陈登加入
if not HasEvent("11011") then
    Talk(0, "刘使君，徐州太守车胄奉曹操之命，要加害于你，请你多加小心。")
else
    Talk(0, "杀了车胄之后，曹操必会亲自率领军队报复，此城危矣。")
    Talk(0, "今只能投奔河北袁绍，别无他路。")
    Talk(0, "郑玄是袁绍老师，若能得他致书与袁绍，袁绍必会收留我等。")
    if not TalkAsk(0, "虽在下才疏学浅，但也愿效绵薄之力，不知皇叔是否肯收纳在下？") then
        :: NO ::
        if not TalkAsk(0, "愿效绵薄之力。") then
            goto NO
        end
    end
    AddRole({ 128 })
    FinishCurrentEvent()
end
do return end 