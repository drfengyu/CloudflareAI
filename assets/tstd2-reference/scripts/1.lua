print "test.lua called";

StartTalk();
Talk(1, "小兄弟，到此寒天雪地，不知有何指教？");
if TalkAsk(0, "請問你是大触嗎？") == true then goto labelYes end;
    EndTalk();
    print "false";
    do return end;
::labelYes::
    EndTalk();
    print "true";
do return end;