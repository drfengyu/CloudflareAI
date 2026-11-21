-- 第六章 金雁桥 张任
Talk(0, "吾乃张任，现已无面目复见主公。")
if TalkAsk(0, "有勇气的给我站出来！拼了！") then
    Talk(-1, string.format("我%s就来会一会你！", GeneralName()))
    local headId = TeamCharactersId(1)[0]
    ClearTempCharacters()
    AddTempCharacterById(headId)
    RemoveRole({ headId }, false)
    SetNPCModel(headId, 0)
    SetActive(true, 0)
    MoveToAsync({{-166, 12}}, 1)
    MoveTo({{-166, 13}}, 0)
    Delay(.5)
    if Battle() == 1 then
        AddCurrentCharacterFromTempById(headId)
        ClearTempCharacters()
        FinishCurrentEvent()
    end
else
    Talk(0, "刘备军全是胆小鬼吗？刘备军没有硬汉吗？")
end
do return end