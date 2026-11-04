# 按棋格绘制的周转货架

2026-10-29，内置 image_gen 生成。新原图原样复制，保留透明通道；旧v3货架保留。提示词见 PROMPT.txt，运行时尺寸和脚点见 manifest.json。

- 先定义1×2格占地，使用棋盘35.264°地面边线和竖直立柱制作参考。
- 几何参考：reference/street-thug-boss-room-v4/rack-geometry.png。
- 画风参考：assets/dungeon/street-thug-boss-room-v3/transit-rack.png。
- 原图1254×1254，RGBA，主体alpha>16的范围为[122,164,1137,1124]，低alpha边缘噪点在显示裁切范围外。
- 显示以953px脚点跨度对应216px两格地面宽度，非按图片整体宽度。保持站立人物原尺寸。
- 原生朝向+X，不镜像、不向墙偏移。生成图仍需小幅地面轴注册；可见三脚校准后误差约2–3px，后脚被遮挡。
- 只替换独立棋盘试场中的货架，未修改正式随机房间部署。

生成来源：exec-f9a79688-d3f9-4931-bb5b-a1ca478583a7.png。
