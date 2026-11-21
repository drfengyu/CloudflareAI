-- 徐州宫殿 曹操
if HasCurrentEvent() then
    Talk(0, "哼！")
else
    if TalkAsk(0, "玄德，河北袁绍虎视眈眈令我无法抽身，就派部将朱灵和路昭助您攻打袁术吧！") then
        Talk(0, "哼！果然你一个人什么事情都做不了。")
        AddRole({ 129, 130 })
        SetActive(false, 0)
        SetActive(false, 1)
        FinishEvents("11002T")
    else
        Talk(0, "哼！那你就一个人去吧。")
        FinishEvents("11002F")
    end
end
FinishCurrentEvent()
do return end