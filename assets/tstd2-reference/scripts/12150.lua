-- 第二章 关定家关定
if HasEvent("12153") then
    Talk(0, "关将军和张将军正在楼上等待皇叔。")
elseif HasRole(127) and HasEvent("12102") and HasEvent("12103") then
    Talk(0, "非常感谢您消灭了山贼。")
    Talk(0, "为了报答您，我把犬子送到刘备帐下效力。")
    Talk(-100, "关平拿着关羽的信去找刘备。")
    FinishCurrentEvent()
    ChangeScene(0, "冀州刘备居", "冀州刘备居", false)
else
    Talk(0, "村里里人被山贼害苦了，快把山贼消灭了吧。")
end
do return end