# 制药重整：全量旧目录与配方迁移附表

> 自动生成的设计快照，不是运行时数据。主方案见 [重整方案](47-pharmacy-rework.md)。重新生成：`node tools/audit-pharmacy-catalog.mjs --write`。现有配方仅作虚构游戏数据索引，不是现实制备说明。

覆盖：96 件本制药源表物品、30 件固定成品、57 条配方、12 个原药效族；动态实例模板单列。外部通用原料通过 items.json 校验引用。

目标计数（功能前提完成后）：启用固定成品 25 件、启用配方 70 条；新增配方 15 条、合并入口 0 个、储备成品 2 件。均为设计目标，不是当前游戏数量。

## 1. 固定成品逐项决定

| 旧物品 / ID | 新目录形态 | 使用理由 | 处置 |
| --- | --- | --- | --- |
| 提神汤液 / potion_tonic_broth | 粗药液 | 廉价日常提神 | 保留；效果由实际配方贡献派生 |
| 提神药烟 / potion_tonic_cigarette | 药烟 | 短窗口提神 | 保留；起效/时长/负担与口服区分 |
| 镇痛药丸 / potion_analgesic_pill | 药丸 | 便携持续镇痛 | 保留；布尔镇痛不按强度线性放大 |
| 活络药膏 / potion_mobility_salve | 药膏 | 入门部位恢复 | 保留；补苦根草外敷恢复的显式剂型适配，不能从镇痛族暗跳 |
| 补液注射液 / potion_rehydration_injection | 旧版注射成品（存档兼容） | 短窗口集中补液 | 退役固定配方；改由药粉动态配置 |
| 强心注射液 / potion_cardiac_injection | 旧版注射成品（存档兼容） | 意识尚存时的危急干预 | 退役固定配方；改由药粉动态配置 |
| 安神汤 / potion_calm_brew | 粗药液 | 日常安神 | 保留；删除无食物依据的营养恢复 |
| 浓煎提神汤 / potion_tonic_broth_potent | 浓缩药液 | 较高集中度的口服提神 | 改链；粗药液经独立浓缩工序产出，消除原料份数超集撞方 |
| 续航糖浆 / potion_energy_draught | 糖浆 | 持续补精力 | 保留；营养只走单一消化来源，不与 buff 重复计算 |
| 补液汤 / potion_rehydration_broth | 粗药液 | 旅途补水 | 保留；同一补水来源不在消化和药效中重复计入 |
| 续力药汤 / potion_strength_decoction | 药液 | 长途携行：负重上限 +6 kg，基础 180 tick | 已实现；与行路减耗分开 |
| 醒神茶 / potion_antistun_tea | 药液 | 出发前的眩晕抗性 | 保留；不承诺解除已发生的眩晕 |
| 幻梦汤 / potion_vision_draught | 药液 | 较长窗口的风险换成长收益 | 保留幻梦定位；不因内部 vision ID 添加视野功能 |
| 红花药泥 / potion_mobility_poultice | 粗药泥 | 便宜的短程部位护理 | 保留；粗制终点，与药膏拉开使用次数和有效窗口 |
| 红花活络膏 / potion_mobility_salve_potent | 精制药膏 | 更集中的部位恢复 | 改链；由精制原料成膏，使精制名称与加工等级一致 |
| 三七止血散 / potion_coagulant_powder | 外敷药粉 | 低成本局部止血 | 储备；保留 ID 与旧档，等待流血闭环 |
| 白芨止血膏 / potion_coagulant_salve | 药膏 | 持续局部止血 | 储备；保留 ID 与旧档，等待流血闭环 |
| 安神药烟 / potion_sedative_incense | 药烟 | 短窗口稳定心情 | 保留；不得沿用药液完整持续时间 |
| 幻梦烟 / potion_vision_incense | 药烟 | 短窗口的风险换成长收益 | 保留；不承诺视觉能力 |
| 镇痛注射液 / potion_analgesic_injection | 旧版注射成品（存档兼容） | 集中镇痛窗口 | 退役固定配方；改由药粉动态配置 |
| 提神注射液 / potion_stimulant_injection | 旧版注射成品（存档兼容） | 短时提神与行动支持 | 退役固定配方；改由药粉动态配置 |
| 醒神注射液 / potion_antistun_injection | 旧版注射成品（存档兼容） | 较短的集中抗眩晕窗口 | 退役固定配方；改由药粉动态配置 |
| 续力注射液 / potion_strength_injection | 旧版注射成品（存档兼容） | 立即携行：负重上限 +7.5 kg，基础 120 tick | 退役固定配方；改由药粉动态配置 |
| 止血注射液 / potion_coagulant_injection | 旧版注射成品（存档兼容） | 系统性止血储备 | 退役固定配方；改由药粉动态配置 |
| 精制镇痛注射液 / potion_analgesic_injection_refined | 旧版注射成品（存档兼容） | 标准化镇痛针的唯一常规入口 | 退役固定配方；改由药粉动态配置 |
| 精制醒神注射液 / potion_antistun_injection_refined | 旧版注射成品（存档兼容） | 标准化醒神针的唯一常规入口 | 退役固定配方；改由药粉动态配置 |
| 精炼镇痛注射液 / potion_analgesic_injection_purified | 旧版注射成品（存档兼容） | 高加工镇痛终点 | 退役固定配方；改由药粉动态配置 |
| 精炼提神注射液 / potion_stimulant_injection_purified | 旧版注射成品（存档兼容） | 高加工提神终点 | 退役固定配方；改由药粉动态配置 |
| 精炼安神汤 / potion_calm_brew_purified | 精炼药液 | 口服安神的高加工终点 | 保留；证明高级加工不必转注射，强度由数据派生 |
| 精炼红花活络膏 / potion_mobility_salve_purified | 精炼药膏 | 外敷恢复的高加工终点 | 保留；总使用次数、每次效果和总成本一起平衡 |

