-- 第七章 天水宫殿 孔明
Talk(0, "我构思了多年的连弩终于完成了，可在战斗中发挥威力。")
AddItem(2018, 1, true)
Talk(0, "伯约将军，汝留在天水城。")
Talk(1, "遵命。")
RemoveRole({111})
AddRole({104, 111})
FinishCurrentEvent()
do return end