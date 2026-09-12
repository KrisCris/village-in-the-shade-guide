# 存档格式与存档编辑器

网页入口：`/save-editor/`（`src/pages/save-editor.astro`）。

测试准备：`npm test` 会先生成页面查询表。个人存档不提交 Git；缺少原始开发快照时，相关集成测试明确标记为跳过，
编解码、查询及搜索等独立单元测试仍运行。完整本地回归的条件见 `tests/gamesave/README.md`。

本文记录的格式全部在 `tests/gamesave/save.001`–`save.005` 与 `.systemsave` 上验证过：
六个文件都能完整解析，并且在不做修改时重新序列化后与原文件**逐字节相同**。

## 存档文件在哪

```
%APPDATA%\Nippon Ichi Software, Inc\Honogurashinoniwa\<SteamID>\
  save.001 … save.005   槽位存档，每个固定 3 MiB
  save.lst              读取界面用的摘要缓存（YKCMP type 4，未解析）
  .systemsave           全局设置与槽位索引（YKCMP type 8，固定 512 KiB）
```

游戏界面上只有 3 个槽位，但文件有 5 个：同一个槽位轮流写入这 5 个文件，
`.systemsave` 里的 `lastSaveDataIndex_`（3 个 u32，每个槽位一个）记录当前用的是哪一个。
例如 `lastSaveDataIndex_ = [3, 0, 0]` 表示槽位 1 当前读写 `save.004`。

读取界面显示的玩家名、游戏内日期和游玩时长来自 `save.lst`，不是从存档本体读的，
所以改过存档之后读取界面上的摘要可能还是旧的，进入游戏后才是新值。

## 容器：YKCMP_V1

小端序：

| 偏移 | 类型 | 含义 |
| --- | --- | --- |
| `0x00` | char[8] | `YKCMP_V1` |
| `0x08` | u32 | 压缩类型。槽位存档和 `.systemsave` 都是 `8` = 裸 LZ4 block |
| `0x0c` | u32 | 压缩数据结束偏移 |
| `0x10` | u32 | 解压后长度，槽位存档固定 `0x1400000`（20 MiB） |
| `0x14` | … | LZ4 block，没有 frame、没有内嵌长度字段 |

文件长度固定，压缩数据之后的字节游戏不读；导出时保持原长度即可。
20 MiB 缓冲区里只有前面一段是有效数据，其余是 0。
`save.lst` 是压缩类型 `4`（YKCMP 自己的 LZ77），这个工具不处理。

## 载荷：SER 容器

解压后是一棵带名称表的节点树。

| 偏移 | 类型 | 含义 |
| --- | --- | --- |
| `0x00` | char[4] | `SER\0` |
| `0x04` | u32 | 保留，观察到的存档里都是 0 |
| `0x08` | u32 | 已使用长度 = 头 + 节点树 + 名称表 |
| `0x0c` | u32 | 名称表偏移 |
| `0x10` | … | 根节点（`SAVEDATA` 或 `SYSTEMSAVEDATA`） |

名称表是一串以 `\0` 结尾的字符串，节点通过字节偏移引用其中一条。
这些名字来自游戏二进制里的反射表，所以字段名就是 C++ 成员名（`money_`、`loveRate_`…）。

### 节点

```
[tag u8][nameOffset u32][size u32] (+ [ref u32]) [payload ...]
```

`ref` 只有 tag 1/3/4 有，并且**不计入 `size`**，所以一个节点占
`9 + (有 ref ? 4 : 0) + size` 字节。

| tag | 名称 | payload | ref |
| --- | --- | --- | --- |
| 0 | scalar | 定长数值，实际只见过 1/2/4/8 字节 | — |
| 1 | blob | `ref` 个定长元素连成一段字节 | 元素个数 |
| 2 | object | 一串子节点 | — |
| 3 | list | 一串子节点；数组时 `ref` == 子节点数，Map 时子节点是 `0k`/`0v`/`1k`/`1v`… 共 `ref * 2` 个 | 元素个数 |
| 4 | pointer | 0 个（空指针）或 1 个子节点（被指对象，名为 `p`）；多态指针额外在前面带一个 `className` 字符串 | 见下 |
| 5 | string | `[长度 u32][UTF-8][\0]` | — |

**指针的 `ref` 是文件偏移**：

