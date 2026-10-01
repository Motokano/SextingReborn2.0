# 缝纫台装置棋子 v1

2026-10-01，用户要求按制药台等设施的标准设计。此处是外观候选，未注册为正式地图设施。

## 统一标准

- 遵循 [59号设施棋子规范](../../docs/design/59-interactive-device-pawns.md) 与 [现有装置素材说明](../../assets/map/isometric/interactive-devices-v1/README.md)。直接以现役 pharmacy.png 为参考，使用内置 imagegen 生成。
- 手绘卡通、深色轮廓、低饱和木色、三分之四俯视、左上光照。沿用深灰薄椭圆底座，源图不绘制底座之外的地面投影。
- 木桌、老式缝纫机为主体，人台、布料、皮尺为识别辅助。人台为工具而非人物，不套用人物骨架规范，也不代表制作性别限制。
- 本图为基础外观，未画可解锁的浸泡桶；桶的外观变体待后续设施展示需求确定，不影响既定浸泡功能设计。
- 地图规格沿用144px格宽，候选可见宽度64px，主体高约75.4px；与58px宽制药台并排预览。后续接入仍须使用现有底座锚点及连续右下阴影方案，不从图片框中心猜接地点。

## 文件与检查

- `sewing.png`：1300×1209，复制保留生成原图，未做后期图像编辑。
- 四角alpha均为0，完全透明像素942600个，约59.97%。
- 原始非零alpha包围框 `[25,49,1251,1142]` 含极淡外围像素；alpha≥16的主体包围框为 `[212,95,877,1033]`。评审页按后者裁切显示，不改动原文件。运行接入前需要单独确认裁切和底座实心锚点，不应直接使用非零alpha全框造成主体缩小。
- [外观与尺寸预览](review.html)：原图和144px格宽的并排比较。该页面是外观比例检查，不是运行时阴影、点击范围或缝纫功能验收。
- 状态（2026-10-01）：用户认可，已接入基地NPC和正式缝纫功能。运行裁切与锚点已经在144px格宽下验收；以上“接入前”说明保留为出图阶段记录。详见 [部署记录](../../docs/design/sewing-station-entry.md)。
- `runtime-ui.png`：正式界面代码在隔离内存样本中的验收截图；样本知识和材料不写入玩家存档。

## 生成提示词

Use case: stylized-concept. Create ONE new standalone sewing workstation game device pawn, matching the attached approved pharmacy workstation pawn as STYLE REFERENCE ONLY. Same elevated three-quarter isometric camera (front and right visible), hand-painted cartoon volume, bold dark outlines, warm muted wooden material, restrained colors, level of finish and broad thin charcoal oval tabletop-pawn base. Subject: compact sturdy wooden sewing workbench, a clearly recognizable vintage dark charcoal sewing machine with brass handwheel and needle arm as the dominant central silhouette, a single folded dusty-blue cloth extending from under its presser foot and draping a little over the front edge. A compact plain cream headless armless dressmaker torso on a short pole mounted at the rear-left of the table (clearly an inanimate tailoring mannequin, not a person), balanced in height with the machine. One large thread spool and a curled cream measuring tape with only a few small unlettered ticks, minimal uncluttered props. Wooden legs, single front drawer. All parts sit on ONE shared oval charcoal base, same base profile as reference. Strong readable sewing identity when scaled down to 58-64 px total visible width on a 144 px wide isometric game tile. Fit the entire machine, mannequin, table and base inside image with clear margin on every side. Match reference scale of details, do not make a huge sewing factory. Soft upper-left lighting, object self-shading only. TRUE transparent RGBA background, no background color or baked checkerboard, no terrain, no cast ground shadow outside base (runtime supplies it). No writing, text, logos, watermark, UI, border, people, fantasy glow, bottles, pharmacy mortar, herbs or soaking bucket. The mannequin is a measuring tool, no human face or limbs. Return image and saved file path.
