-- 冀州 
if HasEvent("12006") then -- 诛文丑后
    Talk(0, "真是无敌将军。")
elseif HasEvent("12006_1") then -- 杀颜良后
    Talk(0, "那么笨呀！")
else
    Talk(0, "河北的军队正同曹军在白马坡争战。")
    Talk(0, "如有袁绍的手令，可以到西南的渡口，坐船去白马坡。")
end

do return end