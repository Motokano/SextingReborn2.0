# 玩家通勤装棋子 v3（2026-09-14）

实际游戏代码目录：C:/Users/haoxian.huang/.codex/worktrees/6254/SextingReborn2.0。
此桌面目录保留素材副本；本次未同步两个目录的其他代码。

素材：assets/map/isometric/player-office-pawn-v3.png。使用内置 ImageGen。
修改实际游戏的 css/isometric-map.css 和 js/scene-app.js，保留旧素材与加载失败回退。

旧图 1145x1374，可见 alpha>20 范围 (378,320)-(773,1085)，84px 高 contain 显示下人物约46.8px高，底部留白约17.6px。
新图 1144x1375，可见范围 (254,68)-(889,1319)。背景以87.719x105.431px绘制，向上偏移5.214px，人物可见高96px，底座下缘位于格中心下8px，与接触阴影重合。

验证：实际 http://127.0.0.1:8000 页面 loaded=true，尺寸/背景位置正确；稳定地图截图确认底座接地；页面无error；node --check js/scene-app.js 和 npm run test:isometric-map 通过。外观低风险变更采用实际浏览器检查，未新增镜像实现的单元测试。

## 最终生成提示词

Edit target: image 1 abstract board-game pawn. Image 2 clothing reference ONLY, ignore its text and people identities. Redress this single pawn as a 21st century everyday office worker: short black hair, no hat, blank cream face, light grey simple crewneck knit sweater over a pale blue collared shirt with small blue collar and hem visible, dark charcoal lower cone section suggesting trousers WITHOUT separate legs. No military coat, no shoulder strap, no backpack, no bedroll. Preserve the simple tapered cone body, round weighted oval base, no arms or hands or legs, thick dark hand-painted outline, muted colors, slight hand-painted texture, same fixed 3/4 view for 45 degree game map. One pawn only on actual transparent background, no ground shadow (game adds it), no tile, no text, no logo. CRITICAL frame pawn tightly: full hair top and full base visible, pawn occupies 92-96 percent of canvas height, base bottom within 2 percent of lower edge. Must read clearly at 65x90 pixels. This is a dressed abstract chess pawn, not a realistic human or chibi anatomy.
## 同日尺寸与阴影二次调整（当前生效）

按用户反馈，可见高度从96px改为54px。棋身顶部为格中心上47px，低于菱形上顶点（约51px）；底座下缘仍为中心下7px。
取消整体 drop-shadow 与宽大椭圆暗斑，仅保留26x4px薄接触暗部。
使用同一棋子透明轮廓作CSS mask，通过matrix(1,0,-.48,-.24,0,0)以底座为原点投射到右下地面，远端更淡。这是固定左上来光的风格化短投影，未接动态昼夜光源。
实际运行目录css/isometric-map.css已更新；浏览器确认高度54px、顶部-47px、轮廓mask和投影矩阵生效；实际地图截图确认头部未越过上顶点。