## 2. 所有其余物品（原料、中间品、溶媒、辅料、器具、动态模板）

| 物品 / ID | 现有类别 / 加工级 | 原药效族 | 处置 |
| --- | --- | --- | --- |
| 古柯 / herb_coca | leaf / 基础 | — | 保留原料及既有跨系统用途；药效由有效成分与剂型适配表定义，不由现实名称推断 |
| 罂粟 / herb_poppy | flower / 基础 | — | 保留原料及既有跨系统用途；药效由有效成分与剂型适配表定义，不由现实名称推断 |
| 麦角菌 / herb_ergot | fungus / 基础 | — | 保留原料及既有跨系统用途；药效由有效成分与剂型适配表定义，不由现实名称推断 |
| 曼陀罗 / herb_datura | flower / 基础 | — | 保留原料及既有跨系统用途；药效由有效成分与剂型适配表定义，不由现实名称推断 |
| 麻黄 / herb_ephedra | vine / 基础 | — | 保留原料及既有跨系统用途；药效由有效成分与剂型适配表定义，不由现实名称推断 |
| 裸盖菇 / herb_psilocybe | fungus / 基础 | — | 保留原料及既有跨系统用途；药效由有效成分与剂型适配表定义，不由现实名称推断 |
| 大麻 / herb_cannabis | leaf / 基础 | — | 保留原料及既有跨系统用途；药效由有效成分与剂型适配表定义，不由现实名称推断 |
| 槟榔 / herb_areca | seed / 基础 | — | 保留原料及既有跨系统用途；药效由有效成分与剂型适配表定义，不由现实名称推断 |
| 烟草 / herb_tobacco | leaf / 基础 | — | 保留原料及既有跨系统用途；药效由有效成分与剂型适配表定义，不由现实名称推断 |
| 护肝草 / herb_liver_herb | leaf / 基础 | — | 保留原料及既有跨系统用途；药效由有效成分与剂型适配表定义，不由现实名称推断 |
| 骆驼蓬 / herb_peganum | seed / 基础 | — | 保留原料及既有跨系统用途；药效由有效成分与剂型适配表定义，不由现实名称推断 |
| 番泻叶 / herb_senna | leaf / 基础 | — | 保留原料及既有跨系统用途；药效由有效成分与剂型适配表定义，不由现实名称推断 |
| 白芨 / herb_baiji | root / 基础 | — | 保留原料及既有跨系统用途；药效由有效成分与剂型适配表定义，不由现实名称推断 |
| 石菖蒲 / herb_acorus | root / 基础 | — | 保留原料及既有跨系统用途；药效由有效成分与剂型适配表定义，不由现实名称推断 |
| 鹿茸 / herb_deer_antler | antler / 基础 | — | 保留原料及既有跨系统用途；药效由有效成分与剂型适配表定义，不由现实名称推断 |
| 可卡因粉 / med_cocaine_powder | pharm_powder / 基础 | stimulant | 保留活性中间品；明确粗制/精制/精炼与可用剂型，补允许粗用的效果；成品从同源贡献派生 |
| 吗啡粉 / med_morphine_powder | pharm_powder / 基础 | analgesic | 保留活性中间品；明确粗制/精制/精炼与可用剂型，补允许粗用的效果；成品从同源贡献派生 |
| 麦角酸粉 / med_lsd_powder | pharm_powder / 基础 | hallucinogen | 保留活性中间品；明确粗制/精制/精炼与可用剂型，补允许粗用的效果；成品从同源贡献派生 |
| 东莨菪碱粉 / med_scopolamine_powder | pharm_powder / 基础 | hallucinogen | 保留活性中间品；明确粗制/精制/精炼与可用剂型，补允许粗用的效果；成品从同源贡献派生 |
| 麻黄碱粉 / med_ephedrine_powder | pharm_powder / 基础 | stimulant | 保留活性中间品；明确粗制/精制/精炼与可用剂型，补允许粗用的效果；成品从同源贡献派生 |
| 裸盖菇素粉 / med_psilocybin_powder | pharm_powder / 基础 | hallucinogen | 保留活性中间品；明确粗制/精制/精炼与可用剂型，补允许粗用的效果；成品从同源贡献派生 |
| THC粉 / med_thc_powder | pharm_powder / 基础 | sedative | 保留活性中间品；明确粗制/精制/精炼与可用剂型，补允许粗用的效果；成品从同源贡献派生 |
| 赤花藤粉 / med_vine_red_powder | pharm_powder / 基础 | stimulant | 保留活性中间品；明确粗制/精制/精炼与可用剂型，补允许粗用的效果；成品从同源贡献派生 |
| 苦根草粉 / med_root_bitter_powder | pharm_powder / 基础 | analgesic | 保留活性中间品；明确粗制/精制/精炼与可用剂型，补允许粗用的效果；成品从同源贡献派生 |
| 槟榔碱粉 / med_arecoline_powder | pharm_powder / 基础 | stimulant | 保留活性中间品；明确粗制/精制/精炼与可用剂型，补允许粗用的效果；成品从同源贡献派生 |
| 尼古丁粉 / med_nicotine_powder | pharm_powder / 基础 | stimulant | 保留活性中间品；明确粗制/精制/精炼与可用剂型，补允许粗用的效果；成品从同源贡献派生 |
| 护肝草粉 / med_liver_herb_powder | pharm_powder / 基础 | synergist | 抵消辅料；负毒性迁为正数抵消能力；移除隐含增效，精制不得削弱单位容量能力 |
| 骆驼蓬碱粉 / med_harmaline_powder | pharm_powder / 基础 | synergist | 专用增效辅料；显式记录增效与抵消两种能力，分别计价与设上限 |
| 番泻叶粉 / med_senna_powder | pharm_powder / 基础 | synergist | 抵消辅料；负毒性迁为正数抵消能力；移除隐含增效，精制不得削弱单位容量能力 |
| 维生素C粉 / med_vitamin_c_powder | pharm_powder / 基础 | synergist | 抵消辅料；负毒性迁为正数抵消能力；移除隐含增效，精制不得削弱单位容量能力 |
| 补液粉 / med_rehydration_powder | pharm_powder / 基础 | rehydrate | 保留活性中间品；明确粗制/精制/精炼与可用剂型，补允许粗用的效果；成品从同源贡献派生 |
| 葡萄糖粉 / med_glucose_powder | pharm_powder / 基础 | energy | 保留活性中间品；明确粗制/精制/精炼与可用剂型，补允许粗用的效果；成品从同源贡献派生 |
| 强心粉 / med_cardiac_powder | pharm_powder / 基础 | revive | 条件储备原料；保留加工/交易身份，止血或强心功能待闭环 |
| 白芨粉 / med_baiji_powder | pharm_powder / 基础 | coagulant | 条件储备原料；保留加工/交易身份，止血或强心功能待闭环 |
| 石菖蒲粉 / med_acorus_powder | pharm_powder / 基础 | antistun | 保留活性中间品；明确粗制/精制/精炼与可用剂型，补允许粗用的效果；成品从同源贡献派生 |
| 鹿茸粉 / med_antler_powder | pharm_powder / 基础 | strength | 保留活性中间品；明确粗制/精制/精炼与可用剂型，补允许粗用的效果；成品从同源贡献派生 |
| 生理盐水 / solvent_saline | solvent / 基础 | — | 保留溶媒；基础载体与药效分开，不凭名称自动附加补液/续航 |
| 葡萄糖液 / solvent_glucose_solution | solvent / 基础 | — | 保留溶媒；基础载体与药效分开，不凭名称自动附加补液/续航 |
| 纯净水 / solvent_water_pure | solvent / 基础 | — | 保留溶媒；基础载体与药效分开，不凭名称自动附加补液/续航 |
| 维生素C / adj_vitamin_c | pharm_adjuvant / 基础 | — | 保留助溶剂；仅显式助溶能力，不默认抵消/增效 |
| 柠檬酸 / adj_citric_acid | pharm_adjuvant / 基础 | — | 保留助溶剂；仅显式助溶能力，不默认抵消/增效 |
| 注射器 / tool_syringe_pharmacy | pharm_kit / 基础 | — | 保留器具耗材；使用条件和卫生成本归操作层，不列作药效 |
| 输液器 / tool_iv_set_pharmacy | pharm_kit / 基础 | — | 保留器具耗材；使用条件和卫生成本归操作层，不列作药效 |
| 复方注射液 / potion_compound_injection | inject / 基础 | — | 保留动态模板；版本化实例，按成分与途径统一药效/负担；不替旧实例凭空提高纯度 |
| 药钵 / tool_mortar_pharmacy | pharm_kit / 基础 | — | 保留器具耗材；使用条件和卫生成本归操作层，不列作药效 |
| 卷药器 / tool_roller_pharmacy | pharm_kit / 基础 | — | 保留器具耗材；使用条件和卫生成本归操作层，不列作药效 |
| 红花 / herb_safflower | flower / 基础 | — | 保留原料及既有跨系统用途；药效由有效成分与剂型适配表定义，不由现实名称推断 |
| 三七 / herb_notoginseng | root / 基础 | — | 保留原料及既有跨系统用途；药效由有效成分与剂型适配表定义，不由现实名称推断 |
| 红花粉 / med_safflower_powder | pharm_powder / 基础 | mobility | 保留活性中间品；明确粗制/精制/精炼与可用剂型，补允许粗用的效果；成品从同源贡献派生 |
| 三七粉 / med_notoginseng_powder | pharm_powder / 基础 | coagulant | 条件储备原料；保留加工/交易身份，止血或强心功能待闭环 |
| 精制THC粉 / med_thc_powder_refined | pharm_powder / 精制 | sedative | 保留活性中间品；明确粗制/精制/精炼与可用剂型，补允许粗用的效果；成品从同源贡献派生 |
| 精制石菖蒲粉 / med_acorus_powder_refined | pharm_powder / 精制 | antistun | 保留活性中间品；明确粗制/精制/精炼与可用剂型，补允许粗用的效果；成品从同源贡献派生 |
| 精制吗啡粉 / med_morphine_powder_refined | pharm_powder / 精制 | analgesic | 保留活性中间品；明确粗制/精制/精炼与可用剂型，补允许粗用的效果；成品从同源贡献派生 |
| 精制可卡因粉 / med_cocaine_powder_refined | pharm_powder / 精制 | stimulant | 保留活性中间品；明确粗制/精制/精炼与可用剂型，补允许粗用的效果；成品从同源贡献派生 |
| 精制护肝草粉 / med_liver_herb_powder_refined | pharm_powder / 精制 | synergist | 抵消辅料；负毒性迁为正数抵消能力；移除隐含增效，精制不得削弱单位容量能力 |
| 精制三七粉 / med_notoginseng_powder_refined | pharm_powder / 精制 | coagulant | 条件储备原料；保留加工/交易身份，止血或强心功能待闭环 |
| 精制裸盖菇素粉 / med_psilocybin_powder_refined | pharm_powder / 精制 | hallucinogen | 保留活性中间品；明确粗制/精制/精炼与可用剂型，补允许粗用的效果；成品从同源贡献派生 |
| 精制红花粉 / med_safflower_powder_refined | pharm_powder / 精制 | mobility | 保留活性中间品；明确粗制/精制/精炼与可用剂型，补允许粗用的效果；成品从同源贡献派生 |
| 精炼THC粉 / med_thc_powder_purified | pharm_powder / 精炼 | sedative | 保留活性中间品；明确粗制/精制/精炼与可用剂型，补允许粗用的效果；成品从同源贡献派生 |
| 精炼石菖蒲粉 / med_acorus_powder_purified | pharm_powder / 精炼 | antistun | 保留活性中间品；明确粗制/精制/精炼与可用剂型，补允许粗用的效果；成品从同源贡献派生 |
| 精炼吗啡粉 / med_morphine_powder_purified | pharm_powder / 精炼 | analgesic | 保留活性中间品；明确粗制/精制/精炼与可用剂型，补允许粗用的效果；成品从同源贡献派生 |
| 精炼可卡因粉 / med_cocaine_powder_purified | pharm_powder / 精炼 | stimulant | 保留活性中间品；明确粗制/精制/精炼与可用剂型，补允许粗用的效果；成品从同源贡献派生 |
| 精炼护肝草粉 / med_liver_herb_powder_purified | pharm_powder / 精炼 | synergist | 抵消辅料；负毒性迁为正数抵消能力；移除隐含增效，精制不得削弱单位容量能力 |
| 精炼三七粉 / med_notoginseng_powder_purified | pharm_powder / 精炼 | coagulant | 条件储备原料；保留加工/交易身份，止血或强心功能待闭环 |
| 精炼裸盖菇素粉 / med_psilocybin_powder_purified | pharm_powder / 精炼 | hallucinogen | 保留活性中间品；明确粗制/精制/精炼与可用剂型，补允许粗用的效果；成品从同源贡献派生 |
| 精炼红花粉 / med_safflower_powder_purified | pharm_powder / 精炼 | mobility | 保留活性中间品；明确粗制/精制/精炼与可用剂型，补允许粗用的效果；成品从同源贡献派生 |

