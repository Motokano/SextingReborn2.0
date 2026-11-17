// Production templates; design drafts and demonstration inventories are never loaded by the game.
export function applyMedicalKits(items, data) {
  if (data.version !== 1) throw Error('Unsupported medical kit catalogue');
  for (const [kind, body] of Object.entries(data.bodies)) {
    const caps = Object.fromEntries(Object.entries(data.reserves).map(([key, reserve]) => [key, reserve.capacity * body.capacity_multiplier]));
    if (Object.values(caps).some(n => !Number.isInteger(n) || n <= 0)) throw Error('Invalid medical capacity');
    items[body.item_id] = {
      item_id: body.item_id, name: body.name, name_0: body.name, placeholder_name: '医疗包',
      fn_before: '收纳医疗用品的装备。', fn: '补充医疗用品后，可处理选定部位的伤势。',
      category: 'tool', sub_category: 'medical_kit', tags: 'medical_kit;equipment',
      weight_kg: body.weight_kg, stack_limit: 1, pocketable: false, equip_slot: 'medical_kit',
      base_value: body.base_value, price_class: 'life_good', volatility: 'low', region_restrict: 0,
      spoilage_ticks: 0, edible: false, usable: false, medical_kit_body: kind, medical_capacities: caps
    };
  }
  const s = data.stapler;
  items[s.item_id] = {...s, name_0:s.name, category:'supply',sub_category:'surgical_staples',
    tags:'consumable;medical_refill',stack_limit:1,pocketable:true,spoilage_ticks:0,edible:false,usable:false,
    price_class:'life_good',volatility:'low',region_restrict:0,
    fn:'补充35枚缝合钉至急救包。',fn_before:'装有缝合钉的器械。',placeholder_name:'皮肤缝合器'};
}
