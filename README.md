# 静谧田园 Wiki

《Village in the Shade / ほの暮しの庭》的中文资料库与规划指南。名称、图标、价格、配方与关联条件主要从游戏构建 `24969282` 提取；AppMedia 仅作选题与核对参考，不是整站翻译。

## 功能

- 游戏类别一览、拼音搜索、季节 / 时段 / 钓点筛选、独立排序方向。
- 全局品质切换；加工增值与种植到加工收益规划。
- 可调宽度的详情侧栏；材料、产物、机器、商店与交付用途相互查询。
- 角色生日与喜恶、四季留货、种植阶段、好感度、料理、狩猎与家畜指南。
- 游戏地图标记图书、神社及已解析的其他收集点。

仍有未核实规则与未补齐攻略。目录有映射不等于正文完整，计算假设和限制见 [内容覆盖说明](docs/content-coverage.md)。

## 本地运行

需要 Node.js **24 LTS**。日常浏览和构建不需要安装游戏或 Python。

```sh
npm ci
npm run dev
```

地址以终端输出为准。`dev` 先生成浏览器使用的 JSON；全部物品按需加载列表数据，每页 50 项，详情数据在打开面板时加载。

```sh
npm run build
npm run preview
```

`dist/` 是最终静态站点，包含 Pagefind 搜索索引。Astro 在构建时生成 HTML，React 处理筛选、排序与侧栏等交互；上线后**无需 Node 后端或数据库**。开发服务器按需编译的耗时不代表静态托管性能。

## 开发与数据更新

```sh
npm test                 # 数据与计算测试
npm run check            # Astro / TypeScript 检查
npm run content:check    # 主题映射检查，不证明正文完整
npm run verify           # 上述检查及完整生产构建
```

| 路径 | 内容 |
| --- | --- |
| `src/pages/`、`src/components/` | 页面与交互 |
| `src/domain/` | 收益、条件和双向关系 |
| `data/generated/build-24969282/` | 已提交的结构化游戏快照 |
| `data/sources/`、`docs/data-evidence/` | 补充数据、参考目录与证据 |
| `src/honogurashi_extractor/`、`tools/` | 本地只读提取器和研究工具 |
| `public/icons/`、`public/maps/`、`public/portraits/` | 展示素材 |

重新提取需要 Python 3.11+、`uv` 和自己的游戏安装。先运行 `uv sync --extra dev`，再参考 [数据提取说明](docs/data-extraction.md)。部分研究工具针对特定构建和本地路径，不属于 CI 步骤；不要直接用基础提取结果覆盖已补充、已核对的快照。

参见 [维护约定](CONTRIBUTING.md) 与 [素材说明](docs/assets.md)。本仓库未指定统一开源许可证，游戏图像和官方头像不因出现在仓库中而成为开源素材。
