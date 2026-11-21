-- 第四章 周瑜
if HasCurrentEvent() then
    Talk(0, "若借来东南风，则我东吴军取胜有希望矣。")
elseif HasItem(5005) then
    Talk(0, "什么？你说能借东南风。若借来东南风，则我东吴军取胜有希望矣。")
    FinishCurrentEvent()
else
    Talk(0, "吾乃水军都督周瑜，敢问先生吾有何难事？")
    Talk(1, "欲破曹公，宜用火攻。万事俱备，只欠东风。")
    Talk(0, "然也，先生真乃神人。")
    FinishCurrentEvent()
end
do return end