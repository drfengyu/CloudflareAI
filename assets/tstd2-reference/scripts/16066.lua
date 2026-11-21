-- 第六章 巴关 小兵
if TalkAsk(0, "刘备刘备军真是仁义之师？") then
    Talk(0, "吾奉命来此放火，但又不忍伤仁义之师，只能逃离此地。")
    Talk(0, "关外埋伏着刘璋军队，贵军若现在沖出关外，会击其不备。")
    Talk(0, "告辞。")
    MoveTo({{1, -6}})
    FinishCurrentEvent()
else
    Talk(0, "是吗？真遗憾。")
end
do return end