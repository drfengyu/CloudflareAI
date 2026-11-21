-- 第三章 三顾茅庐
Talk(0, "...... ......")
if TalkAsk(-100, "卧龙先生正在安睡，是否叫醒他？") then
    Talk(0, "亮乃一耕夫，安敢谈天下事，请将军自回。")
else
    Delay(3)
    SetActive(false, 0)
    SetActive(true, 1)
    
    Talk(0, "南阳野人，殊懒成性，屡蒙将军枉临，不胜愧赧。")
    Talk(1, "大丈夫抱经世之才，岂可空老于林泉之下。愿先生以天下苍生为念，开备愚鲁而赐教。")
    Talk(0, "将军欲成霸业，北让曹操占天时，南让孙权占地利，将军可占人和。")
    Talk(0, "先取荆州为家，后取西川建基业，以成鼎足之势，然后可图中原也。")
    Talk(0, "诚如是，则大业可成，汉室可兴矣。")
    Talk(1, "先生之言，顿开茅塞。使备如拨云雾，而睹青天。")
    Talk(1, "愿先生出山相助，备当拱听明诲。若先生不出，则如苍生何？")
    Talk(-100, "刘备言毕，泪沾袍袖，衣襟尽湿。")
    Talk(0, "将军既不相弃，愿效犬马之劳。")
    AddRole({104})
    Fade(true)
    FinishCurrentEvent()
    -- 进入第四章
    StartChapter(4)
    FinishEvents("14000")
    ChangeScene(0, "新野建成初期宫殿", "小试牛刀", false)
    do return end
end
do return end