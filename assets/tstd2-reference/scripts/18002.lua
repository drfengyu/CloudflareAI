-- 第八章 鲁城宫殿前 关索 
Talk(0, "我是关羽的三子关索，愿替父出征，无论如何请收下我。")
:: NO ::
if not TalkAsk(0, "无论如何，请收下我。") then
    goto NO
end
AddRole({114})
FinishCurrentEvent()
do return end