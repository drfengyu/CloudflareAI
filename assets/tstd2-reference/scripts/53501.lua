-- 荆州城 荆州宫殿门口
if HasEvent("15000") then
    if TalkAsk(0, "曹仁的兵符拿到了吗？") then
        Talk(0, "那很好。")
    else 
        Talk(0, "奇怪呀，曹仁的兵符让陈矫拿着，陈矫会把它藏在哪儿呢？")
    end
else
    Talk(0, "据说，刘表病势沉重，只盼主公早日康复。");
end
do return end 