## 3. 全部旧配方逐项迁移

保留表示保留数据身份与材料来源，不表示直接沿用旧效果结算。固定成品统一计算，不能在这里另手填 potency。新增浓缩工艺、注射封装与精制中间品均尚未实装。

| recipe_id | 现工艺 | 现游戏投料 | 现产出 | 新版目标 |
| --- | --- | --- | --- | --- |
| life_pharmacy.crush_coca_powder | crushing | 古柯 ×1 | 可卡因粉 ×2 | 保留当前输入与工艺；按新版贡献/剂型规则生成结果 |
| life_pharmacy.crush_poppy_powder | crushing | 罂粟 ×1 | 吗啡粉 ×2 | 保留当前输入与工艺；按新版贡献/剂型规则生成结果 |
| life_pharmacy.crush_ergot_powder | crushing | 麦角菌 ×1 | 麦角酸粉 ×2 | 保留当前输入与工艺；按新版贡献/剂型规则生成结果 |
| life_pharmacy.crush_datura_powder | crushing | 曼陀罗 ×1 | 东莨菪碱粉 ×2 | 保留当前输入与工艺；按新版贡献/剂型规则生成结果 |
| life_pharmacy.crush_ephedra_powder | crushing | 麻黄 ×1 | 麻黄碱粉 ×2 | 保留当前输入与工艺；按新版贡献/剂型规则生成结果 |
| life_pharmacy.crush_psilocybe_powder | crushing | 裸盖菇 ×1 | 裸盖菇素粉 ×2 | 保留当前输入与工艺；按新版贡献/剂型规则生成结果 |
| life_pharmacy.crush_cannabis_powder | crushing | 大麻 ×1 | THC粉 ×2 | 保留当前输入与工艺；按新版贡献/剂型规则生成结果 |
| life_pharmacy.crush_vine_red_powder | crushing | 赤花藤 ×1 | 赤花藤粉 ×2 | 保留当前输入与工艺；按新版贡献/剂型规则生成结果 |
| life_pharmacy.crush_root_bitter_powder | crushing | 苦根草 ×1 | 苦根草粉 ×2 | 保留当前输入与工艺；按新版贡献/剂型规则生成结果 |
| life_pharmacy.crush_areca_powder | crushing | 槟榔 ×1 | 槟榔碱粉 ×2 | 保留当前输入与工艺；按新版贡献/剂型规则生成结果 |
| life_pharmacy.crush_tobacco_powder | crushing | 烟草 ×1 | 尼古丁粉 ×2 | 保留当前输入与工艺；按新版贡献/剂型规则生成结果 |
| life_pharmacy.crush_liver_herb_powder | crushing | 护肝草 ×1 | 护肝草粉 ×2 | 保留当前输入与工艺；按新版贡献/剂型规则生成结果 |
| life_pharmacy.crush_peganum_powder | crushing | 骆驼蓬 ×1 | 骆驼蓬碱粉 ×2 | 保留当前输入与工艺；按新版贡献/剂型规则生成结果 |
| life_pharmacy.crush_senna_powder | crushing | 番泻叶 ×1 | 番泻叶粉 ×2 | 保留当前输入与工艺；按新版贡献/剂型规则生成结果 |
| life_pharmacy.crush_baiji_powder | crushing | 白芨 ×1 | 白芨粉 ×2 | 保留当前输入与工艺；按新版贡献/剂型规则生成结果 |
| life_pharmacy.crush_acorus_powder | crushing | 石菖蒲 ×1 | 石菖蒲粉 ×2 | 保留当前输入与工艺；按新版贡献/剂型规则生成结果 |
| life_pharmacy.crush_antler_powder | crushing | 鹿茸 ×1 | 鹿茸粉 ×2 | 保留当前输入与工艺；按新版贡献/剂型规则生成结果 |
| life_pharmacy.macerate_rehydration_powder | maceration | 精海盐 ×1 + 纯净水 ×1 | 补液粉 ×2 | 保留当前输入与工艺；按新版贡献/剂型规则生成结果 |
| life_pharmacy.macerate_glucose_powder | maceration | 甘蔗 ×1 + 纯净水 ×1 | 葡萄糖粉 ×2 | 保留当前输入与工艺；按新版贡献/剂型规则生成结果 |
| life_pharmacy.macerate_cardiac_powder | maceration | 猪心 ×1 + 纯净水 ×1 | 强心粉 ×2 | 保留当前输入与工艺；按新版贡献/剂型规则生成结果 |
| life_pharmacy.brew_tonic_broth | maceration | 赤花藤粉 ×1 + 纯净水 ×1 | 提神汤液 ×1 | 保留当前输入与工艺；按新版贡献/剂型规则生成结果 |
| life_pharmacy.roll_tonic_cigarette | rolling | 尼古丁粉 ×1 + 烟草 ×1 | 提神药烟 ×1 | 保留当前输入与工艺；按新版贡献/剂型规则生成结果 |
| life_pharmacy.press_analgesic_pill | tableting | 苦根草粉 ×1 + 纯净水 ×1 | 镇痛药丸 ×1 | 保留当前输入与工艺；按新版贡献/剂型规则生成结果 |
| life_pharmacy.blend_mobility_salve | blending | 苦根草粉 ×1 + 猪油 ×1 | 活络药膏 ×1 | 保留当前输入与工艺；按新版贡献/剂型规则生成结果 |
| life_pharmacy.crush_safflower_powder | crushing | 红花 ×1 | 红花粉 ×2 | 保留当前输入与工艺；按新版贡献/剂型规则生成结果 |
| life_pharmacy.crush_notoginseng_powder | crushing | 三七 ×1 | 三七粉 ×2 | 保留当前输入与工艺；按新版贡献/剂型规则生成结果 |
| life_pharmacy.brew_calm_brew | maceration | THC粉 ×1 + 纯净水 ×1 | 安神汤 ×1 | 保留当前输入与工艺；按新版贡献/剂型规则生成结果 |
| life_pharmacy.brew_tonic_broth_potent | maceration | 赤花藤粉 ×2 + 纯净水 ×1 | 浓煎提神汤 ×1 | 改为提神汤液 ×2 → 浓缩（新增工艺）→ 浓煎提神汤 ×1；剩余有效成分守恒 |
| life_pharmacy.brew_energy_draught | maceration | 葡萄糖粉 ×1 + 纯净水 ×1 | 续航糖浆 ×1 | 保留当前输入与工艺；按新版贡献/剂型规则生成结果 |
| life_pharmacy.brew_rehydration_broth | maceration | 补液粉 ×1 + 纯净水 ×1 | 补液汤 ×1 | 保留当前输入与工艺；按新版贡献/剂型规则生成结果 |
| life_pharmacy.brew_strength_decoction | maceration | 鹿茸粉 ×1 + 纯净水 ×1 | 续力药汤 ×1 | 保留当前输入与工艺；按新版贡献/剂型规则生成结果 |
| life_pharmacy.brew_antistun_tea | maceration | 石菖蒲粉 ×1 + 纯净水 ×1 | 醒神茶 ×1 | 保留当前输入与工艺；按新版贡献/剂型规则生成结果 |
| life_pharmacy.brew_vision_draught | maceration | 裸盖菇素粉 ×1 + 纯净水 ×1 | 幻梦汤 ×1 | 保留当前输入与工艺；按新版贡献/剂型规则生成结果 |
| life_pharmacy.blend_mobility_poultice | blending | 红花粉 ×1 + 纯净水 ×1 | 红花药泥 ×1 | 保留当前输入与工艺；按新版贡献/剂型规则生成结果 |
| life_pharmacy.blend_mobility_salve_potent | blending | 红花粉 ×2 + 猪油 ×1 | 红花活络膏 ×1 | 红花粉替换为精制红花粉 ×1，其余辅料保留；不与粗制膏共用嵌套投料 |
| life_pharmacy.blend_coagulant_powder | blending | 三七粉 ×1 | 三七止血散 ×1 | 新版新品发现暂缓；已有产物与知识不删除，依赖闭环后恢复 |
| life_pharmacy.blend_coagulant_salve | blending | 白芨粉 ×1 + 猪油 ×1 | 白芨止血膏 ×1 | 新版新品发现暂缓；已有产物与知识不删除，依赖闭环后恢复 |
| life_pharmacy.roll_sedative_incense | rolling | THC粉 ×1 + 烟草 ×1 | 安神药烟 ×1 | 保留当前输入与工艺；按新版贡献/剂型规则生成结果 |
| life_pharmacy.roll_vision_incense | rolling | 裸盖菇素粉 ×2 + 烟草 ×1 | 幻梦烟 ×1 | 保留当前输入与工艺；按新版贡献/剂型规则生成结果 |
| life_pharmacy.refine_thc | distillation | THC粉 ×2 | 精制THC粉 ×1 | 保留输入与工艺；活性回收率/单位体积浓度/负担分开；抵消辅料独立精制参数 |
| life_pharmacy.refine_acorus | distillation | 石菖蒲粉 ×2 | 精制石菖蒲粉 ×1 | 保留输入与工艺；活性回收率/单位体积浓度/负担分开；抵消辅料独立精制参数 |
| life_pharmacy.refine_morphine | crystallization | 吗啡粉 ×2 | 精制吗啡粉 ×1 | 保留输入与工艺；活性回收率/单位体积浓度/负担分开；抵消辅料独立精制参数 |
| life_pharmacy.refine_cocaine | crystallization | 可卡因粉 ×2 | 精制可卡因粉 ×1 | 保留输入与工艺；活性回收率/单位体积浓度/负担分开；抵消辅料独立精制参数 |
| life_pharmacy.refine_liver_herb | filtration | 护肝草粉 ×2 | 精制护肝草粉 ×1 | 保留输入与工艺；活性回收率/单位体积浓度/负担分开；抵消辅料独立精制参数 |
| life_pharmacy.refine_notoginseng | filtration | 三七粉 ×2 | 精制三七粉 ×1 | 保留输入与工艺；活性回收率/单位体积浓度/负担分开；抵消辅料独立精制参数 |
| life_pharmacy.refine_psilocybin | centrifugation | 裸盖菇素粉 ×2 | 精制裸盖菇素粉 ×1 | 保留输入与工艺；活性回收率/单位体积浓度/负担分开；抵消辅料独立精制参数 |
| life_pharmacy.refine_safflower | centrifugation | 红花粉 ×2 | 精制红花粉 ×1 | 保留输入与工艺；活性回收率/单位体积浓度/负担分开；抵消辅料独立精制参数 |
| life_pharmacy.purify_thc | distillation | 精制THC粉 ×2 | 精炼THC粉 ×1 | 保留输入与工艺；活性回收率/单位体积浓度/负担分开；抵消辅料独立精制参数 |
| life_pharmacy.purify_acorus | distillation | 精制石菖蒲粉 ×2 | 精炼石菖蒲粉 ×1 | 保留输入与工艺；活性回收率/单位体积浓度/负担分开；抵消辅料独立精制参数 |
| life_pharmacy.purify_morphine | crystallization | 精制吗啡粉 ×2 | 精炼吗啡粉 ×1 | 保留输入与工艺；活性回收率/单位体积浓度/负担分开；抵消辅料独立精制参数 |
| life_pharmacy.purify_cocaine | crystallization | 精制可卡因粉 ×2 | 精炼可卡因粉 ×1 | 保留输入与工艺；活性回收率/单位体积浓度/负担分开；抵消辅料独立精制参数 |
| life_pharmacy.purify_liver_herb | filtration | 精制护肝草粉 ×2 | 精炼护肝草粉 ×1 | 保留输入与工艺；活性回收率/单位体积浓度/负担分开；抵消辅料独立精制参数 |
| life_pharmacy.purify_notoginseng | filtration | 精制三七粉 ×2 | 精炼三七粉 ×1 | 保留输入与工艺；活性回收率/单位体积浓度/负担分开；抵消辅料独立精制参数 |
| life_pharmacy.purify_psilocybin | centrifugation | 精制裸盖菇素粉 ×2 | 精炼裸盖菇素粉 ×1 | 保留输入与工艺；活性回收率/单位体积浓度/负担分开；抵消辅料独立精制参数 |
| life_pharmacy.purify_safflower | centrifugation | 精制红花粉 ×2 | 精炼红花粉 ×1 | 保留输入与工艺；活性回收率/单位体积浓度/负担分开；抵消辅料独立精制参数 |
| life_pharmacy.brew_calm_brew_purified | maceration | 精炼THC粉 ×1 + 纯净水 ×1 | 精炼安神汤 ×1 | 保留当前输入与工艺；按新版贡献/剂型规则生成结果 |
| life_pharmacy.blend_mobility_salve_purified | blending | 精炼红花粉 ×1 + 猪油 ×1 | 精炼红花活络膏 ×1 | 保留当前输入与工艺；按新版贡献/剂型规则生成结果 |

