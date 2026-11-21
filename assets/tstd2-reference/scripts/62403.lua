-- 葭萌关 中女子
if HasEvent("17000") then
    Talk(0, string.format("啊！救命啊！哎呀，是%s先生，我还以为是曹军呢。", GeneralName()))
else
    Talk(0, string.format("%s将军，谢谢您。可是刘璋和张鲁一样残暴。哎呀！刚才的话，您只当没听见吧。", GeneralName()))
end
do return end 