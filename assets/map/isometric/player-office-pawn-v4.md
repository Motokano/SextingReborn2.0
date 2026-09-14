# 玩家棋子 v4

参考棋盘图调整：可见尺寸39×72px，格宽144px，底座下缘在格中心下8px；缩小头部、拉长棋身、底座加宽。保留右下轮廓投影。实际接入目录为 C:/Users/haoxian.huang/.codex/worktrees/6254/SextingReborn2.0，桌面目录保留素材副本。

内置 ImageGen 制作。PNG 1144×1375，可见alpha>20边界(292,108)-(855,1284)，左上角alpha=0。CSS按可见边界校准，无需改动原图像素。浏览器确认v4加载成功、72px高度及原投影矩阵生效。

## 生成提示词

Edit image 1 office worker abstract pawn. Image 2 is ONLY a proportion reference for the small tapered board-game pawns, not its colors or scene. Keep image 1 clothing and style: short black hair, blank cream face, pale grey knit sweater, pale blue collar and shirt hem, charcoal lower cone, dark outline, muted hand-painted texture, upright fixed three-quarter view. Change proportions clearly: head INCLUDING hair only 20 percent of total pawn height (currently too large); slim long tapered torso, no arms/hands/separate legs; a broader but THIN elliptical weighted base, base width about 55 percent of total pawn height and base height 9 percent of total height. Head width about 23 percent total height. Neck/collar joins small head smoothly to narrow top of torso. Overall height will display at 72 pixels on a 144px-wide isometric tile. Make the silhouette readable at that small size. One complete pawn centered, true transparent background, no shadow (game renders it), no tile, no text, no logos. Keep full head and base visible, tightly frame top and bottom within 3 percent canvas margin. Do not add accessories.

## 透明背景修正提示词

Precise background removal. Keep this exact pawn unchanged. REMOVE the entire gray checkerboard background and all background texture completely. Output actual PNG transparency alpha=0 everywhere outside the pawn. Do not draw a checkerboard as a substitute for transparency, no background color or scenery. Preserve every part of the pawn, its outline, clothing and base. No ground shadow. One fully isolated pawn with a genuinely transparent background.

## 边缘平滑试用（2026-09-14）

当前6254运行目录的js/scene-app.js在素材加载后裁取v4已知可见范围，并通过Canvas高质量平滑分级缩小到至少2倍显示分辨率。当前DPR=1时缓存78×144透明图，以39×72px显示；本体与投影复用相同alpha。未修改高清素材，也没有全局模糊或改变角色比例。此代码的裁取边界仅适用于v4，后续换素材须更新边界。

浏览器已确认 data-texture-sampling=78x144、可见高度72px、原右下投影矩阵保留，实际截图显示外沿较平滑，页面无error。加载处理只在素材改变时运行，不逐帧计算；Canvas不可用时回退原图。最终视觉偏好待用户试用反馈。
