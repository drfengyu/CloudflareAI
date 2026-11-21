-- 第六章 涪水寨 大坝开关
if not HasCurrentEvent() then
    if TalkAsk(-100, "有把手，扳动吗？") then
        Talk(-100, "嘎......嘎......")
        SwitchAudio(0, false)
        PlayAudio(1, "Sluice")
        ShakeCamera(5)
        SwitchAudio(0, true)
        Talk(-100, "发出了很大的声音。")
        FinishCurrentEvent()
    end
end
do return end