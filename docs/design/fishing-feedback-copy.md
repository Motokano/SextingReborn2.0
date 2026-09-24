# 钓鱼事实反馈文案全表

当前共 51 项事实、38 组反馈、152 条文案，每组 4 条。配置正本为 `data/fishing-feedback.json`，事实注册为 `data/fishing-facts.json`。本表便于审阅；已接入正式钓鱼界面和首塘试玩。

## 使用约定

- 每组需要的事实必须全部已被玩家感知，且符合感知渠道。支撑事实（例如持竿、已经检查）不单独凑成一句提示。
- 同一事实组合内换说法，不增加次数、速度、强弱、方向或隐藏原因。
- 钩上无饵只说当前无饵，不推断原先有饵或被鱼吃掉。末端缺件不推断断在哪里。
- 只有光线不足时才使用看不清的反馈；听到水响本身不代表看不清，也不说明水声来自鱼。
- 探底的通用句只说获得估计或未确认；具体水深、底质须由已感知的点位结果另行提供。
- `{float}` 必须由认知层提供当时可知的称呼；鱼获通用句不揭示鱼种。
- 调整完成不表示调整有效，不给最佳配装建议。
- 组合句与单项句同时满足时优先组合句，不把同一事实反复播报。单项句用于事实不齐全的情况；该调度规则已接入。
- 选择器避免最近两条重复，同一事件重复读取沿用原句；不改变玩法随机数。

## 逐组文案

### float_still

渠道：visual。需要：本节点能看见水面浮物；当前呈现处于稳定露出状态；已观察时段内未出现可见新变化。

- {float}稳定露在水面，等了一阵，没有明显变化。
- 看了一会儿，{float}仍停在那里，没有明显动静。
- {float}露出的位置没什么变化。
- 这阵子没看见{float}有明显动作。

### float_sinks

渠道：visual。需要：本次下沉开始时看见浮物；浮物进入水面以下；本观察节点结束前未重新露出。

- {float}没入水中后，没有再露出来。
- 看见{float}沉了下去，此后没再浮上来。
- {float}已经沉到水面以下，没有重新出现。
- 刚才还看得见{float}，沉下去后就没再露头。

### poor_visibility

渠道：visual。需要：当时条件不足以分辨细微漂相。

- 光线太暗，细小的漂动看不清。
- 水面昏暗，难以分辨{float}的细小动作。
- 看不清{float}有没有轻微变化。
- 眼下的光线不足以看清细小漂动。

### single_tap

渠道：visual。需要：本节点能看见水面浮物；发生一次轻微下顿；该次轻点后恢复原露出位置。

- {float}轻轻点了一下，又回到原处。
- {float}短促地下沉了一点，随后恢复原样。
- 看见{float}轻点了一下，很快便恢复了。
- {float}微微一沉，随即又浮回原来的位置。

### repeated_taps

渠道：visual。需要：本节点能看见水面浮物；本节点发生多次轻点。

- {float}接连点动了几次。
- {float}一连几次轻轻下沉。
- 看见{float}反复轻点。
- {float}连续出现了几次小幅下顿。

### sideways

渠道：visual。需要：本节点能看见水面浮物；本节点发生持续横移。

- {float}持续向一侧移动。
- {float}正沿着水面往一边走。
- {float}没有停在原处，仍在向旁边移动。
- 能看见{float}一直往同一侧挪动。

### strike_no_pull

渠道：touch。需要：角色正在持竿执行动作；本次提竿节点已执行；提竿后没有持续负载。

- 提起时，没有感到持续拉扯。
- 抬竿以后，手上没有持续的拉力。
- 这次提竿没带来持续的拉扯。
- 竿抬起来了，但没有持续拉住什么的感觉。

### brief_pull

渠道：touch。需要：角色正在持竿执行动作；入口但未挂牢的节点产生短暂牵拉；刚才的短暂负载已解除。

- 手上一紧，随即松了下来。
- 感到一点拉扯，很快就消失了。
- 刚感到一阵拉力，转眼又松开了。
- 手上传来的拉扯只持续了很短一会儿。

