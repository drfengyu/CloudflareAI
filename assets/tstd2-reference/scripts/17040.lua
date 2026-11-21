-- 第七章 葫芦谷 曹操
if Battle() == 1 then
    SetActive(true, 0)
    MoveTo({{-20, 117}}, 0)
    Talk(0, "陛下亲临鲁城，犒劳将士，请快去！")
    MoveTo({{-20, 130}}, 0)
    FinishCurrentEvent()
end
do return end