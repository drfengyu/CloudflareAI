# 吞食天地武将头像素材

`*.gif` 是本作武将的 48×48 像素头像，文件名即武将 id（对应 `lib/trial/saga/data.ts` 里的 `SAGA_GENERALS`）。

## 出处

- 仓库：<https://github.com/mooneroid/rotj>（MIT License，代码部分），路径 `data/images/doae_portraits/Portrait 48`
- 原始出处：Kongming's Archives 整理的《吞食天地》（Destiny of an Emperor）头像包（随包说明见原仓库同目录的 `_readme.txt`）
- 原包使用条款：可作头像/论坛用途分发，**不得修改压缩包内容、不得用于盈利、不得声称拥有版权**

本目录只是把其中与本作武将对应的单张头像按 id 重命名后引用，用于个人非商业的同人试炼玩法。素材版权归原权利人（Capcom / Kongming's Archives）所有，本项目不主张任何权利。

## 覆盖情况

- 已收录：81 名武将（刘备、关羽、张飞、赵云、诸葛亮、吕布、许褚、太史慈、张角等）
- 未收录：39 名武将（如曹操、孙坚、孙策、陆逊、刘表、孟获、祝融、王平、廖化等），这些武将仍然使用 `components/trial/portraits.ts` 里 Canvas 现画的立绘
- 罗马音不同的几个做了别名映射：`taishici←taisici`、`lvbu←lubu`、`zhangjiao←zhangjao`、`xuchu←xuzhu`、`xunyu←xunhuo`、`lvmeng←lumeng`、`chengpu←chenpu`

## 新增素材

1. 把头像存成 `<武将id>.gif` 放进本目录；
2. 在 `components/trial/portrait-assets.ts` 的 `SAGA_PORTRAIT_IDS` 里加上对应 id；
3. `tests/trial-saga.test.ts` 会校验 id 合法且文件真实存在。
