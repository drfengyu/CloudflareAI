-- 第七章 鲁城宫殿 刘备
-- 进入第八章
Talk(0, "曹操乃世之奸雄，彼死则魏国气数尽矣。汝等可率得胜之师，一鼓作气拿下长安，直取洛阳。")
SetActive(true, 0)
MoveTo({ {-5, -1} }, 0)
Talk(1, "陛下，曹丕为报父仇，已将大军集结到葫芦谷南面的渭水关了。")
MoveTo({ {-5, -14} }, 0, true)
SetActive(true, 0)
MoveTo({ {-5, -1} }, 0)
Talk(1, "陛下，北方的羌族发兵袭击汉中，请派兵镇守。")
MoveTo({ {-5, -14} }, 0, true)
Talk(0, "关兴，你立即去汉中击退羌兵。")
Rest(0, false, true)
RemoveRole({116}, true)
SetActive(true, 1)
MoveTo({{-5, 0}}, 1)
ChangeDirection(1, 1)
Talk(2, "遵命！")
MoveTo({{-5, -14}}, 1, true)
Talk(0, string.format("%s即刻发兵渭水，消灭曹丕。", GeneralName()))
StartChapter(8)
FinishEvents("17050", "18000")
do return end