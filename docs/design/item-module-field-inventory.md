# 物品属性模块分类：逐字段盘点

> 2026-09-22，模块目录与通用组合字段已接入运行时。由 `node tools/audit-item-module-classification.mjs --write` 生成。分类原则见 [63号设计](63-item-attribute-modules.md)，连接契约见 [65号设计](65-item-assembly-and-combined-weight.md)。

全量扫描所列三张模板、十一张CSV、两套显示配置及嵌套字段；实例字段为人工核对集合，代码命中只是文本线索，非完整读写链路证明。

代码命中保存在同名 JSON 中；不是调用或生效证明。CSV 的 string 类型是源文件文本，不代表目标字段类型。嵌套字段随父模块归属，附魔/效果载荷仍需相应子系统校验。

| 来源 | 物品/行数 | CSV列数 |
|---|---:|---:|
| data/items.json | 546 | — |
| data/equipment.json | 27 | — |
| data/modules.json | 16 | — |
| data/items/agriculture_injectables_base.csv | 1 | 31 |
| data/items/compost_matrix_base.csv | 4 | 28 |
| data/items/consumables_base.csv | 36 | 29 |
| data/items/currency_base.csv | 8 | 23 |
| data/items/fertilizer_anaerobic_base.csv | 4 | 32 |
| data/items/fishing_components_base.csv | 7 | 25 |
| data/items/materials_all.csv | 296 | 40 |
| data/items/pharmacy_base.csv | 96 | 46 |
| data/items/product_base.csv | 37 | 23 |
| data/items/seeds_farming.csv | 50 | 30 |
| data/items/soil_amendments_base.csv | 7 | 29 |

共 229 个不同字段路径（含嵌套、CSV空列、显示引用、人工核对状态与兼容候选），未分类 0。此数不是顶层字段数。

## 基础（base）

主表按此大类加载；下列分组在类内按需配置，不单独加载。

### 主表与身份（类内分组 core）

| 原字段路径 | 观察类型 | 来源 | 处理建议 | 当前字段规则 / 信息模块 |
|---|---|---|---|---|
| `category` | string | data/items.json；data/items/agriculture_injectables_base.csv:header；data/items/agriculture_injectables_base.csv:nonempty；data/items/compost_matrix_base.csv:header；data/items/compost_matrix_base.csv:nonempty；data/items/consumables_base.csv:header；data/items/consumables_base.csv:nonempty；data/items/currency_base.csv:header；data/items/currency_base.csv:nonempty；data/items/fertilizer_anaerobic_base.csv:header；data/items/fertilizer_anaerobic_base.csv:nonempty；data/items/fishing_components_base.csv:header；data/items/fishing_components_base.csv:nonempty；data/items/materials_all.csv:header；data/items/materials_all.csv:nonempty；data/items/pharmacy_base.csv:header；data/items/pharmacy_base.csv:nonempty；data/items/product_base.csv:header；data/items/product_base.csv:nonempty；data/items/seeds_farming.csv:header；data/items/seeds_farming.csv:nonempty；data/items/soil_amendments_base.csv:header；data/items/soil_amendments_base.csv:nonempty | 通用主表/实例核心；子项以父模块为准 | 无逐字段规则 |
| `count` |  | reviewed-instance-field | 通用主表/实例核心；子项以父模块为准；含实例状态 | 无逐字段规则 |
| `id` | string | data/equipment.json；data/modules.json；data/items/agriculture_injectables_base.csv:header；data/items/agriculture_injectables_base.csv:nonempty；data/items/compost_matrix_base.csv:header；data/items/compost_matrix_base.csv:nonempty；data/items/consumables_base.csv:header；data/items/consumables_base.csv:nonempty；data/items/currency_base.csv:header；data/items/currency_base.csv:nonempty；data/items/fertilizer_anaerobic_base.csv:header；data/items/fertilizer_anaerobic_base.csv:nonempty；data/items/fishing_components_base.csv:header；data/items/fishing_components_base.csv:nonempty；data/items/materials_all.csv:header；data/items/materials_all.csv:nonempty；data/items/pharmacy_base.csv:header；data/items/pharmacy_base.csv:nonempty；data/items/product_base.csv:header；data/items/product_base.csv:nonempty；data/items/seeds_farming.csv:header；data/items/seeds_farming.csv:nonempty；data/items/soil_amendments_base.csv:header；data/items/soil_amendments_base.csv:nonempty | 统一命名候选；逐来源保留差异，不盲合并 | 无逐字段规则 |
| `item_id` | string | data/items.json；reviewed-instance-field | 通用主表/实例核心；子项以父模块为准；含实例状态 | 无逐字段规则 |
| `material` | string | data/equipment.json | 通用主表/实例核心；子项以父模块为准 | 无逐字段规则 |
| `sub_category` | string | data/items.json；data/items/agriculture_injectables_base.csv:header；data/items/agriculture_injectables_base.csv:nonempty；data/items/compost_matrix_base.csv:header；data/items/compost_matrix_base.csv:nonempty；data/items/consumables_base.csv:header；data/items/consumables_base.csv:nonempty；data/items/currency_base.csv:header；data/items/fertilizer_anaerobic_base.csv:header；data/items/fertilizer_anaerobic_base.csv:nonempty；data/items/fishing_components_base.csv:header；data/items/fishing_components_base.csv:nonempty；data/items/materials_all.csv:header；data/items/materials_all.csv:nonempty；data/items/pharmacy_base.csv:header；data/items/pharmacy_base.csv:nonempty；data/items/product_base.csv:header；data/items/product_base.csv:nonempty；data/items/seeds_farming.csv:header；data/items/seeds_farming.csv:nonempty；data/items/soil_amendments_base.csv:header；data/items/soil_amendments_base.csv:nonempty | 通用主表/实例核心；子项以父模块为准 | 无逐字段规则 |
| `tags` | string | data/items.json；data/items/agriculture_injectables_base.csv:header；data/items/agriculture_injectables_base.csv:nonempty；data/items/compost_matrix_base.csv:header；data/items/compost_matrix_base.csv:nonempty；data/items/consumables_base.csv:header；data/items/consumables_base.csv:nonempty；data/items/currency_base.csv:header；data/items/currency_base.csv:nonempty；data/items/fertilizer_anaerobic_base.csv:header；data/items/fertilizer_anaerobic_base.csv:nonempty；data/items/fishing_components_base.csv:header；data/items/fishing_components_base.csv:nonempty；data/items/materials_all.csv:header；data/items/materials_all.csv:nonempty；data/items/pharmacy_base.csv:header；data/items/pharmacy_base.csv:nonempty；data/items/product_base.csv:header；data/items/product_base.csv:nonempty；data/items/seeds_farming.csv:header；data/items/seeds_farming.csv:nonempty；data/items/soil_amendments_base.csv:header；data/items/soil_amendments_base.csv:nonempty | 通用主表/实例核心；子项以父模块为准 | 无逐字段规则 |
| `weight` | string | data/items/agriculture_injectables_base.csv:header；data/items/agriculture_injectables_base.csv:nonempty；data/items/compost_matrix_base.csv:header；data/items/compost_matrix_base.csv:nonempty；data/items/consumables_base.csv:header；data/items/consumables_base.csv:nonempty；data/items/currency_base.csv:header；data/items/currency_base.csv:nonempty；data/items/fertilizer_anaerobic_base.csv:header；data/items/fertilizer_anaerobic_base.csv:nonempty；data/items/fishing_components_base.csv:header；data/items/fishing_components_base.csv:nonempty；data/items/materials_all.csv:header；data/items/materials_all.csv:nonempty；data/items/pharmacy_base.csv:header；data/items/pharmacy_base.csv:nonempty；data/items/product_base.csv:header；data/items/product_base.csv:nonempty；data/items/seeds_farming.csv:header；data/items/seeds_farming.csv:nonempty；data/items/soil_amendments_base.csv:header；data/items/soil_amendments_base.csv:nonempty | 统一命名候选；逐来源保留差异，不盲合并 | 无逐字段规则 |
| `weight_kg` | number | data/items.json；data/equipment.json；data/modules.json；display-rule | 通用主表/实例核心；子项以父模块为准 | regular；hidden；无技能门槛≥0 |

### 名称与认知描述（类内分组 identity_text）

