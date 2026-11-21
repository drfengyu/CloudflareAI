-- 冀州 
if HasEvent("12006") then
    -- 诛文丑后
    Talk(0, "杀文丑的好像是关羽。")
elseif HasEvent("12006_1") then
    -- 杀颜良后
    Talk(0, "听说颜良被杀了。")
else
    Talk(0, "这里是冀州城。")
end

do return end