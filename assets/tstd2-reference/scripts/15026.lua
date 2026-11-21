-- 第五章 樊城锦囊再战吕布
if Battle() == 100 then
    -- 使用锦囊
    SetTeamActive(false)
    SetActive(true, 0)
    SetActive(true, 1)
    MoveToAsync({ { 21, -77 } }, 0)
    MoveTo({ { 21, -76 } }, 1)
    Delay(.2)
    if Battle(1) == 100 then
        MoveTo({ { 21, -72 } }, 1)
        -- 关羽诱吕布
        if Battle(2) == 1 then
            -- 樊城战
            FinishCurrentEvent()
        end
    end
end
SetTeamActive(true)
do return end