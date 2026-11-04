# 农场与牧场户外迁移

2026-11-04，已按用户指定位置接入正式游戏。坐标均为零基左上角。

| 设施 | 户外范围 | 原室内入口 | 原NPC |
| --- | --- | --- | --- |
| 农场 | x=0～4，y=8～12 | （10,15）已移除 | `npc.station.agriculture_base` |
| 牧场 | x=11～15，y=7～11 | （9,15）已移除 | `npc.station.livestock_base` |

位置正本是`data/maps/M0_Base_Outside_lv_1.json`的`facility_footprints`，50格同步登记碰撞和NPC入口。每套图以占地中心接地，按原生朝向等比绘制一次；点击邻接的任一占格进入原菜单，沿用八向邻格互动。内外出口保持可达，室内旧两格恢复通行。先前清理的22处草、3处灌木不再放回；没有清理范围外树木或池塘。

牧场现使用用户已确认的`assets/map/isometric/ranch-circular-post-v3/ranch-ready.png`：圆形外圈、中央普通木柱及四个分区，原字节SHA256为`700e6ad0ff3bdf28a4de5140e8e02c413b0bda5edab249800677f970a249687c`。农场沿用`farm-ready.png`。共用登记仍保存在`assets/map/isometric/farm-ranch-5x5-v1/manifest.json`，运行登记由`tools/register-outdoor-facilities.mjs`生成。新图按0.43等比显示，圆周接地点用于独立阴影；不旋转、拉伸或加工原图，人物保持125%。院落屋顶透视遮罩先处理建筑，再画前景设施，避免误擦围栏。

圆形版于2026-11-04获用户确认「好，就这么装进游戏吧，没问题了」，两套正式UI的地图棋子和NPC头像同步采用；批准、提示、来源与原图哈希在新素材目录。外观中心柱的改画不修改内部四区养殖轮转规则。5×5范围的角落仍属于逻辑占地，25格碰撞及周边互动保持。旧方形上传图`farm-ranch-5x5-v1/ranch-approved.png`完整保留，其SHA256为`763e2a947c99caaa3b83c389faffe40a10e3944a0bb1104eaedeb266a538edb6`。

两套原系统、NPC标记和保存结构继续使用：农业内部仍为11×11，牧场仍为四区及原机械臂配置。未修复时仍进清理／修复流程，未自动解锁、不赠送物品。当前各只有一张地图外观，不另外虚构破损版。费用、生产规则、农场原开关窗口耗时保持；被动离格或失能关闭不额外耗时。

清理、修复和管理都验证户外5×5矩形的邻接距离，旧室内位置和陈旧菜单不能操作。角色从旧档恢复到新增占地内时，按曼哈顿距离寻找最近可走且非传送点的地格；不推进时间或修改作物、动物、装配与设施进度。

## 验证

- `node --test tools/test-outdoor-facilities.mjs`：两套UI、新旧位置、50格移动及蹑步阻挡、周边入口、陈旧菜单、离格关闭、存档往返和旧站位迁移。
- `node tools/test-device-pawns.mjs`：每套只画一枚和一个独立阴影、原比例、隐藏／未知可见性；其他棋子保持。
- `node tools/test-facility-labor.mjs`及`node --test tools/test-facility-appearance.mjs`：原清理／修复费用、保存标记和外观登记。
- 农业地图／存档、养殖状态校验／完整性测试通过；15项健身房与NPC回归通过。
- `tools/check-outdoor-facilities.cjs`：隔离浏览器运行正式界面，实际打开两套管理窗口并核对正式素材路径。圆形版截图及记录在`reference/ranch-circular-post-v3/runtime/`，通过`OUTDOOR_REVIEW_DIR`指定输出；原迁移记录保留在`reference/farm-ranch-5x5-v1/`。

`tools/outdoor-facilities-review.html?no_reload`提供农场／牧场／回家切换；加`&ui=svelte-hud`检查另一套UI。该页使用独立内存存储，预设修复只供验收，不影响正式角色。

额外检查发现旧`test-hideout-facility-registration.mjs`要求从原入口直接到所有健身设施，与现行健身房封墙规则冲突；该旧断言失败。专用健身房通路与开墙回归通过，未为迁移农牧设施打开健身房墙面。
