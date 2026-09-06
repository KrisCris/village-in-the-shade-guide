# 游戏数据维护

适用于仓库当前快照 `24969282`。仅在更新或核对游戏数据时使用；运行网站不需要重新提取。

## 数据来源

- `data/generated/build-24969282/` 是已补充关联信息的结构化快照，不只是基础提取器的原始输出。
- `data/sources/game-*.json` 保存地图、游戏规则、食谱传授、交换和家畜等专项解析结果。
- 中文名称优先使用游戏官方繁中并转换为简中，保留日文和内部 ID。
- 物品图标由物品表引用图标表、纹理表后裁切，不按名称猜测。角色头像另取发行商人物页，见 [素材来源](assets.md)。

## 安全核对流程

需要 Python 3.11+、uv 和自己的游戏安装。以下命令经当前 CLI 参数核对；更换游戏构建时，需要先确认对应字段结构，不能直接沿用旧偏移。

```powershell
uv sync --extra dev
$gameDir = '你的游戏安装目录'
uv run honogurashi-data verify-schemas --game-dir $gameDir --build-id 24969282
uv run honogurashi-data extract --game-dir $gameDir --build-id 24969282 --output data/raw/review-24969282
uv run honogurashi-data audit data/raw/review-24969282
```

提取到被忽略的审阅目录，**不要直接覆盖正式快照**。基础提取并不重建所有专项数据；应比较变化、核对引用和单位后，再有选择地更新正式文件。原始归档和存档不提交。

验证物品图标时也先写入本地审阅目录：

```powershell
uv run honogurashi-data extract-icons --game-dir $gameDir --snapshot data/raw/review-24969282 --output output/review-icons
```

只读提取会按工具读取游戏主归档及所需子归档，不修改游戏或存档。专项脚本的输入、输出及构建假设需分别检查，不能把整个 tools 目录当成一键更新流水线。

## 更新后的检查

```sh
uv run pytest
npm run verify
```

同时抽查受影响物品的图标、商店条件、配方和反向用途。价格字段本身不能证明物品可购买；加工增值使用原料直接出售的机会成本，不等于从种子开始种植的总收益。完整限制见 [内容覆盖说明](content-coverage.md)。