## 4. 标准注射链还缺的精制中间品

| 拟增 ID | 来源旧中间品 | 目标链 |
| --- | --- | --- |

## 5. 新增用途成品

| 拟增药品 / ID | 独特作用（首版试算） | 虚构配方 | 前提与代价 |
| --- | --- | --- | --- |
| 休养药泥 / potion_rest_poultice | 仅休息时，指定部位自然损毁恢复量 ×1.25，不缩短自然恢复宽限；起效 3 tick / 有效 90 tick / 2 次 | 休养药粉 ×1 + 制药水 ×1 → 调和 → 休养药泥 ×1 | 按部位、按休息条件的自然恢复修正接口；活动时无额外恢复，不直接减损毁 |
| 休养药膏 / potion_rest_salve | 仅休息时，指定部位自然损毁恢复量 ×1.50，不缩短自然恢复宽限；起效 3 tick / 有效 120 tick / 3 次 | 精制休养药粉 ×1 + 膏基 ×1 → 调和 → 休养药膏 ×1 | 同休养药泥；加工和原料投入更高；与同族不叠加 |
| 耐劳药液 / potion_labor_brew | 生活行为实际体力成本 ×0.90，仅采集及设施加工白名单；起效 5 tick / 有效 60 tick / 1 次 | 耐劳药粉 ×1 + 制药水 ×1 → 浸渍 → 耐劳药液 ×1 | 统一行动体力成本修正及小数累计；不增产、不增加经验、不影响战斗或移动 |
| 耐劳丸 / potion_labor_pill | 生活行为实际体力成本 ×0.90，仅采集及设施加工白名单；起效 8 tick / 有效 90 tick / 1 次 | 耐劳药粉 ×1 + 虚构丸基 ×1 → 压片 → 耐劳丸 ×1 | 同耐劳药液；丸剂独立时间配置；更慢起效，多一道辅料成本，换更长窗口与便携性 |
| 行路丸 / potion_travel_pill | 普通移动实际体力成本 ×0.85；起效 8 tick / 有效 90 tick / 1 次 | 行路药粉 ×1 + 虚构丸基 ×1 → 压片 → 行路丸 ×1 | 移动成本专用修正；无基础体力成本的移动不凭空产生收益；不加移速、不减物品重量、不改背包格数，不减战斗步法成本 |
| 御寒药膏 / potion_cold_salve | 环境造成的体温下降量 ×0.75，仅环境降温项；起效 3 tick / 有效 90 tick / 3 次 | 御寒药粉 ×1 + 膏基 ×1 → 调和 → 御寒药膏 ×1 | 环境体温变化来源过滤；全身防护型外敷范围；不直接升温、不豁免死亡阈值，与清暑同槽不能叠用 |
| 清暑药膏 / potion_heat_salve | 环境造成的体温上升量 ×0.75，仅环境升温项；起效 3 tick / 有效 90 tick / 3 次 | 清暑药粉 ×1 + 膏基 ×1 → 调和 → 清暑药膏 ×1 | 同御寒药膏；不直接降温、不补水、不替代衣物和避难，与御寒同槽 |
| 药后调理液 / potion_aftercare_brew | 休息时既有药物毒性代谢速度 ×1.25；不影响药瘾或其他毒物；起效 5 tick / 有效 60 tick / 1 次 | 调理药粉 ×1 + 制药水 ×1 → 浸渍 → 药后调理液 ×1 | 药物毒性代谢的有时限来源修正；有效期内再次获得药物毒性时终止调理效果；不回溯取消已触发后果 |

