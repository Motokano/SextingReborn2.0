# 健身房设施棋子

2026-11-03用户确认现行布局和素材接入正式游戏。批准记录见`approval.json`；正式`js/gym-art.mjs`与`js/gym-scene.js`读取同一manifest，等级直接读保存的GymSystem状态。下文保留绘制与试玩过程记录，当前接入状态以本段为准。

用于8049健身房Demo。用户随后认可现实器械方向并指定藏身处左上角9×10格；已制作`tools/gym-hideout-review.html`布局预览，尚未接正式设施运行或存档。床直接读取 `../hideout-facilities-v2/bed-ready.png` 及其既有登记，不重画，藏身处预览保留原床位置。

## 当前方向

2026-11-03用户要求八类设施按77号规范绘制并随升级变化，随后指出悬吊头套式颈部架过于离奇，要求直接参考现实健身器材。现行稿撤下该结构；颈部、腿部及手足附件以现实器械重画，保留游戏描边、用色、原生等距朝向和适量旧化。不要再按旧头套、足趾弹簧机关或踝部传动踏板继续扩画。

| 设施 | 四档外观变化 |
| --- | --- |
| 基础训练区 | 训练垫 → 防滑垫 → 俯卧撑支架 → 负重背心／沙袋附件 |
| 单杠训练架 | 双立柱单杠 → 底部加固 → 握持包覆／连接件 → 配重挂接与负重腰带 |
| 可调哑铃组 | 可拆片哑铃 → 更多配重 → 锁紧结构 → 两层收纳与配重扩充 |
| 杠铃训练站 | 杠铃架与卧推凳 → 加固 → 更多杠铃片 → 保护杆与承重加固 |
| 滑轮牵引架 | 高低位牵引架 → 滑轮轴承 → 钢索导向 → 框架和配重扩充 |
| 腿部抗阻架 | 现实坐姿伸屈腿机 → 座椅机架 → 滚垫和转轴 → 移动杆配重扩充 |
| 颈部训练机 | 坐姿开放压垫机 → 压垫和座椅调节 → 转轴加固 → 配重与行程调节 |
| 手足专项训练台 | 共用台架；手部、足踝、足趾三套用具各自四档，分别读取各自等级 |

手部采用普通扭簧握力器、软弹力环／握捏材料及张指训练器。足踝采用斜踏板、垫高块和弹力带。足趾采用毛巾、弹力带、拾物珠、小配重及软垫；不画虚构的夹脚／夹趾机器。升级中的添置仍对应Demo原有动作，不在本次美术修改中改变52个动作或成长经济。

## 现实结构参考

这些公开厂家图片仅用于识别结构，不作为游戏素材直接显示，不复制品牌文字。

- [Rogers 4-Way Neck](https://rogersathletic.com/products/4-way-neck/)：座椅、开放压垫、侧置转轴及配重杆。
- [Atlantis Total Neck PW120](https://atlantisstrength.com/gym-equipment/pw120)：同类四向颈部训练机的开放结构。
- [Titan伸屈腿机](https://titan.fitness/products/leg-extension-curl-machine)：上下滚垫、膝位转轴、与活动杆相连的配重。
- [Captains of Crush握力器](https://www.roguefitness.com/captains-of-crush-grippers)、[Xtensor张指训练器](https://www.roguefitness.com/the-xtensor)：手部用具。
- [Slant Board斜踏板](https://slantboard.co.uk/products/slant-board)：防滑斜面与普通木支撑。
- [毛巾与弹力带足趾练习示例](https://www.sussexmskpartnershipcentral.co.uk/wp-content/uploads/2020/07/FLEXOR-HALLUCIS-STRENGTHENIN.pdf)：仅核对用具类型，没有复制练习图或作为现实训练建议。

其余结构以普通单杠、可拆片哑铃、杠铃卧推架、高低位下拉机和训练垫为原型；复核参考 [Rogue S-2架](https://www.roguefitness.com/rogue-s2-squat-stand-2-0)、[Rogue力量器械目录](https://www.roguefitness.com/strength-equipment)。

## 原图与登记

全部生成使用内置 `image_gen`，每个等级独立生成。`records/*.json` 保存现行图的准确提示、实际参考路径、原始输出与使用路径；`prompts.json` 是首轮提示，`real-equipment-prompts.json` 记录用户纠正后的替代方案。带 `-real.png` 的现行稿覆盖对应旧稿；旧文件和 `superseded-records/` 仅留溯源，不进入现行清单。

现行清单共41张透明PNG：7类普通器械×4档、手足共用台架1张、3类附件×4档。床另复用已有素材。PNG按原文件复制，登记校验源文件与使用文件SHA-256相同；未重采样、拉伸、旋转、裁切写回或修改透明像素。

`calibration.json` 记录人工确认的原图接地点、锚点和统一缩放。`manifest.json` 是渲染正本；144px棋格、人物125%，图像只按一个倍率等比绘制，接地阴影独立生成。几何模板与原生方向保存在 `reference/gym-facilities-v1/`；模板在生成前制作，不用于事后扭曲原图。

逻辑占格：垫、滑轮架、腿部机、床为1×2；单杠与颈部机2×1；杠铃站与手足台2×2；哑铃组1×1。占格与互动统一，角色走到任一可达相邻格开窗；占格不随等级扩张。

## 预览和检查

- `tools/gym-prototype.html?no_reload`：原Demo，建造／升级即时刷新棋子。
- `tools/gym-art-review.html?no_reload`：四档同屏、125%人物及接地点开关；手足附件可分别选择等级。
- `node tools/register-gym-art.mjs`：重新登记现行原图并检查透明度与原图一致性。

所有试玩状态仍仅在内存，不修改玩家存档或正式地图。
