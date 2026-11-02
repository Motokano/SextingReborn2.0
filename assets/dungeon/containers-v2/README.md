# 地牢通用容器 v2

2026-10-30，根据用户“旧版容器画风不符合标准，全部直接重画”的要求制作。31种容器，选用62个状态；已接入地图和搜索界面，助手完成原图和144px棋格复核，等待用户视觉确认。标准以 `docs/design/77-grid-scene-art-standard.md` 和已确认头目房v6为准。

使用内置 `image_gen`，一件一态独立出图。新未搜图直接参考地痞一档的手绘体积、v6私藏箱和周转架，并引用棋格几何图。搜空图以新未搜图为对象编辑，保留原物件结构。全部PNG保持生成原文件内容，未做拉伸、剪切、重绘像素或背景像素修补。

- `production.json`：31件名称、出图设计、选用文件、显示底宽和生产状态。
- `prompts/*.json`：每次生成的完整提示词、绝对参考路径、原生成文件及是否选用。
- `provenance.json`：选用62张与保留2张候选的SHA256及来源；64张全部能追溯。
- `asset-checks.json`：尺寸、RGBA、透明范围、可见边界的只读检查。
- `registration.json`：每态原图接触点、两态共用实物底宽、原生显示方式。该文件由登记脚本生成，同时同步总登记表；调整应改测量记录后重建。

选用例外：工具箱未搜采用 `discarded-toolbox-clean.png`；冰箱搜空采用正确右铰链的 `reused-fridge-searched-right.png`。同名初版继续留档，不注册到游戏。既有31个 `-v1` 游戏ID是存档标识，保持不变，不表示仍使用旧图。

接地测量与8页实尺寸截图保存在 `reference/dungeon-grid-scene-v1/qa/`。查看 `tools/dungeon-container-review.html?no_reload` 可比较全部未搜／搜空状态、125%主角与144px格，并切换历史版本和镜像。实际地图使用 `tools/street-thug-boss-room-generation.html?no_reload&seed=fixed-den-review-2&container=patched-bulk-sack-v1`。

复现登记：

```text
node tools/register-container-redraw-v2.mjs
node tools/build-grid-scene-catalog.mjs
node tools/build-grid-scene-provenance.mjs assets/dungeon/containers-v2
node tools/test-dungeon-grid-scene-art.mjs
node tools/test-dungeon-scene-presentation.mjs
```

头目专属容器、尸体袋及自然资源不属于本次31种通用容器重画。
