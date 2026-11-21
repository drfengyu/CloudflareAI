-- 第二章 荥阳小屋
Talk(0, "将军，辛苦了，好好休息。")
Fade(true)
Rest(0)
Fade(false)
if Battle() == 1 then
    FinishCurrentEvent()
    ChangeScene(0, "大地图", "荥阳关火烧后", false)
end 
do return end