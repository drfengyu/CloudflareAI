-- 第二章 荥阳关
if HasEvent("12056") then
    Talk(0, "吾先去开城门，请将军赶快收拾出城。")
elseif HasItem(5003) then
    if TalkAsk(-100, "是否使用胡班家书？") then
        Talk(0, "若非家父之信, 险些误杀忠良了。\n王植心怀不仁，约于三更放火，加害将军。")
        Talk(0, "吾先去开城门，请将军赶快收拾出城。")
        RemoveItem(5003)
        FinishEvents("12056", "12057")
    end
else
    Talk(0, "且请在此暂歇一宿，明日登途未迟。")
end
do return end