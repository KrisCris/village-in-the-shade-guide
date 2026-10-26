# 游戏数据维护

**简体中文** | [English](data-extraction.en.md)

只在游戏更新或核对数据时需要。浏览和构建网站不需要重新提取。

## 数据在哪

| 路径 | 内容 |
| --- | --- |
| `data/generated/build-25311578/` | 当前快照：基础提取结果加上补充、核对过的关联信息 |
| `data/generated/build-24969282/` | 上一构建的快照和表结构，留作对照，不再更新 |
| `data/schemas/build-25311578/` | 核对过的表字段偏移 |
| `data/sources/game-*.json` | 专项解析：地图、游戏规则、钓鱼、采石场、食谱传授、交换、家畜、设备容量、存档编辑器目录等 |
| `data/sources/` 其余文件 | 站点素材来源、官方头像来源等参考数据 |

构建 `25311578` 起游戏自带简体中文，名称和说明直接用官方简中；官方缺失时才从繁中转换。日文、繁中、韩文和预留语言槽按原表顺序保存在 `translations` 中，内部 ID 不变。

`npm run build:data`（`tools/build-site-data.ts`）把快照和专项数据整理成网站用的 JSON，`npm run dev`、`npm test`、`npm run build` 都会先运行它。

## 提取流程

需要 Python 3.11+、uv 和自己的游戏安装。所有工具只读游戏文件，不修改游戏或存档。

`honogurashi-data` 和 `tools/` 下的脚本都用 `--game-dir` 指定游戏目录。不指定时，依次读取环境变量 `HONOGURASHI_GAME_DIR` 和 Steam 的库列表（`libraryfolders.vdf`）自动查找；通过 Steam 安装的游戏一般不用设置。

```powershell
uv sync --extra dev
uv run honogurashi-data verify-schemas --build-id 25311578
uv run honogurashi-data extract --build-id 25311578 --output data/raw/review-25311578
uv run honogurashi-data audit data/raw/review-25311578
uv run honogurashi-data extract-icons --snapshot data/raw/review-25311578 --output output/review-icons
```

`honogurashi-data` 还有 `diff`（比较两个快照）、`inspect-archive`、`inspect-table` 和 `probe` 等子命令，用于研究表结构。

提取结果先放进被忽略的审阅目录，**不要直接覆盖正式快照**。基础提取不会重建所有专项数据，需要比较变化、核对引用和单位后，再有选择地更新正式文件。

## 换新构建时

游戏新增语言槽或改表后，多数表的字段和嵌套列表步长都会移动。先用 `verify-schemas` 确认结构，必要时在 `data/schemas/` 下新建该构建的偏移记录，不能沿用旧偏移。

## 专项工具

`tools/extract-*.py` 各自负责一类数据，针对特定构建写成，输入、输出和假设要逐个检查，不能当作一键更新流水线。多数脚本直接写入 `data/sources/` 下对应的文件，运行前确认工作区干净，运行后用 `git diff` 核对。

| 类别 | 工具 |
| --- | --- |
| 地图与探索 | `extract-map-markers.py`、`extract-exploration-markers.py`、`extract-night-pickups.py`、`extract-farmland.py`、`extract-quarry.py`、`extract-fishing.py` |
| 规则与经济 | `extract-game-rules.py`、`extract-machine-capacities.py`、`extract-livestock-products.py`、`extract-shrine-materials.py`、`extract-kappa-exchange.py`、`extract-night-exchanges.py`、`extract-construction.py`、`extract-sap-trees.py` |
| 食谱与外观 | `extract-recipe-documents.py`、`extract-recipe-lessons.py`、`extract-appearance-groups.py` |
| 存档编辑器 | `extract-save-editor-rules.py`、`extract-save-appearance.py`、`extract-save-unlocks.py`、`extract-save-v2-catalogs.py`、`extract-save-map.py`、`extract-save-editor-icons.py` |
| 图像 | `extract-map-art.py`、`extract-crop-growth.py`、`extract-scenery.py`、`extract-portrait-models.py`、`extract-portrait-options.py`；见 [素材说明](assets.md) |
| 研究 | `inspect-lua54.py`、`save_format.py`、`save-probes/` |

## 更新后检查

```sh
uv run pytest
npm run verify
```

再抽查受影响物品的图标、商店条件、配方和反向用途。价格字段不能证明物品可以购买；加工增值按原料直接出售的机会成本计算，不等于从种子开始的总收益。限制见 [内容覆盖说明](content-coverage.md)，钓点名称的引用链见 [`data-evidence/fishing-locations.md`](data-evidence/fishing-locations.md)。

原始归档和存档不提交。
