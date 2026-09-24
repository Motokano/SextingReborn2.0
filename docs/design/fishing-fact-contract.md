# 钓鱼事实与感知契约

本轮范围：补齐四类反馈场景（等候无口、提竿未中、拉扯中断、受阻挂底）及当前 24 组 / 96 条候选文案的事实依赖。另记录探底、路亚水花/水响、鱼获和装备变更。共 51 项。不是宣称全部钓鱼设计或未来天气已实现。

## 数据归属与执行顺序

1. 水域与钓组配置决定事件；现有作业结算改变实际物品和状态。
2. 动作生产者记录真实现象。记录器不抽随机数、不推进时间、不改变鱼情。
3. 当时的光线、持竿和是否已收回检查决定感知渠道；只把筛选后的 facts 交给界面。
4. 文案层只能匹配事实齐备的模板。新句库已接入动作反馈；投食、拾取等操作回执保留。跨次对比摘要尚未接入。

公共规则在 data/fishing-facts.json；记录器在 js/fishing-facts.js；当前池塘生产者在 js/fishing-pond.js，实际承力/损失在 js/fishing-session.js。统一天气未接入，当前读世界时钟和配置中的可见时段。

## 事实来源

| 来源 | 实际依据 |
|---|---|
| 抛竿、等候 | 当前浮物/配重呈现配置；当时光线。看不清不产生“漂稳定”的观察 |
| 鱼口 | 已发生接触后，从配置的接触信号预设选出现象；信号不直接标注鱼种或是否入口 |
| 提竿 | 挂牢结果与接触事件；入口但未挂牢时是否产生短暂受力由 missed_in_mouth_pull 开关决定，与饵是否消耗分开 |
| 拉扯 | 实际进度、负载变化、放线结果、实际失鱼或断线；不从旧提示反推 |
| 受阻 | 已结算的障碍、放松再拉的结果；额外间歇拉扯来自当前行为的 pull_pulses |
| 收回检查 | 实际部件树上的钩、子线、饵、主线磨损阶段；未收回不公开缺失部件 |
| 水草附着 | 草区接触结果单独记录，并绑定当时钩的实例；新钩不会继承旧钩的水草。再次抛竿不凭空清除附着 |
| 探底 | 点位明确配置 probe_evidence，区分获得估计与未确认；不添加水体物理计算 |
| 路亚回收 | 正常完成一趟回收后同样检查实际末端 |

短暂受力、漂相和间歇拉扯是配置驱动的离散事件，不模拟线张力、竿弯曲轨迹或水流。增加文案变体不增加抽取事件的次数。

## 回收与存档

needs_retrieval 表示钓组仍需回收。断线/脱钩后的 ended 不等于已经检查：禁止改装或重新抛竿，提供收回检查。钓组范围限制和剩余线长不在回收前通过准备界面提前揭示。旧存档正在等待、出现鱼口、拉扯或已上岸时补上此标记。

事实记录保留最近 32 条（配置可改），私有存档包含 actual 与 perceived；公共接口只返回 perceived。每条带事件 ID、来源、世界 tick、水域和点位。读档不重新抽事件，不因后来天亮补发过去看不见的现象。新旧互斥事实同次出现时拒绝记录；非法事实存档拒绝载入。

当前池塘的水域键使用入口地图 ID，点位键使用配置索引。以后同一地图加入多个水域或调整点位顺序前，需要迁移为稳定的水域/点位 ID；通用记录器已接受字符串 ID，不能直接重排旧存档索引。

现有旧文字、背包等信息入口仍需在接入新反馈时继续逐项验收；本轮的感知保证适用于新事实接口，不能据此声称所有历史文案均已改造。不同光照下检查、实际失物、存档还原已有测试；尚未逐一人工试玩全部 24 类反馈。

## 事实字典

下表与配置一致。事实只描述本次事件，不代表永远成立；名字不作为直接给玩家看的术语。

