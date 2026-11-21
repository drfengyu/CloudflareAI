-- 第二章 青州张飞加入
Talk(0, "兄长，对不住，请多原谅。")
:: NO ::
if not TalkAsk(0, "俺也一块去吧！") then
    goto NO
end
AddRole({ 103 })
FinishEvents("12102")

do return end