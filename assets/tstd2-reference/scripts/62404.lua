-- 葭萌关 上右青年
if HasEvent("17000") then
    Talk(0, "曹军已攻占阳平关，请赶快击退他们。")
elseif HasEvent("16050") then
    Talk(0, "有一位叫庞义的人，被刘璋放逐了。他住在涪水城北的小屋里。")
else
    Talk(0, "汉中王张鲁欲坚守汉中，以迎曹操，请尽快攻占汉中。")
end
do return end 