- `ref == 节点自身的偏移`：这个指针拥有后面的对象（`save.003` 里有 11,736 个）；
- `ref == 0xFFFFFFFF`：空指针，payload 为空（16,644 个）；
- 其他值：指向另一个已经序列化过的节点头偏移，payload 为空。五个存档里各只有 1 个，
  都是 `pStatus_`。

这条是改存档时最要紧的一点：**任何长度变化都会让后面所有节点的偏移改变，所有指针
`ref` 都必须跟着改写**。编辑器就是这么做的，所以名字、品牌名可以改成任意字节长度。

### 已确认的字段

```
SAVEDATA
├── version_                          scalar i32
├── playTime_                         object  date_/hour_/minute_/second_/frame_/wholeframe_ (i64)
├── revision_                         string
├── flags_/flags_                     blob    1563 × 8 字节
├── gameValues_                       list    Map，value 是 {min_, max_, this->value_}
├── gameTime_/second_                 scalar i64，游戏内累计秒数
├── money_/this->value_               scalar i64
├── offeringMoney_/this->value_       scalar i64
├── pWeatherData_/dataID              scalar i64，对应 weather 资料表
├── pPlayerStatus_/p
│   ├── name_ / dogName_              string
│   ├── hp_                           object  min_/max_/this->value_（生命）
│   ├── st_                           object  min_/max_/this->value_（体力）
│   ├── pBackHairStyle_/dataID …      scalar  外观资料表 ID
│   ├── crothingColor_ 等             scalar i32，配色编号
│   └── *RangeLevel_                  scalar i32，工具范围等级
├── inventoryItemList_ / toolItemList_   list，每项是指针，空格子是空指针
│   └── p: pData_/dataID（物品 ID）、stackCount_/this->value_、rank_、qualityUpValue_
├── gimmickList_                      世界上的所有物件；带 itemList_ 的就是容器
│   └── p: pData_/dataID（设施种类）、name_（玩家起的名字）、itemList_（格子）
├── livestockList_ → p                name_、pData_/dataID（种类）、loveRate_、moodRate_、
│                                     foodNum_、growStatus_、isSold_
├── npcStatusList_ → p                pData_/dataID（角色）、loveRate_、scheduleTaskIndex_
├── brandCropsNameMap_                Map：key 是收获物的**物品 ID**，value 是品牌名字符串
└── brandLivestockNameMap_            同上（样本里为空）
```

`gameTime_/second_` 的换算（和游戏内显示对得上）：一天 86400 秒，一季 28 天，一年 4 季，
季序为春夏秋冬；一天从 07:00 开始，所以整除 86400 余 0 时显示 07:00。
`save.004` 的 `7344000` = 第 1 年冬 2 日 07:00，与游戏读取界面一致。

### 生命与体力（2026-09-12 原始表复核）

`gamedefine.dat` 明确定义以下常量，不再依赖单个存档的 HUD 采样：

| 常量 | 值 | 含义 |
| --- | --- | --- |
| PLAYER_STATUS_HP_INITIAL_VALUE | 12 | 初始生命 |
| PLAYER_STATUS_HP_MAX_VALUE | 40 | 生命最大值 |
| PLAYER_STATUS_HP_HEART_MAX | 4 | 每颗心的生命 |
| PLAYER_STATUS_HP_HEART_COUNT | 10 | 心数上限 |
| PLAYER_STATUS_ST_INITIAL_VALUE | 190 | 初始体力 |
| PLAYER_STATUS_ST_MAX_VALUE | 950 | 体力最大值 |
| PLAYER_STATUS_ST_GAUGE_MAX | 190 | 每段体力 |
| PLAYER_STATUS_ST_GAUGE_COUNT | 5 | 体力段数上限 |

编辑器使用按整心／整段的上限选择和当前值滑块。降低上限会同步降低超出的当前值；
导出也独立检查当前值不得超过待写入的新上限。原生 HUD 心形／体力条素材还未定位，
当前控件不冒充游戏 HUD 的复刻。

**计划更正：** `gameValues_` key 60 是 `GAME_VALUE_SLEEP_HOUR_1_AGO`（前一天就寝时间），
不是心数。当前安装包的 `updatelevel.dat` 与 `gamesystemvalue.dat` 都仅有 12 个零字节，
没有可用记录；后续工具升级关系需要从实际脚本／其他表继续核实。

### 好感、物品等级与数量

