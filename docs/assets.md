# 素材来源

- `public/icons/generated/items/`：从游戏构建 `24969282` 的物品表、图标表和纹理引用中提取的物品裁切图。鱼类和配方按对应物品 ID 复用。
- `public/icons/generated/livestock/`：游戏原生家畜图标。其余家畜按数据记录复用物品图标。
- `public/maps/`：游戏小地图。标注来自游戏数据，核对记录见 `docs/data-evidence/`。
- `public/game-icon.png`：站点标识所用的游戏图像。
- `public/portraits/official/`：发行商公开人物页头像，来源见 `data/sources/official-character-portraits.json`。
- `public/icons/fallback/`：站点异常兜底图形，不代表对应物品的实际外观。

这些展示素材随仓库保存，使静态部署无需安装游戏。原始 `data.dat`、`texture*.dat` 和完整解包目录不提交，也不进入部署产物。

游戏与发行商图像的权利仍属于相应权利人。本项目没有取得或声明这些素材的开源授权；本地拥有游戏也不自动赋予公开再分发权。公开发布、二次使用前请确认适用的权利人使用政策。仓库当前也没有为代码指定统一开源许可证。
