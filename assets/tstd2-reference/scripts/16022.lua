-- 第六章 葭萌关 马超
if HasEvent("16021") then
    Talk(0, "李恢来过了，但我还要检验贵军的实力。较量一下吧！")
    if Battle() == 1 then
        if not TalkAsk(0, "刘备军果然厉害，铲除曹操并非梦想了，请收某为帐下一员？") then
            :: Marker ::
            if not TalkAsk(0, "请一定收下我！") then
                goto Marker
            end
        end
        Talk(0, "多谢。")
        AddRole({ 107 })
        FinishCurrentEvent()
    end
else
    Talk(0, "占据葭萌关非吾的本意，我真正的敌人是曹操。我并不想和你们交战。")
end
do return end