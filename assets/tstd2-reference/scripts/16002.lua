-- 第六章 新野宫殿 诸葛亮
if HasEvent("16010") then
    Talk(0, "吾观天象，见有不吉之星。先生此去要多加小心。")
elseif HasEvent("16002_1") then
    Talk(0, "请尽快去襄阳城西北山洞里取来西蜀地图。")
elseif HasEvent("16007") then
    Talk(0, "可先取西蜀为基，后北图汉中收取中原，匡正天朝，功莫大焉。")
    Talk(0, "请尽快去襄阳城西北山洞里取来西蜀地图。")
    FinishEvents("16002_1")
elseif HasEvent("16003") then
    Talk(0, "凤雏乃天下奇才，快请他来。")
else
    Talk(0, string.format("劳烦%s将军了。", GeneralName()))
end
do return end