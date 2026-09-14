export function applyFoodCatalog(items, catalog) {
 for (const [id, f] of Object.entries(catalog.foods)) {
  const x = items[id];
  if (!x) throw Error('Food catalog references missing item ' + id);
  x.edible = true;
  x.food_profile = f;
  x.meal_tier = f.meal_tier;
  x.satiety_total = f.satiety_total;
  x.digestion_ticks = f.digestion_ticks;
  x.food_buff_duration_ticks = f.digestion_ticks;
  x.slots_taken = f.slots_taken;
  x.meal_composition = ['staple','meat','veg','other'][f.composition.indexOf(Math.max(...f.composition))];
  x.workhorse = f.workhorse;
  x.info_module_set_id = 'module.food_calibrated';
  x.food_composition_text = f.composition.map((v,i)=>v>0 ? ['主食','蛋白类','蔬果','其他'][i] + ' ' + Math.round(v * 100) + '%' : '').filter(Boolean).join(' / ');
  const names = {jingu:'筋骨',flexibility:'柔韧',breath:'呼吸',dexterity:'身手',focus:'专注'};
  x.food_experience_text = Object.entries(f.attribute_exp).filter(([,v])=>v>0).map(([k,v])=>names[k]+' '+v).join(' / ') || '无属性经验';
  const special = f.special;
  x.food_special_text = ['stamina','energy','mood'].filter(k=>special[k]>0).map(k=>({stamina:'体力',energy:'精力',mood:'心情'})[k]+' +'+Number((special[k]*special.duration_ticks).toFixed(2))).concat(special.speed>1 ? ['出手速度 +'+Math.round((special.speed-1)*100)+'%'] : []).join(' / ') || '无额外增益';
  x.food_special_ticks = special.duration_ticks;
  x.food_thirst_instant = f.thirst_instant;
  // All food restores are profile-owned; legacy buff/use_effect must not also grant them.
  delete x.use_effect;
 }
 for (const id of Object.keys(catalog.exclusions)) {
  if (!items[id]) throw Error('Food exclusion references missing item ' + id);
  items[id].edible = false;
  items[id].cooking_ingredient = true;
 }
}
