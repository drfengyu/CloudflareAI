-- 马良居
if HasEvent("15150") then
    SetActive(true, 4)
    SetActive(true, 5)
elseif HasRole(126) then
    SetActive(true, 0)
    SetActive(true, 1)
else
    SetActive(true, 2)
    SetActive(true, 3)
end
do return end 