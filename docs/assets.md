# 素材说明

**简体中文** | [English](assets.en.md)

网站展示的图像大多从游戏文件提取，随仓库保存，部署时不需要安装游戏。原始归档（`data.dat`、`texture*.dat` 等）和完整解包目录不提交，也不进入部署产物。

## 来源

| 路径 | 内容 | 来源 |
| --- | --- | --- |
| `public/icons/generated/items/` | 物品图标（鱼和配方按物品 ID 复用） | 构建 `25640656` 的物品表 → 图标表 → 纹理引用，按坐标裁切 |
| `public/icons/generated/livestock/` | 家畜图标 | 游戏原生家畜图标 |
| `public/icons/generated/ui/` | 星级、好感心形、体力等界面图标 | `tools/extract-save-editor-icons.py`，裁切坐标见目录内 `sources.json` |
| `public/icons/fallback/` | 缺图时的兜底图形 | 作者绘制，不代表物品实际外观 |
| `public/maps/` | 游戏小地图（简体、繁体、日文、英文各一张，叠加 1.2 版新增农地） | 标注与投影参数见 `data/sources/game-map-markers.json`、`game-exploration-markers.json`、`game-night-pickups.json` |
| `public/maps/farm/` | 存档编辑器的农场、房间、作物和设施图 | `tools/extract-map-art.py`，见该目录的 README |
| `public/maps/village/` | 每日规划地图里农场外的整个村子，含村中建筑（四季分块图和全图） | `tools/extract-village-art.py`，建筑按地图里的摆放和 FAD 部件绘制，见该目录的 README |
| `public/art/` | 首页的山峦、云雾、四季树木与灌木 | `tools/extract-scenery.py`，逐图来源见 `data/sources/site-scenery.json` |
| `public/art/portraits/` | 动态立绘 | `tools/extract-portrait-models.py`、`extract-portrait-options.py` 导出，`tools/package-portraits.mjs` 打包 |
| `public/art/anomalies/` | 怪异页插图 | `tools/extract-anomaly-art.py` 从构建 `25311578` 的 `anime.dat`、`fairy_1_00.dat` 导出，`tools/render-anomaly-art.mjs` 渲染，逐图来源见 `data/sources/game-anomaly-art.json` |
| `public/art/night-monsters/` | 深夜妖怪页插图 | 同一组工具（`night-monsters` 参数）从构建 `25311578` 的 `anime.dat`、`fairy_1_00.dat` 导出并渲染，逐图来源见 `data/sources/game-night-monster-art.json` |
| `public/art/logo-japanese.png` | 日文游戏标志 | Steam 商店公开图片 |
| `public/portraits/official/` | 角色头像 | 发行商网站人物页，来源见 `data/sources/official-character-portraits.json` |
| `public/favicon.svg`、`public/app/` | 站点与应用图标 | 作者绘制，`tools/build-app-icons.mjs` 生成各尺寸 |
| `public/support/` | 赞助弹窗里的支付宝、微信收款码 | 作者本人的收款码 |

首页背景是用游戏素材拼出的装饰画面，不是游戏地图的还原；背景季节不影响资料筛选。

## 权利

上表中来自游戏、Steam 商店和发行商网站的图像，权利属于 Nippon Ichi Software, Inc. 及相应权利人。本站作为非官方攻略展示这些素材，作者不主张对其享有权利，本项目的许可也不授予任何人使用它们的权利。权利人如要求修改或删除，请在 GitHub 开 issue。

提取工具属于本项目代码，按 AGPL-3.0 授权；`public/icons/fallback/`、站点与应用图标等作者绘制的图形按 CC BY-NC-SA 4.0 授权。见 [授权说明](../LICENSING.md)。

## 添加素材

- 按游戏表的引用链提取，记录来源表和构建号，不按名称猜测或用相似图片代替。
- 提交站点实际使用的裁切图或压缩图，不提交完整纹理归档。
- 提取先输出到被忽略的审阅目录，核对后再放进 `public/`。
