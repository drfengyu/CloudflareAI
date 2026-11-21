-- 第三章 荆州小村1
Delay(.5)
MoveTo({{-6, -6}})
Talk(0, "嗯，荆州郡主, 能与您交战，万分荣幸。")
if Battle() == 1 then
    FinishCurrentEvent()    
end
do return end