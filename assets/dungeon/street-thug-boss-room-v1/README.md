# 地痞据点美术素材第一版

2026-10-29。用于第四层专属地痞据点的美术设计候选，未接入正式房间生成。使用内置 image_gen，直接引用已在游戏中的食堂桌、破椅子和遗留箱子；后续三件继续引用本轮看场桌，统一木色、铁件、线条和光源。原始透明PNG完整保留，未用程序抠底、改色或重绘。

## 新增素材

| 文件 | 设计用途 | 状态与占格 | 原始生成文件 |
|---|---|---|---|
| [watch-desk.png](watch-desk.png) | 看场桌，账本和搪瓷杯为桌面装饰 | 常态，2×1格 | exec-3ade7db7-5847-454e-ad21-d47f9c467f0b.png |
| [boss-chair.png](boss-chair.png) | 有扶手的旧木座椅，绿布靠垫和补丁 | 常态，1格 | exec-3cff47ae-351d-4206-ba0e-aa6ac64c068a.png |
| [sealed-stash.png](sealed-stash.png) | 横向封扎货堆，封箱木条和粗绳区分不可搜障碍 | 常态，2×1格 | exec-e1f503ec-4207-457f-9653-16d90479d600.png |
| [territory-mark.png](territory-mark.png) | 门边旧铁片上的白色涂记 | 墙面装饰，无独立占格 | exec-fb534e29-016e-46a0-a1a0-b0da2092960d.png |
| [boss-private-cache.png](boss-private-cache.png) | 头目私藏箱，平盖旧木、暗绿包铁、白漆涂记 | 未搜，1格 | exec-caf66656-ec57-456b-9086-a60a935e34dc.png |
| [boss-private-cache-searched.png](boss-private-cache-searched.png) | 同一私藏箱，掀盖并露出空箱底 | 搜空，1格 | exec-bc774af0-a66b-44ca-aa51-15214823dadb.png |
| [stolen-goods-basket.png](stolen-goods-basket.png) | 赃物袋筐，藤编筐、粗布包与旧绿内衬 | 未搜，1格 | exec-fb519fc1-7e91-4cab-9009-f683987d9e19.png |
| [stolen-goods-basket-searched.png](stolen-goods-basket-searched.png) | 同一袋筐，搜空后布包塌下、露出空腔 | 搜空，1格 | exec-638af59b-1e61-4df9-adff-918d65bd3a4e.png |

八张图片均为RGBA，透明通道包含0和254或255；完整尺寸、可见轮廓及采样记录见 [asset-checks.json](asset-checks.json)。透明区域的隐藏RGB不作为背景色绘制，显示时保留原alpha。容器源图的少量远处alpha=1杂点只在显示时通过带留边的裁切排除，不修改原PNG。外轮廓不能用黑底或棋盘格替代透明。

完整提示、参考图和透明参数见 [PROMPTS.json](PROMPTS.json)。生成源位于本次会话的 `.codex/generated_images/01a17b42-6e6e-7e22-a6af-27970fdf58ae`，项目使用本目录副本。

## 专属容器

2026-10-29按用户要求增加两种专属容器，替换美术预览中的遗留箱子与补缀拉杆箱。使用内置 image_gen 引用本房看场桌、封扎货堆与门边涂记；搜空图分别编辑对应的未搜原图。完整提示与来源见 [CONTAINER-PROMPTS.json](CONTAINER-PROMPTS.json)。两种类型、四张状态图，不增加第三种容器。

私藏箱以开合箱盖表达状态，袋筐以布包鼓起／搜空塌下表达状态。两者都可搜索；封扎货堆继续是不可搜障碍。搭扣与布包只确定外观，不增加钥匙门槛或专属掉落。房间仍只有两个容器，额度与规则沿用75号设计。

显示清单为每个状态记录裁切、接地点和原图箱身／筐身宽度。预览按68px箱身、80px筐身统一尺度绘制，开盖增加的高度与宽度不挤压箱身。生成图的细节存在小幅差异，接入正式房间时仍需校准落格；本轮没有改动正式容器目录和生成器。

## 使用与搭配

详细物件职责、复用素材与美术约束见[76号美术设计](../../../docs/design/76-street-thug-boss-room-art.md)。[manifest.json](manifest.json)记录裁切框、首版显示宽度和候选接地点；这些参数供独立美术预览使用，正式落格仍需随房间接入校准。

预览：[地痞据点美术页](../../../tools/street-thug-boss-room-art.html)。包含两种专属容器搜刮前后并列图、144px格宽下与原头目的比例对照、其余家具、整间搭配，以及深浅背景检查。预览不读写游戏存档，不修改角色或地图。

门边铁片为正面绘制源，贴墙时只做一次墙面投影。看场桌与封扎货堆长边有固定朝向，另一横向可镜像；座椅的开口朝向须与桌和头目站位配合，不能把背面当成已制作状态。家具保留自己的脚架，使用外部地面接触阴影，没有人物式底座。

## 首轮家具检查

浏览器查看了四件新素材的深浅底透明边缘、144px格宽的大小对照、既有容器搜刮前后状态，以及整间搭配。页面无警告或错误，素材引用与JSON通过检查；该记录不代表专属房已在正式游戏生成。

预览截图：[素材总览](../../../reference/street-thug-boss-room-v1/art-sheet.png)、[实际大小与复用状态](../../../reference/street-thug-boss-room-v1/scale-and-reuse.png)。

## 专属容器检查

已在浏览器查看两种容器的深浅底透明边缘、144px格宽下的前后状态并列、与原头目的大小对照，以及房间内未搜／搜空切换。箱盖升起时仍按箱身比例绘制，筐内物资消失后保留筐架。页面无警告或错误，脚本语法、状态文件及显示清单已检查。

本轮截图：[两种容器](../../../reference/street-thug-boss-room-v1/exclusive-containers.png)、[地图大小](../../../reference/street-thug-boss-room-v1/exclusive-containers-scale.png)、[房间未搜](../../../reference/street-thug-boss-room-v1/exclusive-containers-room.png)、[房间搜空](../../../reference/street-thug-boss-room-v1/exclusive-containers-room-searched.png)。此前通用容器的旧截图仅作为首轮记录保留。

## 地面方向修正

用户指出物件摆在地上歪斜。上述首轮预览只缩放、镜像原图，源图边缘方向与地图两条轴不平行；先前“地图大小已检查”不代表透视已经正确。现按项目食堂既有方法，为桌椅、货堆、容器两态及预览中的木架、地毯补上地面方向校准，并调整支撑区域中心。源图不改，人物与墙面装饰不套用这项变换。

`manifest.json`中的`groundSlopes`是源图水平轴斜率，显示时一次映射至±1/√2；绕接地点变换，之后才进行横向镜像，竖直边不随整图旋转。袋筐轮廓为曲线，短轴估计值由两态共用。完整房间与144px对照采用此校准，大图卡片保留原绘。房间区的“摆放”按钮可比较前后，“地面参考线”用于查看物件边缘方向。

[数值记录](ground-registration-checks.json)涵盖9项状态／物件、两种镜像方向及固定接地点；浏览器复核整体、搜空状态和144px对照。视觉记录：[原始方向](../../../reference/street-thug-boss-room-v1/ground-alignment-before.png)、[校准后](../../../reference/street-thug-boss-room-v1/ground-alignment-after.png)、[参考线](../../../reference/street-thug-boss-room-v1/ground-alignment-guides.png)。此修正限独立美术预览，正式接入仍须检查碰撞、遮挡和操作格。