同一常量表中的 `NPC_LOVE_LEVEL1_MAX` 到 `NPC_LOVE_LEVEL6_MAX` 为
100、300、600、1000、1500、2100，总上限 `NPC_LOVE_MAX=2100`。
因此不能用固定的“每颗心多少点”换算；滑块按原始点数编辑，心形在相邻阈值之间填充。
心形素材来自 `ICON_ID_INTANGEBLE_POPUP_LIKABILITY`，是游戏的好感图标。

家畜则同时存在 `LIVESTOCK_LOVE_RATE_MAX=2000` 与
`LIVESTOCK_LOVE_RATE_MAX_EASY=1500`（描述为鸡等）。哪些种类用哪一套、犬的换算与
每颗心阈值尚未证实，不能直接套用 NPC 规则。

物品等级为 `ITEM_RANK_NORMAL=0`、`COPPER=1`、`SILVER=2`、`GOLD=3`、`BRAND=4`。
最后一级原始名为“品牌”，不是一个另定义的 PLATINUM 枚举。对应原生等级图标为
`icon.dat` ID 1023–1026，纹理 `itemicon_rank01.nltx`；裁切坐标见
`public/icons/generated/ui/sources.json`。
`qualityUpValue_` 的含义仍未证实，主界面隐藏并保留原值。
`ITEM_STACK_MAX=999` 是全局堆叠上限；类型专属限制（尤其工具、机器）仍需进一步核实。
`MONEY_MAX=99999999` 是明确的金钱常量。

### 收纳箱与设备

游戏里的收纳箱**不是**根节点上的 `shippingBoxItemList_` 那一组 —— 那几个列表在
六个存档里都是空的（count 0）。真正的容器是 `gimmickList_` 里带 `itemList_` 的条目：

| 字段 | 含义 |
| --- | --- |
| `pData_/dataID` | 设施种类。`241000000` 是收纳箱（30 格），`241000400` 是另一种箱子 |
| `name_` | 玩家给箱子起的名字，没改过就是空字符串 |
| `itemList_` | 格子列表，长度就是这个容器的格数 |

`save.004` 里有 13 个收纳箱、179 个带格子的设备（蜂箱、采集器、晾晒架之类，多数是空的）。

背包、工具栏和容器里的物品对象结构完全一致（逐个字段比对过：tag、名字、长度都相同），
所以同一套网格可以渲染全部容器：

```
p: uniqueID_、pData_/dataID（物品 ID）、stackCount_/this->value_（数量）、
   rank_、qualityUpValue_、effectList_、exchangeItemID_、state_、pos_ …
```

物品对象里没有任何 tag 4 指针，所以可以整份复制到别的格子里 —— 空格子就是这么填的：
克隆一个已有物品，改掉 `pData_/dataID`、数量、rank、品质加成，再从
`statusUniqueIDGenerator_/idSeed_` 取一个新的 `uniqueID_`（`idSeed_` 等于树里最大的
`uniqueID_`，每发一个就加一）。

其余根字段（`gimmickList_`、`mapStatusMap_`、`questMap_`、`encyclopediaReleaseMap_` 等）
结构能完整解析，但语义没有逐个验证，只在「完整字段树」里按原样展示。

## 代码结构

| 文件 | 作用 |
| --- | --- |
| `src/lib/saveEditor.ts` | YKCMP 容器：LZ4 编解码、`decodeSave`、`encodeSave` |
| `src/lib/ser.ts` | SER 树：解析、取值、`serializeSer`（重排偏移并改写指针） |
| `src/lib/saveModel.ts` | 字段模型：分类 schema、列表视图、改动收集、导出 |
| `src/lib/saveItems.ts` | 容器模型：背包 / 工具栏 / 收纳箱 / 设备，以及填格子用的物品合成 |
| `src/lib/saveNames.ts` | 数字 ID → 名称与图标查表，数据来自 `public/save-editor-names.json` |
| `src/components/save/` | React 界面：分类页签、十列物品网格与格子编辑器、完整字段树 |
| `tools/save_format.py` | 不依赖第三方库的 Python 参考实现，用来独立验证 |

`public/save-editor-names.json` 由 `npm run build:data` 生成，只含
items/characters/livestock/crops/weather/facilities 的 `numeric_id → 名称 + 图标`
（约 200 KB），避免为了标注几个 ID 去下载 6 MB 的完整资料库。

