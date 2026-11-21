-- 冀州 
if HasEvent("12006") then -- 诛文丑后
    Talk(0, "据说，曹操回到许都，妄杀皇妃，专权弄国。")
elseif HasEvent("12006_1") then -- 杀颜良后
    Talk(0, "要说比颜良文丑猛的武将，就数下落不明的吕布了。")
else
    Talk(0, "你就是刘皇叔吧，关羽和张飞去哪儿了呢？")
end

do return end