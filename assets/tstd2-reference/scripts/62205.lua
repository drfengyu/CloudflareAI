-- 涪水城 右上男子
if HasEvent("17000") then
    Talk(0, "曹军来攻打汉中，太可怕了。")
elseif HasEvent("16050") then
    Talk(0, "这是什么事？和逆贼曹操结成一伙，我主刘璋难道有意反叛汉朝吗？")
else
    Talk(0, "我读过一本景帝陵墓的古书，记得几句。")
    Talk(0, "向东走，在第三道门转向北，在第四道门转向西，若如此......再往后就记不清了。")
end
do return end 