```json
{
  "iconBase": "/icons/generated/items/",
  "iconExt": ".webp",
  "names": { "items": { "230000": "木材" } },
  "icons": { "items": { "230000": "ITEM_ID_OBJECT_WOOD" },
             "characters": { "1010": "/portraits/official/CHARA_ID_ORPHAN.png" } }
}
```

图标存的是去掉公共前后缀的词干，读的时候拼回 `iconBase + 词干 + iconExt`；
以 `/` 开头的值是完整路径（角色立绘在别的目录）。2 856 个物品全都有图标，
天气和设施没有，这时 `lookupIcon` 返回 `null`，界面就只显示名字。

## 验证方式

```bash
npm test -- src/lib/ser.test.ts src/lib/saveEditor.test.ts src/lib/saveModel.test.ts
python tools/save_format.py verify tests/gamesave/save.00* tests/gamesave/.systemsave
```

测试覆盖：六个真实存档的逐字节往返、改变字符串字节长度后整棵树仍然自洽、
所有指针 `ref` 指向真实节点头、字段值与游戏内显示一致、导出后重新读取得到新值。

游戏内验证：把一个改过玩家名（`losty` → 更长的名字）、牲畜名（缩短）、金钱和好感的
`save.003` 重建版本放进槽位读取，游戏正常进入世界，金额显示为改后的值，
物品栏、体力、日期等其他状态完全正常 —— 说明偏移重排和指针改写是对的。

## 限制

- 只支持 type 8（LZ4）容器；`save.lst` 的 type 4 没有实现。
- 结构性改动只支持物品格：可以往空格子里放物品，也可以清空某一格。
  其他列表（牲畜、NPC、任务等）仍然只改值，不能增删条目。
- 被别的指针别名引用的节点不允许替换。六个存档里这样的节点只有一个
  （`pConstructionStatus_/pStatus_` 指向 `gimmickList_` 里的一项），不是物品格，
  但导出时仍然会检查。
- 数值字段的整数/浮点区分来自 schema；「完整字段树」里未归类的数值同时给出浮点读法，
  由使用者自己判断。
- 不会更新 `save.lst`，读取界面上的摘要在进游戏前仍是旧的。

## v2 第一批实现与验证（2026-09-12）

- 浏览器会话草稿：原始压缩文件按 SHA-256 存在 IndexedDB，名称、字节数、摘要、字段草稿、
  结构性格子草稿及当前页签存在 sessionStorage。恢复时重新解码并核对 SHA-256 和格子地址；
  不同文件或不兼容草稿不会被应用。存储被禁用／清理时显示错误，用户仍可本地编辑并导出。
- 物品选择器共享分类与按 80 条连续加载；保留“加载更多”按钮供键盘和没有 Observer 的环境使用。
  分类来源是现有 catalog 的 category_id/category_name，未按名称猜分类。
- 天气使用同一可搜索选择器；NPC／物种名称在 ID 前显示；收纳箱可改名，待写入列表可逐项撤销。
- 外观解析覆盖六张表，共 92 组。前发型物品列偏移 112、后发型 136；服装 200、头饰 240、
  颈饰和背饰 148，配色槽均为 10 个 u64，发型只有 1 个；解锁标记紧随物品列。
  配色保留原索引，不把空项过滤后的序号当作颜色。当前背饰只有“无背包”。
  未解锁外观显示并禁用，尚未提供直接解锁功能；发色使用 HSV ↔ RGB 颜色选择器。
- 导出检查支持完整心／体力段、修改后的当前值上限、合法外观配色、1–999 数量和 0–4 等级。
  增加金钱、NPC 满好感、品牌物品会要求确认永久成就风险；这是保守提示，不是声称已查明成就触发阈值。
- 工具层级联动、机器真实输入和计时、家畜房舍／新增、图鉴、技能、配方和任务编辑仍待后续实现。
  原生 HUD 素材、家畜好感的种类差异尚待 RE，不能把这批工作视为完整 v2。

可重复提取（游戏目录仅只读）：

```powershell
python tools/extract-save-editor-rules.py --game-dir '<游戏目录>' --output data/sources/game-save-editor-rules.json
python tools/extract-save-appearance.py --game-dir '<游戏目录>' --output data/sources/game-save-appearance.json
.venv/Scripts/python.exe tools/extract-save-editor-icons.py --game-dir '<游戏目录>' --output public/icons/generated/ui
```

