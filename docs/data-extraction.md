# 游戏数据提取与校验

本项目只读 `Village in the Shade/data.dat`；生成图标时还会读取 `data/texture*.dat`，不会修改游戏目录或存档。当前快照对应 Steam App `3934250`、构建 `24969282`；归档和每张数据表的 SHA-256 均写入 `manifest.json`，因此更新游戏后可以明确判断数据是否变化。

## 生成快照

```powershell
.\.venv\Scripts\python.exe -m honogurashi_extractor.cli verify-schemas `
  --game-dir "E:\Games\SteamLibrary\steamapps\common\Village in the Shade" `
  --build-id 24969282

.\.venv\Scripts\python.exe -m honogurashi_extractor.cli extract `
  --game-dir "E:\Games\SteamLibrary\steamapps\common\Village in the Shade" `
  --build-id 24969282 `
  --output data/generated/build-24969282

.\.venv\Scripts\python.exe -m honogurashi_extractor.cli audit `
  data/generated/build-24969282

.\.venv\Scripts\python.exe -m honogurashi_extractor.cli extract-icons `
  --game-dir "E:\Games\SteamLibrary\steamapps\common\Village in the Shade" `
  --snapshot data/generated/build-24969282 `
  --output public/icons/generated/items
```

字段档案只为已经由至少两条真实记录确认的标量命名。作物和机械加工表含有可变长数组；它们按数组计数读取，不按某一行的固定偏移套用。中文名优先使用游戏内官方繁中，再转换为简中，同时保留繁中、日文和内部 ID 作为搜索别名。

`extract-icons` 同样只读游戏文件：它用快照中的物品数字 ID 查询 `item.dat`、`icon.dat` 与 `texture.dat`，按图集坐标裁切并写成无损 WebP。`item.dat` 的记录长度会随物品种类变化，主图标与轮廓图标 ID 分别位于记录末尾前 52、44 字节，不能使用固定绝对偏移；否则较短记录会被漏掉，部分较长记录则会把轮廓图误当成主图。当前构建共请求 2856 个物品图标，成功写出 2856 个，缺失 0 个，解码失败 0 个。鱼类复用同 ID 的物品图标，料理和配方复用产出物图标；游戏数据库没有为角色提供同类的一对一平面头像，因此角色列表不显示伪造占位图。网站仍保留分类占位图作为游戏更新或文件损坏时的兜底。

当前 Steam 构建的纹理使用 `NMPLTEX1` 布局标记 102、BC7 数据与 YKCMP 方法 9；提取器也保留旧布局的块线性解码路径。游戏更新后应先运行 schema 校验和数据审计，再重新提取图标，不应沿用未经核对的偏移。

## 首次快照抽查

以下数值来自生成后的 JSON，并与游戏内日文/繁中字符串及 AppMedia 对应页面交叉核对：

1. 洋葱：`ITEM_ID_CROPS_ONION`，简中名“洋葱”，售价 63，关联洋葱种子，季节为春；与 [AppMedia 洋葱页](https://appmedia.jp/honogurashi/80320957) 一致。
2. 番茄：`ITEM_ID_CROPS_TOMATO`，售价 23，关联番茄种子，季节为夏；与 [AppMedia 番茄页](https://appmedia.jp/honogurashi/80320990) 一致。
3. 高丽菜：`ITEM_ID_CROPS_CABBAGE`，售价 200，关联高丽菜种子，季节为春；与 [AppMedia 高丽菜页](https://appmedia.jp/honogurashi/80320975) 一致。
4. 腌菜桶：售价 37；洋葱加工为腌渍洋葱，原料 1、产物 1、游戏时长 1380 分钟（界面显示 1 日）、产物售价 83；与 [机械列表](https://appmedia.jp/honogurashi/80266021) 及 [加工品列表](https://appmedia.jp/honogurashi/80263435) 一致。
5. 酿造桶：售价 62；洋葱加工为洋葱高汤，原料 1、产物 1、游戏时长 2820 分钟（界面显示 2 日）、产物售价 103；与 [洋葱高汤页](https://appmedia.jp/honogurashi/80322187) 一致。
6. 商店：洋葱种子存在于杂货店和行商销售表，物品买价 40、售价 30；与 [洋葱种子页](https://appmedia.jp/honogurashi/80320105) 一致。
7. 料理：洋葱汤 `COOKING_ID_013` 产出 1 份，原料为洋葱×2、奶酪×1，成品售价 306；[洋葱用途页](https://appmedia.jp/honogurashi/80320957) 同样记录洋葱汤需要洋葱×2。

“日”是界面级显示值：将游戏分钟除以 1440 后向上取整。快照保留原始分钟，网站同时显示原始时长和换算天数，避免丢失精度。

## 品质价格口径

普通、铜星、银星、金星、品牌品质分别使用 1、1.25、1.5、1.75、2 倍基础售价。种子、树苗以及不具品质传播关系的原料保持固定价格；作物收获物及其可传播品质的加工产物使用全局品质。由于游戏最终显示时对非整数价格的取整规则尚未完全验证，网站保留计算结果并以 `≈` 标明小数估算值。
