-- 第八章 赤松子居 赤松子
if HasCurrentEvent() then
    Talk(0, "将军请记住，从入口向南20步，再向东20步，就是此阵之出口。")
else
    Talk(0, "唉！愁杀吾也。宫中御药丢失，此乃杀身之祸呀！")
    if HasItem(5053, 1) then
        if TalkAsk(0, "是否交予九转丹？") then
            RemoveItem(5053, 1)
            Talk(0, "正是此药！！！")
            Talk(0, "将军真乃吾之救命恩人也。吾乃赤松子，若有何难事，只管讲来。")
            Talk(-1, "这石阵...")
            Talk(0, "哈哈哈！此乃司马懿布下的石壁八卦阵。此阵瞒得了别人，吾却可破。")
            Talk(0, "将军请记住，从入口向南二十步，再向东二十步，就是此阵之出口。")
            FinishCurrentEvent()
        end
    end
end
do return end