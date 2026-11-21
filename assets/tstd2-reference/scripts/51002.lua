-- 冀州 
if HasEvent("12006") then -- 诛文丑后
    Talk(0, "杀颜良文丑如此轻松，关羽是怎样的一位武将。")
elseif HasEvent("12006_1") then -- 杀颜良后
    Talk(0, "颜良吗，被杀了？")
else
    Talk(0, "武将们应当装备齐全，武器精良，对新来的武将们应当留心安排。")
end

do return end