### tip_returns

渠道：visual。需要：当时能看到竿梢；短暂牵拉使竿梢弯下后恢复。

- 竿梢刚压下去，又弹了回来。
- 竿梢短暂弯了一下，随后恢复原样。
- 看见竿梢一弯，很快又回弹了。
- 竿梢向下压了一下，紧接着又抬了回来。

### sudden_slack

渠道：touch。需要：角色正在持竿执行动作；此前存在持续负载；本节点持续负载解除。

- 原本持续的拉扯突然消失了。
- 手上一松，刚才那股拉力断了。
- 持续拉着的力道一下子没了。
- 刚才还在拉扯，忽然就松了下来。

### fixed_resistance

渠道：touch。需要：角色正在持竿执行动作；执行了实际回收或受阻处理；当前固定障碍仍在牵制。

- 收到这里便拉不动了，阻力来自同一方向。
- 再往回拉时，线在一个方向绷住了。
- 往回收的动作停了下来，同一方向仍有阻力。
- 拉到这里就停住了，再收仍受到固定方向的牵制。

### retry_fixed

渠道：touch。需要：角色正在持竿执行动作；本次执行放松后再试；同一受阻事件没有解除。

- 放松后再提，仍在相近的位置绷住。
- 松了一下再拉，还是在那里受阻。
- 放松没有解除阻力，再收时又停在相近的位置。
- 重新提动后，刚才那处阻力仍在。

### variable_pull

渠道：touch。需要：角色正在持竿执行动作；相邻实际对抗步骤的负载不同。

- 手上的拉力和刚才不一样了。
- 能感觉到拉扯的力道变了。
- 这一下的拉力有了变化。
- 传到手上的力道发生了变化。

### fish_and_obstruction

渠道：touch。需要：角色正在持竿执行动作；当前固定障碍仍在牵制；固定受阻时当前鱼行为仍有配置的脉冲拉扯。

- 线仍被牵住，其间又传来几下拉扯。
- 固定方向的阻力还在，同时能感到另外几阵拉力。
- 仍然拉不回来，手上却又多了几下拉扯。
- 受阻没有解除，其间断续传来几阵拉力。

### obstruction_released

渠道：touch。需要：角色正在持竿执行动作；本次受阻状态转为解除；解除后能够继续回收。

- 阻力松开，线又能收回了。
- 原先拉不动的位置松了，能继续往回收。
- 固定的牵制消失了，回收又能继续。
- 刚才那处阻力解除了，线开始收得回来。

### line_payout

渠道：touch。需要：角色正在持竿执行动作；本节点渔轮实际放线且可感知；当前收鱼进度没有增加。

- 绕线处仍在放线，没有把它拉近。
- 能感觉到线继续放出，这次没能拉近。
- 这阵子线还在向外放，没见距离缩短。
- 线在往外放，这次收线没有把它带近。

### progress

渠道：touch。需要：角色正在持竿执行动作；当前仍有持续负载；本步收鱼进度增加且持竿可感知。

- 拉扯还在，但已经比刚才拉近了一些。
- 仍能感到拉力，这次往回带近了一点。
- 拉扯没有消失，距离却比刚才近了。
- 顶着这阵拉力，还是往回收近了一些。

### bait_present

渠道：inspection。需要：钩已在岸上检查；被检查的钩上仍有饵实例。

- 检查时，钩上挂着饵。
- 看了看钩，上面有饵。
- 钩上的饵能看得清楚。
- 查看末端，饵挂在钩上。

### bait_absent

渠道：inspection。需要：钩已在岸上检查；被检查的钩上没有饵实例。

- 检查时，钩上没有饵。
- 看了看钩，上面是空的。
- 查看末端，没有看见钩上挂着饵。
- 钩上已经看清楚了，没有饵。

### hook_line_present

渠道：inspection。需要：岸上已检查末端组成；实际末端钩存在；实际末端短线存在。

