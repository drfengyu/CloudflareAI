Talk(0, "杀了车胄之后，曹操必会亲自率领军队报复，此城危矣。\n今只能投奔河北袁绍，别无他路。");
Talk(0, "郑玄是袁绍老师，若能得他致书与袁绍，袁绍必会收留我等。");
if TalkAsk(0, "虽在下才疏学浅，但也愿效绵薄之力，不知皇叔是否肯收纳在下？") == true then goto Yes end;
::No::
    if TalkAsk(0, "愿效绵薄之力") == true then goto Yes end;
    goto No;
    do return end;
::Yes::
    FinishEvents("10");
    AddRole({225}); 
do return end;