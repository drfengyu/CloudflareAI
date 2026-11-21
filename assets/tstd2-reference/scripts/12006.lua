-- 第二章 杀颜良诛文丑
if not HasEvent("12006_1") then
    if Battle() == 100 then
        -- 杀颜良
        FinishEvents("12006_1");
        ChangeScene(2, "", "冀州门前", false)
        Rest(0, false, true)
        RemoveRole({132}, true)
        
        SetEvent("12002F", 0)
        SetEvent("12002T", 1)
    end
else
    -- 诛文丑
    if Battle() == 100 then
        FinishEvents("12006");
        ChangeScene(2, "", "冀州门前", false)
        Rest(0, false, true)
        RemoveRole({131}, true)
        
        SetEvent("12002F", 0)
        SetEvent("12002T", 0)
    end
end

do return end