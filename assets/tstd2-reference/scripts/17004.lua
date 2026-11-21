-- 第七章 汉中宫殿门口 关兴
if not TalkAsk(0, "吾乃关兴，愿代父关羽出征，请收下我吧！") then
    :: NO ::
    if not TalkAsk(0, "请收下我吧！") then
        goto NO
    end
end
AddRole({116})
FinishCurrentEvent()
do return end