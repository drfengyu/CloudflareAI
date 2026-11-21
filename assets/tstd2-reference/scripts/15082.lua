-- 第五章 长沙收魏延
if not TalkAsk(0, "吾乃魏延，很久就想在刘备军中效力，请收下我吧？") then
    Talk(0, "那太遗憾了。")
else
    Talk(0, "愿效犬马之劳。")
    AddRole({109})
    FinishCurrentEvent()
end
do return end