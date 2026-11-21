-- 南郑关 上青年
if HasEvent("17000") then
    Talk(0, "把守汉中的是曹军猛将夏侯渊。此人精通兵法，不可小看。")
elseif HasEvent("16050") then
    Talk(0, "张鲁之后就是刘璋吗？我为什么就没有君主之命呢？")
else
    Talk(0, "汉中城易守难攻，正面攻打，很难攻下。")
end
do return end 