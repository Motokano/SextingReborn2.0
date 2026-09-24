# 地痞四档外观定稿

2026-09-15 用户确认四档形象，并授权一档接入现有地痞。

- tier-1.png：街头混混，灰背心、单手旧绷带。
- tier-2.png：看场打手，黑背心、单手缠带。
- tier-3.png：老练狠角色，酒红短袖、双手缠带。
- tier-4.png：地头头目，墨绿外套、放低双手。

四张均为内置 imagegen 生成的原始概念定稿，保留原图；原图背景不作为透明游戏素材使用。二至四档已归档，未绑定敌人。

## 一档运行时

素材：../../assets/map/isometric/street-thug-v1/standing.png
绑定：enemy.street_thug，js/core/tile-renderer-v2.js。
真实RGBA透明，裁切 [230,38,757,1216]，接地点 [609.5,1253]，144px格宽显示底座46px、本体约74px高；底座下缘在格中心下8px。沿用已认可的合并底座与轮廓投影。保留战斗属性、AI、掉落和现有死亡处理；本次只接入已认可的站立素材，未制作死亡图。

使用内置 imagegen 去背景，可能有轻微重绘差异，不称为无损抠图。源图为 tier-1.png；提取输出 exec-68434d23-711b-4be0-8c98-cd3b8901a1e2.png。
提取提示：Background extraction edit ONLY of this approved game pawn. Remove ALL gray and white checkerboard squares and textured background completely. Output true RGBA transparency, alpha zero outside the character and its physical oval base, including gaps between arms and body and legs. Preserve exactly this character identity, messy black short hair, tan face with cocky brows, gray tank top, one ivory wrapped hand, dark striped track pants and old sneakers, same entire dark gray oval base, same proportions pose outline brushwork lighting. Do not redesign. No new checkerboard, no solid backdrop, no ground cast shadow. Entire base included. Transparent game sprite.

验证：test-device-pawns.mjs 覆盖地痞选图、透明、尺寸、贴地阴影、未知/隐藏及其他敌人隔离；主角128状态回归通过。桌面与当前8000端口6254工作目录同步。
