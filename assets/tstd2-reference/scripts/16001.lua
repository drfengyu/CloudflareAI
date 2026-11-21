-- 第六章 新野宫殿 刘备
if HasEvent("16010") then
    Talk(0, "此去西川，路途艰险，请先生多保重。")
elseif HasEvent("16007") then
    if HasItem(5014) then -- 找到西蜀地图
        FinishEvents("16010SO")
    elseif HasEvent("16001_1") then
        Talk(0, "地图还没找到吗？")
    else
        Talk(0, "请诸位将军带上此信，去襄阳城西北的山洞把西蜀地图取来。")
        AddItem(5013, 1, true)
        FinishEvents("16001_1")
    end
elseif HasEvent("16003") then
    Talk(0, "想快点见到水镜先生。")
else
    Talk(0, string.format("劳烦%s将军去会水镜先生。", GeneralName()))
end
do return end