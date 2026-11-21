-- 训
local data = ParametersInScene()
local lv = data[0]
local money = data[1]
if TalkAsk(0, string.format("%s将军，这里是训练场。\n历练到 %d , 需要花费 %d 金，是否需要训练？", GeneralName(), lv, money)) then
    if HasLv(lv)
    then
        Talk(0, "您的历练已经足够高了，请到别的训练场训练。");
    else
        if HasMoney(money)
        then
            TeamMoveTo({ { 4, -1 }, { -14, -1 } }, true)
            Fade(true)
            Train(lv, money)
            Fade(false)
            TeamMoveTo({ { 4, -1 }, { 4, 1 } }, false)
            Talk(0, string.format("%s将军，训练辛苦了。", GeneralName()));
        else
            Talk(0, string.format("%s将军，您的金钱不足，非常抱歉。", GeneralName()));
        end
    end
end
do
    return
end