/** Apply the confirmed pharmacy catalogue plan to the editable CSV/recipe sources. */
import fs from 'node:fs';

const csvPath = 'data/items/pharmacy_base.csv';
const recipePath = 'data/pharmacy-recipes.json';
const plan = JSON.parse(fs.readFileSync('docs/design/47-pharmacy-full-recipe-plan.json', 'utf8'));
const addictionPlan = JSON.parse(fs.readFileSync('docs/design/47-pharmacy-addiction-values.json', 'utf8'));

function parseCsv(text) {
  const rows=[]; let row=[], cell='', quoted=false;
  for (let i=0;i<text.length;i++) { const c=text[i], n=text[i+1];
    if (quoted) { if(c==='"'&&n==='"'){cell+='"';i++;} else if(c==='"')quoted=false; else cell+=c; }
    else if(c==='"')quoted=true; else if(c===','){row.push(cell);cell='';}
    else if(c==='\n'){row.push(cell.replace(/\r$/,''));rows.push(row);row=[];cell='';} else cell+=c;
  }
  if(cell||row.length){row.push(cell);rows.push(row);} return rows;
}
const quote=v=>{const s=String(v??'');return /[",\r\n]/.test(s)?'"'+s.replaceAll('"','""')+'"':s;};
const rows=parseCsv(fs.readFileSync(csvPath,'utf8').replace(/^\uFEFF/,''));
const headers=rows[0];
for (const h of ['pharmacy_active_components','pharmacy_addiction_gain','pharmacy_relief_stages','pharmacy_oral_toxicity','pharmacy_extra_toxicity_decay']) if(!headers.includes(h)) headers.push(h);
const objects=rows.slice(1).filter(r=>r.some(Boolean)).map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]??''])));
const byId=new Map(objects.map(o=>[o.id,o]));
for(const [id,o] of [...byId.entries()])if(o.pharmacy_legacy==='1')byId.delete(id);
const clone=(base,id,sn,fn)=>({...Object.fromEntries(headers.map(h=>[h,''])),...byId.get(base),id,sn,name:'',placeholder_name:sn,fn});
const set=(o,k,v)=>{o[k]=v==null?'':String(v);return o;};

const basePill=byId.get('potion_analgesic_pill');
Object.assign(basePill,{sn:'苦根镇痛丸',placeholder_name:'苦根丸',stack_limit:'3',spoilage_ticks:'7200',satiety_restore:'',food_buff_duration_ticks:'',pharmacy_active_components:'med_root_bitter_powder:1',pharmacy_addiction_gain:'0.25',pharmacy_relief_stages:'2',pharmacy_oral_toxicity:'2.4'});

const products=[
  ['potion_strength_pill','续力丸','med_antler_powder:1','buff_pharm_strength_pill','2'],
  ['potion_antistun_pill','醒神丸','med_acorus_powder:1','buff_pharm_antistun_pill','3'],
  ['potion_energy_pill','续航丸','med_glucose_powder:1','buff_pharm_energy_pill','3'],
  ['potion_calm_pill','安神丸','med_thc_powder:1','buff_pharm_sedative_pill','3'],
  ['potion_vision_pill','幻梦丸','med_psilocybin_powder:1','buff_pharm_hallucinogen_pill','2'],
  ['potion_analgesic_pill_regular','舒行丸','med_root_bitter_powder:2','buff_pharm_analgesic_drink_regular','3'],
  ['potion_analgesic_pill_potent','止痛丸','med_morphine_powder:1','buff_pharm_analgesic_drink_potent','2'],
  ['potion_analgesic_pill_purified','定痛丸','med_morphine_powder_purified:1','buff_pharm_analgesic_drink_pure','2'],
  ['potion_detox_pill','清毒丸','med_liver_herb_powder:2','buff_pharm_detox_pill','2']
];
for(const [id,sn,components,buff,stack] of products){
  const o=clone('potion_analgesic_pill',id,sn,sn+'，制药台压制成形。');
  Object.assign(o,{stack_limit:stack,spoilage_ticks:'7200',use_buff_id:buff,use_action:'drink',pharm_family:id.includes('analgesic')?'analgesic':id.includes('strength')?'strength':id.includes('antistun')?'antistun':id.includes('energy')?'energy':id.includes('calm')?'sedative':id.includes('vision')?'hallucinogen':'detox',satiety_restore:'',thirst_restore:'',nutrition_restore:'',energy_restore:'',food_buff_duration_ticks:'',pharmacy_active_components:components,pharmacy_addiction_gain:'0',pharmacy_relief_stages:'0',pharmacy_oral_toxicity:'0'});
  const spec=plan.new_products.find(x=>x.id===id);
  if(spec?.addiction_draft){o.pharmacy_addiction_gain=String(spec.addiction_draft.oral_gain);o.pharmacy_relief_stages=String(spec.addiction_draft.relief_stages);}
  if(spec?.oral_toxicity_gain!=null)o.pharmacy_oral_toxicity=String(spec.oral_toxicity_gain);
  if(spec?.extra_toxicity_decay_per_tick!=null)o.pharmacy_extra_toxicity_decay=String(spec.extra_toxicity_decay_per_tick);
  byId.set(id,o);
}
for(const [id,name,effect,tox,conc] of [['med_antler_powder_refined','精制鹿茸粉',90,0,20],['med_antler_powder_purified','精炼鹿茸粉',113,0,15]]){
  const o=clone('med_antler_powder',id,name,name+'，更省配药浓度。');Object.assign(o,{pharm_effect:String(effect),pharm_toxicity:String(tox),concentration_cost:String(conc),spoilage_ticks:'7200'});byId.set(id,o);
}
for(const [id, profile] of Object.entries(addictionPlan.components)){
  const o=byId.get(id); if(!o)continue;
  o.pharmacy_addiction_gain=String(profile.oral_gain||0);
  o.pharmacy_relief_stages=String(profile.relief_stages||0);
}
for(const row of plan.medicine_stack_review.items){if(byId.has(row.id))byId.get(row.id).stack_limit=String(row.proposed_stack_limit);}
for(const o of byId.values())if(o.id.startsWith('potion_')&&o.pharmacy_legacy!=='1')o.spoilage_ticks='7200';