验证：全套 Vitest 359 项通过；Astro 检查零诊断，生产构建通过，5180 页链接检查零错误。新增测试覆盖原始文件指纹不匹配、草稿恢复的导出一致性、
色彩换算、全部外观到物品的关联、箱子改名、跨字段上限以及非法输入。
浏览器用真实文件的只读副本修改玩家名、犬名、金钱（60083→60082）及背包第 20 格（木材×3），
离开到 `/data/items/` 再返回。离开前、恢复后和 Node 独立导出的 SHA-256 一致：
`78dccf390244d1074cf3890227a86fa9d35da04324c46767158c69ab085a31a3`。
Python 独立解析：194071 节点，used=2595956，roundtrip/repack 均通过。
未修改真实存档、未运行游戏、未更新 Steam 进度。


## 2026-09-12 v2 第二轮：UI 与联动修正

本节覆盖前一批的旧结论。所有游戏文件均只读；真实存档目录未写入，未启动游戏验证修改档。

### 确认的逻辑

- **工具**：item.dat 的等级为 1–5，不能用 ID 尾数当等级。原生升级代码
  `0x140329AE8/0x140329B15/0x140329B46` 把 ItemData+0x154 分别写入锄头、犁、水壶的范围。
  `0x14021F9E7` / `0x1402208EC` 证明存档保存的是当前选择范围，玩家可以切换为较小范围。
  因此仅在更换同类工具等级时同步范围；未改工具时保留原范围。玩家页不展示内部范围等级。
- **发色**：shader_1_00.dat 内 hsv.fxdat 的 DXBC 反汇编显示，发色向量是纹理 HSV 的调整参数：
  H 相加并回绕、S 和 V 相乘。`(0,1,1)` 保留原始金发，直接 HSV→RGB 会错误显示红色。
  预览颜色取自 hairf_0020_1_01.nltx 的实际纹理采样，按同一算法变换；不是完整发型渲染。
- **加工**：原生 `GimmickProcessPushItem` → `0x14026EF20`；`timeValue_` 为开始秒数，
  `createTime_` 为加工持续秒数。每项任务保留 8 个内部原料指针，升级设备最多 3 项任务。
  `itemID0..2` 是**产物**，`itemVal0..2` 是产物数量。立即完成修改开始时刻，不把持续时长清零。
  新增加工使用 gimmickprocess.dat 的合法配方，普通品质、独立 uniqueID，明确不扣背包材料。
  非配方加工类设施（蜂箱等）不再开放任意箱子编辑。
- **动物**：`LivestockGetLoveLevel` → `0x14010AA80` 检查物种和运行时 feature 11；每心
  300 或 400 点，均最多 5 心。狗狗为 400 点／心。心情限制 0–255，喂食为开关。
  `0x14013BB50` 和 `0x14013AD30` 确认可用安置位由 requires/excludes 建筑标记决定。
  `0x1401050A0` 确认畜舍／禽舍 basePos 为地图原点加安置位坐标。实际 save.004 对应 4 格畜舍、8 格禽舍。
  移动同步安置 ID、地图组、当前位置及家位置；新增动物使用普通动物结构模板，按目标品种初始化（见下方 2026-09-13 补充），清理临时状态，分配新 ID。
- **任务**：`CQuestStatus` 的 `checkLevel_` 位于 +0x18，`state_` 位于 +0x1c。
  `0x1401338E0` 按 checkLevel **大于** CheckInfo 阈值判定勾选。
  GameHideQuest (`0x14045B980`) 写状态 0；显示入口 `0x14013CF50` 写 1；完成状态为 3。
  UI 可编辑已有任务的显示及清单记录，不篡改无关剧情 flags，也不会补发奖励。
- **解锁**：图鉴增删 map 键值对，技能增删 skills_ 指针并联动对应 flag；配方及外观只更改对应 flag 位。
  SER 写入器保留原名称表并按需追加名称，重新计算所有节点长度和指针。

### 界面与验证

天气／物品／发色使用统一模态框，不参与主页面布局。容器选单在箱名之前。
修改清单移至导出预览；连续拖动滑条时位置固定。工具使用同类升级卡片，机器使用真实加工栏位；动物使用建筑安置位。
外观支持“解锁并使用”，生命心形、体力图标、物品星级及 27 种动物图标来自原游戏素材。

