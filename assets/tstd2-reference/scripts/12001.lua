-- 第二章 冀州宫殿 袁绍
if HasEvent("12006") then
    -- 文丑被杀
    Talk(0, "杀颜良文丑的，难道不是你弟关羽吗？");
    Talk(1, "在下被曹军围困，未见其面，云长亦不知我在河北。")
    Talk(0, "吾若得云长，胜颜良文丑十倍。")
    Talk(1, "吾派人投书，云长必会星夜来投。")
    FinishEvents("12008")
    Fade(true)
    ChangeScene(0, "宛城关羽居", "关羽", false)
elseif HasEvent("12006_1") then
    -- 颜良被杀
    if not HasEvent("12006_1T") then
        Talk(0, "什么!颜良被杀？真 ...... 真难以置信。")
        Talk(1, "真厉害！")
        Talk(0, "文丑勇猛胜于颜良，派文丑出战定能得胜。")
        FinishEvents("12006_1T")
    else
        Talk(0, "文丑勇猛胜于颜良，派文丑出战定能得胜。")
    end
elseif HasEvent("12001") then
    Talk(0, "和我军猛将颜良一起迎战白马坡。")
else
    Talk(0, "你杀了我弟弟 袁术，岂能留你!")
    if HasItem(5002) then
        if TalkAsk(-100, "是否使用郑玄的信？") then
            Talk(0, "哦，是吾师郑玄的信吗？让我看看。")
            Talk(0, "...... ...... ......")
            Talk(0, "嗯，言之有理。我若杀了你，只会让曹操高兴。")
            Talk(0, "联手干吧！和我军猛将颜良一起攻占白马坡。")
            AddRole({ 132 })
            RemoveItem(5002)
            FinishEvents("12001")
        end
    end
end
do return end