-- 第七章 汉中宫殿门口 张苞
if not TalkAsk(0, "我是张飞之子张苞，我愿参加伐魏，也请收下我吧！") then
    :: NO ::
    if not TalkAsk(0, "作为伐魏之一员，也请收下我吧！") then
        goto NO
    end
end
AddRole({113})
FinishCurrentEvent()
do return end