-- 第三章 荆州小村2
Delay(.5)
MoveTo({{-2, -15}})
Talk(0, "这些荆州兵不可怕。\n伙计们，动手！")
if Battle() == 1 then
    FinishCurrentEvent()    
end
do return end