| 原字段路径 | 观察类型 | 来源 | 处理建议 | 当前字段规则 / 信息模块 |
|---|---|---|---|---|
| `desc` | string | data/modules.json | 迁入所属模块，保留语义 | 无逐字段规则 |
| `desc_0` | string | data/items.json；data/equipment.json；display-rule | 统一命名候选；逐来源保留差异，不盲合并 | regular；language_gated_desc；survival_language≥0 |
| `desc_1` | string | data/equipment.json；display-rule | 迁入所属模块，保留语义 | regular；language_gated_desc；survival_language≥0 |
| `desc_2` | string | data/equipment.json；display-rule | 迁入所属模块，保留语义 | regular；language_gated_desc；survival_language≥0 |
| `display_skill_id` | string | data/equipment.json | 迁入所属模块，保留语义 | 无逐字段规则 |
| `fn` | string | data/items.json；data/items/agriculture_injectables_base.csv:header；data/items/agriculture_injectables_base.csv:nonempty；data/items/compost_matrix_base.csv:header；data/items/compost_matrix_base.csv:nonempty；data/items/consumables_base.csv:header；data/items/consumables_base.csv:nonempty；data/items/currency_base.csv:header；data/items/currency_base.csv:nonempty；data/items/fertilizer_anaerobic_base.csv:header；data/items/fertilizer_anaerobic_base.csv:nonempty；data/items/fishing_components_base.csv:header；data/items/fishing_components_base.csv:nonempty；data/items/materials_all.csv:header；data/items/materials_all.csv:nonempty；data/items/pharmacy_base.csv:header；data/items/pharmacy_base.csv:nonempty；data/items/product_base.csv:header；data/items/product_base.csv:nonempty；data/items/seeds_farming.csv:header；data/items/seeds_farming.csv:nonempty；data/items/soil_amendments_base.csv:header；data/items/soil_amendments_base.csv:nonempty；display-rule | 迁入所属模块，保留语义 | regular；language_gated_desc；survival_language≥4 |
| `fn_before` | string | data/items.json；data/items/agriculture_injectables_base.csv:header；data/items/agriculture_injectables_base.csv:nonempty；data/items/compost_matrix_base.csv:header；data/items/compost_matrix_base.csv:nonempty；data/items/fertilizer_anaerobic_base.csv:header；data/items/fertilizer_anaerobic_base.csv:nonempty；data/items/materials_all.csv:header；data/items/materials_all.csv:nonempty；data/items/seeds_farming.csv:header；data/items/seeds_farming.csv:nonempty；data/items/soil_amendments_base.csv:header；data/items/soil_amendments_base.csv:nonempty；display-rule | 迁入所属模块，保留语义 | regular；language_gated_desc；survival_language≥2 |
| `name` | string | data/items.json；data/modules.json；display-rule | 统一命名候选；逐来源保留差异，不盲合并 | regular；language_gated_name；survival_language≥0 |
| `name_0` | string | data/items.json；data/equipment.json；display-rule | 统一命名候选；逐来源保留差异，不盲合并 | regular；language_gated_name；survival_language≥0 |
| `name_1` | string | data/equipment.json；display-rule | 迁入所属模块，保留语义 | regular；language_gated_name；survival_language≥0 |
| `name_2` | string | data/equipment.json；display-rule | 迁入所属模块，保留语义 | regular；language_gated_name；survival_language≥0 |
| `placeholder_name` | string | data/items.json；data/items/agriculture_injectables_base.csv:header；data/items/agriculture_injectables_base.csv:nonempty；data/items/compost_matrix_base.csv:header；data/items/compost_matrix_base.csv:nonempty；data/items/consumables_base.csv:header；data/items/consumables_base.csv:nonempty；data/items/currency_base.csv:header；data/items/currency_base.csv:nonempty；data/items/fertilizer_anaerobic_base.csv:header；data/items/fertilizer_anaerobic_base.csv:nonempty；data/items/fishing_components_base.csv:header；data/items/fishing_components_base.csv:nonempty；data/items/materials_all.csv:header；data/items/materials_all.csv:nonempty；data/items/pharmacy_base.csv:header；data/items/pharmacy_base.csv:nonempty；data/items/product_base.csv:header；data/items/product_base.csv:nonempty；data/items/seeds_farming.csv:header；data/items/seeds_farming.csv:nonempty；data/items/soil_amendments_base.csv:header；data/items/soil_amendments_base.csv:nonempty；display-rule | 迁入所属模块，保留语义 | regular；language_gated_name；survival_language≥0 |
| `sn` | string | data/items.json；data/items/agriculture_injectables_base.csv:header；data/items/agriculture_injectables_base.csv:nonempty；data/items/compost_matrix_base.csv:header；data/items/compost_matrix_base.csv:nonempty；data/items/consumables_base.csv:header；data/items/consumables_base.csv:nonempty；data/items/currency_base.csv:header；data/items/currency_base.csv:nonempty；data/items/fertilizer_anaerobic_base.csv:header；data/items/fertilizer_anaerobic_base.csv:nonempty；data/items/fishing_components_base.csv:header；data/items/fishing_components_base.csv:nonempty；data/items/materials_all.csv:header；data/items/materials_all.csv:nonempty；data/items/pharmacy_base.csv:header；data/items/pharmacy_base.csv:nonempty；data/items/product_base.csv:header；data/items/product_base.csv:nonempty；data/items/seeds_farming.csv:header；data/items/seeds_farming.csv:nonempty；data/items/soil_amendments_base.csv:header；data/items/soil_amendments_base.csv:nonempty；display-rule | 迁入所属模块，保留语义 | regular；language_gated_name；survival_language≥3 |

### 堆叠（类内分组 stacking）

| 原字段路径 | 观察类型 | 来源 | 处理建议 | 当前字段规则 / 信息模块 |
|---|---|---|---|---|
| `stack_limit` | number/string | data/items.json；data/items/agriculture_injectables_base.csv:header；data/items/agriculture_injectables_base.csv:nonempty；data/items/compost_matrix_base.csv:header；data/items/compost_matrix_base.csv:nonempty；data/items/consumables_base.csv:header；data/items/consumables_base.csv:nonempty；data/items/currency_base.csv:header；data/items/currency_base.csv:nonempty；data/items/fertilizer_anaerobic_base.csv:header；data/items/fertilizer_anaerobic_base.csv:nonempty；data/items/fishing_components_base.csv:header；data/items/fishing_components_base.csv:nonempty；data/items/materials_all.csv:header；data/items/materials_all.csv:nonempty；data/items/pharmacy_base.csv:header；data/items/pharmacy_base.csv:nonempty；data/items/product_base.csv:header；data/items/product_base.csv:nonempty；data/items/seeds_farming.csv:header；data/items/seeds_farming.csv:nonempty；data/items/soil_amendments_base.csv:header；data/items/soil_amendments_base.csv:nonempty | 迁入所属模块，保留语义 | 无逐字段规则 |
| `stack_max` |  | runtime-contract-candidate | 统一命名候选；逐来源保留差异，不盲合并 | 无逐字段规则 |

### 交易价值与流通（类内分组 trade）