| ID | 含义 | 可感知渠道 |
|---|---|---|
| float_visible | 本节点能看见水面浮物 | visual |
| float_stable | 当前呈现处于稳定露出状态 | visual |
| no_visible_change | 已观察时段内未出现可见新变化 | visual |
| float_visible_at_start | 本次下沉开始时看见浮物 | visual |
| float_submerged | 浮物进入水面以下 | visual |
| no_reappearance | 本观察节点结束前未重新露出 | visual |
| float_visibility_insufficient | 当时条件不足以分辨细微漂相 | visual |
| single_light_dip | 发生一次轻微下顿 | visual |
| float_returned | 该次轻点后恢复原露出位置 | visual |
| repeated_light_dips | 本节点发生多次轻点 | visual |
| sustained_lateral_motion | 本节点发生持续横移 | visual |
| holding_rod | 角色正在持竿执行动作 | touch |
| strike_completed | 本次提竿节点已执行 | touch |
| no_sustained_pull | 提竿后没有持续负载 | touch |
| brief_tension | 入口但未挂牢的节点产生短暂牵拉 | touch |
| tension_released | 刚才的短暂负载已解除 | touch |
| rod_tip_visible | 当时能看到竿梢 | visual |
| tip_bent_then_returned | 短暂牵拉使竿梢弯下后恢复 | visual |
| sustained_tension_before | 此前存在持续负载 | touch |
| sudden_tension_loss | 本节点持续负载解除 | touch |
| retrieval_attempt | 执行了实际回收或受阻处理 | touch |
| fixed_direction_resistance | 当前固定障碍仍在牵制 | touch |
| relax_then_pull | 本次执行放松后再试 | touch |
| same_obstruction_persists | 同一受阻事件没有解除 | touch |
| tension_strength_varies | 相邻实际对抗步骤的负载不同 | touch |
| separate_pull_pulses | 固定受阻时当前鱼行为仍有配置的脉冲拉扯 | touch |
| obstruction_released | 本次受阻状态转为解除 | touch |
| retrieval_possible | 解除后能够继续回收 | touch |
| payout_perceived | 本节点渔轮实际放线且可感知 | touch |
| no_observed_progress | 当前收鱼进度没有增加 | touch |
| pull_persists | 当前仍有持续负载 | touch |
| progress_perceived | 本步收鱼进度增加且持竿可感知 | touch |
| retrieve_completed | 实际回收动作完成 | inspection |
| hook_inspected | 钩已在岸上检查 | inspection |
| bait_present | 被检查的钩上仍有饵实例 | inspection |
| bait_absent | 被检查的钩上没有饵实例 | inspection |
| terminal_inspected | 岸上已检查末端组成 | inspection |
| hook_present | 实际末端钩存在 | inspection |
| leader_present | 实际末端短线存在 | inspection |
| hook_absent | 实际末端钩缺失 | inspection |
| leader_absent | 实际末端短线缺失 | inspection |
| grass_attached | 本次带草事件留下的可检查草叶 | inspection |
| no_visible_attachment | 检查时没有本次事件留下的附着物 | inspection |
| line_inspected | 岸上已检查实际主线 | inspection |
| visible_local_fraying | 检查时线磨损达到可见阈值 | inspection |
| surface_splash_visible | 路亚接触事件的可见水花 | visual |
| surface_sound_heard | 路亚接触事件的可闻水响 | sound |
| bottom_estimate_obtained | 探底结果包含深度估计证据 | touch |
| bottom_unconfirmed | 探底结果没有确认水底 | touch |
| catch_visible | 已处理上岸鱼获 | inspection |
| component_changed | 实际部件或深度设置发生改变 | inspection |

## 全事实文案补齐

句库现已扩充为 38 组、152 条，覆盖上述 51 项事实。完整审阅表见 [反馈文案全表](fishing-feedback-copy.md)。支撑事实参与条件组合，不独立堆叠提示；界面调度已接入。测试检查每项事实有文案覆盖、双向索引一致、缺少任一必要事实不出句、重复事件与读档保持原句。

## 运行接入记录

正式句库已移至 `data/fishing-feedback.json`，主游戏与试玩页共同加载。动作结束时从当次已感知事实选句，按配置优先级和排除关系合并，最多六句；页面重画不选新句。连续等待且事实不变时更新原记录的次数和时间，不消耗新句。词句选择历史与现有钓鱼存档一起保存。

夜间仍能感知“看不清”和“已经收回”，但不能检查饵或末端部件。抛竿、提竿、拉扯、挂底、回收的旧同类提示已让位于事实句库；动作回执及点位具体探底记录继续保留。自动测试覆盖组合优先、缺少事实不出句、夜间筛选、等待合并、读档一致；浏览器已验收抛竿和回收的新文案及单屏布局。
