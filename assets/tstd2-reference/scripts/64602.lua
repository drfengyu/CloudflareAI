-- 成都 左男子
if HasEvent("17000") then
    Talk(0, string.format("%s将军，曹军围攻汉中来了，请赶快击退他们吧！", GeneralName()));
else
    Talk(0, "刘皇叔已经到成都了，正在宫殿中等各位将军了。")
end
do return end 