| 原字段路径 | 观察类型 | 来源 | 处理建议 | 当前字段规则 / 信息模块 |
|---|---|---|---|---|
| `base_value` | number/string | data/items.json；data/items/agriculture_injectables_base.csv:header；data/items/agriculture_injectables_base.csv:nonempty；data/items/compost_matrix_base.csv:header；data/items/compost_matrix_base.csv:nonempty；data/items/consumables_base.csv:header；data/items/consumables_base.csv:nonempty；data/items/currency_base.csv:header；data/items/currency_base.csv:nonempty；data/items/fertilizer_anaerobic_base.csv:header；data/items/fertilizer_anaerobic_base.csv:nonempty；data/items/fishing_components_base.csv:header；data/items/fishing_components_base.csv:nonempty；data/items/materials_all.csv:header；data/items/materials_all.csv:nonempty；data/items/pharmacy_base.csv:header；data/items/pharmacy_base.csv:nonempty；data/items/product_base.csv:header；data/items/product_base.csv:nonempty；data/items/seeds_farming.csv:header；data/items/soil_amendments_base.csv:header；data/items/soil_amendments_base.csv:nonempty | 迁入所属模块，保留语义 | 无逐字段规则 |
| `price_class` | string | data/items.json；data/items/agriculture_injectables_base.csv:header；data/items/agriculture_injectables_base.csv:nonempty；data/items/compost_matrix_base.csv:header；data/items/compost_matrix_base.csv:nonempty；data/items/consumables_base.csv:header；data/items/consumables_base.csv:nonempty；data/items/currency_base.csv:header；data/items/currency_base.csv:nonempty；data/items/fertilizer_anaerobic_base.csv:header；data/items/fertilizer_anaerobic_base.csv:nonempty；data/items/fishing_components_base.csv:header；data/items/fishing_components_base.csv:nonempty；data/items/materials_all.csv:header；data/items/materials_all.csv:nonempty；data/items/pharmacy_base.csv:header；data/items/pharmacy_base.csv:nonempty；data/items/product_base.csv:header；data/items/product_base.csv:nonempty；data/items/seeds_farming.csv:header；data/items/seeds_farming.csv:nonempty；data/items/soil_amendments_base.csv:header；data/items/soil_amendments_base.csv:nonempty | 迁入所属模块，保留语义 | 无逐字段规则 |
| `region_restrict` | number/string | data/items.json；data/items/agriculture_injectables_base.csv:header；data/items/agriculture_injectables_base.csv:nonempty；data/items/compost_matrix_base.csv:header；data/items/compost_matrix_base.csv:nonempty；data/items/consumables_base.csv:header；data/items/consumables_base.csv:nonempty；data/items/currency_base.csv:header；data/items/currency_base.csv:nonempty；data/items/fertilizer_anaerobic_base.csv:header；data/items/fertilizer_anaerobic_base.csv:nonempty；data/items/fishing_components_base.csv:header；data/items/fishing_components_base.csv:nonempty；data/items/materials_all.csv:header；data/items/materials_all.csv:nonempty；data/items/pharmacy_base.csv:header；data/items/pharmacy_base.csv:nonempty；data/items/product_base.csv:header；data/items/product_base.csv:nonempty；data/items/seeds_farming.csv:header；data/items/seeds_farming.csv:nonempty；data/items/soil_amendments_base.csv:header；data/items/soil_amendments_base.csv:nonempty | 迁入所属模块，保留语义 | 无逐字段规则 |
| `volatility` | string | data/items.json；data/items/agriculture_injectables_base.csv:header；data/items/agriculture_injectables_base.csv:nonempty；data/items/compost_matrix_base.csv:header；data/items/compost_matrix_base.csv:nonempty；data/items/consumables_base.csv:header；data/items/consumables_base.csv:nonempty；data/items/currency_base.csv:header；data/items/currency_base.csv:nonempty；data/items/fertilizer_anaerobic_base.csv:header；data/items/fertilizer_anaerobic_base.csv:nonempty；data/items/fishing_components_base.csv:header；data/items/fishing_components_base.csv:nonempty；data/items/materials_all.csv:header；data/items/materials_all.csv:nonempty；data/items/pharmacy_base.csv:header；data/items/pharmacy_base.csv:nonempty；data/items/product_base.csv:header；data/items/product_base.csv:nonempty；data/items/seeds_farming.csv:header；data/items/seeds_farming.csv:nonempty；data/items/soil_amendments_base.csv:header；data/items/soil_amendments_base.csv:nonempty | 迁入所属模块，保留语义 | 无逐字段规则 |

### 货币兑换（类内分组 currency）

| 原字段路径 | 观察类型 | 来源 | 处理建议 | 当前字段规则 / 信息模块 |
|---|---|---|---|---|
| `accept_code` | string | data/items.json；data/items/currency_base.csv:header；data/items/currency_base.csv:nonempty | 迁入所属模块，保留语义 | 无逐字段规则 |
| `convert_to_high` | string | data/items.json；data/items/currency_base.csv:header；data/items/currency_base.csv:nonempty | 迁入所属模块，保留语义 | 无逐字段规则 |
| `usable_regions` | number/string | data/items.json；data/items/currency_base.csv:header；data/items/currency_base.csv:nonempty | 迁入所属模块，保留语义 | 无逐字段规则 |

### 腐败（类内分组 spoilage）

| 原字段路径 | 观察类型 | 来源 | 处理建议 | 当前字段规则 / 信息模块 |
|---|---|---|---|---|
| `spoilage_elapsed_ticks` |  | reviewed-instance-field | 迁入所属模块，保留语义；含实例状态 | 无逐字段规则 |
| `spoilage_ticks` | number/string | data/items.json；data/items/agriculture_injectables_base.csv:header；data/items/agriculture_injectables_base.csv:nonempty；data/items/compost_matrix_base.csv:header；data/items/compost_matrix_base.csv:nonempty；data/items/consumables_base.csv:header；data/items/consumables_base.csv:nonempty；data/items/currency_base.csv:header；data/items/currency_base.csv:nonempty；data/items/fertilizer_anaerobic_base.csv:header；data/items/fertilizer_anaerobic_base.csv:nonempty；data/items/fishing_components_base.csv:header；data/items/fishing_components_base.csv:nonempty；data/items/materials_all.csv:header；data/items/materials_all.csv:nonempty；data/items/pharmacy_base.csv:header；data/items/pharmacy_base.csv:nonempty；data/items/product_base.csv:header；data/items/product_base.csv:nonempty；data/items/seeds_farming.csv:header；data/items/seeds_farming.csv:nonempty；data/items/soil_amendments_base.csv:header；data/items/soil_amendments_base.csv:nonempty；display-rule；info-module-reference | 迁入所属模块，保留语义 | food_detail；hidden；无技能门槛≥0；module.food_calibrated/preservation（life_cooking≥2） |

### 显示编排（非能力）（类内分组 presentation）

| 原字段路径 | 观察类型 | 来源 | 处理建议 | 当前字段规则 / 信息模块 |
|---|---|---|---|---|
| `info_module_set_id` | string | data/items.json；data/equipment.json；data/items/agriculture_injectables_base.csv:header；data/items/compost_matrix_base.csv:header；data/items/consumables_base.csv:header；data/items/consumables_base.csv:nonempty；data/items/currency_base.csv:header；data/items/fertilizer_anaerobic_base.csv:header；data/items/fishing_components_base.csv:header；data/items/materials_all.csv:header；data/items/materials_all.csv:nonempty；data/items/pharmacy_base.csv:header；data/items/pharmacy_base.csv:nonempty；data/items/product_base.csv:header；data/items/seeds_farming.csv:header；data/items/soil_amendments_base.csv:header | 保留显示编排引用；不能作为属性模块声明 | 无逐字段规则 |

### 来源与生产索引（类内分组 provenance）

| 原字段路径 | 观察类型 | 来源 | 处理建议 | 当前字段规则 / 信息模块 |
|---|---|---|---|---|
| `production_lines` | string | data/items.json；data/items/agriculture_injectables_base.csv:header；data/items/agriculture_injectables_base.csv:nonempty；data/items/compost_matrix_base.csv:header；data/items/compost_matrix_base.csv:nonempty；data/items/consumables_base.csv:header；data/items/consumables_base.csv:nonempty；data/items/currency_base.csv:header；data/items/fertilizer_anaerobic_base.csv:header；data/items/fertilizer_anaerobic_base.csv:nonempty；data/items/fishing_components_base.csv:header；data/items/fishing_components_base.csv:nonempty；data/items/materials_all.csv:header；data/items/materials_all.csv:nonempty；data/items/pharmacy_base.csv:header；data/items/pharmacy_base.csv:nonempty；data/items/product_base.csv:header；data/items/product_base.csv:nonempty；data/items/seeds_farming.csv:header；data/items/soil_amendments_base.csv:header；data/items/soil_amendments_base.csv:nonempty | 迁入所属模块，保留语义 | 无逐字段规则 |
| `source` | string | data/items.json；data/items/agriculture_injectables_base.csv:header；data/items/agriculture_injectables_base.csv:nonempty；data/items/compost_matrix_base.csv:header；data/items/compost_matrix_base.csv:nonempty；data/items/consumables_base.csv:header；data/items/consumables_base.csv:nonempty；data/items/currency_base.csv:header；data/items/currency_base.csv:nonempty；data/items/fertilizer_anaerobic_base.csv:header；data/items/fertilizer_anaerobic_base.csv:nonempty；data/items/fishing_components_base.csv:header；data/items/fishing_components_base.csv:nonempty；data/items/materials_all.csv:header；data/items/materials_all.csv:nonempty；data/items/pharmacy_base.csv:header；data/items/pharmacy_base.csv:nonempty；data/items/product_base.csv:header；data/items/product_base.csv:nonempty；data/items/seeds_farming.csv:header；data/items/seeds_farming.csv:nonempty；data/items/soil_amendments_base.csv:header；data/items/soil_amendments_base.csv:nonempty | 迁入所属模块，保留语义 | 无逐字段规则 |

### 所在地与地面时间（非能力）（类内分组 location）

| 原字段路径 | 观察类型 | 来源 | 处理建议 | 当前字段规则 / 信息模块 |
|---|---|---|---|---|
| `ground_drop_tick` |  | reviewed-instance-field | 迁入所属模块，保留语义；含实例状态 | 无逐字段规则 |

## 食物（food）

主表按此大类加载；下列分组在类内按需配置，不单独加载。

### 食用与消化（类内分组 edible）

