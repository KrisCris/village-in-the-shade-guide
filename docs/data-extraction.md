# 游戏数据提取与校验

本项目只读 `Village in the Shade/data.dat`，不会修改游戏目录或存档。当前快照对应 Steam App `3934250`、构建 `24969282`；归档和每张数据表的 SHA-256 均写入 `manifest.json`，因此更新游戏后可以明确判断数据是否变化。

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
```

字段档案只为已经由至少两条真实记录确认的标量命名。作物和机械加工表含有可变长数组；它们按数组计数读取，不按某一行的固定偏移套用。中文名优先使用游戏内官方繁中，再转换为简中，同时保留繁中、日文和内部 ID 作为搜索别名。

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
