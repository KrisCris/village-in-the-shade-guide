# 部署与排错

## 首次部署

1. 创建或选择自己的 GitHub 仓库，将本地仓库的远程地址指向它。
2. 在 Settings → Pages → Build and deployment 中，将 Source 设为 GitHub Actions。
3. 推送 `master`。Actions 中 “Deploy Wiki to GitHub Pages” 成功后，environment 链接就是站点地址。

本次整理只做本地提交和合并，不创建远程仓库、不执行 push。没有远程地址时，不会发生线上部署。

之后每次推送到 `master` 自动部署，也支持手动运行，但只有 `master` 可以发布。构建失败时保留上次部署；并发部署串行完成。

## 构建内容

CI 用 Node 24 与 `npm ci` 按锁文件安装，执行映射检查、Vitest、Astro 检查，然后运行 `npm run build`。使用仓库内的结构化数据和 Web 图像，不读取游戏安装、不抓取参考站点、不运行 Python 提取器。

`actions/configure-pages` 提供 `origin` 和 `base_path`，传入 `SITE_URL` 与 `BASE_PATH`。展示层通过 `withBase` 处理链接、图标和 JSON 请求，原始数据路径不变。Astro 处理脚本和 CSS 的部署路径，Pagefind 从部署目录加载索引。

只上传 `dist/`，不创建 `gh-pages` 分支。使用工作流 `GITHUB_TOKEN` 和 OIDC，无需 PAT 或个人密钥。Pages 需在仓库设置中可用并启用。

## 本地验证子路径

```powershell
$env:SITE_URL = 'https://example.github.io'
$env:BASE_PATH = '/wiki-check/'
npm run build
npm run preview
# 打开终端地址的 /wiki-check/ 路径
```

结束后关闭 preview，并清除本终端的变量：

```powershell
Remove-Item Env:SITE_URL, Env:BASE_PATH -ErrorAction SilentlyContinue
```

重新默认构建即可恢复根路径版本。不要把子路径构建与根路径 preview 配置混用。

## 常见问题

- **configure-pages 返回 404**：检查 Pages 是否启用、Source 是否为 GitHub Actions，以及仓库是否具备 Pages 使用资格。
- **图标 / JSON 404**：检查资源是否已提交、请求是否带仓库前缀。不要把 `public/icons/generated/` 加回忽略列表。
- **数据没更新**：运行 `npm run build:data`，部署必须重新运行完整 build。
- **全文搜索不可用**：Pagefind 索引由生产构建生成，开发服务器不重新生成它。
- **自定义域名**：先在 Pages 设置中配置域名与 DNS，再重跑工作流，URL 和 base 会重新读取。

参考：[Astro Pages 部署](https://docs.astro.build/en/guides/deploy/github/)、[GitHub 自定义 Pages 工作流](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。
