-- 新野建成初期 左上青年
if HasEvent("13013") then
    Talk(0, "这儿是座小城，人少，什么都得我一个人干。")
    Talk(0, "要是变成洛阳那样的大城，人口也会增加。多舒心呀！")
elseif HasEvent("13011") then
    Talk(0, "曹操的军队攻来了！");
else
    Talk(0, "这儿是座小城，人少，什么都得我一个人干。")
    Talk(0, "要是变成洛阳那样的大城，人口也会增加。多舒心呀！")
end
do return end 