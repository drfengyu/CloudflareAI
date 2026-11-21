-- 第二章 宛城关羽所 关羽收到信件
if not HasEvent(12050) then
    AddItem(1802, 1, false) --赤兔马
    AddItem(1100, 1, false) --石刀
    TeamInitRoles({ 102 }, {}, {})
    TeamChangeDirection(0)
    SwitchAudio(0, false)
    Delay(0.5)
    Talk(-100, "关羽身在曹营，思念兄长，旦夕烦恼。\n忽一日，有密使来访。")
    SwitchAudio(0, true)
    Fade(false)
    MoveTo({ { 2, -14 }, { 2, -2 }, { -1, -2 } })
    Talk(0, "是兄长来信。")
    Talk(0, "...... ...... ......")
    Talk(0, "人生天地间，无终始者，非君子也。\n烦公达知兄长，容某辞却曹操，奉嫂来见。")
    MoveTo({ { -1, -2 }, { 2, -2 }, { 2, -14 } })
    FinishCurrentEvent()
end 
do return end