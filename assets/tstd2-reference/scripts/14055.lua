-- 第四章 日巫女
if HasCurrentEvent() then
    Talk(-100, "孔明先生得了秘法书，再去求风肯定能够如愿。")
else
    Talk(0, "你们是怎么登上这座山的？")
    Talk(1, "我们杀死一条大蛇上来的。")
    Talk(0, "谢谢你们救了我，作为感谢，这本秘法书给你们，需要东南风时，使用秘法书既可如愿。")
    AddItem(5005, 1, true)
    Talk(-100, "孔明先生得了秘法书，再去求风肯定能够如愿。")
    FinishCurrentEvent()
end
do return end