| 原字段路径 | 观察类型 | 来源 | 处理建议 | 当前字段规则 / 信息模块 |
|---|---|---|---|---|
| `digestion_ticks` | number/string | data/items.json；data/items/materials_all.csv:header；data/items/materials_all.csv:nonempty；info-module-reference | 食物目录覆盖范围内归一；目录外保留现有数据，核对后迁移 | 无逐字段规则；module.food_calibrated/digestion（life_cooking≥1） |
| `edible` | boolean/string | data/items.json；data/items/agriculture_injectables_base.csv:header；data/items/compost_matrix_base.csv:header；data/items/consumables_base.csv:header；data/items/consumables_base.csv:nonempty；data/items/fertilizer_anaerobic_base.csv:header；data/items/materials_all.csv:header；data/items/materials_all.csv:nonempty；data/items/pharmacy_base.csv:header；data/items/seeds_farming.csv:header；data/items/soil_amendments_base.csv:header；display-rule | 迁入所属模块，保留语义 | regular；hidden；无技能门槛≥0 |
| `edible_buff_id` | string | data/items.json；data/items/agriculture_injectables_base.csv:header；data/items/compost_matrix_base.csv:header；data/items/consumables_base.csv:header；data/items/consumables_base.csv:nonempty；data/items/fertilizer_anaerobic_base.csv:header；data/items/materials_all.csv:header；data/items/materials_all.csv:nonempty；data/items/seeds_farming.csv:header；data/items/soil_amendments_base.csv:header；display-rule | 迁入所属模块，保留语义 | food_detail；hidden；无技能门槛≥0 |
| `food_buff_duration_ticks` | number/string | data/items.json；data/items/consumables_base.csv:header；data/items/consumables_base.csv:nonempty；data/items/materials_all.csv:header；data/items/materials_all.csv:nonempty；data/items/pharmacy_base.csv:header；data/items/pharmacy_base.csv:nonempty；display-rule；info-module-reference | 食物目录覆盖范围内归一；目录外保留现有数据，核对后迁移 | food_detail；hidden；无技能门槛≥0；module.pharmacy_medicine/route（无模块技能门槛≥0） |
| `food_composition_text` | string | data/items.json；info-module-reference | 计算/显示派生，不作第二数值真源 | 无逐字段规则；module.food_calibrated/digestion（life_cooking≥1） |
| `food_experience_text` | string | data/items.json；info-module-reference | 计算/显示派生，不作第二数值真源 | 无逐字段规则；module.food_calibrated/growth（life_cooking≥3） |
| `food_profile` | object | data/items.json | 迁入所属模块，保留语义 | 无逐字段规则 |
| `food_profile.attribute_exp` | object | data/items.json | 迁入所属模块，保留语义 | 无逐字段规则 |
| `food_profile.attribute_exp.breath` | number | data/items.json | 迁入所属模块，保留语义 | 无逐字段规则 |
| `food_profile.attribute_exp.flexibility` | number | data/items.json | 迁入所属模块，保留语义 | 无逐字段规则 |
| `food_profile.attribute_exp.jingu` | number | data/items.json | 迁入所属模块，保留语义 | 无逐字段规则 |
| `food_profile.composition` | array | data/items.json | 迁入所属模块，保留语义 | 无逐字段规则 |
| `food_profile.composition[]` | number | data/items.json | 迁入所属模块，保留语义 | 无逐字段规则 |
| `food_profile.digestion_ticks` | number | data/items.json | 迁入所属模块，保留语义 | 无逐字段规则 |
| `food_profile.edible_buff_id` | string | data/items.json | 迁入所属模块，保留语义 | 无逐字段规则 |
| `food_profile.meal_tier` | string | data/items.json | 迁入所属模块，保留语义 | 无逐字段规则 |
| `food_profile.name` | string | data/items.json | 迁入所属模块，保留语义 | 无逐字段规则 |
| `food_profile.portion_units` | number | data/items.json | 迁入所属模块，保留语义 | 无逐字段规则 |
| `food_profile.satiety_total` | number | data/items.json | 迁入所属模块，保留语义 | 无逐字段规则 |
| `food_profile.special` | object | data/items.json | 迁入所属模块，保留语义 | 无逐字段规则 |
| `food_profile.special.duration_ticks` | number | data/items.json | 迁入所属模块，保留语义 | 无逐字段规则 |
| `food_profile.special.energy` | number | data/items.json | 迁入所属模块，保留语义 | 无逐字段规则 |
| `food_profile.special.mood` | number | data/items.json | 迁入所属模块，保留语义 | 无逐字段规则 |
| `food_profile.special.speed` | number | data/items.json | 迁入所属模块，保留语义 | 无逐字段规则 |
| `food_profile.special.stamina` | number | data/items.json | 迁入所属模块，保留语义 | 无逐字段规则 |
| `food_profile.thirst_instant` | number | data/items.json | 迁入所属模块，保留语义 | 无逐字段规则 |
| `food_profile.workhorse` | boolean | data/items.json | 迁入所属模块，保留语义 | 无逐字段规则 |
| `food_special_text` | string | data/items.json；info-module-reference | 计算/显示派生，不作第二数值真源 | 无逐字段规则；module.food_calibrated/growth（life_cooking≥3） |
| `food_special_ticks` | number | data/items.json；info-module-reference | 食物目录覆盖范围内归一；目录外保留现有数据，核对后迁移 | 无逐字段规则；module.food_calibrated/growth（life_cooking≥3） |
| `food_thirst_instant` | number | data/items.json；info-module-reference | 食物目录覆盖范围内归一；目录外保留现有数据，核对后迁移 | 无逐字段规则；module.food_calibrated/food（无模块技能门槛≥0） |
| `meal_composition` | string | data/items.json；data/items/materials_all.csv:header；data/items/materials_all.csv:nonempty | 计算/显示派生，不作第二数值真源 | 无逐字段规则 |
| `meal_tier` | string | data/items.json；data/items/materials_all.csv:header；data/items/materials_all.csv:nonempty | 食物目录覆盖范围内归一；目录外保留现有数据，核对后迁移 | 无逐字段规则 |
| `satiety_total` | number/string | data/items.json；data/items/materials_all.csv:header；data/items/materials_all.csv:nonempty；info-module-reference | 食物目录覆盖范围内归一；目录外保留现有数据，核对后迁移 | 无逐字段规则；module.food_calibrated/food（无模块技能门槛≥0） |
| `workhorse` | boolean/string | data/items.json；data/items/materials_all.csv:header；data/items/materials_all.csv:nonempty | 食物目录覆盖范围内归一；目录外保留现有数据，核对后迁移 | 无逐字段规则 |

### 食物装盒规格（类内分组 meal_packing）

| 原字段路径 | 观察类型 | 来源 | 处理建议 | 当前字段规则 / 信息模块 |
|---|---|---|---|---|
| `food_profile.slots_taken` | number | data/items.json | 迁入所属模块，保留语义 | 无逐字段规则 |
| `slots_taken` | number/string | data/items.json；data/items/materials_all.csv:header；data/items/materials_all.csv:nonempty；info-module-reference | 食物目录覆盖范围内归一；目录外保留现有数据，核对后迁移 | 无逐字段规则；module.food_calibrated/food（无模块技能门槛≥0） |

## 材料与生产（production）

主表按此大类加载；下列分组在类内按需配置，不单独加载。

### 烹饪投料（类内分组 cooking_input）

| 原字段路径 | 观察类型 | 来源 | 处理建议 | 当前字段规则 / 信息模块 |
|---|---|---|---|---|
| `cooking_ingredient` | boolean/string | data/items.json；data/items/agriculture_injectables_base.csv:header；data/items/compost_matrix_base.csv:header；data/items/consumables_base.csv:header；data/items/currency_base.csv:header；data/items/fertilizer_anaerobic_base.csv:header；data/items/fishing_components_base.csv:header；data/items/materials_all.csv:header；data/items/materials_all.csv:nonempty；data/items/pharmacy_base.csv:header；data/items/product_base.csv:header；data/items/seeds_farming.csv:header；data/items/soil_amendments_base.csv:header；display-rule | 迁入所属模块，保留语义 | cooking_station；bool_tag；life_cooking≥1 |

### 燃料（类内分组 fuel）

| 原字段路径 | 观察类型 | 来源 | 处理建议 | 当前字段规则 / 信息模块 |
|---|---|---|---|---|
| `fuel_points` | number/string | data/items.json；data/items/agriculture_injectables_base.csv:header；data/items/compost_matrix_base.csv:header；data/items/fertilizer_anaerobic_base.csv:header；data/items/materials_all.csv:header；data/items/materials_all.csv:nonempty；data/items/pharmacy_base.csv:header；data/items/pharmacy_base.csv:nonempty；data/items/seeds_farming.csv:header；data/items/soil_amendments_base.csv:header；display-rule | 迁入所属模块，保留语义 | cooking_station；number；life_cooking≥1 |

