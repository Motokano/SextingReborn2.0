# 工具台棋子 v1

2026-09-26，按用户要求将观测台改名工具台，并新增装置棋子。内部 NPC ID 与解锁标记保留 observation，以兼容存档。

使用内置 imagegen，以同目录 pharmacy.png 为画风、视角、底座参考；属于装置，不套用人形骨骼或七部位规则。原始生成文件：`C:/Users/haoxian.huang/.codex/generated_images/01a0d20c-b6c0-74e0-a2d0-49bc82bf6746/exec-a0b767c6-a316-4405-bea6-a354282c940f.png`。项目素材为 `toolbench.png`，原图复制保留，无后期重绘。

源图 1300×1209，实测 alpha 裁切 [218,77,869,1055]，底座锚点 [662,1131]，透明像素占比 56.55%，四角 alpha 均为 0。144px 格宽下可见宽度 58px、高约 70.4px，底座下缘为格中心下 8px。沿用 TileRendererV2.makeGroundShadow，footprint [29,10]，不烘焙地面投影。

运行时通过 npc.station.observation_base 选中图像，替换之前简易绘制。实际 8016 服务已返回新配置。使用同服务器 runtime-review.html、真实基地入口数据与游戏绘制代码，在 144px 格宽检查与灶台、制药台并列的大小、底座与投影；不改动玩家当前存档。装置透明度、尺寸、阴影、NPC 可见性与地图投影测试通过。最终美术仍待用户体验确认。

## 生成提示词

Use case: stylized-concept. Create one new transparent PNG game device pawn: a small wooden utility workbench (工具台), used to unlock simple measuring tools and calendar. Reference image is an existing pharmacy device pawn: match its three-quarter isometric camera, hand-painted cartoon volume, bold dark outlines, warm restrained wood colors, detail quality, thin charcoal oval pedestal and compact tabletop silhouette. Replace subject with a utility bench: wooden backboard holding a small cream paper flip calendar with a few simple marks but NO legible text or digits; a vertical red-liquid glass thermometer mounted on the backboard; one small brass circular measuring dial, a wooden-handled hand tool and small parts tray on tabletop; one drawer underneath. Keep sparse and clearly readable at 58px visible width. Not a person, no character, no huge industrial machine. One centered isolated complete pawn, all feet on a single wide shallow oval charcoal pedestal like the reference. Genuine transparent background, no opaque/checkerboard backdrop, NO cast ground shadow outside pedestal, no terrain, no scene, no labels, no border, no watermark. Upper-left lighting, material shading only. Save generated image and return its path.
