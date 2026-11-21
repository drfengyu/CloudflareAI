-- 第三章 荆州宫殿
if HasCurrentEvent() then
    Talk(-100, "刘表已无力言语。")
else
    Talk(0, "我已病入膏盲，将不久于人世。望贤弟和蔡瑁将军共同辅佐嗣子，以图大业。")
    FinishCurrentEvent()
end
do return end