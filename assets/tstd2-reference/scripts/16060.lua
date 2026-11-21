-- 第六章 落凤坡 庞统陨落
if Battle(0) ~= 0 then
    FinishEvents("16060SO")
    RemoveRole({105}, true)
    TeamMoveTo({{-133, 26}, {-137, 26}, {-137, 43}, {-118, 43}, {-118, 15}, {-110, 15}, {-110, -2}, {-102, -2}}, false)
    if Battle(1) == 1  then
        Rest(0, false, true)
        RemoveRole({104}, true)
        FinishCurrentEvent()
        ChangeScene(0, "涪水宫殿", "开场", false)
    end
end
do return end