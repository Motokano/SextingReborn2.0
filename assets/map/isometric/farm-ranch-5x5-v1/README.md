# 牧场与农场 5×5 棋子 v1

2026-11-04。先按两个系统布局及77号规范生成候选，随后用户指定位置并要求正式迁移。农场部署于户外（0,8），牧场于（11,7），各占5×5。牧场使用用户上传的原图`ranch-approved.png`，农场沿用`farm-ready.png`；两套正式UI共用。说明与验证见`docs/design/outdoor-farm-ranch-placement.md`。

## 原图

- [牧场](ranch-approved.png)：中央低轴心、四根机械臂、四块开放区域、外围围栏与入口门，附少量食槽、水槽及空鸡笼。四区不固定画入动物、草高或地面。首稿误生成为六臂，后修正为四臂；用户上传定稿的字节另存`ranch-approved.png`，生成原件`ranch-ready.png`保留溯源。
- [农场](farm-ready.png)：角落水池、连通主支水渠、四组低种植床、两处小跨渠板、支架及陶瓮，供水端保留阀门与投料装置。土壤仅位于种植箱内。作物仅为本张设施候选的视觉示意，不表示正式作物实例的状态。

## 系统依据

- `docs/design/31-livestock-husbandry.md` §2、`31-livestock-confirmed-decisions.md`、`31-livestock-ui-iteration.md` 以及 `data/livestock-modules.json`：固定四区、四臂与轴心，区域没有永久功能类型，臂和动物同步轮转。
- `docs/design/28-agriculture-irrigation.md`、`28-agriculture-ui-iteration.md` 以及 `js/agriculture-map.js`：内部农业地图11×11、左上水源、主支水渠、种植与配套建筑。本次5×5定义主地图设施占地，不修改内部11×11系统。
- `docs/design/77-grid-scene-art-standard.md`：深色轮廓、成块明暗、左上光、现代旧物修补、真实透明、原生朝向与等比显示。

生成前实际查看并引用一档地痞、相应旧装置、已认可v6周转架、现行藏身处设施与本次5×5几何图。几何参考和风格参考在提示中分开标注。精确提示、参考路径、生成源和首稿修正见 [generation.json](generation.json)。

## 登记与核看

[manifest.json](manifest.json) 登记5×5逻辑占地、原图尺寸、SHA256、显示裁切、脚点／组合支承范围、锚点、等比倍率、原生朝向和高度参照。PNG保持来源原始字节，不裁改、不剪切、不拉伸；绘制层单独给投影。牧场围栏约47px高，农场种植床约25px高，人物沿用正式图册与125%倍率。

两图按5×5占地显示，正式地图已接入50格碰撞和原NPC互动。接地点是目测登记，原生地面角度有偏差，保留偏差而未以非等比拉伸强行贴格；不宣称逐像素几何完全贴合。

预览：`tools/farm-ranch-5x5-review.html?no_reload`，可切格线、墙边和接地点。使用正式主角图册、144px棋格与125%人物；只读素材，不接任何游戏存档。截图与检查记录在 `reference/farm-ranch-5x5-v1/`。

已实际查看两枚棋盘图与墙边图，四臂四区、四床水路、人物尺寸与完整边缘可辨。两图为RGBA透明图；源文件SHA256一致。透明外边缘分别有18／62个alpha=1的极淡残留像素，没有alpha≥32的贴边像素，未修改原图以清除它们。四区抽样有一处alpha=3的轻微透明残留，见记录；不将透明检查描述为所有空隙逐像素绝对为0。

复核工具为 `tools/check-farm-ranch-5x5-art.cjs`，以本地文件拦截方式打开独立页面，无需网络或游戏存档。可通过 `ART_PLAYWRIGHT` 指向环境已有的Playwright；检查源文件一致、透明、边缘与浏览器报错，并保存正常及墙边截图。当前页面无脚本报错。
