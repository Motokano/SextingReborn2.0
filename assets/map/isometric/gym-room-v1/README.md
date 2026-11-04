# 藏身处健身房陈设 v1

2026-11-03用户确认紧凑布局可以接入正式游戏，现行陈设与墙地定稿，见`approval.json`。正式位置与地面分区正本为`data/gym-layout.json`；`js/gym-room-art.mjs`复用原图，`js/gym-scene.js`将陈设并入正式场景深度排序。原床和原藏身处设施保持。下文的“预览”描述仅记录制作过程。

2026-11-03，用户要求房间布局、装饰参考《逃离塔科夫》健身房，并允许按既有美术规范补充资源。本组用于8049藏身处健身房交互预览，当前为可评价版本，未记录为用户逐图定稿。

## 素材与登记

全部由 **内置 image_gen** 生成，保留原始输出文件并逐字节复制到此目录，没有裁图写回、重绘、抠图或像素加工。`manifest.json`登记原图路径、SHA-256、透明范围、接地锚点和等比倍率；`records/*.json`保存每张实际使用的完整提示、参考及来源，`prompts.json`汇总当前提示。初版管线挂件因浅透视／光晕未采用，当前为revision 2。

| 文件 | 用途 | 144px棋格下显示 |
| --- | --- | --- |
| locker.png | 旧铁柜，闭门及顶部毛巾 | 0.13等比，柜体约93px高，1格 |
| bench.png | 更衣长凳、毛巾、水瓶 | 0.13等比，座面约28px高，2×1格 |
| crate.png | 工具箱、镁粉罐与布带杂物箱 | 0.078等比，箱体约25px高，1格 |
| fittings_x.png | 管线、笼灯、换气口、训练图 | 原生+x墙面朝向，0.16等比 |
| fittings_y.png | 管线、接线盒、钟、拉伸图 | 原生+y墙面朝向，0.16等比 |
| wall_material.png | 旧混凝土／褪色橄榄绿墙漆 | 正面平面材质，仅映射建筑表面 |
| floor_material.png | 深色橡胶地垫 | 俯视平面材质，仅映射地面 |

家具和挂件直接按原生朝向等比绘制，没有剪切、翻转或非等比拉伸；家具投影通过正式`TileRendererV2.makeGroundShadow`独立绘制，墙上挂件不投地面影。建筑墙地使用专门平面材质，投影与家具处理分开。人物保持125%，八种现有器械及其四级外观保持同一登记。

## 实际参考

- `reference/street-thugs-v1/tier-1.png`：已批准角色笔触、轮廓与色调，未引用其底座。
- `assets/map/isometric/interactive-devices-v1/toolbench.png`：已批准旧木／金属材料处理。
- `assets/dungeon/street-thug-boss-room-v6/transit-rack.png`：已批准场景陈设画法。
- `reference/gym-room-v1/*-geometry.png`：生成前绘制的棋盘相机／占地模板，地面轴±0.7071，竖线直立；模板及计划见同目录`geometry.json`。
- `reference/gym-room-v1/tarkov-gym-reference.jpg`：房间氛围参考，来自[NME的塔科夫健身房画面](https://www.nme.com/guides/escape-from-tarkov-how-to-break-the-defective-wall-and-unlock-gym-3376132)。仅参考沿墙器材、旧墙、管线和训练区材料，没有把截图当作游戏贴图。

## 布局与检查

`tools/gym-hideout-layout.json`保留用户选定的左上9×10格，八种器械19格，三件地面陈设4格；中间通路、右侧出入口和藏身处原床保留。陈设不增加储物容量、搜刮奖励或额外设施功能。

布局第二版按用户“紧凑实用”要求，将工具箱集中到杠铃／哑铃旁，长凳和铁柜在入口边成组，左侧专项和垫上训练共用连续垫区。地垫只铺训练区，中间通道复用已批准`assets/map/hideout-v1/concrete-quiet.png`。本轮仅改摆放与材料分区，七项原始素材和显示倍率不变；新版实景为`reference/gym-room-v1/room-compact-v2.png`与`room-compact-v2-level4.png`。

入口：`tools/gym-hideout-review.html?no_reload`。登记校验：`node tools/register-gym-room-art.mjs`；管线／通路回归：`node --test tools/test-gym-npcs.mjs`。实景检查图保存于`reference/gym-room-v1/room-preview.png`及`room-level4.png`。
