-- 第三章 荆州宫殿伊籍
local teamPos = TeamPosition()
SetPosition({teamPos[0], -19})
MoveTo({ { teamPos[0], teamPos[1] - 1 } })
TeamChangeDirection(0)
Talk(0, "蔡瑁设计害君，欲助刘琮为荆州之主。")
Talk(0, "宫外皆有军马把守，惟左边房间内有秘密出口，公宜速逃。")
Talk(0, "出城后过桥向西逃。")
MoveTo({ { teamPos[0], -19 } })
FinishCurrentEvent()
do return end