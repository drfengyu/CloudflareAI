-- 第四章 张昭
if HasCurrentEvent() then
    Talk(0, "百万支箭到手了，随时都可以开战。")
elseif HasItem(5008) then
    Talk(1, "张昭先生，百万支箭业已湊齐。")
    Talk(0, "什么？百万支箭到手了，不愧是刘备军啊。")
    FinishCurrentEvent()
else
    Talk(0, "吾乃东吴张昭, 请问先生，水路交兵，以何兵器为先？")
    Talk(1, "当以弓箭为先。") 
    Talk(0, "甚合愚意，但今军中正缺箭用，敢烦先生监造百万枝箭否？")
    Talk(1, "军师见委，自当效劳。")
end
do return end