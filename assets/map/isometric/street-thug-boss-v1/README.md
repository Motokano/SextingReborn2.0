# 地头头目运行素材

> 2026-10-31：用户另行要求更新头目专属倒地图，并随后要求换姿势；当前美术及预览见 [v3向前扑倒](../street-thug-boss-defeated-v3/README.md)。本目录站姿原图保留，新倒地图尚未切换正式尸体分支。下文统一面粉袋要求记录当时运行情况，不再限制本次明确授权的倒地素材制作。

2026-10-28。`standing.png` 为已确认 `reference/street-thugs-v1/tier-4.png` 的透明提取版，内置 imagegen 制作，生成式提取不是无损抠图。第一档 `reference/street-thugs-v1/tier-1.png` 同时作为画风参考输入，未改变服饰身份。原始输出：`exec-d09a4eb6-3b82-42d5-86aa-0f199c2c65c6.png`。

RGBA 1215×1295，alpha 0–255。主体 alpha>128 包围盒 (244,43)–(950,1238)。运行裁切 [240,40,715,1200]，底座锚点 [597.5,1238]，144px 格宽下等比显示46px宽，沿用统一底座与地面投影。

用户随后明确：敌人死亡统一显示原有面包／面粉袋式尸体棋子，即 `assets/dungeon/corpse.png`（标记后 `corpse-marked-v2.png`）。本目录不接入新倒地图；伤残不切换死亡素材。

内置生成最终提示：

> Use case: background-extraction. Edit target image 1 (tier-4): the approved green short-sleeve jacket street thug boss standing on a wide thin dark grey oval base. Change only its white background to genuine transparent alpha. Preserve the exact character identity, swept black hair and grey temples, face, clothes, wrist wrap, complete limbs, standing pose, proportions, hand-painted shading, outlines, lighting and complete base. Do not redesign. Supporting image 2 (tier-1) is the mandatory style/quality reference only, do not copy its clothes or face or checkered background. No baked ground shadow outside base, no text, no environment, no other character. Full standing character and entire oval base centered with small transparent margin.
