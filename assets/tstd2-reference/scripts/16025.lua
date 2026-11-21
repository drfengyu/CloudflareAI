-- 第六章 汉中 张鲁
SetActive(true, 1)
MoveTo({{0, -13}}, 1)
Talk(1, "城门已开，酬金何在？")
Delay(.3)
SetActive(true, 0)
MoveTo({{-1, -13}}, 0)
ChangeDirection(3, 0)
Talk(0, "汝好大胆，竟敢放刘备军进城。")
Talk(1, "没，没！")
Talk(0, "还想狡辨，斩!")
Talk(1, "啊！")
SetActive(false, 1)
Delay(.3)
MoveTo({{0, -13}}, 0)
ChangeDirection(0, 0)
Talk(0, "汝等休走！")
if Battle() == 1 then
    FinishCurrentEvent()
end
do return end