const doc=JSON.parse(fs.readFileSync(recipePath,'utf8'));
const recipes=new Map(doc.recipes.map(r=>[r.recipe_id,r]));
for(const change of plan.changes){const r=recipes.get(change.recipe_id);if(r){r.inputs=change.inputs;r.recommended_skill_level=change.required_level??0;r.cost_override=change.proposed_cost??r.cost_override;}}
for(const add of plan.additions){
  if(add.recipe_id.includes('cardiac_from_'))continue;
  const rid=add.recipe_id.replace('proposal.pharmacy.','life_pharmacy.');
  recipes.set(rid,{recipe_id:rid,method_id:add.method_id,inputs:add.inputs,main_output:add.main_output,recommended_skill_level:add.required_level??0,...(add.proposed_cost?{cost_override:add.proposed_cost}:{})});
}
const heldConsumerGapRecipes=new Set([
  'life_pharmacy.macerate_cardiac_powder',
  'life_pharmacy.crush_baiji_powder','life_pharmacy.crush_notoginseng_powder',
  'life_pharmacy.refine_notoginseng','life_pharmacy.purify_notoginseng',
  'life_pharmacy.blend_coagulant_powder','life_pharmacy.blend_coagulant_salve'
]);
for(const [id,recipe] of recipes)recipe.enabled=!heldConsumerGapRecipes.has(id);
doc.recipes=[...recipes.values()];
fs.writeFileSync(recipePath,JSON.stringify(doc,null,2)+'\n');

// 固定成品的依赖、缓解和口服毒性只从实际成品配方中的活性投入推导，避免与配方双写失配。
for(const recipe of doc.recipes){
  const outputId=recipe.main_output?.[0], outputCount=Math.max(1,Number(recipe.main_output?.[1])||1);
  const product=byId.get(outputId); if(!product||!product.use_buff_id)continue;
  const route=String(product.use_action||'').toLowerCase();
  const active=[]; let oralBase=0, relief=0, positiveToxicity=0;
  for(const [inputId, rawCount] of recipe.inputs||[]){
    const count=Math.max(0,Number(rawCount)||0), input=byId.get(inputId), profile=addictionPlan.components[inputId]||(route==='inhale'?addictionPlan.raw_carrier_exposure?.[inputId]:null);
    if(input?.sub_category==='pharm_powder')active.push(inputId+':'+count);
    if(profile){oralBase+=(Number(profile.oral_gain)||0)*count;relief=Math.max(relief,Number(profile.relief_stages)||0);}
    if(input?.sub_category==='pharm_powder')positiveToxicity+=Math.max(0,Number(input.pharm_toxicity)||0)*count;
  }
  const gain=oralBase*(Number(addictionPlan.route_multipliers[route])||0)/outputCount;
  product.pharmacy_active_components=active.join(';');
  product.pharmacy_addiction_gain=String(Math.round(gain*10000)/10000);
  product.pharmacy_relief_stages=String(gain>0?relief:0);
  product.pharmacy_oral_toxicity=String(route==='drink'?Math.round(positiveToxicity*.2/outputCount*10000)/10000:0);
}
// 四档镇痛与清毒是逐项定稿值，覆盖通用推导中的精炼剂量近似。
Object.assign(byId.get('potion_analgesic_pill'),{pharmacy_addiction_gain:'0.25',pharmacy_relief_stages:'2',pharmacy_oral_toxicity:'2.4'});
Object.assign(byId.get('potion_analgesic_pill_regular'),{pharmacy_addiction_gain:'0.5',pharmacy_relief_stages:'2',pharmacy_oral_toxicity:'4.8'});
Object.assign(byId.get('potion_analgesic_pill_potent'),{pharmacy_addiction_gain:'4',pharmacy_relief_stages:'3',pharmacy_oral_toxicity:'13'});
Object.assign(byId.get('potion_analgesic_pill_purified'),{pharmacy_addiction_gain:'6.0235',pharmacy_relief_stages:'3',pharmacy_oral_toxicity:'5.2'});
Object.assign(byId.get('potion_detox_pill'),{pharmacy_addiction_gain:'0',pharmacy_relief_stages:'0',pharmacy_oral_toxicity:'0'});
fs.writeFileSync(csvPath,headers.map(quote).join(',')+'\n'+[...byId.values()].map(o=>headers.map(h=>quote(o[h])).join(',')).join('\n')+'\n');
console.log(JSON.stringify({items:byId.size,recipes:doc.recipes.length,addedProducts:11,heldCardiac:3}));
