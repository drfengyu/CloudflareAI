-- 徐州 张飞
SetActive(true, 0)
SetPosition({2, -14}, 0)
MoveTo({ { 2, -11 }, { -8, -11 }, { -8, -5 } }, 0)

if not TalkAsk(0, "让俺与兄长一同讨伐袁术吧。\n不然俺要憋死了！")
then
    :: Marker ::
    if not TalkAsk(0, "别那样说......")
    then
        goto Marker
    end
end
AddRole({ 103 })
FinishCurrentEvent()
do return end