# 资料室配套陈设 · 第一版

2026-11-02。用户认为资料室偏素，要求绘制符合已定规范的配套素材。本批由内置 **image_gen** 绘制，用户随后确认“接入正式房间然后提交”，三件外观及展示布局定稿并接入正式资料室。批准范围与PNG校验见[approval.json](approval.json)。

## 三件素材

| 原图 | 内容 | 144px格宽下接地宽 | 物理高度探针 |
|---|---|---:|---:|
| [archive-shelf.png](archive-shelf.png) | 蓝灰旧铁档案架，替换木层板、夹册与绑好的纸稿 | 75.38px | 72.25px |
| [drawing-rolls.png](drawing-rolls.png) | 木质图筒架，长短卷图、旧筒套与帆布固定带 | 61.43px | 44.25px |
| [patched-stool.png](patched-stool.png) | 旧铁脚矮凳，橄榄色座面与布补丁 | 51.10px | 25.30px |

三张都是1254×1254透明PNG。保留生成原图像素，不裁改文件、不拉伸、扭曲、斜切或旋转；绘制器只使用登记的透明边界、原生朝向、等比缩放和接地锚点。没有圆形展示底座或烘焙地面投影；阴影由现有地图绘制器单独绘制。接地中心与高度探针为人工估计，隐藏后脚为包络估计，不将截图总高当作家具物理高度。

风格沿用77号／60号：深色轮廓、手绘明暗块、左上光源；以旧铁、木板、纸张和少量修补表达使用痕迹。人物仍为原图册和125%倍率，未改资料台两态原图或0.12倍率。

## 实际参考与提示词

生成前已查看并实际传入：一档地痞原图 `reference/street-thugs-v1/tier-1.png`、已批准旧仓库工具台 `assets/map/isometric/interactive-devices-v1/toolbench.png`、v6家具 `transit-rack.png`（档案架／图筒架）或 `factory-desk.png`（矮凳），以及每件预绘的棋格几何模板。旧工具台仅参考材质，不沿用底座。

精确提交文本：[档案架提示词](prompt-archive-shelf.txt)、[图筒架提示词](prompt-drawing-rolls.txt)、[矮凳提示词](prompt-patched-stool.txt)。每次将几何模板作为第一张编辑目标，其余图片作为画风参考；均设置透明背景，使用内置工具，没有CLI生成或后处理改图。

[manifest.json](manifest.json) 登记原始生成路径、SHA256、所有实际参考文件及校验值、提示词路径、显示比例、接地锚点与布局位置。原始生成文件仍在 `.codex/generated_images/01a199e0-bec6-7310-851c-5de06cae4c7b/`，项目副本与原文件逐字节一致。

## 房间搭配

内部3×4格，以后排左上角为(0,0)：档案架(0,0)、原资料台(1,0)、图筒架(2,0)、矮凳(0,1)。各占一格，仍有8/12格可通行；台前(1,1)和门内(1,3)留空。三件为静态陈设，不添加搜刮、存取、奖励或其他交互。

[素材展示](http://127.0.0.1:8044/tools/recipe-study-room-art-review.html) · [实际房间搭配](http://127.0.0.1:8044/tools/street-thug-boss-room-generation.html?no_reload&seed=study-room-v1-61&floor=1&area=%E8%B5%84%E6%96%99%E5%AE%A4&studyArt=1)

本地8044静态服务可用 `node tools/serve-live.mjs 8044` 启动。预览使用自然命中的固定种子、正式生成器与地图绘制器，陈设也由正式流程生成；不读写玩家存档。正式新生成资料室使用相同三件陈设，已生成的旧地图按保存内容保留，不在读档时补物。整次出征3%、最多1间及一次配方／全掌握潜能奖励保持。

## 检查记录

- [正式房间截图](../../../reference/recipe-study-room-art-v1/room-runtime.png)：正式生成流程，144px棋格、125%人物；检查原生方向、材质、接地、墙后关系和家具间遮挡。
- [透明度检查](../../../reference/recipe-study-room-art-v1/alpha-checks.json)：透明像素分别约60.16%、65.98%、83.48%；原始alpha保留。
- `reference/recipe-study-room-art-v1/register.mjs`核对原始文件SHA256并建立尺寸登记。
- 正式摆放前检查占格不冲突、整层自由格连通、资料台至少一处可达及房内至少60%可走；实际页面加载通过。
- 新预览模块和关联页面脚本语法检查通过，浏览器核对三张原图和实际房间显示。

正式摆放见`RuinsRecipeStudy.decorate`，由房间生成器在普通陈设分配后调用；素材由`tools/build-grid-scene-catalog.mjs`统一构建。新增陈设与碰撞随既有地图存档保存，不另设陈设奖励或玩家物品。回归入口为`tools/test-recipe-study-room.mjs`、`tools/dungeon/test-generation.mjs`及`tools/test-dungeon-grid-scene-art.mjs`。