### 供水（类内分组 water_supply）

| 原字段路径 | 观察类型 | 来源 | 处理建议 | 当前字段规则 / 信息模块 |
|---|---|---|---|---|
| `water_points` | number/string | data/items.json；data/items/fishing_components_base.csv:header；data/items/materials_all.csv:header；data/items/materials_all.csv:nonempty；data/items/pharmacy_base.csv:header；data/items/pharmacy_base.csv:nonempty；data/items/product_base.csv:header；data/items/product_base.csv:nonempty；display-rule | 迁入所属模块，保留语义 | cooking_station；number；life_cooking≥1 |

### 制药投料（类内分组 pharmacy_input）

| 原字段路径 | 观察类型 | 来源 | 处理建议 | 当前字段规则 / 信息模块 |
|---|---|---|---|---|
| `adjuvant_strength` | number/string | data/items.json；data/items/pharmacy_base.csv:header；data/items/pharmacy_base.csv:nonempty；display-rule | 迁入所属模块，保留语义 | pharmacy；number；life_pharmacy≥1 |
| `chem_class` | string | data/items.json；data/items/pharmacy_base.csv:header；data/items/pharmacy_base.csv:nonempty；display-rule | 迁入所属模块，保留语义 | pharmacy；enum_label；life_pharmacy≥1 |
| `concentration_cost` | number/string | data/items.json；data/items/pharmacy_base.csv:header；data/items/pharmacy_base.csv:nonempty；display-rule | 迁入所属模块，保留语义 | pharmacy；number；life_pharmacy≥1 |
| `pharm_effect` | number/string | data/items.json；data/items/pharmacy_base.csv:header；data/items/pharmacy_base.csv:nonempty；display-rule | 迁入所属模块，保留语义 | pharmacy；number；life_pharmacy≥1 |
| `pharm_family` | string | data/items.json；data/items/pharmacy_base.csv:header；data/items/pharmacy_base.csv:nonempty；display-rule | 迁入所属模块，保留语义 | pharmacy；enum_label；life_pharmacy≥1 |
| `pharm_toxicity` | number/string | data/items.json；data/items/pharmacy_base.csv:header；data/items/pharmacy_base.csv:nonempty；display-rule | 迁入所属模块，保留语义 | pharmacy；number；life_pharmacy≥1 |
| `pharmacy_active_components` | string | data/items.json；data/items/pharmacy_base.csv:header；data/items/pharmacy_base.csv:nonempty | 迁入所属模块，保留语义 | 无逐字段规则 |
| `pharmacy_ingredient` | boolean/string | data/items.json；data/items/agriculture_injectables_base.csv:header；data/items/compost_matrix_base.csv:header；data/items/consumables_base.csv:header；data/items/consumables_base.csv:nonempty；data/items/currency_base.csv:header；data/items/fertilizer_anaerobic_base.csv:header；data/items/fishing_components_base.csv:header；data/items/materials_all.csv:header；data/items/materials_all.csv:nonempty；data/items/pharmacy_base.csv:header；data/items/pharmacy_base.csv:nonempty；data/items/product_base.csv:header；data/items/seeds_farming.csv:header；data/items/soil_amendments_base.csv:header；display-rule | 迁入所属模块，保留语义 | pharmacy；bool_tag；life_pharmacy≥1 |

### 堆肥投料与菌剂（类内分组 compost_input）

| 原字段路径 | 观察类型 | 来源 | 处理建议 | 当前字段规则 / 信息模块 |
|---|---|---|---|---|
| `compost_inoculant_aerobic` | boolean/string | data/items.json；data/items/materials_all.csv:header；data/items/materials_all.csv:nonempty；display-rule | 迁入所属模块，保留语义 | planting_compost；bool_tag；life_planting≥2 |
| `compost_inoculant_anaerobic` | boolean/string | data/items.json；data/items/materials_all.csv:header；data/items/materials_all.csv:nonempty；display-rule | 迁入所属模块，保留语义 | planting_compost；bool_tag；life_planting≥2 |
| `fert_c` | string | data/items.json；data/items/agriculture_injectables_base.csv:header；data/items/compost_matrix_base.csv:header；data/items/compost_matrix_base.csv:nonempty；data/items/fertilizer_anaerobic_base.csv:header；data/items/materials_all.csv:header；data/items/materials_all.csv:nonempty；data/items/seeds_farming.csv:header；data/items/soil_amendments_base.csv:header；display-rule | 迁入所属模块，保留语义 | planting_compost；number；life_planting≥1 |
| `fert_n` | string | data/items.json；data/items/agriculture_injectables_base.csv:header；data/items/compost_matrix_base.csv:header；data/items/compost_matrix_base.csv:nonempty；data/items/fertilizer_anaerobic_base.csv:header；data/items/materials_all.csv:header；data/items/materials_all.csv:nonempty；data/items/seeds_farming.csv:header；data/items/soil_amendments_base.csv:header；display-rule | 迁入所属模块，保留语义 | planting_compost；number；life_planting≥1 |

### 农业施肥（类内分组 fertilizer）

| 原字段路径 | 观察类型 | 来源 | 处理建议 | 当前字段规则 / 信息模块 |
|---|---|---|---|---|
| `agriculture_buried_jar_injectable` | string | data/items.json；data/items/fertilizer_anaerobic_base.csv:header；data/items/fertilizer_anaerobic_base.csv:nonempty | 迁入所属模块，保留语义 | 无逐字段规则 |
| `agriculture_nutrient_per_bottle` | string | data/items.json；data/items/agriculture_injectables_base.csv:header；data/items/agriculture_injectables_base.csv:nonempty；data/items/fertilizer_anaerobic_base.csv:header；data/items/fertilizer_anaerobic_base.csv:nonempty | 迁入所属模块，保留语义 | 无逐字段规则 |
| `agriculture_venturi_injectable` | string | data/items.json；data/items/agriculture_injectables_base.csv:header；data/items/agriculture_injectables_base.csv:nonempty | 迁入所属模块，保留语义 | 无逐字段规则 |
| `inject_facility` | string | data/items.json；data/items/agriculture_injectables_base.csv:header；data/items/agriculture_injectables_base.csv:nonempty；data/items/fertilizer_anaerobic_base.csv:header；data/items/fertilizer_anaerobic_base.csv:nonempty | 迁入所属模块，保留语义 | 无逐字段规则 |
| `is_anaerobic_fertilizer` | string | data/items.json；data/items/fertilizer_anaerobic_base.csv:header；data/items/fertilizer_anaerobic_base.csv:nonempty | 迁入所属模块，保留语义 | 无逐字段规则 |

### 土壤改良（类内分组 soil_amendment）

| 原字段路径 | 观察类型 | 来源 | 处理建议 | 当前字段规则 / 信息模块 |
|---|---|---|---|---|
| `grants_soil_id` | string | data/items.json；data/items/soil_amendments_base.csv:header；data/items/soil_amendments_base.csv:nonempty | 迁入所属模块，保留语义 | 无逐字段规则 |

### 播种（类内分组 seed）

| 原字段路径 | 观察类型 | 来源 | 处理建议 | 当前字段规则 / 信息模块 |
|---|---|---|---|---|
| `harvest_item_id` | string | data/items.json；data/items/seeds_farming.csv:header；data/items/seeds_farming.csv:nonempty | 迁入所属模块，保留语义 | 无逐字段规则 |
| `seed_tier` | string | data/items.json；data/items/seeds_farming.csv:header；data/items/seeds_farming.csv:nonempty | 迁入所属模块，保留语义 | 无逐字段规则 |

## 药品与使用（medicine）

主表按此大类加载；下列分组在类内按需配置，不单独加载。

### 主动使用（类内分组 usable）

