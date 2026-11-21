-- 第四章 江夏宫殿 
Talk(0, "唔，叔父，我本想继承先父遗志，让荆州昌盛起来，但蔡瑁背主求降，荆州已落入曹军之手。")
Talk(0, "若从曹操手中夺回荆州，我不堪此任，请您代领荆州军务。")
Talk(-100, "刘备领荆州牧，离开战斗队列。")
Rest(0, false, true)
RemoveRole({101}, true)
Fade(true)
FinishCurrentEvent()
TeamQuickMoveTo({ -4, 0 }, 1, true)
Fade(false)
Talk(1, "军师所言极是。")
do return end