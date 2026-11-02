# 车间车床重绘 v2

2026-10-30：用户确认重新绘制比例失衡的旧车床。新图以已认可的地痞小屋 v6 画风、2×1 格结构参考绘制，已接入地图，待用户美术复核。

- 选用图：`workshop-machine-v1.png`，1254×1254 RGBA；使用内置 imagegen。
- 最终精确提示与引用：`prompts/workshop-machine-v1-geometry.json`；前两轮提示保留，未选用。
- 可复现结构参考：`reference/dungeon-grid-scene-v1/lathe-geometry.html` 与其截图。脚点对齐棋盘，床面抬高，两端柜式支撑，中间留空，缩小手轮和机头。
- 注册：`registration.json`。保持既有对象 ID，素材目录独立版本；原 PNG 与生成源 SHA256 相同。
- 正常144px格宽下，落地接触总宽约184px，完整图约200px；床面实体高度约43px，机头约70px，与现有125%人物对照。底面窄于整格，占格2×1；沿另一轴部署为1×2并镜像。仅等比缩放，禁止旧整图仿射拉伸。
- 新生成车床的实际阻挡为两格，保留两侧操作通路；旧存档不重排。头目固定小屋布局、人物、自然资源和其他家具不变。

重建：`node tools/register-workshop-lathe-v2.mjs`，再运行 `node tools/build-grid-scene-catalog.mjs`。来源复核：`node tools/build-grid-scene-provenance.mjs assets/dungeon/workshop-lathe-v2`。

实景：`tools/street-thug-boss-room-generation.html?no_reload&seed=fixed-den-review-2&prop=workshop-machine-v1`。

验证：`tools/test-dungeon-grid-scene-art.mjs` 检查双朝向等比显示；`tools/test-workshop-lathe.mjs` 检查新生成占格、镜像、阻挡和通路。
