# 地痞据点棋盘候选 v4

2026-10-29。响应房间围合、方向逻辑与人物比例反馈。当前为5×8室内、3×4中央净空的独立正式棋盘试场；未部署到随机楼层。

- 最新追加：货架按1×2格重新生成透明图，保存在 assets/dungeon/street-thug-boss-room-v4/，其余家具和容器原图保留。校准宽度与测量点见 tools/street-thug-boss-room-scale.mjs。
- 正式玩家约71px、头目约77px可见图框（保留原始比率），底座46px；比较用实际资产，不使用示意人。
- 桌面、凳面、床面沿实际竖边测量，显示比较时将该支脚和人物的底座接地线排齐。
- 朝向由可见正面、墙面位置和可达操作格共同约束。桌后座椅朝桌面，容器搜空后不翻转。
- 验证：tools/test-street-thug-boss-room-board.mjs；隔离文档同步：tools/build-boss-room-review.mjs --check。
- 在线空间参考及范围见 docs/design/76-street-thug-boss-room-art.md；无第三方图片导入。

截图在实际棋盘预览页通过浏览器保存。

货架依据 rack-geometry.html / rack-geometry.png 的真实棋格投影绘制。rack-contact-check.html 标记原图可见脚点。manifest.json 记录原图残余角度、显示校准和约3px的脚点误差，不将生成式绘图宣称为像素级精确几何。源图无像素后处理，透明通道保留。
