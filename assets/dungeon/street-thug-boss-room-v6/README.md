# 地痞据点 · 棋格与生活痕迹版 v6

2026-10-30定稿：用户确认当前小屋及默认布局。新生成第四层已接入本版固定模板，地图位置可变，墙门、家具、两种容器及头目初始站位保持固定；预览和正式地图共用绘制。原图来源与此前制作记录继续保留。

结构源 `room-template.json`、用户坐标 `default-layout.json`、美术登记 `manifest.json` 由 `node tools/build-boss-room-template.mjs` 编译为 `js/dungeon/boss-room-data.js`；`--check` 检查一致性。布局编辑器草稿不自动发布到模板。正式随机第四层检视页：`tools/street-thug-boss-room-generation.html`。

预览：[实际棋盘](../../../tools/street-thug-boss-room-board.html) · [14张素材原图](../../../tools/street-thug-boss-room-grid-art.html)。

## 画风与背景

- 原始画风锚点：[一档地痞](../../../reference/street-thugs-v1/tier-1.png)、既有装置的床／药房／仓库。深色外轮廓、成块手绘体积、左上来光，细节有主次。新人物未重画。
- 故事依据：[30号剧情](../../../docs/design/30-story-outline-blackout.md)的仍能耕种、打铁、交易但秩序崩坏的社会，以及[45号电池经济](../../../docs/design/45-battery-economy.md)的有限供电。
- 房间是被地痞长期占用的旧厂房值班室：旧物混用，坏了凑合修，生活用品没有刻意归位。磨损集中在手摸、搬运、坐卧和洗漱的位置。墙窗补片、水印、纸片及搬运痕迹由预览的原生建筑／地面绘制层呈现，不新增互动点或碰撞。
- 地面仍留通路，家具底边保持棋盘方向。没有用随机歪转家具、统一脏色滤镜或满图碎噪点表现杂乱。

## 选用素材

| 素材 | 文件 | 绘制底面 | 使用痕迹 |
|---|---|---|---|
| 收账桌与凳 | factory-desk.png | 1×1格 | 贴面掉皮、茶渍、账纸、抽屉铁片、凳子胶带 |
| 头目座椅 | vinyl-armchair.png | 0.6×0.6格 | 扶手露泡棉、缝线补丁、随手搭着的布 |
| 铁床 | steel-cot.png | 1×2格 | 被子起褶未叠、补丁、错开的拖鞋、焊点掉漆 |
| 洗漱柜 | metal-sideboard.png | 1×1格 | 换过把手、局部掉漆、盆底水印、松叠毛巾 |
| 周转货架 | transit-rack.png | 1×2格 | 旧绳代绑带、凹角箱、帆布补片、异种货物 |
| 停转小电扇 | stopped-fan.png | 0.125×0.125格底座 | 沿用本轮v5图；作为小型电扇校准，整格仍为障碍 |
| 磨旧地垫 | worn-mat.png | 2×1格 | 局部磨穿、补条、踩踏色块 |
| 角落碎砖 | corner-rubble.png | 0.9×0.9格内 | 沿用本轮v5图；不额外铺满全屋 |
| 私藏箱未搜／搜空 | private-cache.png / private-cache-searched.png | 0.92×0.92格 | 旧板、补铁、木角磨损；开盖保持箱身尺度 |
| 赃物筐未搜／搜空 | stolen-basket.png / stolen-basket-searched.png | 0.9×0.7格 | 沿用本轮v5图；布袋堆放／搜空内衬 |
| 墙、地面 | painted-plaster.png / painted-concrete.png | 直接贴合投影平面 | 沿用本轮v5手绘材质；局部修缮见建筑层 |

共14张选用PNG。透明物件12张，墙地材质2张。图像均保留生成原件，不使用像素脚本涂改。

## 棋格与尺度

以144px格宽为参考，格高144/√2，地面轴斜率±1/√2，竖边保持竖直。生成前的准确投影模板保存在 [v5几何参考](../../../reference/street-thug-boss-room-v5/geometry.html)；v6在已按格生成的完整物件上编辑生活痕迹。

`manifest.json` 登记底面尺寸、原图脚点、接地中心、裁切框和两态箱身跨度。按脚点跨度缩放，不按PNG留白或开盖轮廓缩放。生成式编辑仍可能改变构图，本轮重新测量桌、柜、货架的接触点。显示时只做一次保竖直的地面轴登记；不旋转平面图片冒充新视角。

`ground-contact-checks.json` 记录可见三个脚点的估测残差：正常144px格宽下约0–3.5px。数字由人工测量点计算，不保证原图所有边线精确，也不证明被遮住的后脚位置。实际棋盘与人物旁仍需视觉评审。

主角和头目的素材、尺寸、底座保持原样。沿竖直边估测：桌面约30px、椅面约20px、床面约23px、柜面约41px、货架前立柱约67px；透视纵深不计作物件高度。桌上和柜上日用品另做缩小编辑，避免杯壶与人物不成比例。

两格物件使用占格中心锚点，床、货架原生取用面朝+X；柜、桌、私藏箱朝+Y。没有为迁就摆放镜像已有视角。室内5×8格、中央3×4净空、唯一头目、两种容器与门外绕行规则延续。

## 生成与校验归档

使用内置 **image_gen** 模式。8件修订目标的完整提示、参考对象和原始生成路径见 [PROMPTS.json](PROMPTS.json)。其余6张来自本轮v5，源提示见 [v5提示](../street-thug-boss-room-v5/PROMPTS.json)；桌柜小物修订见 [ACCESSORY-PROMPTS.json](../street-thug-boss-room-v5/ACCESSORY-PROMPTS.json)，高度修订见 [HEIGHT-PROMPTS.json](../street-thug-boss-room-v5/HEIGHT-PROMPTS.json)。

`asset-checks.json` 保存分辨率、alpha范围、内容边界和SHA256。透明原图未叠加棋盘背景。地垫孔洞显示为透明，检查无可见饱和红色像素。

实际棋盘检查记录见 [reference/v6](../../../reference/street-thug-boss-room-v6/README.md)。自动检查涵盖通路、绕行、碰撞、柱与半墙视线、家具使用面和状态往返；数值检查不等同用户美术验收或战斗平衡验收。
