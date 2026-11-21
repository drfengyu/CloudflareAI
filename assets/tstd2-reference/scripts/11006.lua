-- 徐州 董承
if not HasCurrentEvent() then
    Talk(0, "吾等歃血为盟共灭曹贼，皇叔何故突然离京？")
    Talk(1, "曹操心思缜密，为防其识破吾等之计，出城暂避尔。")
    FinishCurrentEvent()
end
Talk(0, "请多加小心。")
do return end