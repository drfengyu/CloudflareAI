-- 第七章 安定姜母居 姜母
if HasCurrentEvent() then
    Talk(1, "老人家深明大义，令吾等敬佩。")
elseif HasEvent("17013") then
    Talk(0, "我是姜维的母亲，我儿早就敬仰孔明先生。心怀复兴汉室的志向，但却因为我的病......")
    Talk(0, "现在，您请来名医为我治病，我儿可归顺矣。")
    Talk(1, "老人家深明大义，令吾等敬佩。")
    FinishCurrentEvent()
else
    Talk(0, "嗯......嗯......")
end
do return end