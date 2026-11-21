-- 第四章 吕蒙
if HasCurrentEvent() then
    Talk(0, "蔡瑁死了，也不用怕曹军了。下令吧！")
elseif HasEvent("14060_1") then
    Talk(0, "什么？杀了蔡瑁，刘备军可真厉害......") 
    Talk(0, "无论如何？现在无人指挥曹操的水军了。蔡瑁死了，也不用怕曹军了。下令吧！") 
    FinishCurrentEvent()
else
    Talk(0, "吾乃吕蒙，那蔡瑁久居江东，谙习水战。曹操用其为水军都督，实乃我心腹大患，先生能否设计除之？")
    Talk(1, "亮当驱兵袭之。")
end
do return end