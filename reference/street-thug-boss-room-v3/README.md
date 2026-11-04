# 旧厂房据点预览检查

2026-10-29，独立房间美术页导出；用于用户评审，不能视为正式房间部署验收。

- `room-overview.png`：原尺寸1360×1150整间房图，未搜容器，无辅助线。
- `map-scale-check.png`：144px格宽、原头目和五组新家具的正常显示大小。
- `searched-ground-check.png`：搜空状态与地面方向辅助线检查。
- `preview-page.png`：当前浏览器页面截图。

源图、完整提示及校准清单见[素材目录](../../assets/dungeon/street-thug-boss-room-v3/README.md)。保留旧版对照入口；本轮未修改正式战斗、房间生成或存档。

## 实际棋盘地形试场

后续用户要求补地形并在实际棋盘查看。试场加载正式游戏，使用独立内存存储，不改正常存档。房间为9×10格候选，有短矮墙、承重柱和碎砖区；原7×8素材设计图作为前版保留。

- `board-overview.png`：正式棋盘画面的缩小全景，包含主角和头目。
- `board-normal-size.png`：正常格宽下的柱旁观察，主角与前景柱子的遮挡。
- `board-player-sight.png`：同一位置切回主角真实视野。

入口：[实际棋盘试场](../../tools/street-thug-boss-room-board.html)。通行与遮挡检查见 `tools/test-street-thug-boss-room-board.mjs`。本版尚未加入第四层随机房间生成。
