-- 第三章 江夏宫殿
Talk(0, "目今曹操大军压境，我主孙权将军，虎踞六郡，兵精粮足。")
Talk(0, "今为君计，宜遣心腹，往结东吴，共图大事。")
Talk(1, "事急矣，请奉命一行。")
if HasEvent("14010") then
    Talk(0, "终于有船了吗，那就快些动身吧。")
    AddRole({133})
    FinishCurrentEvent()
else
    Talk(0, "要是有船就好了。")
end
do return end