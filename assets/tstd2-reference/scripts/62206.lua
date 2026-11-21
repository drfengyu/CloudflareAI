-- 涪水城 左上青年
if HasEvent("17000") then
    Talk(0, "无可奉告。")
elseif HasEvent("16050") then
    Talk(0, "据说涪水的堤坝上有一间控制水闸的小屋，但那间小屋总是着锁。")
else
    Talk(0, "马腾被曹操所杀，据说马超正在寻找能灭曹操的名主。")
end
do return end 