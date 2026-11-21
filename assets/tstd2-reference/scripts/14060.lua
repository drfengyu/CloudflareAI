-- 第四章 炸石头
if HasItem(5007, 1) then
    if TalkAsk(-100, "是否使用火药？") then
        PlayAudio(1, "Gunpowder1")
        ShakeCamera(1.8)
        PlayAudio(1, "Gunpowder2")
        FinishCurrentEvent()
    end
end
do return end