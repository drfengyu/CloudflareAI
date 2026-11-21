-- 高老庄 中老人
if HasCurrentEvent() then
    Talk(0, "水不是装满了吗？")
elseif TalkAsk(0, "此村甘泉尤宜沏茶，天下闻名，想要吗？")  then
    if HasItem(5051) then
        Talk(0, "这样可以吧？水壶已经装满了。")
        FinishCurrentEvent()
    else
        Talk(0, "可惜缺少水壶。")
    end
end
do return end