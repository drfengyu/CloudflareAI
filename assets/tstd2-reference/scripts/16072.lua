-- 第六章 蒋家居 蒋琬
if HasEvent("16074") then
    if not TalkAsk(0, "你们救了母亲，万分感激。如果派我打头阵，就能进入越隽城门。") then
        ::NO::
        if not TalkAsk(0, "一定，拜托了！")  then
            goto NO
        end
    end
    AddRole({118})
    FinishCurrentEvent()
else
    Talk(0, "吾乃蒋琬，仰慕刘皇叔久矣，但母亲被抓作人质，也没有办法。")
end
do return end