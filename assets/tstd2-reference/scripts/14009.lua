-- 第四章 江夏宫殿 
if HasEvent("14011") then
    if HasEvent("14010") then
        Talk(0, "是吗，终于找到船了。请和鲁肃将军一起去见孙权。")
    else
        Talk(0, "此乃东吴鲁肃将军，欲请军师过江商谈。")
    end
else
    Talk(0, "无论如何要阻止曹军的进攻。")
end
do return end