共享材料绑定：water = 纯净水 (`solvent_water_pure`)；salve_base = 猪油 (`hus_pork_lard`)；pill_base = 小麦粉 (`herb_wheat_flour`)。原料与采集/种植来源尚待投放，不能因设计表有 ID 就认为已可获取。

| 拟增原料 / ID | 拟增中间品 / ID | 基础工序 |
| --- | --- | --- |
| 绵息草 / herb_mianxi | 休养药粉 / med_rest_powder | life_pharmacy.crushing：原料 ×1 → 中间品 ×2 |
| 耐劳藤 / herb_nailao | 耐劳药粉 / med_labor_powder | life_pharmacy.crushing：原料 ×1 → 中间品 ×2 |
| 轻履叶 / herb_qinglv | 行路药粉 / med_travel_powder | life_pharmacy.crushing：原料 ×1 → 中间品 ×2 |
| 暖苔 / herb_nuantai | 御寒药粉 / med_cold_guard_powder | life_pharmacy.crushing：原料 ×1 → 中间品 ×2 |
| 凉苔 / herb_liangtai | 清暑药粉 / med_heat_guard_powder | life_pharmacy.crushing：原料 ×1 → 中间品 ×2 |
| 回清草 / herb_huiqing | 调理药粉 / med_aftercare_powder | life_pharmacy.crushing：原料 ×1 → 中间品 ×2 |

