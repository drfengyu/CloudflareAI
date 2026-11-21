-- 涪水城 右小孩
if HasEvent("17000") then
    Talk(0, string.format("啊！%s先生，全靠你了。请快击退曹军吧！", GeneralName()))
elseif HasEvent("16050") then
    Talk(0, "西北有个大水塘挡路，无法去绵竹关，要设法打开堤坝水门。")
else
    Talk(0, "李恢同马超之父马腾非常要好。")
end
do return end 