| 原字段路径 | 观察类型 | 来源 | 处理建议 | 当前字段规则 / 信息模块 |
|---|---|---|---|---|
| `charges` |  | reviewed-instance-field | 迁入所属模块，保留语义；含实例状态 | 无逐字段规则 |
| `usable` | boolean/string | data/items.json；data/items/agriculture_injectables_base.csv:header；data/items/compost_matrix_base.csv:header；data/items/consumables_base.csv:header；data/items/fertilizer_anaerobic_base.csv:header；data/items/materials_all.csv:header；data/items/pharmacy_base.csv:header；data/items/pharmacy_base.csv:nonempty；data/items/seeds_farming.csv:header；data/items/soil_amendments_base.csv:header | 迁入所属模块，保留语义 | 无逐字段规则 |
| `use_action` | string | data/items.json；data/items/consumables_base.csv:header；data/items/pharmacy_base.csv:header；data/items/pharmacy_base.csv:nonempty；display-rule；info-module-reference | 迁入所属模块，保留语义 | pharmacy_common；enum_label；无技能门槛≥0；module.pharmacy_medicine/route（无模块技能门槛≥0） |
| `use_buff_id` | string | data/items.json；data/items/agriculture_injectables_base.csv:header；data/items/compost_matrix_base.csv:header；data/items/consumables_base.csv:header；data/items/fertilizer_anaerobic_base.csv:header；data/items/materials_all.csv:header；data/items/pharmacy_base.csv:header；data/items/pharmacy_base.csv:nonempty；data/items/seeds_farming.csv:header；data/items/soil_amendments_base.csv:header；display-rule | 迁入所属模块，保留语义 | pharmacy；pharmacy_effect；life_pharmacy≥1 |
| `use_charges` | number/string | data/items.json；data/items/pharmacy_base.csv:header；data/items/pharmacy_base.csv:nonempty；display-rule；info-module-reference | 迁入所属模块，保留语义 | pharmacy_common；pharmacy_charges；无技能门槛≥0；module.pharmacy_medicine/route（无模块技能门槛≥0） |

### 复方承载与配方状态（类内分组 pharmacy_compound）

| 原字段路径 | 观察类型 | 来源 | 处理建议 | 当前字段规则 / 信息模块 |
|---|---|---|---|---|
| `components` |  | display-rule；reviewed-instance-field | 迁入所属模块，保留语义；含实例状态 | pharmacy；pharmacy_components；life_pharmacy≥1 |
| `components[].count` |  | reviewed-instance-field | 迁入所属模块，保留语义；含实例状态 | 无逐字段规则 |
| `components[].item_id` |  | reviewed-instance-field | 迁入所属模块，保留语义；含实例状态 | 无逐字段规则 |
| `concentration_capacity` | number/string | data/items.json；data/items/pharmacy_base.csv:header；data/items/pharmacy_base.csv:nonempty；display-rule | 迁入所属模块，保留语义 | pharmacy；number；life_pharmacy≥1 |
| `pharmacy_compound` | boolean/string | data/items.json；data/items/pharmacy_base.csv:header；data/items/pharmacy_base.csv:nonempty；display-rule | 迁入所属模块，保留语义 | pharmacy；bool_tag；life_pharmacy≥1 |
| `pharmacy_formula_key` |  | reviewed-instance-field | 迁入所属模块，保留语义；含实例状态 | 无逐字段规则 |
| `pharmacy_rules_version` |  | reviewed-instance-field | 迁入所属模块，保留语义；含实例状态 | 无逐字段规则 |
| `precipitated` |  | reviewed-instance-field | 现有产出字段；由成分推导，需核实历史档后处理；含实例状态 | 无逐字段规则 |
| `salt_deficit` |  | reviewed-instance-field | 现有产出字段；由成分推导，需核实历史档后处理；含实例状态 | 无逐字段规则 |

### 药品效果参数（类内分组 pharmacy_effect）

| 原字段路径 | 观察类型 | 来源 | 处理建议 | 当前字段规则 / 信息模块 |
|---|---|---|---|---|
| `pharmacy_addiction_gain` | string | data/items.json；data/items/pharmacy_base.csv:header；data/items/pharmacy_base.csv:nonempty | 迁入所属模块，保留语义 | 无逐字段规则 |
| `pharmacy_extra_toxicity_decay` | string | data/items.json；data/items/pharmacy_base.csv:header；data/items/pharmacy_base.csv:nonempty | 迁入所属模块，保留语义 | 无逐字段规则 |
| `pharmacy_oral_toxicity` | string | data/items.json；data/items/pharmacy_base.csv:header；data/items/pharmacy_base.csv:nonempty | 迁入所属模块，保留语义 | 无逐字段规则 |
| `pharmacy_relief_stages` | string | data/items.json；data/items/pharmacy_base.csv:header；data/items/pharmacy_base.csv:nonempty | 迁入所属模块，保留语义 | 无逐字段规则 |

## 装备（equipment）

主表按此大类加载；下列分组在类内按需配置，不单独加载。

### 装备位置与条件（类内分组 equippable）

| 原字段路径 | 观察类型 | 来源 | 处理建议 | 当前字段规则 / 信息模块 |
|---|---|---|---|---|
| `equip_slot` | string | data/equipment.json | 迁入所属模块，保留语义 | 无逐字段规则 |
| `req_innate_jingu` |  | info-module-reference；runtime-contract-candidate | 迁入所属模块，保留语义 | 无逐字段规则；module.equipment_armor/combat_detail（survival_language≥5） |

### 攻击载体与动作修正（类内分组 combat_carrier）

| 原字段路径 | 观察类型 | 来源 | 处理建议 | 当前字段规则 / 信息模块 |
|---|---|---|---|---|
| `attack_power` |  | runtime-contract-candidate | 统一命名候选；逐来源保留差异，不盲合并 | 无逐字段规则 |
| `damage_type_effects` |  | runtime-contract-candidate | 迁入所属模块，保留语义 | 无逐字段规则 |
| `form_coefs` | object | data/equipment.json；info-module-reference | 迁入所属模块，保留语义 | 无逐字段规则；module.equipment_armor/combat_detail（survival_language≥5） |
| `form_coefs.戳` | number | data/equipment.json | 迁入所属模块，保留语义 | 无逐字段规则 |
| `form_coefs.扫` | number | data/equipment.json | 迁入所属模块，保留语义 | 无逐字段规则 |
| `form_coefs.拳` | number | data/equipment.json | 迁入所属模块，保留语义 | 无逐字段规则 |
| `form_coefs.掌` | number | data/equipment.json | 迁入所属模块，保留语义 | 无逐字段规则 |
| `form_coefs.踏` | number | data/equipment.json | 迁入所属模块，保留语义 | 无逐字段规则 |
| `form_coefs.踹` | number | data/equipment.json | 迁入所属模块，保留语义 | 无逐字段规则 |
| `limb_tags` | array | data/equipment.json | 迁入所属模块，保留语义 | 无逐字段规则 |
| `limb_tags[]` | string | data/equipment.json | 迁入所属模块，保留语义 | 无逐字段规则 |
| `move_cost_mod` | number | data/equipment.json；info-module-reference | 迁入所属模块，保留语义 | 无逐字段规则；module.equipment_armor/combat_detail（survival_language≥5） |
| `parry_coef` | number | data/equipment.json；info-module-reference | 迁入所属模块，保留语义 | 无逐字段规则；module.equipment_armor/combat_detail（survival_language≥5） |
| `skill_coef` | number/string | data/items.json；data/items/fishing_components_base.csv:header；data/items/product_base.csv:header；data/items/product_base.csv:nonempty | 迁入所属模块，保留语义 | 无逐字段规则 |
| `speed_coef` | number | data/equipment.json；info-module-reference | 迁入所属模块，保留语义 | 无逐字段规则；module.equipment_armor/combat_detail（survival_language≥5） |
| `weapon_attack_power` | number/string | data/items.json；data/items/fishing_components_base.csv:header；data/items/product_base.csv:header；data/items/product_base.csv:nonempty | 迁入所属模块，保留语义 | 无逐字段规则 |

### 防护与激活盾（类内分组 armor）

| 原字段路径 | 观察类型 | 来源 | 处理建议 | 当前字段规则 / 信息模块 |
|---|---|---|---|---|
| `base_shield` | number | data/equipment.json；info-module-reference | 迁入所属模块，保留语义 | 无逐字段规则；module.equipment_armor/armor_stats（survival_language≥4） |
| `damage_reduce_blunt_pct` | number | data/equipment.json；info-module-reference | 迁入所属模块，保留语义 | 无逐字段规则；module.equipment_armor/armor_stats（survival_language≥4） |
| `damage_reduce_pierce_pct` | number | data/equipment.json；info-module-reference | 迁入所属模块，保留语义 | 无逐字段规则；module.equipment_armor/armor_stats（survival_language≥4） |
| `damage_reduce_slash_pct` | number | data/equipment.json；info-module-reference | 迁入所属模块，保留语义 | 无逐字段规则；module.equipment_armor/armor_stats（survival_language≥4） |

### 部件效果（类内分组 attachment_effect）