可重复提取新增数据：

```powershell
.venv/Scripts/python.exe -X utf8 tools/extract-save-v2-catalogs.py --game-dir '<游戏目录>' --output-dir data/sources
.venv/Scripts/python.exe -X utf8 tools/extract-save-editor-icons.py --game-dir '<游戏目录>' --output public/icons/generated/ui
.venv/Scripts/python.exe -X utf8 tools/save-probes/native.py function 14026ef20
```

浏览器检查覆盖 390/768/1440px 下全部 9 个页签，未发现页面横向溢出；检查了深浅主题、天气和物品弹窗边界、
20 步连续滑条拖动、物品超过 80 条的加载、容器名称顺序、空位添加和导出确认。
最终回归：73 个测试文件、374 项测试全部通过；Astro 检查零错误、零警告；生产构建和 5180 页链接检查通过。
补充检查了清空物品不会弹出选单、撤销后表单恢复、移动端动物图标与弹窗、工具升级合并显示及关联撤销。

复合回写场景：普通犁升级为陨铁犁并同步范围到 5、完成一个已有加工任务、空位新增鸡、图鉴发现陨铁犁、解锁配方。
浏览器首次导出／导航恢复后导出／Node 独立导出逐字节一致，SHA-256：
`6d5dc15171ecb5133d0fb74e94b2c92bc6125e71d686db0c1f33127a074d83b1`。
Python 独立验证：194081 个节点，used=2596081，roundtrip/repack 均通过。

### 神龛技能树与村长交付目录（2026-09-12）

- `tools/extract-save-unlocks.py` 提取全部 80 个节点（31 个技能效果及 49 个配方／能力节点），而非只按效果 ID 筛选。
  `skilltree.dat` 的有符号坐标在 24/28，图标在 32，效果 ID 在 40，三个前置 ID 在 48/56/64，修缮等级在 72。
  76 是 showFlag 数组长度，后续字段按数组长度移动；releaseFlag 在 80，hideHorrorOffMode 在 88，六项材料成本在 92 起。
  原生序列化 `0x140025FB0` 确认字段；`0x140576380` / `0x140576477` 检查修缮等级、恐怖模式、显示标记和全部前置节点。
  `GAME_VALUE_SHRINE_LEVEL=20000000`，读取 `gameValues_` 中的对应值。界面不自动修改修缮等级或剧情。
- 技能树保留实际坐标和连线，支持拼音搜索、定位、缩放和拖动；解锁补齐前置，锁定联动后继。
  `skills_` 与 flags 同步，配方列表修改对应神龛节点时也走同一联动。空技能列表可按已核实的原生五节点结构添加技能。
  19 个节点图标沿 `icon.dat -> texture.dat -> NLTX` 提取，以原图透明度蒙版适配深浅主题。
- `bundlegroup.dat` 中 12–20 对应村长 9 册目录、35 组、100 个材料项。每组最多 3 种材料。
  **材料结构是 itemId u32、rank u32、count u32**；不能将前两项误读为 u64，高品质作物／畜产品／家畜毛要求 rank=4。
  只修改 `bundleList_/.../p/bundleItems_/.../remain_`，保持物品、品质和其他节点原样；已交付数量以“所需数量减剩余数量”显示。
  读取时同时核对物品 ID、品质和标量宽度，导出限制整数范围 0…所需数量。
- `gimmick_bundle_purple_pink/orange_yellow/white_black/green_blue.lub` 的可见性及碰撞检测受 `GAME_FLAG_STORY_02_022` 控制。
  “开放村长家的交付目录”只设置这个标记。初始“协助林”册也可查看、编辑已有交付记录。
- `0x1403314E0` 在交付时递减 remain；`0x140331A90` 检查当前组全零后进入领奖回调；`0x140331C40` 发奖并记录交付完成，
  `0x140332200` 扫描整册，全部交付后设置 `bundlegroup.completeFlag`（原生 +0xa0）并触发 eventID（+0xa8）。
  编辑器按实际数量联动整册完成标记，但不伪造交付事件、成就计数或补发奖励。提供“留最后一件”让玩家在游戏里完成最后一次交付。
  重新减少交付数量会清除这册完成标记；不会回收已领取物品或回滚已发生剧情。

复现目录提取：

