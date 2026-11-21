-- 第六章 南郑关 王平
if HasCurrentEvent() then
    Talk(0, "祝君好运。")
else
    Talk(0, "吾名王平，久慕贵军，愿献一策。汉中杨松极贪金帛，若予万金，即可让他按时打开汉中城门。")
    if TalkAsk(0, "是否交予黄金？") then
        if HasMoney(10000) then
            Talk(0, "我这就去，请在此静候佳音。")
            MoveTo({ { 2, -3 }, { 5, -3 }, { 5, -10 } })
            Fade(true, .5)
            SetPosition({2, 5})
            Fade(false, .5)
            Talk(0, "此计甚妙，汉中城门定开无疑。攻下汉中，在此一举。")
            FinishCurrentEvent()
        else
            Talk(0, "黄金数量不多，恐不足以行贿。")
        end
    else
        Talk(0, "若如此，请湊足再来。")
    end
end
do return end