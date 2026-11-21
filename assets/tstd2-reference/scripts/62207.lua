-- 涪水城 左上老人
if HasEvent("17000") then
    Talk(0, "嗨！我老了，不中用了。")
elseif HasEvent("16050") then
    Talk(0, "庞义被刘璋放逐时，好象秘密地拿走了什么钥匙。")
else
    Talk(0, "据说，皇帝曾下一道密诏，要铲除曹操。几位大臣写血书起誓，其中就有马腾，但后来被曹操发现了。")
end
do return end 