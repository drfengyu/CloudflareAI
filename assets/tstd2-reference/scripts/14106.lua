-- 第四章 赤壁之战
SetCameraFollowNPC(0)
Delay(.5)
MoveToAsync({{-3, -15}}, 1)
MoveTo({{-2, -15}}, 2)
Talk(-100, "曹军至葫芦口，已疲惫不堪，多有倒于路者。")
Talk(-100, "操教前面暂歇。兵士拣干处埋锅造饭，尽皆脱去湿衣吹晒，马皆摘鞍野放。")
Delay(1)
MoveTo({{-2, -17}})
Delay(.5)
FinishCurrentEvent()
ChangeScene(0, "大地图", "荆州村子2", true)
do return end