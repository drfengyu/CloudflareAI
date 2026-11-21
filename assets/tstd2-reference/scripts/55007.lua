-- 江夏 右上男子
if HasEvent("15000") then
    if TalkAsk(0, "我知道难办，不过五百两黄金，还买不到吗？") then
        if not HasMoney(500) then
            Talk(0, "你的钱不够啊。")
        else
            Talk(0, "嘿嘿，要不那样就办不成了。")
            Talk(0, "据说，兵符现在在荆州城的陈矫手里，首先去荆州城吧。")
            MoveTo({{0, 7}, {0, 19}})
            FinishCurrentEvent()
        end
    else
        Talk(0, "哼，小气！看着办吧。")
    end
else
    Talk(0, "据说襄阳城由蔡瑁，新野城由蔡勋，荆州城由蔡中分别把守。");
end
do return end 