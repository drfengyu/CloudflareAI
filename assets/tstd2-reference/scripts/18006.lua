-- 第八章 黄石公居 黄石公
if HasCurrentEvent() then
    Talk(0, "记住破落雷计的咒语：\n 上  上  下  下\n 左  右  上  下")
    Talk(0, "司马懿念起落雷计的咒语时， 汝须念此咒语，但此咒语须孔明念才能见效，还需各位相助。")
elseif HasEvent("18006_3") then
    if HasItem(5052, 1) then
        RemoveItem(5052, 1)
        Talk(0, "哈哈哈！你们的心意我领了。")
        Talk(0, "记住破落雷计的咒语：\n 上  上  下  下\n 左  右  上  下")
        Talk(0, "司马懿念起落雷计的咒语时， 汝须念此咒语，但此咒语须孔明念才能见效，还需各位相助。")
        FinishCurrentEvent()
    else
        Talk(0, "可惜缺少好茶具。")
    end
elseif HasEvent("18006_2") then
    if HasEvent("65803") then
        RemoveItem(5051, 1)
        Talk(0, "啊？拿来水了。")
        Talk(0, "... ...")
        Talk(0, "嗯，确是好水，现在可以沖好茶啦。但是家里没有沏茶茶具，能弄到吗？")
        FinishEvents("18006_3")
    else
        Talk(0, "如果有高老庄的名水......")
    end
elseif HasEvent("18006_1") then
    if HasItem(5050) then
        RemoveItem(5050, 1)
        Talk(0, "噢，拿来了吗？")
        Talk(0, "... ...")
        Talk(0, " 嗯，确实是好茶。不过，这样的好茶，要用名水来沏。请用这个水壶接些高老庄的泉水。")
        AddItem(5051, 1, true)
        FinishEvents("18006_2")
    else
        Talk(0, "如果有茶的话......")
    end
else
    Talk(0, "醒来了，吾乃黄石公。")
    Talk(1, "莫非您是曾经传授兵书给汉初功臣张良的那位仙人？")
    Talk(0, "正是。")
    Talk(1, "吾军正在与魏军交战，却被震昏。请教先生此乃何计？")
    Talk(0, "此乃落雷计，出自吴起之兵法书。")
    Talk(1, "喔，果然厉害！不知可否有破落雷计之法？")
    Talk(0, "有倒是有，不过......烦请找些上好茶叶。")
    FinishEvents("18006_1")
end
do return end