-- 第六章 庞义居 庞义
if HasCurrentEvent() then
    Talk(0, "青铜钥匙放在地下的宝箱里。")
else
    if TalkAsk(0, string.format("吾乃庞义。%s将军，今刘璋暗弱，西蜀不久必属他人，将军尽早取之，不可错失。", GeneralName())) then
        Talk(0, "青铜钥匙放在地下的宝箱里。只要有了它，就能进入控制水门的小屋了。")
        MoveTo({ {0, 4} })
        ChangeDirection(0)
        FinishCurrentEvent()
    else
        Talk(0, "啊！天下要成为曹操的了吗？")
    end
end
do return end