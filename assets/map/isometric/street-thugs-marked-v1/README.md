# 四种倒地棋子 · 标记状态 v1

2026-11-03，用户要求为四种已有死亡棋子补齐标记状态。沿用尸体袋的棕色交叉胶带，贴于朝上的衣服，头目贴背部；保持原倒地姿势、人物身份、完整四肢和薄灰底座。随后按用户要求接入剧情变量「血腥开关」：默认关闭时显示共用面粉袋与面包，开启后显示本组各自的普通／标记态。规则见[血腥开关](../../../../docs/design/corpse-gore-switch.md)。

## 素材和精确提示

| 角色 | 新标记态 | 原倒地态 | 提示 |
| --- | --- | --- | --- |
| 街头混混 | [tier-1-marked.png](tier-1-marked.png) | [仰面摊倒](../street-thug-lower-tiers-defeated-v1/tier-1.png) | [一档](tier-1-prompt.txt) |
| 看场打手 | [tier-2-marked.png](tier-2-marked.png) | [侧身蜷倒](../street-thug-lower-tiers-defeated-v1/tier-2.png) | [二档](tier-2-prompt.txt) |
| 老练狠角色 | [tier-3-marked.png](tier-3-marked.png) | [侧身倒地](../street-thug-veteran-v1/defeated.png) | [三档](tier-3-prompt.txt) |
| 地头头目 | [boss-marked.png](boss-marked.png) | [v3扑倒](../street-thug-boss-defeated-v3/defeated.png) | [头目](boss-prompt.txt) |

使用内置 `image_gen.imagegen`，每张单独编辑。每次输入均为对应倒地原图（编辑对象）、`assets/dungeon/corpse-bag-v3/marked.png`（仅胶带参考）、`reference/street-thugs-v1/tier-1.png`（60号画风参考），生成前已实际查看。源输出、工具输入和精确提示见 [generation.json](generation.json)，输入／输出SHA256和显示登记见 [manifest.json](manifest.json)。选用PNG直接复制，未做像素后处理；生成式编辑有轻微细节差异，不称无损叠图。

## 显示登记

四张均为真实RGBA，四角alpha为0。前两档和头目画布1536×1024；第三档输出1115×1410，与原1215×1295不同，通过人物轮廓宽度与接地位置等比校准，不修改PNG，不做宽高独立拉伸。

| 角色 | 标记态裁切 x/y/w/h | 接地锚点 | 144px格宽等比倍率 |
| --- | --- | --- | --- |
| 街头混混 | 103 / 110 / 1358 / 844 | 782 / 950 | 0.0759577279 |
| 看场打手 | 44 / 255 / 1449 / 630 | 768.5 / 881 | 0.0759577279 |
| 老练狠角色 | 17 / 369 / 1086 / 658 | 559.5314927 / 1027 | 0.0816025283 |
| 地头头目 | 40 / 201 / 1488 / 642 | 780 / 839 | 0.0643356643 |

上述倍率已含125%人物。前两档使用原登记；头目两态共用包住两图的裁切，原锚点和v3的0.8身体校准保持。原生朝向不旋转／镜像，接地位置为格中心下10px，预览独立投影复用 `TileRendererV2.makeGroundShadow`。仅作显示登记，不回写骨骼或逻辑占格。

## 预览与检查

[四种对照页](../../../../tools/street-thugs-marked-art.html?no_reload) 提供大图、144px棋格／125%主角对照和标记开关，不加载游戏存档。棋格模式复用正式死亡绘制，支持本页临时血腥开关，默认关闭。本次检查地址：`http://127.0.0.1:8051/tools/street-thugs-marked-art.html?no_reload`。

- [大图对照](review-overview.png)
- [前两档实际棋格](review-board-upper.png)
- [第三档与头目实际棋格](review-board-lower.png)
- [正式绘制：血腥开关关闭](review-gore-off.png)
- [正式绘制：血腥开关开启](review-gore-on.png)／[第三档与头目](review-gore-on-lower.png)

已实际查看四种大图与棋格显示，胶带X可辨、人物和底座完整，两态尺寸与落点接近；标记开关可切换。透明和选用PNG与生成源字节一致性检查通过。第三档仍有生成式细节差异，最终美术评价待用户反馈。正式接入仅按剧情开关切换表现，并保留尸体身份随存档恢复；死亡、搜刮和回收规则保持。

复现登记：`node tools/register-street-thugs-marked.mjs`（需保留本机生成来源文件）。
