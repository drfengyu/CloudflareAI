-- 第四章 赤壁之战
SetCameraFollowNPC(0)
Fade(false)
PlayAudio(0, "World1")
Talk(0, "这是何处？")
Talk(1, "乌林之西。")
Talk(0, "（仰天大笑不止）吾笑周瑜无谋，诸葛亮少智，若预先在此伏下一军，如之奈何？")
Talk(-100, "两边鼓声震响，火光竟天而起，惊得曹操几乎坠马，斜刺里一彪军杀出。")
-- 赵云出现
SetActive(true, 1)
MoveTo({ { 47, -5 } }, 1)
Talk(2, "（大叫）赵子龙奉军师将令在此等候多时了！")
Talk(-100, "徐晃、张辽双敌赵云。")
AddTempCharacterById(106)
Battle()
ClearTempCharacters()
MoveTo({ { 48, -9 } }, 0)
Talk(-100, "天色微明，黑云罩地，大雨倾盆，湿透衣甲，曹军进村劫掠粮食。")
MoveTo({{ 48, -14 }}, 0)
Delay(.5)
FinishCurrentEvent()
ChangeScene(0, "荆州村子·二", "荆州村子2", true)
do return end