```powershell
.venv/Scripts/python.exe -X utf8 tools/extract-save-unlocks.py --game-dir '<游戏目录>' --output data/sources/game-save-unlocks.json
```

验证包含：80 个节点连线和分支联动、空技能列表重建、100 项交付映射、品质保留、完成标记、非法数量拒绝，以及真实浏览器拼音查询、
深浅主题与 390px 窄屏布局、修改后会话恢复和两次导出。全程只读原始 `tests/gamesave/save.004`，编辑副本输出到忽略的 `output/save-v2`。
浏览器首次导出、恢复后导出、Node 独立导出逐字节一致，SHA-256 `c9c2b320da1ce681207c3f1518bc242d59d0db50e5386d5956725da0dfa16faf`。
Python 独立验证：194042 个节点、used=2595593，roundtrip / repack 均通过。
本轮回归：75 个测试文件、384 项测试通过；最后的技能联动调整另经 13 项针对性测试验证。Astro 检查零错误／警告，生产构建成功，5180 页、6242 条路径的链接检查零错误。

### 畜牧品种与画布交互（2026-09-13）

- 禽舍增加完整的 20 种品种／毛色／成长形态选择，包括火鸡、彩色小鸡和公鸡；畜舍也按毛色分别展示。
  列表支持拼音及首字母，现有动物的图标按存档 `pReplaceTexData_` 对应毛色显示。名字与搜索框统一主题样式。
- `livestock.dat` 的成长天数在 64、成年物种 ID 在 68。features 计数在 92；跳过 features 和产物数组后，
  三项替换纹理在 tail+20、图标在 tail+44、对应物品在 tail+100。保留实际槽索引，不能过滤后重编号。
- 原生 `0x140104380` 初始化动物状态，`0x140292DB0` 的创建入口按 variant 索引选取替换纹理；
  `0x140292F52` 读取的正是 `LivestockData+0x180+variant*8`。
  新增时写入目标物种、替换纹理、名字、唯一 ID 和安置坐标，成长天数、好感、心情、进食和临时行为清零。
  `0x140104590` 会按目标物种重建动画；`0x1401046A4` 重写包围盒，因此新增对象不沿用其他物种的边界。
- 成长逻辑 `0x14010664B` 起：进食后递增成长值，达到阈值时换成成年物种；先匹配幼年纹理槽，再取成年物种的同一槽。
  咖啡小鸡对应纹理 609，成长 5 天后切到成年鸡的同槽纹理 620。运行时特性清零，表中固有特性由原生初始化重建。
- 技能树从下向上展开。画布滚轮以鼠标为中心缩放（35%–180%），支持拖动和定位；点击节点显示可关闭的悬浮详情，
  不再预留右侧栏。详情内容独立滚动，窄屏保持在画布边界内。移除体力图标与“每级需求递增”文案。
- 一并修正通用提取脚本中技能节点 showFlag 变长数组的偏移处理；重新提取的动物、技能目录与已保存数据一致。

验证：75 个文件、386 项测试通过；Astro 检查零诊断，生产构建成功，5180 页／6242 条路径链接检查零错误。
浏览器实测 1440px／390px、深浅主题、品种搜索、名字输入、鼠标锚点缩放、拖动、悬浮窗和 Escape 关闭。
新增火鸡及咖啡色小鸡后，首次导出、刷新恢复后导出、Node 独立导出逐字节一致，SHA-256：
`def1992c2cffd71fdf07abe1f8a3127d702718be52a328e4513569837dcb7c37`。
Python 独立解析为 194121 节点，used=2596586，roundtrip / repack 均通过。
原始 `save.004` SHA-256 仍为 `42931814b9f00a0565e8b588b308617b135fc93bde2fa15efedd34bd47275370`。

### 其余边界

- 新增普通动物不再要求存档已有同种动物，但仍需至少一个普通动物作为序列化结构模板；剧情特殊生物不开放新增。
- 马厩／狗窝使用场景骨骼挂点，与畜舍／禽舍的坐标规则不同；目前支持好感等属性，不支持它们的跨位置安置。
- 任务清单不是完整剧情状态机；任意剧情跳转、补发剧情奖励没有实现。
- 发色是实际纹理采样预览；完整角色实时换装渲染没有实现。体力段是网页控件，并非复制完整 HUD 动画。
- 离线结构验证不能替代游戏内加载行为验证；本次刻意没有启动游戏或触碰真实 Steam 存档。
