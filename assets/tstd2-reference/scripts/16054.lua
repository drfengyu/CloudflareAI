-- 第六章 涪水寨 门
Talk(-100, "门已着锁。")
if HasItem(5016) then
    if TalkAsk(-100, "是否使用青铜钥匙？") then
        FinishCurrentEvent()
        Talk(-100, "门已打开。")
    end
end
do return end