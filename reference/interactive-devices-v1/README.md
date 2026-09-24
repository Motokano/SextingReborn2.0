# 可互动装置棋子设计 v1

> 2026-09-15：用户已认可并授权实装。正式透明素材见 `assets/map/isometric/interactive-devices-v1/`，实际尺寸验收页见 [runtime-review.html](runtime-review.html?view=isometric)。下文保留首轮设计稿记录。

2026-09-15：七类装置的首轮外观设计，使用内置 imagegen；风格参考 `assets/map/isometric/player-atlas-v1/L00.png`。

统一手绘卡通、深色轮廓、低饱和色块、三分之四视角与深灰薄椭圆底座。装置形状用于识别用途，不套用人形结构。

这是外观提案，尚未接入游戏或通过真实地图尺寸验收。生成图的透明性逐图记录；带背景的图不可直接作为运行时透明素材。

| 文件 | 装置 | 主要识别点 |
|---|---|---|
| stove.png | 灶台 | 锅、炉门、烟管 |
| ranch-v2.png | 牧场 | 四区域十字机械围栏、羊、食槽；修正三分区误读 |
| farm.png | 农场 | 作物、种植箱、水渠 |
| bed.png | 床 | 木床、枕头、蓝被 |
| barrel.png | 制肥桶 | 木桶、摇柄、叶片 |
| pharmacy.png | 制药台 | 研钵、药瓶、草药 |
| warehouse.png | 仓库 | 储物架、木箱、袋子 |

“桶”依据现有设施语义按制肥桶设计；牧场是系统入口的缩微表达。没有新增游戏规则。

## 完整生成提示词

### 图像检查

七张均已查看。`barrel.png`、`pharmacy.png` 为 RGBA，预览显示透明背景；其余五张为 RGB，棋盘格已画入背景，仅供外观评审。全部尚未完成游戏内尺寸与接地验收。

### 灶台
+
Use case: stylized-concept. Generate ONE standalone game interactable device pawn asset. Input image is STYLE REFERENCE ONLY: match its hand-painted cartoon finish, bold dark outline, soft simple shading, low-saturation color blocks, rounded chunky shapes and dark charcoal thin oval tabletop pawn base. Do not copy the human or any injury. Fixed elevated three-quarter isometric view, front and right side visible. Soft upper-left light. Object centered on one broad very thin dark oval base matching the reference base, whole object and base fully visible with 12% clear margin. This is a readable miniature for a 144px-wide diamond tile: simplify details to survive display at approximately 60-80px wide. Real transparent RGBA background, no background color, no checkerboard, no floor, no ground cast shadow, no text, no labels, no frame, no UI, no human characters. Avoid photorealism, tiny decorative clutter, huge buildings, thick pedestal and glowing effects. Subject: A compact squat gray metal cooking stove with a single round cooking pot, small warm amber firebox opening, short stovepipe. Clear cooking silhouette.

### 牧场
+
Use case: stylized-concept. Generate ONE standalone game interactable device pawn asset. Input image is STYLE REFERENCE ONLY: match its hand-painted cartoon finish, bold dark outline, soft simple shading, low-saturation color blocks, rounded chunky shapes and dark charcoal thin oval tabletop pawn base. Do not copy the human or any injury. Fixed elevated three-quarter isometric view, front and right side visible. Soft upper-left light. Object centered on one broad very thin dark oval base matching the reference base, whole object and base fully visible with 12% clear margin. This is a readable miniature for a 144px-wide diamond tile: simplify details to survive display at approximately 60-80px wide. Real transparent RGBA background, no background color, no checkerboard, no floor, no ground cast shadow, no text, no labels, no frame, no UI, no human characters. Avoid photorealism, tiny decorative clutter, huge buildings, thick pedestal and glowing effects. Subject: A miniature mechanized ranch interaction station: a central chunky metal spindle with four short cross-shaped rotating fence arms dividing four tiny paddock sections, one simple cream sheep in one section and a small hay trough. The cross-shaped mechanism must read clearly. Compact emblematic device, not a whole landscape.

### 农场
+
Use case: stylized-concept. Generate ONE standalone game interactable device pawn asset. Input image is STYLE REFERENCE ONLY: match its hand-painted cartoon finish, bold dark outline, soft simple shading, low-saturation color blocks, rounded chunky shapes and dark charcoal thin oval tabletop pawn base. Do not copy the human or any injury. Fixed elevated three-quarter isometric view, front and right side visible. Soft upper-left light. Object centered on one broad very thin dark oval base matching the reference base, whole object and base fully visible with 12% clear margin. This is a readable miniature for a 144px-wide diamond tile: simplify details to survive display at approximately 60-80px wide. Real transparent RGBA background, no background color, no checkerboard, no floor, no ground cast shadow, no text, no labels, no frame, no UI, no human characters. Avoid photorealism, tiny decorative clutter, huge buildings, thick pedestal and glowing effects. Subject: A compact raised rectangular planting box with two neat rows of large leafy green crops, a visible short blue irrigation channel and a small valve at the back. An emblematic farming interaction device, not a whole farm landscape.

