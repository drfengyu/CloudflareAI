-- 第六章 巴城 严颜
if TalkAsk(0, "吾乃严颜，久闻刘备军仁义，老朽也愿效力军前。") then
    Talk(0, "谢军师。") 
    AddRole({120})
    FinishCurrentEvent()
else
    Talk(0, "那太遗憾了。")
end
do return end