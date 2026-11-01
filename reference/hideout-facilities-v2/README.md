# 藏身处新设施检查记录

2026-11-01，使用内置 image_gen 重画11类／20张，另沿用已确认制作台。原图、精确提示与登记：[素材目录](../../assets/map/isometric/hideout-facilities-v2/README.md)。

逐件几何模板由 `tools/build-hideout-facility-geometry.cjs` 生成，SVG及PNG均为出图前的几何参考，不是游戏素材。`geometry.json` 为预先的绘制目标，实际人工脚点及等比尺寸以素材目录 `calibration.json` 和 `manifest.json` 为准。

- `all-facilities-144px.png`：全套对照，144px棋格／125%原主角。
- `map-<设施ID>-before.png`、`map-<设施ID>-after.png`：12类设施的实际藏身处位置和视线；制作台沿用已有破损版。
- `map-before.png`、`map-after.png` 及对应 `-detail`：真实卫生间修复前后。由独立浏览器角色操作材料滑块完成，非仅直接改完成标记。
- `browser-checks.json`：实际运行目录核对、设施选图及浏览器错误检查。

本次8000服务确认为当前桌面项目，未使用历史6254工作目录。实景页注入独立内存存储，自动测试另建独立浏览器上下文，均不读写玩家存档。素材原图、人物旁、格线、修复切换、墙边遮挡和邻近设施已经检查；床第二格与通路通过静态碰撞检查。2026-11-01用户确认“可以实装了”，本版已定稿并用于正式游戏；批准范围与文件校验见[批准记录](../../assets/map/isometric/hideout-facilities-v2/approval.json)。