| 原字段路径 | 观察类型 | 来源 | 处理建议 | 当前字段规则 / 信息模块 |
|---|---|---|---|---|
| `activation_cost_pct` | number | data/modules.json | 迁入所属模块，保留语义 | 无逐字段规则 |
| `effects` | array | data/modules.json | 迁入所属模块，保留语义 | 无逐字段规则 |
| `effects[]` | object | data/modules.json | 迁入所属模块，保留语义 | 无逐字段规则 |
| `effects[].effect_params` | object | data/modules.json | 迁入所属模块，保留语义 | 无逐字段规则 |
| `effects[].effect_params.anti_stun_pct` | number | data/modules.json | 迁入所属模块，保留语义 | 无逐字段规则 |
| `effects[].effect_params.blunt_pct` | number | data/modules.json | 迁入所属模块，保留语义 | 无逐字段规则 |
| `effects[].effect_params.hit_pct` | number | data/modules.json | 迁入所属模块，保留语义 | 无逐字段规则 |
| `effects[].effect_params.pierce_pct` | number | data/modules.json | 迁入所属模块，保留语义 | 无逐字段规则 |
| `effects[].effect_params.slash_pct` | number | data/modules.json | 迁入所属模块，保留语义 | 无逐字段规则 |
| `effects[].effect_type` | string | data/modules.json | 迁入所属模块，保留语义 | 无逐字段规则 |
| `segments` | object | data/modules.json | 迁入所属模块，保留语义 | 无逐字段规则 |
| `segments.clothing` | object | data/modules.json | 迁入所属模块，保留语义 | 无逐字段规则 |
| `segments.clothing.effects` | array | data/modules.json | 迁入所属模块，保留语义 | 无逐字段规则 |
| `segments.clothing.effects[]` | object | data/modules.json | 迁入所属模块，保留语义 | 无逐字段规则 |
| `segments.clothing.effects[].effect_params` | object | data/modules.json | 迁入所属模块，保留语义 | 无逐字段规则 |
| `segments.clothing.effects[].effect_params.pierce_pct` | number | data/modules.json | 迁入所属模块，保留语义 | 无逐字段规则 |
| `segments.clothing.effects[].effect_params.slash_pct` | number | data/modules.json | 迁入所属模块，保留语义 | 无逐字段规则 |
| `segments.clothing.effects[].effect_type` | string | data/modules.json | 迁入所属模块，保留语义 | 无逐字段规则 |
| `segments.head` | object | data/modules.json | 迁入所属模块，保留语义 | 无逐字段规则 |
| `segments.head.effects` | array | data/modules.json | 迁入所属模块，保留语义 | 无逐字段规则 |
| `segments.head.effects[]` | object | data/modules.json | 迁入所属模块，保留语义 | 无逐字段规则 |
| `segments.head.effects[].effect_params` | object | data/modules.json | 迁入所属模块，保留语义 | 无逐字段规则 |
| `segments.head.effects[].effect_params.blunt_pct` | number | data/modules.json | 迁入所属模块，保留语义 | 无逐字段规则 |
| `segments.head.effects[].effect_params.slash_pct` | number | data/modules.json | 迁入所属模块，保留语义 | 无逐字段规则 |
| `segments.head.effects[].effect_type` | string | data/modules.json | 迁入所属模块，保留语义 | 无逐字段规则 |
| `special` | boolean | data/modules.json | 迁入所属模块，保留语义 | 无逐字段规则 |
| `special_effect` | object | data/modules.json | 迁入所属模块，保留语义 | 无逐字段规则 |
| `special_effect.effect_params` | object | data/modules.json | 迁入所属模块，保留语义 | 无逐字段规则 |
| `special_effect.effect_params.from` | string | data/modules.json | 迁入所属模块，保留语义 | 无逐字段规则 |
| `special_effect.effect_params.to` | string | data/modules.json | 迁入所属模块，保留语义 | 无逐字段规则 |
| `special_effect.effect_type` | string | data/modules.json | 迁入所属模块，保留语义 | 无逐字段规则 |

### 附魔（类内分组 enchantment）

| 原字段路径 | 观察类型 | 来源 | 处理建议 | 当前字段规则 / 信息模块 |
|---|---|---|---|---|
| `enchant_id` |  | reviewed-instance-field | 迁入所属模块，保留语义；含实例状态 | 无逐字段规则 |
| `enchant_slot` | number | data/modules.json | 统一命名候选；逐来源保留差异，不盲合并 | 无逐字段规则 |
| `enchant_slots` | number | data/equipment.json；info-module-reference | 迁入所属模块，保留语义 | 无逐字段规则；module.equipment_armor/upgrade_potential（survival_language≥5） |
| `enchants` |  | reviewed-instance-field | 迁入所属模块，保留语义；含实例状态 | 无逐字段规则 |

## 收纳与装配（structure）

主表按此大类加载；下列分组在类内按需配置，不单独加载。

### 穿戴收纳（类内分组 storage）

| 原字段路径 | 观察类型 | 来源 | 处理建议 | 当前字段规则 / 信息模块 |
|---|---|---|---|---|
| `backpack_slots` |  | info-module-reference；runtime-contract-candidate | 迁入所属模块，保留语义 | 无逐字段规则；module.equipment_armor/capacity（survival_language≥3） |
| `backpack_weight_factor` |  | runtime-contract-candidate | 迁入所属模块，保留语义 | 无逐字段规则 |
| `pocket_slots` | number | data/equipment.json；info-module-reference | 迁入所属模块，保留语义 | 无逐字段规则；module.equipment_armor/capacity（survival_language≥3） |
| `vest_slots` | number | data/equipment.json；info-module-reference | 迁入所属模块，保留语义 | 无逐字段规则；module.equipment_armor/capacity（survival_language≥3） |

### 装配宿主（类内分组 attachment_host）

| 原字段路径 | 观察类型 | 来源 | 处理建议 | 当前字段规则 / 信息模块 |
|---|---|---|---|---|
| `module_slots` | array | data/equipment.json；info-module-reference | 迁入所属模块，保留语义 | 无逐字段规则；module.equipment_armor/armor_stats（survival_language≥4） |
| `module_slots[]` | string | data/equipment.json | 迁入所属模块，保留语义 | 无逐字段规则 |
| `modules` |  | reviewed-instance-field | 迁入所属模块，保留语义；含实例状态 | 无逐字段规则 |

### 可装配部件（类内分组 attachment_part）

| 原字段路径 | 观察类型 | 来源 | 处理建议 | 当前字段规则 / 信息模块 |
|---|---|---|---|---|
| `install_slots` | array | data/modules.json | 迁入所属模块，保留语义 | 无逐字段规则 |
| `install_slots[]` | string | data/modules.json | 迁入所属模块，保留语义 | 无逐字段规则 |
| `max_per_armor` |  | runtime-contract-candidate | 迁入所属模块，保留语义 | 无逐字段规则 |
| `occupies` | array | data/modules.json | 迁入所属模块，保留语义 | 无逐字段规则 |
| `occupies[]` | string | data/modules.json | 迁入所属模块，保留语义 | 无逐字段规则 |

### 通用组合宿主（类内分组 assembly_host）

| 原字段路径 | 观察类型 | 来源 | 处理建议 | 当前字段规则 / 信息模块 |
|---|---|---|---|---|
| `assembly_slots` | object/string | data/items.json；data/items/fishing_components_base.csv:header；data/items/fishing_components_base.csv:nonempty | 迁入所属模块，保留语义 | 无逐字段规则 |
| `assembly_slots.bait` | object | data/items.json | 迁入所属模块，保留语义 | 无逐字段规则 |
| `assembly_slots.bait.accepts` | array | data/items.json | 迁入所属模块，保留语义 | 无逐字段规则 |
| `assembly_slots.bait.accepts[]` | string | data/items.json | 迁入所属模块，保留语义 | 无逐字段规则 |
| `assembly_slots.float` | object | data/items.json | 迁入所属模块，保留语义 | 无逐字段规则 |
| `assembly_slots.float.accepts` | array | data/items.json | 迁入所属模块，保留语义 | 无逐字段规则 |
| `assembly_slots.float.accepts[]` | string | data/items.json | 迁入所属模块，保留语义 | 无逐字段规则 |
| `assembly_slots.hook` | object | data/items.json | 迁入所属模块，保留语义 | 无逐字段规则 |
| `assembly_slots.hook.accepts` | array | data/items.json | 迁入所属模块，保留语义 | 无逐字段规则 |
| `assembly_slots.hook.accepts[]` | string | data/items.json | 迁入所属模块，保留语义 | 无逐字段规则 |
| `assembly_slots.hook.required` | boolean | data/items.json | 迁入所属模块，保留语义 | 无逐字段规则 |
| `assembly_slots.leader` | object | data/items.json | 迁入所属模块，保留语义 | 无逐字段规则 |
| `assembly_slots.leader.accepts` | array | data/items.json | 迁入所属模块，保留语义 | 无逐字段规则 |
| `assembly_slots.leader.accepts[]` | string | data/items.json | 迁入所属模块，保留语义 | 无逐字段规则 |
| `assembly_slots.leader.required` | boolean | data/items.json | 迁入所属模块，保留语义 | 无逐字段规则 |
| `assembly_slots.main_line` | object | data/items.json | 迁入所属模块，保留语义 | 无逐字段规则 |
| `assembly_slots.main_line.accepts` | array | data/items.json | 迁入所属模块，保留语义 | 无逐字段规则 |
| `assembly_slots.main_line.accepts[]` | string | data/items.json | 迁入所属模块，保留语义 | 无逐字段规则 |
| `assembly_slots.main_line.required` | boolean | data/items.json | 迁入所属模块，保留语义 | 无逐字段规则 |
| `assembly_slots.sinker` | object | data/items.json | 迁入所属模块，保留语义 | 无逐字段规则 |
| `assembly_slots.sinker.accepts` | array | data/items.json | 迁入所属模块，保留语义 | 无逐字段规则 |
| `assembly_slots.sinker.accepts[]` | string | data/items.json | 迁入所属模块，保留语义 | 无逐字段规则 |
| `connections` |  | reviewed-instance-field | 迁入所属模块，保留语义；含实例状态 | 无逐字段规则 |

