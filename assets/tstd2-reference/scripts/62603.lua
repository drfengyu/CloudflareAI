-- 阳平关 右女子
if HasEvent("17000") then
    Talk(0, "要进入汉中，须经过山峻路险的西蜀栈道。")
elseif HasEvent("16050") then
    Talk(0, "涪水城在葭萌关西南。")
else
    Talk(0, "要进入汉中，须经过山峻路险的西蜀栈道。")
end
do return end 