# 配方解锁兴趣点 · 旧工艺资料台 v1

2026-11-02。用户确认“这个外观可以，做剩下的功能吧”。两态外观已定稿并接入正式地牢、研究授予及存档；批准与原图校验见[approval.json](approval.json)。唯一奖励为手动配置范围内的一项未学配方，完整规则和配置见[V15资料台](../../../docs/dungeon/ruins-v15/RECIPE-STUDY.md)。

## 外观与状态

正式名称为“旧工艺资料台”。蓝灰旧铁脚、磨损木桌、局部金属补片与一份工艺记录组成一枚单格场景棋子。图纸、铅笔和夹子只是外观，不生成可拾取物品，也不表示可制作、存取、恢复或掉落奖励。

- [available.png](available.png)：资料摊开，用于可研究状态。
- [used.png](used.png)：同一桌体上资料合拢，用于已使用状态。

正式首版每层1处、1世界tick研读，候选全已学时不消耗；重复访问已使用点不再授予。首版数量与耗时是实施试调值，范围配置和所有边界详见V15说明。既有“基础1级／其余研究”的知识规则保持。

## 生成来源

使用内置 **image_gen**。原始输出完整复制到本目录，源文件保留；两张1254×1254 RGBA原图未裁切、重采样、改alpha、剪切或拉伸。

先读取[77号](../../../docs/design/77-grid-scene-art-standard.md)和[60号](../../../docs/design/60-pawn-quality-standard.md)，实际查看并向生成工具提供：

1. 本次预绘的[几何模板](../../../reference/recipe-study-point-v1/geometry.png)，仅用于投影和体积。
2. 一档地痞原图，固定轮廓、明暗与完成度。
3. 已认可工具台原图，固定材质厚度与线条，不取其展示底座。
4. 已认可v6工厂桌，固定旧工业家具的使用痕迹和原生投影。

使用态基于可研究态编辑，并继续引用三张已认可风格原图。精确输入、源路径和SHA256见[generation.json](generation.json)；提示全文为[prompt-available.txt](prompt-available.txt)及[prompt-used.txt](prompt-used.txt)。编辑产生少量桌体像素差异，不宣称非书本区域逐像素一致。

## 几何与比例

- 预绘几何：144px格宽、144/√2≈101.82px格高、地面轴斜率±1/√2；竖边竖直，正交投影。候选逻辑占格1×1，实体底面目标0.72×0.72格，桌面实体高度目标40px。
- 两态共用显示裁切`[151,160,976,1006]`、接地锚点`[636,847]`和等比倍率0.12。裁切仅是显示参数，不修改PNG。
- 底部左右脚接触中心横距约864px，在144px格宽下显示103.68px；桌面竖直高度探针约39.72px。可见总高度约118.56／118.80px，包含俯视带来的地面深度，不作为家具实体高度。
- 接点为人工估测：后脚被遮挡，后接点仅用于包络登记；不能用估测点强行扭曲PNG。未生成碰撞或视线规则。
- 原生正面朝+Y；只等比缩放与平移，未旋转或镜像。正式主角和头目原图及125%倍率保持，参考底座57.5px。
- 透明背景无地板块、展示底座或烘焙地面投影；独立检视层绘制阴影。

详细显示参数见[manifest.json](manifest.json)。

## 检查与复现

[144px棋格对照](../../../reference/recipe-study-point-v1/board-144px.png)复用本项目正式`js/core/map-projection.js`计算棋格顶点，并用原始角色图册及本次PNG离线绘制；两态同时查看，含格线、墙边和人物前景遮挡。它是独立美术检视，不是正式地图截图或玩法验收。

已目视检查大图、正常棋格、125%主角／头目旁的比例、墙边、透明边缘和两态落地位置。透明统计见[alpha-checks.json](../../../reference/recipe-study-point-v1/alpha-checks.json)：两图均有超过71%的完全透明背景；保留生成的边缘alpha。两态边界相差最多2px，实际显示约0.24px，共用锚点和缩放，未为对齐而扭曲原图。

复现顺序：`reference/recipe-study-point-v1/inspect-alpha.ps1` → `node reference/recipe-study-point-v1/register.mjs` → `reference/recipe-study-point-v1/render-board.ps1`。几何模板由同目录`build-geometry.ps1`生成。

浏览器检视页：[recipe-study-point-art-review.html](../../../tools/recipe-study-point-art-review.html)。本地服务8041端口可预览；页面只展示原图和棋格对照，不读取或写入游戏存档。首轮浏览器工具无法连接本机服务，使用本地离线渲染检查，未把浏览器截图验收记为通过。正式接入回归见V15说明；本次未修改PNG像素，生成记录保留出图时的候选身份。