- 检查后，钩和末端短线都在。
- 查看钓组，末端连着短线和钩。
- 末端的短线和钩都能看见。
- 看了看末端，短线与钩都连着。

### terminal_missing

渠道：inspection。需要：岸上已检查末端组成；实际末端钩缺失；实际末端短线缺失。

- 检查末端，没有看见短线和钩。
- 查看钓组，末端没有连着短线和钩。
- 末端那段短线和钩都不在。
- 看清末端后，没有找到短线和钩。

### grass_attached

渠道：inspection。需要：钩已在岸上检查；本次带草事件留下的可检查草叶。

- 钩上挂着水草。
- 检查钩时，看见上面带着草。
- 查看末端，水草附在钩上。
- 钩上能看见附着的草。

### no_attachment

渠道：inspection。需要：钩已在岸上检查；检查时没有本次事件留下的附着物。

- 钩上没有看见缠挂的杂物。
- 检查钩时，没发现缠着什么杂物。
- 看了看钩，没有明显附着的杂物。
- 查看末端，没在钩上发现缠挂的东西。

### line_frayed

渠道：inspection。需要：岸上已检查实际主线；检查时线磨损达到可见阈值。

- 线上有起毛的地方。
- 检查时，发现线的局部有些毛糙。
- 线上能看见毛边。
- 细看这段线，有的地方已经起毛。

### surface_splash

渠道：visual。需要：路亚接触事件的可见水花。

- 水面翻起了水花。
- 看见水面溅起一片水花。
- 水面上出现了翻动的水花。
- 一片水花从水面溅起。

### surface_sound

渠道：sound。需要：路亚接触事件的可闻水响。

- 听见一声水响。
- 水面方向传来响动。
- 耳边传来一阵水响。
- 有水声从那边传来。

### bottom_estimate

渠道：touch。需要：探底结果包含深度估计证据。

- 这次探底有了结果，能大致估计这里的深浅。
- 根据这次探底，大致能判断这里有多深。
- 探过以后，对这里的水深有了大概估计。
- 这次已经探到了底，深浅大致有数了。

### bottom_uncertain

渠道：touch。需要：探底结果没有确认水底。

- 这次还没能确认水底。
- 探了一次，仍不能确定有没有到底。
- 这次探底的结果还不明确。
- 还不能凭这次探查判断水底在哪里。

### catch_seen

渠道：inspection。需要：已处理上岸鱼获。

- 眼前的鱼已经能看清了。
- 现在可以仔细看看这条鱼。
- 这条鱼就在眼前，能看清它的样子。
- 鱼的模样已经看得清楚。

### setup_changed

渠道：inspection。需要：实际部件或深度设置发生改变。

- 钓组已按刚才的操作调整。
- 这次调整已经完成。
- 钓组的设置已经改好了。
- 刚才对钓组的改动已经完成。

### pull_continues

渠道：touch。需要：角色正在持竿执行动作；当前仍有持续负载。

- 手上仍能感到拉扯。
- 那股拉力还在。
- 拉扯还没有停。
- 仍有力道牵着竿。

### no_progress

渠道：touch。需要：角色正在持竿执行动作；当前收鱼进度没有增加。

- 这次没能往回收近。
- 还没有拉近的感觉。
- 这一轮没有收近。
- 这次往回拉，没有明显进展。

### still_submerged

渠道：visual。需要：浮物进入水面以下；本观察节点结束前未重新露出。

- 水面上仍没见{float}露出来。
- {float}还在水面以下，没有重新露头。
- 依旧没有看见{float}浮上来。
- {float}没在水面上重新出现。

### hook_missing

渠道：inspection。需要：岸上已检查末端组成；实际末端钩缺失。

- 检查末端，没有看见钩。
- 查看钓组，末端没有钩。
- 看清末端后，没有找到钩。
- 末端没有连着钩。

### leader_missing

渠道：inspection。需要：岸上已检查末端组成；实际末端短线缺失。

- 检查末端，没有看见那段短线。
- 末端没有连着短线。
- 查看钓组，找不到末端的短线。
- 看清末端后，没有发现短线。

