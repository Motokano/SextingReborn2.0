# 地痞据点：旧厂房值班室候选

2026-10-29。针对用户“太木制、太古风”的纠正，按项目现有旧工业／城市生活背景重做五组布景。仍为独立美术候选，尚未经用户确认或正式部署。

## 素材与来源

全部使用内置 `image_gen`，透明背景。生成结果原样复制，没有进行栅格像素后处理；显示裁切、锚点及保竖直地面投影只记录在清单并由预览绘制。完整提示和引用图片见[PROMPTS.json](PROMPTS.json)，尺寸、透明像素统计与SHA256见[asset-checks.json](asset-checks.json)。

生成源目录：`C:/Users/haoxian.huang/.codex/generated_images/01a17b42-6e6e-7e22-a6af-27970fdf58ae/`。

| 素材 | 显示宽度（144px格宽） | 生成源文件 |
|---|---:|---|
| factory-desk.png · 钢架桌与两把凳子 | 118px | exec-b1403e65-b866-4673-b074-a3f36875d558.png |
| steel-cot.png · 带帘铁架床 | 144px | exec-41096ddc-df4b-4355-9852-b3c77e3e00f0.png |
| metal-sideboard.png · 茶水洗漱铁柜 | 90px | exec-4089c644-469d-45f6-8bc6-40e979cfc212.png |
| vinyl-armchair.png · 旧人造革椅 | 54px | exec-82c056ec-e76f-4c31-bb6d-48c878ee923c.png |
| transit-rack.png · 周转货架 | 124px | exec-750819f0-ff35-405a-ab85-622a93f68d61.png |

复用旧电扇、磨损地毯、混凝土地面、车间墙材、门材、原头目站立棋子，以及v1的私藏箱和赃物袋筐两态。五组新物件均为布景，不新增可搜容器、任务或恢复点。原v1、v2完整保留。

## 世界观与显示范围

- 世界依据：[30号故事大纲](../../../docs/design/30-story-outline-blackout.md)、[45号电池经济](../../../docs/design/45-battery-economy.md)、[城市工作稿](../../../docs/design/city-guangzhou-working-notes.md)。使用旧工业家具与现代日用品，不以武学设定推导仿古装潢。
- 木地板改为残留地坪漆；灯管不亮、电扇停用，只有电池工作灯亮着。没有稳定市电、充电或恢复机制的新增承诺。
- 地面轴通过家具直边估计，以±1/√2为目标进行一次保竖直显示校准；原大图仍显示未校准原绘。登记值是美术预览参数，不是正式碰撞体。
- 原头目比例、底座与轮廓投影不变。以其正常大小核对桌柜高度，避免直接照搬旧组合素材的宽度。

预览入口：`tools/street-thug-boss-room-art.html`。房间图和地图大小对照见[参考目录](../../../reference/street-thug-boss-room-v3/README.md)。正式接入仍需另外验证占格、通行、视野、可搜操作格、门口距离及存档。