## 6. 数据审查结果

### 6.1 同工艺存在包含关系的配方

当前超集匹配并加权随机选择。下列关系说明投足高档配方也可能命中另一配方；这是当前规则的结果，不是已改成精确匹配。任意额外投料的多配方命中仍遵循统一系统，本次仅消除目录中的常规升级撞方。

| 配方 A | 配方 B |
| --- | --- |
| life_pharmacy.brew_tonic_broth | life_pharmacy.brew_tonic_broth_potent |

### 6.2 固定模板档位与同族投入点数分档不同

此表仅比较原始同族点数总和，不模拟给药、增效、沉淀、多次使用或回收率；差异不是自动判错，而是证明存在两套定档来源，需在重整时逐项统一。

| 成品 | 配方 | 固定档位 | 投入点数 | 动态阈值档位 |
| --- | --- | --- | --- | --- |
| 提神汤液 | life_pharmacy.brew_tonic_broth | weak | 35 | regular |
| 提神药烟 | life_pharmacy.roll_tonic_cigarette | regular | 20 | weak |
| 红花活络膏 | life_pharmacy.blend_mobility_salve_potent | potent | 120 | pure |
| 幻梦烟 | life_pharmacy.roll_vision_incense | potent | 110 | pure |
| 精炼安神汤 | life_pharmacy.brew_calm_brew_purified | pure | 68 | potent |
| 精炼红花活络膏 | life_pharmacy.blend_mobility_salve_purified | pure | 90 | potent |

