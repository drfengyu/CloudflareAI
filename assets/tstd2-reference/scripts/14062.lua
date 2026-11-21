-- 第四章 孙权
if HasEvent("14066") then
    Talk(1, "孙权阁下，曹军的船已连在一起了。")
    Talk(0, "好，周瑜，准备应战。立刻传令下去，马上出动。")
    FinishEvents("14100") --开始赤壁之战
elseif HasEvent("14062_1") and HasEvent("14062_2") and HasEvent("14062_3") then
    Talk(0, "孔明先生，三个难题均已解决，但还应说服曹操将船拴在一起，火攻方能生效。")
    Talk(1, "确实如此，能担此重任者，非凤雏先生不可。但是到哪里去找他.....")
    Talk(0, "凤雏乃庞统，您可去拜访司马徽。")
    FinishCurrentEvent()
elseif HasEvent("14060SO") then
    Talk(0, "孔明先生有何良策？")
else
    Talk(0, "一路辛苦。曹操百万大军压境，又发檄文逼孤投降。然我东吴今已历三世，安忍一旦废弃。")
    Talk(0, "孤与曹贼势不两立，望孔明助孤一臂之力。")
    Talk(0, "眼下尚有三大难事，请先生与众臣商议，孔明先生有何良策？")
    FinishEvents("14060SO")
end
do return end