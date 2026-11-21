-- 第二章 关平拜关公为父
if not HasEvent("12155") then
    Talk(0, "欲遣次子关平跟随关将军，关将军肯容纳否？")
    Talk(1, "既蒙长者厚意，吾弟尚未有子，今既以贤郎为子，如何？")
    Talk(0, "如此甚好。")
    Talk(-100, "于是乎，关平拜关公为父。")
    Talk(-100, "关定大喜，设宴款待，众将安歇。")
    Fade(true)
    Rest(0)
    Fade(false)
    FinishCurrentEvent()
else
    Talk(0, "再会。")
end
do return end