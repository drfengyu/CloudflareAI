if Battle() ~= 0 then
    Talk(-100, "战乱中，桃园三兄弟失散，刘备去投奔袁绍。")
    Rest(0, false, true)
    RemoveRole({ 102, 103 }, true)
    FinishCurrentEvent()
end
do return end 