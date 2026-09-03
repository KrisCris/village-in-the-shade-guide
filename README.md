# 《静谧田园》中文版 Wiki / Guide

这是一个纯静态、默认简体中文的《静谧田园》（Village in the Shade / ほの暮しの庭）资料库。站点把 Steam 构建 `24969282` 的本地游戏数据与 AppMedia 日文攻略主题结合起来：数值与关系来自游戏文件，玩法与流程以原创中文行动清单呈现，并保留日文、繁中和内部 ID 供搜索核对。

## 已覆盖内容

- 4652 个结构化实体，包含 2856 件物品、162 条作物记录、37 台机械、486 条加工、195 条制作配方、118 道料理、45 种鱼、16 名角色等。
- 116 / 116 个 AppMedia 首页可发现主题均有映射；列表主题进入实时数据表，流程、系统、怪异、角色与活动主题进入中文攻略页。
- 简中 / 繁中 / 日文 / 内部 ID 全局搜索；分类页搜索、季节与机械筛选、URL 状态、价格及利润排序。
- 分类页同时支持中文拼音全拼、分词和首字母搜索；品质选择会统一更新物品售价、利润与排行。
- 可连续展开的关联详情：物品 → 配方 → 原料 → 商店 / 机械；桌面侧栏与手机全屏详情共用同一套内容。
- 作物首次成熟、再生周期与 28 天单季利润；加工按原料直接出售的机会成本计算净收益和日收益。

## 本地运行

需要 Node.js 22+ 与 Python 3.12+。

```powershell
npm install
npm run dev
```

生产构建：

```powershell
npm run verify
```

输出位于 `dist/`，可部署到任意静态托管。站点不会把游戏安装路径、归档文件或存档复制进 `dist/`。

仓库包含分类占位图，因此没有安装游戏也能直接构建和浏览；此时未生成的物品图标会显示对应分类占位图。真实图标只从本地游戏提取，不纳入 Git。

## 从本地游戏重新提取

提取过程只读本地游戏归档（`data.dat` 与图标所需的 `data/texture*.dat`），不会修改游戏目录。示例命令：

```powershell
.\.venv\Scripts\python.exe -m honogurashi_extractor.cli verify-schemas `
  --game-dir "E:\Games\SteamLibrary\steamapps\common\Village in the Shade" `
  --build-id 24969282

.\.venv\Scripts\python.exe -m honogurashi_extractor.cli extract `
  --game-dir "E:\Games\SteamLibrary\steamapps\common\Village in the Shade" `
  --build-id 24969282 `
  --output data/generated/build-24969282

.\.venv\Scripts\python.exe -m honogurashi_extractor.cli audit data/generated/build-24969282

.\.venv\Scripts\python.exe -m honogurashi_extractor.cli extract-icons `
  --game-dir "E:\Games\SteamLibrary\steamapps\common\Village in the Shade" `
  --snapshot data/generated/build-24969282 `
  --output public/icons/generated/items
```

更新 AppMedia 主题目录与覆盖表：

```powershell
npm run content:catalog
npm run content:outlines
npm run content:coverage
npm run content:check
```

详情见 [数据提取说明](docs/data-extraction.md) 与 [内容覆盖审计](docs/content-coverage.md)。

## 计算口径

- 每个被浇水日增加 100 成长点；首次成熟日与再生周期由游戏作物记录的成长阈值向上取整。
- 作物排行假设完整 28 天季节、每日浇水、当前全局品质、同一格地；一次性作物成熟后重新买种播种，再生作物只计算首颗种子成本。
- 加工净收益 = 产物售价 − 原料若直接出售的总价；日净收益按游戏内加工分钟数除以 1440 换算。
- 品质售价按游戏数据确认的倍率计算：普通 1×、铜星 1.25×、银星 1.5×、金星 1.75×、品牌 2×。游戏最终整数取整方式尚未完全验证，出现小数时页面用 `≈` 标记为估算值，不擅自取整。
- 尚未验证的树木、水田等特殊成长结构不会硬套普通作物公式，而显示“数据不足”。
