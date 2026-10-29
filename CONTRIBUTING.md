# 维护约定

**简体中文** | [English](CONTRIBUTING.en.md)

欢迎提交 issue 和 pull request。贡献按项目对应部分的许可发布：代码按 AGPL-3.0，文字和翻译按 CC BY-NC-SA 4.0，你保留自己贡献的著作权。见 [授权说明](LICENSING.md)。

## 开发环境

- Node.js 24 LTS，用 `npm ci` 安装。依赖变化时同时提交 `package-lock.json`。
- 改提取器或工具时需要 Python 3.11+ 和 uv：`uv sync --extra dev`。Python 依赖锁定在 `uv.lock`。
- 临时输出放在被忽略的 `output/` 或 `.local/`，不要提交。

## 提交前

- 运行 `npm run verify`；改动提取器时再运行 `uv run pytest`。pull request 会在 CI 上自动跑同样的检查。
- 界面改动要在生产预览（`npm run build && npm run preview`）里检查桌面和手机宽度、深浅主题、键盘操作和焦点样式。
- 提交保持专注，信息采用 `fix(save-editor): …`、`feat(tables): …` 这样的格式。pull request 写明改了什么、怎么验证的，界面改动附截图。

## 数据

- 游戏数据是唯一依据。保留内部 ID 和构建号；AppMedia 等外部站点只能用来找线索，不能代替游戏字段。
- 有价格字段不等于商店有卖；一次随机交付不等于固定需求。没核实的规则要在页面上写明。
- 加获取或用途关系时，同时检查反向关系（物品 ↔ 配方 ↔ 机器 ↔ 商店）。
- 收益计算区分加工增值和从种子开始的总收益，写清产量、季节、品质、重复收获和机器时间等假设。
- 图标按游戏表的引用链提取，不按名称猜，也不用相似图片代替。
- 不要用基础提取结果直接覆盖 `data/generated/` 里已补充、已核对的快照。

## 代码

- TypeScript 和 Astro 用两空格缩进，Python 用四空格。组件文件名用 PascalCase，函数用 camelCase。TypeScript 保持 strict。
- 站内链接、素材路径和 `fetch` 一律经过 `src/lib/sitePath.ts` 的 `withBase`，不要把部署前缀写进数据。
- 界面使用项目已有的主题控件（输入框、可搜索下拉、按钮），不要露出浏览器默认样式的控件。
- 大列表要分批渲染、按需加载，筛选作用于完整数据，不能把整份数据塞进静态 HTML。
- 页面上的文字一律经过 `tr()` / `t()`，并在 `src/i18n/catalogs/` 补齐日文（`ja.json`）和英文（`en.json`）翻译，繁中由同步脚本生成；`npm run i18n:check` 会拦下遗漏。
- 测试与模块放在一起（`*.test.ts`），Python 测试放在 `tests/test_*.py`。

## 不要提交

存档（加密的 `tests/fixtures/gamesave.tar.gz.enc` 除外）、密钥和 `.env`、原始游戏归档和完整解包目录、抓取缓存、截图日志、`node_modules` 和私人笔记。`public/` 里的展示素材和 `data/` 里的快照是构建输入，需要保留。
