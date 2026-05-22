# item-field-display-rules 审计运行记录

- **日期**：2026-05-11  
- **命令**：`npm run audit:item-keys`、`npm run audit:item-field-rules`  
- **仓库**：SextingReborn2.0  

## audit:item-keys

```
[audit-item-template-keys] data/items.json template key count: 37
accept_code, base_value, category, compost_inoculant_aerobic, compost_inoculant_anaerobic, convert_to_high, cooking_ingredient, desc_0, edible, edible_buff_id, fert_c, fert_n, fn, fn_before, food_buff_duration_ticks, fuel_points, info_module_set_id, item_id, name, name_0, placeholder_name, price_class, production_lines, quality, region_restrict, skill_coef, sn, source, spoilage_ticks, stack_limit, sub_category, tags, usable_regions, volatility, water_points, weapon_attack_power, weight_kg

[audit-item-template-keys] data/equipment.json template key count: 18
damage_reduce_blunt_pct, damage_reduce_pierce_pct, damage_reduce_slash_pct, desc_0, desc_1, desc_2, display_skill_id, enchant_slots, equip_slot, id, name_0, name_1, name_2, pocket_slots, quality_tier, skill_coef, vest_slots, weight_kg

[audit-item-template-keys] union (items ∪ equipment) key count: 51
accept_code, base_value, category, compost_inoculant_aerobic, compost_inoculant_anaerobic, convert_to_high, cooking_ingredient, damage_reduce_blunt_pct, damage_reduce_pierce_pct, damage_reduce_slash_pct, desc_0, desc_1, desc_2, display_skill_id, edible, edible_buff_id, enchant_slots, equip_slot, fert_c, fert_n, fn, fn_before, food_buff_duration_ticks, fuel_points, id, info_module_set_id, item_id, name, name_0, name_1, name_2, placeholder_name, pocket_slots, price_class, production_lines, quality, quality_tier, region_restrict, skill_coef, sn, source, spoilage_ticks, stack_limit, sub_category, tags, usable_regions, vest_slots, volatility, water_points, weapon_attack_power, weight_kg

[audit-item-template-keys] no use_effect objects found in items.json (no subkeys to list).
```

## audit:item-field-rules

### 1) 模板字段路径并集

- items：37 个不同字段；equipment：18 个；并集 51 个（与 `audit:item-keys` 一致，本脚本不额外展开 `use_effect.*` 除非 JSON 中存在该对象）。

### 2) 规则表有、模板从未出现

- `pharmacy_ingredient`（规则已配置，当前 `items.json` 无该键——待 CSV 填 `pharmacy_ingredient` 并构建后会出现）
- `use_effect.nutrition` / `use_effect.satiety` / `use_effect.thirst`（deprecated 占位；当前无 `use_effect` 数据）

### 3) 模板有、规则表未覆盖（28 个）

`accept_code`, `base_value`, `category`, `convert_to_high`, `damage_reduce_blunt_pct`, `damage_reduce_pierce_pct`, `damage_reduce_slash_pct`, `display_skill_id`, `enchant_slots`, `equip_slot`, `id`, `info_module_set_id`, `item_id`, `pocket_slots`, `price_class`, `production_lines`, `quality`, `quality_tier`, `region_restrict`, `skill_coef`, `source`, `stack_limit`, `sub_category`, `tags`, `usable_regions`, `vest_slots`, `volatility`, `weapon_attack_power`

（与 `27-item-template-fields-inventory.md` §8.2「默认隐藏」块一致，属预期缺口，供后续补规则。）

### 4) CSV 旧轨列

- `consumables_base.csv`：表头含 `satiety_restore` / `thirst_restore` / `nutrition_restore`；**会生成 `use_effect` 分量的行数：0**（空或全 0）。
- 其余合并 CSV：无上述三列。

### 5) items.json `use_effect`

- 带非空 `use_effect` 的模板数：**0**。

### 6) 规则表字段级 `deprecated`

- `use_effect.nutrition`, `use_effect.satiety`, `use_effect.thirst`。

---

*下文为终端原文备份（便于 diff）。*

```
> audit:item-field-rules
> node tools/audit-item-field-display-rules.mjs

========================================================================
1) 模板字段路径（扁平 + use_effect.*）
========================================================================
items.json 不同字段数: 37
equipment.json 不同字段数: 18
并集 items ∪ equipment 字段数: 51

并集字段列表（字典序）：
accept_code, base_value, category, compost_inoculant_aerobic, compost_inoculant_anaerobic, convert_to_high, cooking_ingredient, damage_reduce_blunt_pct, damage_reduce_pierce_pct, damage_reduce_slash_pct, desc_0, desc_1, desc_2, display_skill_id, edible, edible_buff_id, enchant_slots, equip_slot, fert_c, fert_n, fn, fn_before, food_buff_duration_ticks, fuel_points, id, info_module_set_id, item_id, name, name_0, name_1, name_2, placeholder_name, pocket_slots, price_class, production_lines, quality, quality_tier, region_restrict, skill_coef, sn, source, spoilage_ticks, stack_limit, sub_category, tags, usable_regions, vest_slots, volatility, water_points, weapon_attack_power, weight_kg

========================================================================
2) 规则表有定义、但当前 items/equipment 模板从未出现的字段
========================================================================
  - pharmacy_ingredient
  - use_effect.nutrition
  - use_effect.satiety
  - use_effect.thirst

========================================================================
3) 当前模板出现、但 item-field-display-rules.json 未覆盖的字段
========================================================================
  数量: 28
  - accept_code
  - base_value
  - category
  - convert_to_high
  - damage_reduce_blunt_pct
  - damage_reduce_pierce_pct
  - damage_reduce_slash_pct
  - display_skill_id
  - enchant_slots
  - equip_slot
  - id
  - info_module_set_id
  - item_id
  - pocket_slots
  - price_class
  - production_lines
  - quality
  - quality_tier
  - region_restrict
  - skill_coef
  - source
  - stack_limit
  - sub_category
  - tags
  - usable_regions
  - vest_slots
  - volatility
  - weapon_attack_power

========================================================================
4) 废弃口径：CSV 旧轨列 + JSON use_effect
========================================================================
说明：satiety_restore / thirst_restore / nutrition_restore 为旧轨，构建后写入 use_effect.*；
      新展示分块以 edible + edible_buff_id 为主轨；use_effect 即时恢复不进新分块（见设计 §8.4）。

文件: consumables_base.csv
  表头含列: satiety_restore, thirst_restore, nutrition_restore
  含「非空且非零数值」或「非数值非空」的行数（会生成 use_effect 分量）: 0
文件: materials_all.csv
  表头：无 satiety_restore/thirst_restore/nutrition_restore 列
文件: product_base.csv
  表头：无 satiety_restore/thirst_restore/nutrition_restore 列
文件: currency_base.csv
  表头：无 satiety_restore/thirst_restore/nutrition_restore 列
文件: compost_matrix_base.csv
  表头：无 satiety_restore/thirst_restore/nutrition_restore 列

========================================================================
5) items.json 中带非空 use_effect 的模板数量
========================================================================
  计数: 0

========================================================================
6) 规则表中 deprecated 标记（字段级）
========================================================================
  - use_effect.nutrition
  - use_effect.satiety
  - use_effect.thirst

[audit-item-field-display-rules] 完成。
```