### hook_seen

渠道：inspection。需要：岸上已检查末端组成；实际末端钩存在。

- 末端能看见钩。
- 检查钓组，钩在末端。
- 查看末端，钩还连着。
- 末端的钩能看清楚。

### leader_seen

渠道：inspection。需要：岸上已检查末端组成；实际末端短线存在。

- 末端连着一段短线。
- 检查时，能看见末端的短线。
- 查看钓组，末端的短线在。
- 末端那段短线能看清楚。

### retrieved

渠道：inspection。需要：实际回收动作完成。

- 钓组已经收回。
- 这次回收已经完成。
- 已经把钓组收回来了。
- 钓组已收回手边。

## 事实覆盖索引

| 事实 | 文案组 |
|---|---|
| float_visible | float_still、single_tap、repeated_taps、sideways |
| float_stable | float_still |
| no_visible_change | float_still |
| float_visible_at_start | float_sinks |
| float_submerged | float_sinks、still_submerged |
| no_reappearance | float_sinks、still_submerged |
| float_visibility_insufficient | poor_visibility |
| single_light_dip | single_tap |
| float_returned | single_tap |
| repeated_light_dips | repeated_taps |
| sustained_lateral_motion | sideways |
| holding_rod | strike_no_pull、brief_pull、sudden_slack、fixed_resistance、retry_fixed、variable_pull、fish_and_obstruction、obstruction_released、line_payout、progress、pull_continues、no_progress |
| strike_completed | strike_no_pull |
| no_sustained_pull | strike_no_pull |
| brief_tension | brief_pull |
| tension_released | brief_pull |
| rod_tip_visible | tip_returns |
| tip_bent_then_returned | tip_returns |
| sustained_tension_before | sudden_slack |
| sudden_tension_loss | sudden_slack |
| retrieval_attempt | fixed_resistance |
| fixed_direction_resistance | fixed_resistance、fish_and_obstruction |
| relax_then_pull | retry_fixed |
| same_obstruction_persists | retry_fixed |
| tension_strength_varies | variable_pull |
| separate_pull_pulses | fish_and_obstruction |
| obstruction_released | obstruction_released |
| retrieval_possible | obstruction_released |
| payout_perceived | line_payout |
| no_observed_progress | line_payout、no_progress |
| pull_persists | progress、pull_continues |
| progress_perceived | progress |
| retrieve_completed | retrieved |
| hook_inspected | bait_present、bait_absent、grass_attached、no_attachment |
| bait_present | bait_present |
| bait_absent | bait_absent |
| terminal_inspected | hook_line_present、terminal_missing、hook_missing、leader_missing、hook_seen、leader_seen |
| hook_present | hook_line_present、hook_seen |
| leader_present | hook_line_present、leader_seen |
| hook_absent | terminal_missing、hook_missing |
| leader_absent | terminal_missing、leader_missing |
| grass_attached | grass_attached |
| no_visible_attachment | no_attachment |
| line_inspected | line_frayed |
| visible_local_fraying | line_frayed |
| surface_splash_visible | surface_splash |
| surface_sound_heard | surface_sound |
| bottom_estimate_obtained | bottom_estimate |
| bottom_unconfirmed | bottom_uncertain |
| catch_visible | catch_seen |
| component_changed | setup_changed |

## 运行接入记录

正式句库已移至 `data/fishing-feedback.json`，主游戏与试玩页共同加载。动作结束时从当次已感知事实选句，按配置优先级和排除关系合并，最多六句；页面重画不选新句。连续等待且事实不变时更新原记录的次数和时间，不消耗新句。词句选择历史与现有钓鱼存档一起保存。

夜间仍能感知“看不清”和“已经收回”，但不能检查饵或末端部件。抛竿、提竿、拉扯、挂底、回收的旧同类提示已让位于事实句库；动作回执及点位具体探底记录继续保留。自动测试覆盖组合优先、缺少事实不出句、夜间筛选、等待合并、读档一致；浏览器已验收抛竿和回收的新文案及单屏布局。
