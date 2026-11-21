-- 第六章 李恢居 李恢
if HasCurrentEvent() then
    Talk(0, "祝你们好运。")
elseif HasItem(5015) then
    -- 血书
    Talk(0, "噢，拿来血书了。让我去说服马超。")
    MoveTo({ { 8, -3 }, { 1, -3 }, { 1, -12 } })
    Fade(true, .5)
    SetPosition({ 8, 4 })
    TeamQuickMoveTo({ 8, 3 }, 1, true)
    Fade(false, .5)
    Talk(0, "马超说想见你们，请速去葭萌关吧。")
    FinishCurrentEvent()
elseif HasEvent("16021SO") then
    Talk(0, "拿到血书了吗？")
else
    if TalkAsk(0, "你们是刘皇叔的人吗？") then
        Talk(0, "现在有些事可以对你们说了。")
        Talk(0, "以前皇帝下秘诏要铲除曹操时，刘备和马超之父马腾，与其他几位大臣一起立血书，誓除曹操。")
        Talk(0, "可惜事情败露，除刘皇叔外其他几位都被曹操杀害了，马腾也被杀了。")
        Talk(0, "马腾怕血书落入曹操手中，给刘皇叔带来麻烦，预先把血书藏在汉景帝的墓里。")
        Talk(0, "只有我知道景帝墓的入口，拿来西蜀地图我告诉你们。")
        Talk(0, "噢，地图拿来了，给我看看。")
        Talk(0, "从这儿向北走，有一片小树林，到那里调查一下，应该能找到入口。")
        Talk(0, "拿到血书后，请交给我，凭此物我可说服马超。")
        FinishEvents("16021SO")
    else
        Talk(0, "是我弄错了吗？")
    end
end
do return end