### 6.3 共用同一药效 buff 的成品

- 活络药膏 / 红花药泥 → buff_pharm_mobility_topical_regular

- 镇痛注射液 / 精制镇痛注射液 → buff_pharm_analgesic_inject_potent

共用 buff 不代表物品完全相同；仍可能有用量、成本、消化和保存差异。新版必须在成品卡明确这些差异。

## 7. 快照来源

- `data/items/pharmacy_base.csv` SHA256 `e01121237f8717564dccdc77f8f5b35ac1ea9f177451caf203e1f66b2faa58fe`

- `data/pharmacy-recipes.json` SHA256 `001c2525e1bfa2ce805e47860c682e96ed4880b0063f65aac3c61ee66c46006c`

- `data/pharmacy-buff-matrix.json` SHA256 `0e0ad88755beff486b9a578e6566cc36df8a030d328c84f86dc475cbccac1b07`

- `data/pharmacy-system-config.csv` SHA256 `fe6269b61cde8d9128e31452bf3b328d4f38320d0a46e9be668a712a8eaef6a3`

- `docs/design/47-pharmacy-rework-plan.json` SHA256 `3a1dd3fdd2b2cbdd7472f54c26166e47a84b63c6dc276a15819fd43c449a233a`

- `data/items.json` SHA256 `577325bd4583816e324de98fea43ee2e01a4f775e4f1af13ff9bfa58830f6c70`
