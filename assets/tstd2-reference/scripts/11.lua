-- 宿
local data = ParametersInScene()
local money = data[0] * TeamCharactersCount()
if TalkAsk(0, string.format("将军，辛苦了。\n小店住宿一晚 %d 金\n是否住宿？", money)) then
    if HasMoney(money) 
    then
        Talk(0, "好好休息。", true)
        Fade(true)
        Rest(money)
        Fade(false)
        Talk(0, "早上好，今天还望继续努力。")
    else
        Talk(0, "将军，您的金钱不足，非常抱歉。")
    end
end
do return end