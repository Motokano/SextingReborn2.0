/* Default category resolution. No item names or rarity values are inferred here. */
(function(root,factory){const art=typeof module==='object'&&module.exports?require('./icons.js'):root.ItemIconArt;const api=factory(art);if(typeof module==='object'&&module.exports)module.exports=api;else root.ItemIcons=api;})(typeof globalThis!=='undefined'?globalThis:this,function(art){
  'use strict';
  const subcategories={
    'book/skill_textbook':'paper',
    'supply/tourniquet':'bandage','supply/hemostatic_gauze':'bandage','supply/trauma_dressing':'bandage','supply/fracture_band':'bandage','supply/medical_alcohol':'reagent','supply/surgical_staples':'medical_kit','tool/medical_kit':'medical_kit',
    'supply/bandage':'bandage','supply/fire_start':'firestarter','supply/rope':'rope','supply/torch':'torch',
    'material/pharm_adjuvant':'powder','material/pharm_powder':'powder','material/battery':'battery','material/chemical':'reagent','material/compost_waste':'scrap','material/compost_matrix':'fertilizer','material/fertilizer_liquid':'fertilizer','material/meat_product':'meat','material/electronic':'circuit','material/flux':'powder','material/industrial':'metal','material/fuel':'oil','material/feed':'feed','material/scrap':'scrap','material/ware':'ceramic','material/leather':'leather','material/oil':'oil','material/paper':'paper','material/plant':'herb','material/soil_amendment':'soil','material/solvent':'water','material/supply':'crate','material/fish':'fish','material/forging_feed':'ingot','material/precision':'precision_core',
    'fish/shellfish':'shellfish','fish/fish':'fish','fish/sea_product':'seaweed','fish/seafood':'seafood',
    'hunt/fish':'fish','hunt/seafood':'seafood','hunt/bone':'bone','hunt/plume':'feather','hunt/horn':'horn','hunt/meat':'meat','hunt/collagen':'offal','hunt/venom':'reagent','hunt/offal':'offal','hunt/hide':'leather','hunt/fat':'fat','hunt/dairy':'milk','hunt/meat_product':'meat','hunt/egg':'egg',
    'food/biscuit':'food','food/cooking_fail':'scrap','food/drink':'drink','food/dairy':'milk','food/stew':'soup','food/soup':'soup','food/dried':'meat','food/bread':'bread','food/tea':'drink','food/herb_raw':'herb','food/berry':'fruit',
    'herb/root':'root','herb/nut':'nut','herb/fruit':'fruit','herb/seed':'seed','herb/veg':'vegetable','herb/spice':'spice','herb/flower':'flower','herb/leaf':'herb','herb/fruit_product':'fruit','herb/antler':'horn','herb/vine':'herb','herb/fungus':'mushroom','herb/grain':'grain','herb/seafood_product':'seaweed','herb/mushroom':'mushroom','herb/poison':'herb','herb/sugar':'salt','herb/resin':'resin',
    'ore/gem':'gem','ore/stone':'stone','ore/clay':'clay','ore/water':'water','ore/salt':'salt','ore/scrap':'scrap','ore/spirit':'gem','ore/sulfur':'powder',
    'textile/fiber':'fiber','textile/cocoon_domestic':'cocoon','textile/cocoon_wild':'cocoon',
    'potion/drink':'medicine','potion/topical':'salve','potion/inject':'syringe','potion/inhale':'incense',
    'tool/fishing_float':'float','tool/fishing_hook':'hook','tool/fishing_leader':'line','tool/fishing_main_line':'line','tool/fishing_lure':'bait','tool/fishing_reel':'reel','tool/fishing_rod':'rod','tool/fishing_sinker':'sinker','tool/container':'bucket','tool/pharmacy':'medical_kit','tool/pharm_kit':'medical_kit','tool/cookware':'pot','tool/logging':'axe','tool/mining':'pickaxe','tool/sewing':'sewing_kit','tool/repair_kit':'toolroll','tool/repair':'toolroll',
    'weapon/dagger':'dagger','weapon/machete':'sword','weapon/spear':'spear','weapon/single_hand':'sword',
    'weapon_component/blade':'blade','weapon_component/blunt_side':'weapon_head','weapon_component/hilt':'hilt','weapon_component/multi_position':'weapon_head','weapon_component/front':'point',
    'wood/wood':'wood','wood/bamboo':'bamboo','wood/softwood':'wood','wood/wood_product':'wood','wood/spice':'spice','wood/charcoal':'charcoal','wood/fruit':'fruit',
    'armor/bamboo':'armor','armor/cloth':'clothing','armor/silk_under':'clothing'
  };
  const categories={material:'crate',armor:'armor',consumable:'toolroll',currency:'currency',fish:'fish',hunt:'meat',tool:'toolroll',bait:'bait',food:'meal',ore:'ore',herb:'herb',textile:'cloth',animal:'animal',potion:'medicine',seed:'seed',supply:'crate',weapon:'sword',wood:'wood',equipment:'clothing',weapon_component:'weapon_head',attachment:'armor'};
  // Stable item-id families disambiguate older broad subcategories; never inspect display names.
  const families=[
    ['^potion_.*_pill(?:_|$)','pills'],['^potion_.*_powder(?:_|$)','powder'],
    ['^consumable_hunting_bait$','feed'],['^consumable_hunting_blood_kit$','medical_kit'],['^consumable_hunting_skin_kit$','toolroll'],['^consumable_hunting_net$','net'],['^consumable_hunting_snare$','rope'],['^consumable_javelin_','spear'],
    ['^fishing_bait_','bait'],['^fishing_float_','float'],['^fishing_hook_','hook'],['^fishing_(?:leader|line)_','line'],['^fishing_sinker_','sinker'],['^fishing_lure_','bait'],['^fishing_reel_','reel'],['^fishing_rod_','rod'],
    ['^fish_(?:mussel|scallop|snail)','shellfish'],['^fish_(?:shrimp|crab|cuttlefish|octopus|squid)','seafood'],['^fish_(?:fish_maw|head)$','fish'],['^fish_bone$','bone'],['^hus_.*_bone$','bone'],
    ['^hus_(?:duck_fat_pure|pork_lard)$','fat'],['^cook_salo$','fat'],['^ore_cast_iron$','ingot'],['^item_glass$','glass'],['^item_porcelain$','ceramic'],['^electronic_wire$','wire'],['^metal_pipe$','pipe'],
    ['^textile_.*_fiber$','fiber'],['^textile_.*_cloth$','cloth'],['^filling_','fiber'],['^leather_','leather'],['^sewing_part_','cloth'],['^sewing_outfit_','clothing'],
    ['^sewing_tape_measure$','measure'],['^sewing_body_scale$','scale'],['^sewing_mannequin$','mannequin'],['^sewing_workbench$','workbench'],['^sewing_soaking_bucket$','bucket'],
    ['^tool_flask_','flask'],['^tool_distiller_','distiller'],['^tool_garlic_press_','press'],['^tool_layer_filter_','filter'],['^tool_long_handle_flask_','medicine'],['^tool_.*(?:jar|pickling)_','jar'],['^tool_mortar_','mortar'],['^tool_(?:roller|rolling_pin)_','roller'],['^tool_steel_basin_','pot'],['^tool_strainer_pot_','filter'],['^tool_syringe_','syringe'],['^tool_iv_set_','medical_kit'],
    ['^tool_repair_hammer$','hammer'],['^tool_repair_pliers$','pliers'],['^tool_repair_whetstone$','whetstone'],
    ['^mod_face_goggles$','goggles'],['^mod_face_lamp$','lamp'],['^mod_face_plume$','feather'],['^mod_helm_','helmet'],['^mod_hooded_coat$','clothing'],['^mod_','armor']
  ];
  const compiled=families.map(([pattern,icon])=>({pattern,re:new RegExp(pattern),icon}));
  const slots={clothing:'clothing',vest:'clothing',backpack:'crate',head:'helmet',glove_left:'glove',glove_right:'glove',shoe_left:'boot',shoe_right:'boot',hand_left:'sword',hand_right:'sword'};
  let registered=Object.create(null);
  const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
  function detail(input){
    let item=input||{};
    if(typeof item==='string')item=own(registered,item)?registered[item]:{item_id:item};
    if(!item.category&&item.item_id&&own(registered,item.item_id))item={...registered[item.item_id],...item};
    const explicit=item.icon_key||item.icon;
    if(art.has(explicit))return {key:explicit,via:'explicit'};
    if(art.has(item.icon_category))return {key:item.icon_category,via:'icon_category'};
    const am=item.attribute_modules||{},slot=item.equip_slot||am.equipment?.wearable?.equip_slot;
    if(own(slots,slot))return {key:slots[slot],via:'equip_slot:'+slot};
    const id=String(item.item_id||item.id||'');
    const family=compiled.find(rule=>rule.re.test(id));
    if(family)return {key:family.icon,via:'id_family:'+family.pattern};
    const sub=item.category+'/'+item.sub_category;
    if(own(subcategories,sub))return {key:subcategories[sub],via:'subcategory:'+sub};
    if(own(categories,item.category))return {key:categories[item.category],via:'category:'+item.category};
    if(am.structure?.attachment||item.install_slots)return {key:'armor',via:'attachment'};
    return {key:'generic',via:'fallback'};
  }
  function registerCatalog(catalog){const entries=catalog.items||catalog;for(const [id,item] of Object.entries(entries))registered[id]={item_id:id,...item};}
  return {version:'1.0',art,detail,resolve:item=>detail(item).key,forItem:item=>art.svg(detail(item).key),svg:art.svg,has:art.has,registerCatalog,rules:{categories,subcategories,families,slots,fallback:'generic'}};
});
