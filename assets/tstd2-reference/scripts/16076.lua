-- 第六章 越巂 董和
local ids = TeamCharactersId(1)
if ids.Count > 0 and ids[0] == 118 then
    Talk(0, "我是蒋婉，带领部下前来助战，请开门！")
    Talk(1, "好的，进来吧。")
    TeamMoveTo({{-133, -26}}, false)
    ChangeScene(0, "越巂", "越巂", true)
else
    Battle()
end
do return end