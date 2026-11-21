-- 襄阳 下小孩
if HasEvent("16005") then
    Talk(0, "啊！只有我家母亲没有回来。")
elseif HasEvent("16000") then
    Talk(0, "呜，母亲......")
else
    Talk(0, "请赶快救救荆州百姓。")
end
do return end 