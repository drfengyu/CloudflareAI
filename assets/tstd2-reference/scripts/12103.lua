-- 第二章 青州城赵云加入
Talk(0, "在下赵云，赵子龙是也。\n听说张飞将军在青州，特来投奔。")
:: NO ::
if not TalkAsk(0, "今得相随，大称平生。虽肝脑涂地，无恨矣。") then
    goto NO
end
AddRole({ 106 })
FinishEvents("12103")

do return end