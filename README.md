# 静谧田园 Wiki

**简体中文** | [English](README.en.md)

《Village in the Shade / ほの暮しの庭》（静谧田园）的非官方资料站、收益规划工具和存档编辑器。

网站：<https://kriscris.github.io/village-in-the-shade-guide/>
支持简体中文、繁體中文和日本語。

数据直接从游戏文件提取（当前为 Steam 构建 `25311578`），名称、说明和图标与游戏一致。AppMedia 等站点只用来对照选题，不作为数据来源。

## 网站内容

- **资料库**：作物、机械、加工、料理、鱼类、角色和全部物品。可按拼音搜索，按季节、时段、钓点、品质筛选，点列标题排序。详情侧栏列出获取方式、用途、配方、商店和交付等双向关系。
- **收益规划**：比较加工增值，以及从买种到加工出售的整体收益。
- **生产工作流**：在画布上安排买种、种植、加工、留货和出售，自动推算数量、日期、土地、机器和资金。见 [生产工作流说明](docs/workflow-planner.md)。
- **每日规划**：读取存档，核对三张交付清单、加工设备和材料，列出今天该做的事：能交的交付、要加造几台设备、材料去采石场哪几层或砍哪些树、空地种什么、畜舍还能养什么，并记住你的农田范围。只读，不上传。见 [每日规划说明](docs/daily-planner.md)。
- **攻略**：四季留货、四季钓点、采石场掉落、生日与送礼、图书与神社地图、新手与系统、剧情流程、探索收集、外观、狩猎、家畜、料理、夜间准备、祠堂技能等。
- **存档编辑器**：在浏览器里读取和修改存档，导出为新文件，不上传服务器。可以编辑玩家状态、物品与容器、加工设备、家畜、NPC 好感、任务、图鉴与解锁，以及农场和室内地图。见 [存档编辑器说明](docs/save-editor.md)。

数值和条件都有游戏数据依据，还没核实的规则会在页面上注明。覆盖范围和已知限制见 [内容覆盖说明](docs/content-coverage.md)。

## 本地运行

需要 Node.js 24 LTS。浏览和构建网站不需要安装游戏或 Python。

```sh
npm ci
npm run dev        # 生成数据并启动开发服务器，地址见终端输出
```

```sh
npm run build      # 生成静态站点和 Pagefind 搜索索引，输出到 dist/
npm run preview    # 预览生产构建
```

网站是纯静态的：Astro 在构建时生成页面，React 负责筛选、规划器和编辑器等交互，Pagefind 提供搜索。部署后不需要服务器或数据库。大列表和详情数据按需加载、分批渲染；性能请用生产预览判断，不要看开发服务器。

## 检查与测试

```sh
npm test               # Vitest
npm run check          # Astro 与 TypeScript
npm run content:check  # 主题映射
npm run i18n:check     # 翻译完整性
npm run verify         # 以上全部，加生产构建
npm run check:build    # 构建后检查站内链接
uv run pytest          # 提取器测试（需 Python 3.11+ 和 uv）
```

每个 pull request 都会在 GitHub Actions 上运行 `npm run verify`、链接检查和 pytest；合并到 `main` 后再次检查并部署到 GitHub Pages。

存档编辑器的回归测试使用作者的测试存档。存档不以明文进入仓库，CI 用的是加密副本 `tests/fixtures/gamesave.tar.gz.enc`，由仓库密钥解密。没有存档时，这部分测试会自动跳过。详见 [tests/gamesave/README.md](tests/gamesave/README.md)。

## 目录结构

| 路径 | 内容 |
| --- | --- |
| `src/pages/`、`src/components/`、`src/layouts/`、`src/styles/` | 页面、组件和样式 |
| `src/domain/` | 收益计算、工作流模拟和实体关系 |
| `src/data/`、`src/lib/` | 数据读取、存档读写和通用工具 |
| `src/i18n/` | 界面语言与翻译目录 |
| `data/generated/build-25311578/` | 当前游戏快照（旧构建 `24969282` 留作对照） |
| `data/sources/` | 地图、规则、存档编辑器目录等专项数据 |
| `docs/` | 说明文档和数据核对记录 |
| `public/` | 图标、地图、场景、立绘等展示素材 |
| `src/honogurashi_extractor/`、`tools/` | 只读提取器和维护脚本 |
| `tests/` | 提取器测试和测试存档说明 |

## 更新游戏数据

需要 Python 3.11+、uv 和自己的游戏安装。提取器只读游戏文件，不修改游戏或存档。流程见 [游戏数据维护](docs/data-extraction.md)，素材来源见 [素材说明](docs/assets.md)。

## 参与

欢迎通过 issue 报告错误或提出建议，按问题类型选择对应的模板。提交代码前请阅读 [维护约定](CONTRIBUTING.md)。

## 许可

Copyright (c) 2026 _connlost。

- **代码**采用 [AGPL-3.0](LICENSE)，并有附加条款：公开部署修改版时要公开源代码、保留作者署名和本仓库链接、标明是修改版，并使用自己的站点名称。
- **攻略文字、翻译、文档和数据整理**采用 [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)：可以非商业转载和改编，但要署名“静谧田园 Wiki（作者 _connlost）”并附原页面链接，改编后用同样的许可发布。商业使用需要作者书面同意。

详细说明和署名格式见 [授权说明](LICENSING.md)。

游戏的名称、文字、图像和数据归 Nippon Ichi Software, Inc. 及相应权利人所有。本站是非官方攻略，与开发商和发行商无关。
