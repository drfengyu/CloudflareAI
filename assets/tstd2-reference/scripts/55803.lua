-- 襄阳 中老人
if HasEvent("16005") then
    Talk(0, "谢谢了。")
elseif HasEvent("16000") then
    Talk(0, "无论如何，请救出我的女儿。")
else
    Talk(0, "荆州已经攻下来了吗，没有的话，最好先攻下它。")
end
do return end 