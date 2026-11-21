-- 朱灵，路昭离队
if HasRole(129) or HasRole(130) then
    Talk(0, "玄德公， 现在伪帝袁术已败，吾等也不必逗留，早回都城向丞相缴令。")
    Talk(-100, "朱灵、路昭回城去了。")
    Delay(.5)
    Rest(0, false, true)
    RemoveRole({129, 130}, true)
end
FinishCurrentEvent()
ChangeScene(0, "徐州", "徐州", true)
do return end