### 床
+
Use case: stylized-concept. Generate ONE standalone game interactable device pawn asset. Input image is STYLE REFERENCE ONLY: match its hand-painted cartoon finish, bold dark outline, soft simple shading, low-saturation color blocks, rounded chunky shapes and dark charcoal thin oval tabletop pawn base. Do not copy the human or any injury. Fixed elevated three-quarter isometric view, front and right side visible. Soft upper-left light. Object centered on one broad very thin dark oval base matching the reference base, whole object and base fully visible with 12% clear margin. This is a readable miniature for a 144px-wide diamond tile: simplify details to survive display at approximately 60-80px wide. Real transparent RGBA background, no background color, no checkerboard, no floor, no ground cast shadow, no text, no labels, no frame, no UI, no human characters. Avoid photorealism, tiny decorative clutter, huge buildings, thick pedestal and glowing effects. Subject: A simple short wooden single bed, one cream pillow and a muted dusty blue folded blanket, low headboard, four stout legs. Strong unmistakable bed silhouette.

### 制肥桶
+
Use case: stylized-concept. Generate ONE standalone game interactable device pawn asset. Input image is STYLE REFERENCE ONLY: match its hand-painted cartoon finish, bold dark outline, soft simple shading, low-saturation color blocks, rounded chunky shapes and dark charcoal thin oval tabletop pawn base. Do not copy the human or any injury. Fixed elevated three-quarter isometric view, front and right side visible. Soft upper-left light. Object centered on one broad very thin dark oval base matching the reference base, whole object and base fully visible with 12% clear margin. This is a readable miniature for a 144px-wide diamond tile: simplify details to survive display at approximately 60-80px wide. Real transparent RGBA background, no background color, no checkerboard, no floor, no ground cast shadow, no text, no labels, no frame, no UI, no human characters. Avoid photorealism, tiny decorative clutter, huge buildings, thick pedestal and glowing effects. Subject: A squat lidded compost-making wooden barrel with dark metal hoops, a simple side crank and a small green leaf emblem painted on the front, a few green leaf tips visible at lid edge. Clearly a compost apparatus, not a drinking water bucket.

### 制药台
+
Use case: stylized-concept. Generate ONE standalone game interactable device pawn asset. Input image is STYLE REFERENCE ONLY: match its hand-painted cartoon finish, bold dark outline, soft simple shading, low-saturation color blocks, rounded chunky shapes and dark charcoal thin oval tabletop pawn base. Do not copy the human or any injury. Fixed elevated three-quarter isometric view, front and right side visible. Soft upper-left light. Object centered on one broad very thin dark oval base matching the reference base, whole object and base fully visible with 12% clear margin. This is a readable miniature for a 144px-wide diamond tile: simplify details to survive display at approximately 60-80px wide. Real transparent RGBA background, no background color, no checkerboard, no floor, no ground cast shadow, no text, no labels, no frame, no UI, no human characters. Avoid photorealism, tiny decorative clutter, huge buildings, thick pedestal and glowing effects. Subject: A compact wooden medicine crafting workbench with a mortar and pestle, exactly two chunky glass medicine bottles in muted teal and amber, a little herb bundle, one low rear shelf. Nonmagical practical herbal medicine station, strong uncluttered silhouette.

### 仓库
+
Use case: stylized-concept. Generate ONE standalone game interactable device pawn asset. Input image is STYLE REFERENCE ONLY: match its hand-painted cartoon finish, bold dark outline, soft simple shading, low-saturation color blocks, rounded chunky shapes and dark charcoal thin oval tabletop pawn base. Do not copy the human or any injury. Fixed elevated three-quarter isometric view, front and right side visible. Soft upper-left light. Object centered on one broad very thin dark oval base matching the reference base, whole object and base fully visible with 12% clear margin. This is a readable miniature for a 144px-wide diamond tile: simplify details to survive display at approximately 60-80px wide. Real transparent RGBA background, no background color, no checkerboard, no floor, no ground cast shadow, no text, no labels, no frame, no UI, no human characters. Avoid photorealism, tiny decorative clutter, huge buildings, thick pedestal and glowing effects. Subject: A compact sturdy storage rack holding two large wooden supply crates and a cream tied sack, one closed lower cabinet with dark iron latch. An emblematic warehouse storage interaction station, no full warehouse building.
