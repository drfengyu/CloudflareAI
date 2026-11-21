-- 第二章 胡华家
if not HasEvent(12049) then
    Talk(0, "是谁呀？")
    Talk(1, "行路人借宿。")
    Talk(0, "欢迎！")
    Fade(true)
    Rest(0)
    Fade(false)
    Talk(0, "请拿上这封信，我儿胡班在荥阳太守王植手下当差。要去河北，荥阳是必经之地。")
    AddItem(5003, 1) -- 获得 胡班家书
    FinishCurrentEvent()
else
    Talk(0, "请多保重。")
end
do return end