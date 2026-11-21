-- 第六章 越巂 吴懿
if TalkAsk(0, "我叫吴懿，是蒋琬的朋友。我想与蒋琬一同效力皇叔。") then
    AddRole({117})
    FinishCurrentEvent()
else
    Talk(0, "那太遗憾了。")
end
do return end