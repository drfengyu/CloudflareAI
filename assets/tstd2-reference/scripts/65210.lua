-- 天水 茶商
if HasCurrentEvent() then
    Talk(0, "只要想要茶，什么时候都可以来。")
elseif HasEvent("18000") then
    if TalkAsk(0, "噢，各位将军想要茶吗？") then
        Talk(0, "来！来！请收下这茶。")
        AddItem(5050, 1)
        FinishCurrentEvent()
    else
        Talk(0, "只要想要茶，什么时候都可以来。")
    end
else
    Talk(0, "我是茶叶商，因为不能随便去街亭，所以买不到好茶叶了。") 
end 
do return end