-- 第二章 冀州门卫
if HasEvent("12152") then
    Talk(0, "将军慢走。")
    FinishCurrentEvent()
else
    Talk(0, "将军，您这是要去哪儿？")
end
do return end