### 通用组合部件类型（类内分组 assembly_part）

| 原字段路径 | 观察类型 | 来源 | 处理建议 | 当前字段规则 / 信息模块 |
|---|---|---|---|---|
| `assembly_types` | array/string | data/items.json；data/items/fishing_components_base.csv:header；data/items/fishing_components_base.csv:nonempty | 迁入所属模块，保留语义 | 无逐字段规则 |
| `assembly_types[]` | string | data/items.json | 迁入所属模块，保留语义 | 无逐字段规则 |

### 真实部件连接记录（类内分组 assembly_connection）

| 原字段路径 | 观察类型 | 来源 | 处理建议 | 当前字段规则 / 信息模块 |
|---|---|---|---|---|
| `connection_schema_version` |  | reviewed-instance-field | 迁入所属模块，保留语义；含实例状态 | 无逐字段规则 |

## 能源（energy）

主表按此大类加载；下列分组在类内按需配置，不单独加载。

### 储能供电（类内分组 power）

| 原字段路径 | 观察类型 | 来源 | 处理建议 | 当前字段规则 / 信息模块 |
|---|---|---|---|---|
| `battery_capacity` | number/string | data/items.json；data/items/materials_all.csv:header；data/items/materials_all.csv:nonempty；display-rule；info-module-reference | 迁入所属模块，保留语义 | regular；number；无技能门槛≥0；module.battery/base（无模块技能门槛≥0） |
| `battery_charge` | number/string | data/items.json；data/items/materials_all.csv:header；data/items/materials_all.csv:nonempty；display-rule；info-module-reference；reviewed-instance-field | 模板初始电量与实例剩余电量分开；含实例状态 | regular；number；无技能门槛≥0；module.battery/base（无模块技能门槛≥0） |

## 活体（organism）

主表按此大类加载；下列分组在类内按需配置，不单独加载。

### 活体个体（类内分组 live_animal）

| 原字段路径 | 观察类型 | 来源 | 处理建议 | 当前字段规则 / 信息模块 |
|---|---|---|---|---|
| `hunting_juvenile` |  | reviewed-instance-field | 迁入所属模块，保留语义；含实例状态 | 无逐字段规则 |
| `hunting_juvenile.gender` |  | reviewed-instance-field | 迁入所属模块，保留语义；含实例状态 | 无逐字段规则 |
| `hunting_juvenile.perks` |  | reviewed-instance-field | 迁入所属模块，保留语义；含实例状态 | 无逐字段规则 |
| `hunting_juvenile.species` |  | reviewed-instance-field | 迁入所属模块，保留语义；含实例状态 | 无逐字段规则 |

## 迁移审计（不可加载）（migration）

仅审计保留，不是可加载模块。

### 旧轨兼容与废弃候选（类内分组 legacy）

| 原字段路径 | 观察类型 | 来源 | 处理建议 | 当前字段规则 / 信息模块 |
|---|---|---|---|---|
| `energy_restore` | string | data/items/pharmacy_base.csv:header；data/items/pharmacy_base.csv:nonempty | 隔离审计；不因归类直接删除或启用 | 无逐字段规则 |
| `nutrition_restore` | string | data/items/consumables_base.csv:header；data/items/consumables_base.csv:nonempty；data/items/pharmacy_base.csv:header；data/items/pharmacy_base.csv:nonempty | 隔离审计；不因归类直接删除或启用 | 无逐字段规则 |
| `pharmacy_legacy` |  | data/items/pharmacy_base.csv:header | 隔离审计；不因归类直接删除或启用 | 无逐字段规则 |
| `quality` | string | data/items.json；data/items/agriculture_injectables_base.csv:header；data/items/agriculture_injectables_base.csv:nonempty；data/items/compost_matrix_base.csv:header；data/items/consumables_base.csv:header；data/items/consumables_base.csv:nonempty；data/items/currency_base.csv:header；data/items/currency_base.csv:nonempty；data/items/fertilizer_anaerobic_base.csv:header；data/items/fertilizer_anaerobic_base.csv:nonempty；data/items/fishing_components_base.csv:header；data/items/fishing_components_base.csv:nonempty；data/items/materials_all.csv:header；data/items/materials_all.csv:nonempty；data/items/pharmacy_base.csv:header；data/items/pharmacy_base.csv:nonempty；data/items/product_base.csv:header；data/items/product_base.csv:nonempty；data/items/seeds_farming.csv:header；data/items/seeds_farming.csv:nonempty；data/items/soil_amendments_base.csv:header；data/items/soil_amendments_base.csv:nonempty | 隔离审计；不因归类直接删除或启用 | 无逐字段规则 |
| `satiety_restore` | string | data/items/consumables_base.csv:header；data/items/consumables_base.csv:nonempty；data/items/pharmacy_base.csv:header | 隔离审计；不因归类直接删除或启用 | 无逐字段规则 |
| `thirst_restore` | string | data/items/consumables_base.csv:header；data/items/consumables_base.csv:nonempty；data/items/pharmacy_base.csv:header；data/items/pharmacy_base.csv:nonempty | 隔离审计；不因归类直接删除或启用 | 无逐字段规则 |
| `use_effect` | object | data/items.json | 隔离审计；不因归类直接删除或启用 | 无逐字段规则 |
| `use_effect.energy` | number | data/items.json | 隔离审计；不因归类直接删除或启用 | 无逐字段规则 |
| `use_effect.nutrition` | number | data/items.json；display-rule | 隔离审计；不因归类直接删除或启用 | legacy_use_effect；hidden；无技能门槛≥0；废弃标记 |
| `use_effect.satiety` |  | display-rule | 隔离审计；不因归类直接删除或启用 | legacy_use_effect；hidden；无技能门槛≥0；废弃标记 |
| `use_effect.thirst` | number | data/items.json；display-rule | 隔离审计；不因归类直接删除或启用 | legacy_use_effect；hidden；无技能门槛≥0；废弃标记 |

### 保留设计（非已实现能力）（类内分组 reserved）

| 原字段路径 | 观察类型 | 来源 | 处理建议 | 当前字段规则 / 信息模块 |
|---|---|---|---|---|
| `_special_reserved` | string | data/equipment.json | 隔离审计；不因归类直接删除或启用 | 无逐字段规则 |
| `numeric_rolls` |  | design-26-not-runtime-confirmed | 隔离审计；不因归类直接删除或启用 | 无逐字段规则 |
| `resolved_rolls` |  | design-26-not-runtime-confirmed | 隔离审计；不因归类直接删除或启用 | 无逐字段规则 |

## 静态信息模块

这些说明没有字段引用，也必须保留文案与认知条件；不能仅按字段数量迁移。完整内容在配套 JSON 的 static_info_modules。

- module.material_ore/base：基础识别，无模块技能门槛≥0
- module.material_ore/physical：物理性质，survival_gathering≥3
- module.material_ore/trade_hint：交易线索，survival_language≥4
- module.battery/lore：来历传闻，survival_language≥3
- module.food_basic/base：食物印象，无模块技能门槛≥0
- module.food_basic/flavor：风味层次，life_cooking≥2
- module.food_basic/digest：消化评估，survival_language≥3
- module.pharmacy_medicine/risk：风险提示，无模块技能门槛≥0
