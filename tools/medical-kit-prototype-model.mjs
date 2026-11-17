// Disposable, memory-only UI model. See NOTES for explicitly provisional demo values.
export const PARTS = {head:'头部',chest:'胸部',belly:'腹部',lhand:'左手臂',rhand:'右手臂',lfoot:'左腿',rfoot:'右腿'};
export const INJURIES = {bleeding:'普通出血',heavy_bleeding:'大出血',fracture:'骨折',wound_infection:'伤口感染'};
export const AFFIXES = {
  universal:{name:'通用止血',label:'止血带兼治普通出血'},
  fixed:{name:'固定包扎',label:'固定骨折时一并止普通出血'},
  dressing:{name:'临时敷护',label:'纱布可恢复损毁'}
};
export const MATERIALS = {textile_cotton_cloth:'棉布',textile_hemp_cloth:'麻布',material_nylon_stock:'尼龙料',material_steel_wire:'钢丝料'};
export const MODS = {
  none:{name:'基础急救包',label:'基础包体',weight:0},
  expand:{name:'扩容急救包',label:'五类储量 +50%',weight:.1,ticks:4,cost:{textile_cotton_cloth:2,material_nylon_stock:1}},
  meter:{name:'定量急救包',label:'四类伤势耗材 −20%',weight:.05,ticks:4,cost:{textile_cotton_cloth:1,material_nylon_stock:1,material_steel_wire:1}},
  quick:{name:'快取急救包',label:'战斗中可用 · 全储量 −50%',weight:.05,ticks:3,cost:{textile_hemp_cloth:1,material_nylon_stock:1}},
  linked:{name:'联动急救包',label:'清除伤势后接敷料 · 共1刻',weight:.05,ticks:4,cost:{textile_cotton_cloth:2,material_nylon_stock:1}}
};
const limbs=['lhand','rhand','lfoot','rfoot'];
const round=n=>Math.round(n*1e8)/1e8;
export function initialState(draft) {
  const quickCapacityMultiplier=draft.quick_capacity_balance.capacity_multiplier;
  const template=draft.templates.tool_medical_kit_basic;
  const reserves=structuredClone(template.attribute_modules.structure.medical_storage.reserves);
  const treatments=structuredClone(template.attribute_modules.equipment.medical_kit.kit_treatments);
  const alcohol=reserves.medical_alcohol;
  alcohol.unit='tenth_ml';alcohol.capacity*=10;alcohol.basic_refill_amount*=10;alcohol.display_divisor=10;
  for(const part of Object.keys(treatments.medical_alcohol.cost_by_body_part))treatments.medical_alcohol.cost_by_body_part[part]*=10;
  reserves.surgical_staples={name:'缝合钉',capacity:70,basic_refill_amount:35,display_divisor:1,display_unit:'枚',portion_weight_g:3.5};
  const kits=Array.from({length:9},(_,i)=>({id:'kit-'+String(i+1).padStart(2,'0'),number:String(i+1).padStart(2,'0'),name:MODS.none.name,affixes:[],mod:'none',dressingWeight:0,remaining:Object.fromEntries(Object.keys(reserves).map(k=>[k,0]))}));
  for(const [i,mod,affixes] of [[1,'meter',['universal']],[2,'expand',['dressing']],[3,'quick',[]],[4,'linked',['fixed']],[5,'none',['universal']],[6,'none',['fixed']],[7,'none',['dressing']]]){
    Object.assign(kits[i],{mod,name:MODS[mod].name,affixes});
    if(i<5){Object.assign(kits[i].remaining,{trauma_dressing:100,hemostatic_gauze:375,tourniquet:150,fracture_band:mod==='quick'?450*quickCapacityMultiplier:450,medical_alcohol:150,surgical_staples:35});kits[i].dressingWeight=mod==='expand'?50:mod==='quick'?75/quickCapacityMultiplier:75;}
  }
  return {
    base:{reserves,treatments,weight:template.weight_kg,quickCapacityMultiplier},tick:0,stamina:100,surgeryLevel:0,home:true,atHomeManufacturingWorkbench:false,inCombat:false,
    kits,selectedKitId:kits[0].id,equippedKitId:kits[0].id,operation:null,
    supplies:Object.fromEntries(Object.keys(reserves).map(k=>[k,6])),materials:Object.fromEntries(Object.keys(MATERIALS).map(k=>[k,8])),
    warehouse:Object.fromEntries(Object.keys(reserves).map(k=>[k,6])),
    body:{head:{max:50,damage:15,injuries:[]},chest:{max:100,damage:55,injuries:['bleeding']},belly:{max:80,damage:50,injuries:['wound_infection']},lhand:{max:100,damage:100,injuries:['heavy_bleeding']},rhand:{max:100,damage:65,injuries:[]},lfoot:{max:100,damage:100,injuries:['fracture','bleeding']},rfoot:{max:100,damage:100,injuries:[]}},
    selectedPart:'lhand',selectedSupply:'surgical_staples',mode:'normal'
  };
}
export function activeKit(s){return s.kits.find(k=>k.id===(s.atHomeManufacturingWorkbench?s.selectedKitId:s.equippedKitId))||null;}
export function profile(s,kit=activeKit(s),affixes=kit.affixes,mod=kit.mod){
  const caps=Object.fromEntries(Object.entries(s.base.reserves).map(([k,r])=>[k,r.capacity*(mod==='expand'?1.5:mod==='quick'?s.base.quickCapacityMultiplier:1)]));
  const ownWeight=s.base.weight+MODS[mod].weight;
  const knownContents=kit.dressingWeight/1000+Object.entries(kit.remaining).reduce((sum,[k,n])=>sum+(['trauma_dressing','surgical_staples'].includes(k)?0:n/s.base.reserves[k].basic_refill_amount*s.base.reserves[k].portion_weight_g/1000),0);
  return {caps,reduction:mod==='meter'?20:0,ownWeight,weight:ownWeight+knownContents+kit.remaining.surgical_staples*.0001,provisionalStaples:false};
}
export function refillStock(s,key){const carried=s.supplies[key]||0,warehouse=s.home?(s.warehouse?.[key]||0):0;return {carried,warehouse,total:carried+warehouse};}
export function refillAllPlan(s){
  if(!activeKit(s)||s.operation||s.inCombat)return {reason:s.operation?'手术中':s.inCombat?'战斗中不能补充':'未装备',portions:0,ticks:0};
  const p=profile(s),kit=activeKit(s);let portions=0;
  for(const [k,r]of Object.entries(s.base.reserves)){const per=k==='trauma_dressing'?p.caps[k]/3:r.basic_refill_amount;portions+=Math.min(Math.ceil((p.caps[k]-kit.remaining[k])/per),refillStock(s,k).total);}
  return {reason:portions?'':'没有可补充的用品',portions,ticks:portions};
}
export function refillPlan(s,key){
  const kit=activeKit(s),r=s.base.reserves[key];
  if(!kit||!r)return {reason:'用品不可用'};
  if(s.operation)return {reason:'手术中'};
  if(s.inCombat)return {reason:'战斗中不能补充'};
  const p=profile(s);
  if(kit.remaining[key]>=p.caps[key])return {reason:'已满'};
  if(!refillStock(s,key).total)return {reason:'库存不足'};
  // Sixth-reserve loading timing/overflow follow the other rows only for this UI demo.
  const per=key==='trauma_dressing'?p.caps[key]/3:r.basic_refill_amount,gain=Math.min(per,p.caps[key]-kit.remaining[key]);
  return {reason:'',count:1,gain,next:kit.remaining[key]+gain,weightGain:key==='trauma_dressing'?75*gain/per:0,ticks:1};
}
export function therapyPlan(s){
  const kit=activeKit(s),part=s.body[s.selectedPart],key=s.selectedSupply,surgery=key==='surgical_staples';
  const result={reason:'',costs:{},recovery:0,clears:[],ticks:surgery?6:1,stamina:surgery?10:0,surgery,afterMax:part.max,afterDamage:part.damage};
  const reject=reason=>({...result,reason});
  if(s.atHomeManufacturingWorkbench)return reject('请在日常界面治疗');
  if(!kit||kit.id!==s.equippedKitId)return reject('未装备');
  if(s.operation)return reject('手术进行中');
  if(s.inCombat&&kit.mod!=='quick')return reject('仅限非战斗状态');
  if(s.mode==='linked'&&kit.mod!=='linked')return reject('需要联动急救包');
  const p=profile(s),need=Math.max(0,part.damage-Math.ceil(part.max*.3));
  if(surgery){
    if(!limbs.includes(s.selectedPart))return reject('手术仅限四肢');
    if(part.damage<part.max)return reject('部位尚未满损毁');
    const cost=(s.selectedPart.includes('hand')?10:15)*(kit.mod==='meter'?.8:1);
    result.costs.surgical_staples=cost;
    result.afterMax=Math.max(1,Math.floor(part.max*(100+Math.max(0,Math.min(100,s.surgeryLevel)))/200));
    result.afterDamage=result.afterMax-1;
    if(s.mode==='linked'){
      result.recovery=Math.min(result.afterDamage-Math.ceil(result.afterMax*.3),kit.remaining.trauma_dressing);
      if(result.recovery<=0)return reject('无法接敷料');
      result.costs.trauma_dressing=result.recovery;result.afterDamage-=result.recovery;
    }
    if(kit.remaining.surgical_staples<cost)return reject('缝合钉不足');
    if(s.stamina<10)return reject('体力不足');
    return result;
  }
  const t=s.base.treatments[key];
  if(!t||!t.allowed_body_parts.includes(s.selectedPart))return reject('部位不适用');
  const temporary=key==='hemostatic_gauze'&&kit.affixes.includes('dressing')&&!part.injuries.length;
  if(key==='trauma_dressing'||temporary){
    if(s.mode==='linked')return reject('请选择伤势用品');
    if(part.damage>=part.max)return reject('满损毁需先手术');
    if(part.injuries.length)return reject('存在伤势');
    if(!need)return reject('已至治疗下限');
    const per=temporary?5:1;
    result.recovery=Math.min(need,Math.floor(kit.remaining[key]/per));
    if(!result.recovery)return reject('储量不足');
    result.costs[key]=result.recovery*per;
  }else{
    let injury=t.injury_type;
    if(key==='tourniquet'&&kit.affixes.includes('universal')&&part.injuries.includes('bleeding'))injury='bleeding';
    if(!part.injuries.includes(injury))return reject('无对应伤势');
    const cost=t.cost_by_body_part[s.selectedPart]*(100-p.reduction)/100;
    if(kit.remaining[key]<cost)return reject('储量不足');
    result.costs[key]=cost;result.clears=[injury];
    if(key==='fracture_band'&&kit.affixes.includes('fixed')&&part.injuries.includes('bleeding'))result.clears.push('bleeding');
    if(s.mode==='linked'){
      if(part.injuries.some(x=>!result.clears.includes(x)))return reject('尚有其他伤势');
      if(part.damage>=part.max)return reject('满损毁需先手术');
      if(!need)return reject('无需恢复损毁');
      result.recovery=Math.min(need,kit.remaining.trauma_dressing);
      if(!result.recovery)return reject('敷料不足');
      result.costs.trauma_dressing=result.recovery;
    }
  }
  result.afterDamage=part.damage-result.recovery;
  return result;
}
export function modificationPlan(s,mod){
  if(!s.home||!s.atHomeManufacturingWorkbench)return {reason:'需在家中制造台'};
  if(s.operation||s.inCombat)return {reason:'当前无法改造'};
  const kit=activeKit(s),recipe=MODS[mod];
  if(!kit)return {reason:'急救包不可用'};
  if(kit.mod!=='none')return {reason:'已改造 · 不可再次改造'};
  if(!recipe?.cost)return {reason:'请选择改造包体'};
  if(Object.entries(kit.remaining).some(([k,v])=>v>profile(s,kit,kit.affixes,mod).caps[k]))return {reason:'储量超出上限'};
  if(Object.entries(recipe.cost).some(([k,n])=>s.materials[k]<n))return {reason:'材料不足'};
  return {reason:'',...recipe};
}
function spend(kit,costs){
  for(const [k,n] of Object.entries(costs)){
    if(k==='trauma_dressing')kit.dressingWeight=round(kit.dressingWeight*(1-n/kit.remaining[k]));
    kit.remaining[k]=round(kit.remaining[k]-n);
  }
}
function worldTick(s){
  s.tick++;
  // Explicit demo fixture, NOT the future injury Buff's damage/interval configuration.
  for(const key of limbs){const b=s.body[key];if(b.injuries.some(i=>['bleeding','heavy_bleeding'].includes(i)))b.damage=Math.min(b.max,b.damage+1);}
}
export function act(state,action,value,expectedKitId=activeKit(state)?.id){
  const s=structuredClone(state),ok=(notice='')=>({state:s,notice}),no=notice=>({state,notice});
  if(action==='cancel'){
    if(!s.operation)return no('没有进行中的手术');
    s.operation=null;return ok('手术已取消');
  }
  if(action==='combat'){
    s.inCombat=Boolean(value);
    if(s.operation&&s.inCombat&&s.kits.find(k=>k.id===s.operation.kitId)?.mod!=='quick'){s.operation=null;return ok('进入战斗，手术中断');}
    return ok();
  }
  if(action==='advanceSurgery'){
    const op=s.operation;if(!op)return no('没有进行中的手术');
    const kit=s.kits.find(k=>k.id===op.kitId);
    if(!kit||s.equippedKitId!==op.kitId||(s.inCombat&&kit.mod!=='quick')){s.operation=null;return ok('手术中断');}
    worldTick(s);op.elapsed++;
    if(op.elapsed<op.ticks)return ok();
    const b=s.body[op.part];b.max=op.afterMax;b.damage=op.afterMax-1;
    // Provisional linked demo: a new injury suppresses only the optional dressing stage.
    if(op.costs.trauma_dressing&&!b.injuries.length){const n=Math.min(op.costs.trauma_dressing,kit.remaining.trauma_dressing,Math.max(0,b.damage-Math.ceil(b.max*.3)));if(n){spend(kit,{trauma_dressing:n});b.damage-=n;}}
    s.operation=null;return ok('手术完成');
  }
  if(s.operation)return no('请先完成或取消手术');
  if(action==='selectKit'){
    if(!s.home||!s.atHomeManufacturingWorkbench)return no('需在家中制造台');
    if(!s.kits.some(k=>k.id===value))return no('急救包不可用');
    s.selectedKitId=value;s.mode='normal';return ok();
  }
  const kit=activeKit(s);
  if(['refill','refillAll','heal','modify','equip'].includes(action)&&(!kit||kit.id!==expectedKitId))return no('急救包已变更');
  if(action==='part'){if(!PARTS[value])return no('部位无效');s.selectedPart=value;s.mode='normal';return ok();}
  if(action==='supply'){if(!s.base.reserves[value])return no('用品无效');const reason=therapyPlan({...s,selectedSupply:value,mode:'normal'}).reason;if(reason)return no(reason);s.selectedSupply=value;s.mode='normal';return ok();}
  if(action==='mode'){if(!['normal','linked'].includes(value)||value==='linked'&&kit?.mod!=='linked')return no('方式不可用');s.mode=value;return ok();}
  if(action==='equip'){
    if(!s.home||!s.atHomeManufacturingWorkbench)return no('需在家中制造台');
    s.equippedKitId=s.equippedKitId===kit.id?null:kit.id;s.mode='normal';worldTick(s);return ok();
  }
  if(action==='refill'){
    const p=refillPlan(s,value);if(p.reason)return no(p.reason);
    if(refillStock(s,value).warehouse)s.warehouse[value]--;else s.supplies[value]--;
    kit.remaining[value]=p.next;kit.dressingWeight=round(kit.dressingWeight+p.weightGain);worldTick(s);return ok();
  }
  if(action==='refillAll'){
    const all=refillAllPlan(s);if(all.reason)return no(all.reason);let filled=0;
    for(const k of Object.keys(s.base.reserves)){let p;while(filled<all.portions&&!(p=refillPlan(s,k)).reason){if(refillStock(s,k).warehouse)s.warehouse[k]--;else s.supplies[k]--;kit.remaining[k]=p.next;kit.dressingWeight=round(kit.dressingWeight+p.weightGain);worldTick(s);filled++;}}
    return ok('已补充'+filled+'份 · '+filled+'刻');
  }
  if(action==='heal'){
    const p=therapyPlan(s);if(p.reason)return no(p.reason);
    if(p.surgery){spend(kit,{surgical_staples:p.costs.surgical_staples});s.stamina-=10;s.operation={...p,kitId:kit.id,part:s.selectedPart,elapsed:0};return ok();}
    spend(kit,p.costs);const b=s.body[s.selectedPart];b.damage=p.afterDamage;b.injuries=b.injuries.filter(i=>!p.clears.includes(i));worldTick(s);return ok();
  }
  if(action==='modify'){
    const p=modificationPlan(s,value);if(p.reason)return no(p.reason);
    for(const [k,n] of Object.entries(p.cost))s.materials[k]-=n;
    for(let i=0;i<p.ticks;i++)worldTick(s);
    kit.mod=value;kit.name=p.name;s.mode='normal';return ok('已改为'+p.name);
  }
  return no('操作无效');
}

