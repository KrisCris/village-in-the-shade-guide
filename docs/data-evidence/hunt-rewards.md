# 狩猎证明报酬：抽取次数与权重

在构建 25640656（village.exe sha256 979aebe3…）上核对。只依据 `huntreward.dat` 和 village.exe 的代码，没有实测抽取结果。

## 表结构

village.exe 把 `data/database/huntReward.dat` 读成 `HuntRewardData`，序列化字段名和 88 字节记录的对应关系如下：

| 字节 | 字段 | 说明 |
| --- | --- | --- |
| 0 | `ID` | 记录编号 |
| 8、12 | `enumName` | 内部名（HUNT_REWARD_*）的字符串偏移和长度 |
| 16 | `certificateID` | 狩猎证明的物品 ID |
| 20 | `dropNum` | 每张证明抽取的次数 |
| 24–71 | `reward` | 固定 4 个 `Reward`，每个 12 字节：`ID`（物品）、`Num`（数量）、`Rate`（权重） |
| 72–87 | `version`、`region`、`product`、`platform` | 当前数据全为 0 |

`reward` 的类型是 `CFixArray<Reward, 4>`。字节 20 不是报酬条数：例如狐狸的 `dropNum` 是 4，但只有 3 个非空报酬；熊的头目是 9。旧提取器把它当作条数，碰巧没有读错报酬，但会把字节 72 以后的字段当作报酬槽。

## 抽取逻辑

两条交证明的路径用同一套逻辑：

- 手持证明放进猎人小屋的小箱子：`gimmick_indoor_huntinglodge_filing_box.lub` 调用 Lua 函数 `ItemPushCertificate`（包装函数 0x1404b7b80），实现位于 0x14026b320。
- 交付菜单（`mapevent_huntinglodge_submit.lub` 打开 `CTask_Menu_SubmitCertificate`）：提交循环位于 0x140432cd0，按选中的每一叠证明、每一张证明重复同样的抽取。

`huntReward.dat` 只有这两处读取（取表函数 0x14002c580 只有这两个调用点）。每张证明的处理：

1. 按 `certificateID` 找到记录。
2. 把 `ID` 不为 0 且 `Rate` 大于 0 的报酬槽放进候选列表，同时累加 `Rate` 得到总权重。
3. 循环 `dropNum` 次：用 0x1406808c0（MT19937，结果缩到 0 到总权重减 1）取随机数，加 1 后沿候选列表累加 `Rate`，取第一个累计值不小于它的报酬。
4. 每次抽中都生成 `Num` 个该物品（按该物品数量的上下限截断），放入奖励箱。

所以每次抽中某项的概率是 `Rate / 总权重`，各次独立，可以重复。一张证明至少抽中一次的概率是 `1 − (1 − Rate / 总权重)^dropNum`。当前 12 条记录的总权重都是 100。

小箱子路径还有两项检查：手上选中的物品分类不是狩猎证明时提示 `LOG_NO_CERTIFICATE_ITEM`；奖励箱现有条目数加 `dropNum` 超过 30 时不收这张证明，提示 `LOG_FULL_HUNT_REWARD_BOX`（“先整理奖励箱吧。”）。

## 举例

绿雉的狩猎证明（155060）：`dropNum` 3，报酬为小动物的骨头 50、野生小动物的肉 40、绿雉的饰羽 10。每次抽到饰羽的概率是 10%，一张证明至少拿到一根饰羽的概率是 1 − 0.9³ ≈ 27.1%，平均每张 0.3 根。

## 复查方法

完整的 REA 或 Ghidra 分析会超时。可以在 `.text` 中找引用字段名字符串（`dropNum`、`ItemPushCertificate`）的 RIP 相对地址，再用 `objdump -d --x86-asm-syntax=intel --start-address/--stop-address` 只反汇编附近范围；游戏 Lua 脚本用 `tools/inspect-lua54.py` 查看。提取器的读取见 `src/honogurashi_extractor/normalize_world.py` 的 `_normalize_hunt_rewards`。
