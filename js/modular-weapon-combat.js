/* Single-hand combat. Physical instances own durability and pending effects;
 * positions own attack/guard order. Dry runs capture results before either side commits. */
(function (g) {
 'use strict';
 const ROOT='weapon_single_hand_assembly', SKILL='__weapon_component_moves__';
 const order=['front','side1','side2','hilt'], guards=['side1','side2','hilt'];
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)), copy=v=>JSON.parse(JSON.stringify(v));
 const tick=()=>Number(g.GameTime?.getState().totalTicks??g.Survival?.getState().tickCount)||0;
 const bindings=()=>g.ForgingConfig?.components||{};
 const selectors=new Map();
 const rangeModifiers=new Map();
 let transaction=null;
 const moveRows=[
  ['front_thrust','直刺','pierce',.9,[10,50,30,5,5,0,0],'刺击'],
  ['front_bump','顶击','blunt',.8,[0,50,30,10,10,0,0],'顶击'],
  ['side_cleave','劈砍','slash',1.1,[25,35,0,20,20,0,0],'劈砍'],
  ['side_swing','横击','blunt',.9,[0,20,0,25,25,15,15],'挥击'],
  ['side_peck','啄刺','pierce',1,[20,20,10,25,25,0,0],'刺击'],
  ['hilt_strike','柄击','blunt',.7,[20,40,20,10,10,0,0],'柄击'],
  ['hilt_thrust','尾刺','pierce',.9,[0,20,60,10,10,0,0],'刺击']
 ];
 const moves=moveRows.map(([id,name,type,power,weights,tag])=>({
  id:'weapon_basic_'+id,name,damage_type:type,move_power_multiplier:power,
  required_limb_tags:[tag],action_tags:[tag],hit_segments:1,attack_range:1,
  default_power_level:10,power_level_min:1,power_level_max:12,stun_head_hit:35,
  hit_part_weights:Object.fromEntries(['head','chest','abdomen','left_arm','right_arm','left_leg','right_leg'].map((k,i)=>[k,weights[i]])),
  ...(id==='front_bump'?{on_parry_failed_displace_target:{cells:1}}:{})
 }));
 const skill={id:SKILL,name:'部件招式',category:'weapon',primary_attribute:'jingu',component_only:true,max_level:0,moves};
 function isWeapon(item){return item?.item_id===ROOT;}
 function equipped(){
  const eq=g.InventoryEquipment?.getState().equipment||{};
  for(const slot of ['weapon_left','weapon_right'])if(isWeapon(eq[slot]))return {item:eq[slot],slot,limbId:slot==='weapon_left'?'lhand':'rhand'};
  return null;
 }
 function runtime(item){
  let s=item.weapon_combat;
  if(!s||s.version!==1)s=item.weapon_combat={version:1,mode:'weapon',attackCursor:0,guardCursor:0,pending:[],frontCharge:{}};
  s.pending=(s.pending||[]).filter(p=>p.expires==null||p.expires>tick());
  s.frontCharge=s.frontCharge||{};
  if(!Array.isArray(s.attackOrder)||s.attackOrder.length!==4||new Set(s.attackOrder).size!==4||s.attackOrder.some(k=>!order.includes(k)))s.attackOrder=order.slice();
  return s;
 }
 function validateEquip(item,slot){
  if(!isWeapon(item))return {success:false,message:'不是可持用的武器。'};
  if(!['weapon_left','weapon_right'].includes(slot))return {success:false,message:'请选择持械手。'};
  const c=g.ForgingRules.coverage(item),eq=g.InventoryEquipment.getState().equipment;
  if(eq[slot]&&g.ForgingSystem?.isInstanceLocked(eq[slot].instance_id))return {success:false,message:'这只手上的武器正在维修。'};
  if(!c.complete)return {success:false,message:'四个攻击位置都装好部件后才能使用。'};
  if(eq[slot==='weapon_left'?'weapon_right':'weapon_left'])return {success:false,message:'当前原型只能单手持一把武器。'};
  if(g.CharacterAttributes?.canUseWeapon&&!g.CharacterAttributes.canUseWeapon(c.strength))return {success:false,message:'先天筋骨不足，无法挥动这把武器。'};
  return {success:true};
 }
 function reset(item){
  if(!isWeapon(item))return;
  delete item.weapon_combat;
  const c=g.ForgingRules.coverage(item);item.weapon_moves={};
  for(const pos of order)if(c.positions[pos])item.weapon_moves[pos]={move_id:c.positions[pos].position.fallbackMoveId,variants:[]};
  runtime(item);
 }
 function active(allowInactive){
  const e=equipped();if(!e)return null;
  const s=runtime(e.item),c=g.ForgingRules.coverage(e.item);
  const destroyed=!!g.CharacterAttributes?.isBodyPartDestroyedForParry?.(e.limbId==='lhand'?'left_arm':'right_arm');
  if(destroyed){if(s.mode==='weapon')s.mode='forced_unarmed';return null;}
  if(s.mode==='forced_unarmed'){s.mode='weapon';onEnter(e.item,c);}
  if((!allowInactive&&s.mode!=='weapon')||!c.complete)return null;
  if(g.CharacterAttributes?.canUseWeapon&&!g.CharacterAttributes.canUseWeapon(c.strength))return null;
  return {...e,coverage:c,state:s};
 }
 function putPending(item,key,data){
  const s=runtime(item);s.pending=s.pending.filter(p=>p.key!==key);s.pending.push({key,...data});
 }
 function onEnter(item,c){
  for(const part of c.parts){const b=bindings()[part.item_id];if(b.designId==='H07'&&part.forged_component.durability_current>0)
   putPending(item,'hilt_entry',{source:part.instance_id,kind:'entry',damage:.1});}
 }
 function setMode(mode){
  const e=equipped();if(!e||!['weapon','unarmed'].includes(mode))return false;
  const s=runtime(e.item),old=s.mode;s.mode=mode;
  if(old!=='weapon'&&mode==='weapon')onEnter(e.item,g.ForgingRules.coverage(e.item));
  return true;
 }
 function onEquip(item){g.CombatMetaSkills?.weaponChanged(item.instance_id);reset(item);onEnter(item,g.ForgingRules.coverage(item));}
 function clearTransient(item){if(isWeapon(item)){g.CombatMetaSkills?.weaponChanged(item.instance_id);const s=runtime(item);s.pending=[];s.frontCharge={};}}
 function endCombat(){const e=equipped();if(e){const s=runtime(e.item);s.pending=[];s.frontCharge={};}}
 function zeroProfile(part,slot){
  const f=part.forged_component,b=bindings()[part.item_id],out={power:1,block:1,unload:1,speed:0,blockDisabled:false,effectsDisabled:false};
  if(f.durability_current>0)return out;
  const n=Number(f.zero_durability_result?.index)||0,type=b.positions.find(p=>p.slot===slot||p.slot==='side')?.damageType;
  if(b.group==='H'){out.blockDisabled=true;out.effectsDisabled=true;out.speed=b.designId==='H01'?-b.baseline.speedPercent:0;return out;}
  if(n===1){out.speed=-3;return out;}
  const id=b.designId.split('-')[0];
  const bluntSide=()=>{if(n===0)out.power=.8;else out.block=out.unload=.75;};
  const bladeSide=()=>{out.power=n===0?.75:.9;if(n===2)out.block=out.unload=.8;};
  if(b.group==='B')bladeSide();
  else if(b.group==='D')bluntSide();
  else if(b.group==='T')out.power=type==='pierce'?(n===0?.75:.5):(n===0?.8:.6);
  else if(id==='M01')bluntSide();
  else if(id==='M02')bladeSide();
  else if(slot==='front'){
   if(id==='M07')out.power=n===0?.8:.6;
   else if(id==='M08')out.power=n===0?.75:.5;
   else out.power=n===0?1:.5;
  }else if(type==='blunt')bluntSide();
  else if(type==='slash')bladeSide();
  else {out.power=n===0?.75:.5;if(n===2)out.block=out.unload=.8;}
  return out;
 }
 function position(a,slot){
  const p=a.coverage.positions[slot];if(!p)return null;
  const f=p.item.forged_component,z=zeroProfile(p.item,slot);
  const final=f.final_position_powers.find(x=>x.slot===slot||x.slot==='side');
  return {...p,slot,definition:bindings()[p.item.item_id],zero:z,power:(final?.power||0)*z.power,
   blockCoefficient:p.position.blockCoefficient*z.block,deflectionCoefficient:p.position.deflectionCoefficient*z.unload,
   blockEligible:p.position.blockEligible&&!z.blockDisabled,trait:copy(f.ore_trait),durability:f.durability_current,maxDurability:f.durability_max};
 }
 function traitValue(p,names){return p?.trait&&names.includes(p.trait.stat)?Number(p.trait.value)||0:0;}
 function speedPercent(){
  const a=active();if(!a)return 0;
  return a.coverage.parts.reduce((sum,part)=>{const b=bindings()[part.item_id],p={trait:part.forged_component.ore_trait};
   return sum+b.baseline.speedPercent+zeroProfile(part,'side1').speed+traitValue(p,['weapon_speed_percentage_points'])-100*traitValue(p,['weapon_additive_speed_penalty_once_per_component']);},0);
 }
 function intent(){
  const a=active();if(!a)return null;
  return intentAt(a.state.attackOrder[clamp(Math.floor(a.state.attackCursor)||0,0,3)]);
 }
 function configuredMove(a,slot){
  const p=a.coverage.positions[slot];if(!p)return null;
  const cfg=a.item.weapon_moves?.[slot],CS=g.CombatSkills,I=g.InventoryEquipment;
  const sk=CS.getSkill(cfg?.skill_id),move=sk?.category==='weapon'&&!sk.component_only&&I.getSkillLevel(sk.id)>0
   ?CS.getUnlockedMoves(sk.id,I.getSkillLevel(sk.id)).find(m=>m.id===cfg.move_id&&m.damage_type===p.position.damageType):null;
  if(move)return {skillId:sk.id,move};
  return {skillId:SKILL,move:moves.find(m=>m.id===p.position.fallbackMoveId)};
 }
 function intentAt(slot,allowInactive){
  const a=active(allowInactive);if(!a)return null;
  return configuredIntentAt(slot,a);
 }
 function configuredIntentAt(slot,a){
  if(!a){const e=equipped();if(!e)return null;a={...e,coverage:g.ForgingRules.coverage(e.item),state:runtime(e.item)};}
  const c=configuredMove(a,slot);if(!c)return null;
  return {skillId:c.skillId,moveId:c.move.id,limbId:a.limbId,advanceCursor:false,weaponPosition:slot,weaponId:a.item.instance_id,powerLevel:powerLevel(a.item,slot)};
 }
 function validIntent(i,allowInactive){const current=intentAt(i.weaponPosition,allowInactive||i.allowInactiveWeapon);return !!(current&&current.weaponId===i.weaponId&&current.skillId===i.skillId&&current.moveId===i.moveId);}
 function setMoveConfig(slot,cfg){
  const a=active(true);if(!a||!a.coverage.positions[slot]||!cfg)return false;
  const old=a.item.weapon_moves?.[slot],CS=g.CombatSkills,I=g.InventoryEquipment;
  const p=a.coverage.positions[slot],fallback=p.position.fallbackMoveId;
  let next={skill_id:cfg.skill_id,move_id:cfg.move_id,variants:Array.isArray(cfg.variants)?cfg.variants.slice():[],power_level:clamp(Number(cfg.power_level)||10,1,12)};
  if(next.move_id===fallback){if(next.variants.length)return false;next.skill_id=SKILL;}
  else {
   const sk=CS.getSkill(next.skill_id),lv=I.getSkillLevel(next.skill_id);
   const move=sk?.category==='weapon'&&!sk.component_only&&lv>0?CS.getUnlockedMoves(sk.id,lv).find(m=>m.id===next.move_id&&m.damage_type===p.position.damageType):null;
   if(!move||next.variants.length>Math.max(0,CS.getMaxSlotsForLevel(sk.id,lv)-1)||new Set(next.variants).size!==next.variants.length)return false;
   for(const id of next.variants){if(!id)continue;const v=g.CombatVariants.getVariant(id);
    if(!v||!['active_moves','both'].includes(v.assist_scope||'active_moves')||!g.CombatVariants.isVariantUnlocked(v,{getSkillLevel:I.getSkillLevel,getMoveUsage:id=>I.getSkillsState()[id]?.move_usage||{},CombatSkills:CS})
     ||!g.CombatVariants.allowsMove(v,{moveId:move.id,moveTags:move.action_tags||move.required_limb_tags||[],damageType:move.damage_type}))return false;
   }
  }
  if(JSON.stringify(old)===JSON.stringify(next))return false;
  const before=g.CombatMetaSkills?.configSignature();a.item.weapon_moves=a.item.weapon_moves||{};a.item.weapon_moves[slot]=next;g.CombatMetaSkills?.configChanged(before);return true;
 }
 function prepareAttack(i,repeatIndex){
  registerBuffs();
  if(!validIntent(i))return null;
  const a=active(i.allowInactiveWeapon),p=position(a,i.weaponPosition),b=p.definition,s=a.state,n=repeatIndex||0;
  let damage=0,hit=0;const consumed=[];
  for(const pending of s.pending){
   const eligible=(pending.kind==='entry')||(pending.kind==='nonhilt'&&p.slot!=='hilt')||(pending.kind==='position'&&pending.target===p.slot)||((pending.kind==='ore_hit'||pending.kind==='ore_damage')&&pending.source===p.item.instance_id)||(pending.kind==='front'&&p.slot==='front'&&pending.source===p.item.instance_id);
   if(eligible){damage+=pending.damage||0;hit+=pending.hit||0;consumed.push(pending.key);}
  }
  for(const part of a.coverage.parts){const h=bindings()[part.item_id];if(h.group!=='H'||part.forged_component.durability_current<=0)continue;
   if(h.designId==='H10'&&p.position.damageType==='blunt')damage+=.08;
   if(h.designId==='H13'&&p.position.damageType==='pierce')damage+=.08;
   if(h.designId==='H16'&&n>0)damage+=.08;
  }
  for(const e of b.componentEffects||[]){if(e.name==='重击'&&n===0||e.name==='追打'&&n>0)damage+=e.strengthPercent/100;}
  damage-=traitValue(p,['component_damage_reduction']);
  if(p.position.damageType==='blunt')damage+=traitValue(p,['blunt_damage_bonus']);
  if(p.durability>.75*p.maxDurability)damage+=traitValue(p,['damage_bonus_above_75_percent_durability']);
  if(p.durability>0&&p.durability<=.25*p.maxDurability)damage+=traitValue(p,['damage_bonus_at_positive_durability_at_most_25_percent']);
  hit+=traitValue(p,['attack_hit_percentage_points'])/100-traitValue(p,['component_hit_chance_penalty']);
  if(p.position.damageType==='pierce')hit+=traitValue(p,['pierce_hit_chance_bonus']);
  const threshold=g.CharacterAttributes?.getWeaponThresholdAndBonus?.(a.coverage.strength);
  return {root:a.item,part:p.item,position:p,slot:p.slot,repeatIndex:n,consumed,damageBonus:damage,hitBonus:hit,
   power:p.power*(threshold?.M_threshold??1),move:copy(configuredMove(a,i.weaponPosition).move),limbId:a.limbId,advanceCycle:i.advanceWeaponCursor!==false,
   contact:contactLoss(p,false),blockedContact:contactLoss(p,true),committed:false};
 }
 function selectGuard(ctx){
  const a=active();if(!a)return null;
  const s=a.state,candidates=guards.filter(k=>position(a,k)?.blockEligible);
  if(!candidates.length)return null;
  const cursor=transaction?.guardCursor?.[a.item.instance_id]??s.guardCursor;
  const sorted=guards.map((_,i)=>guards[(cursor+i)%guards.length]).filter(k=>candidates.includes(k));
  let best=-Infinity,preferred=[];
  for(const [id,fn] of selectors){const proposal=fn({candidates:sorted.slice(),hitPart:ctx.hitPart,weapon:a.item,defaultPosition:sorted[0]});if(!proposal||!candidates.includes(proposal.position))continue;
   const priority=Number(proposal.priority)||0;if(priority>best){best=priority;preferred=[];}if(priority===best)preferred.push(proposal.position);}
  const chosen=sorted.find(k=>preferred.includes(k))||sorted[0],p=position(a,chosen),next=(guards.indexOf(chosen)+1)%guards.length;
  if(transaction)transaction.guardCursor[a.item.instance_id]=next;
  else s.guardCursor=next;
  return {root:a.item,position:p,nextCursor:next,loss:contactLoss(p,true,true),committed:false};
 }
 function guardBonus(guard){const p=guard.position;return {
  chance:traitValue(p,['block_chance_bonus_when_selected_as_defender'])-traitValue(p,['block_chance_penalty_when_component_is_selected']),
  unload:traitValue(p,['unload_percentage_points'])/100};}
 function targetDefense(a){const p=a?.position;if(!p)return {chance:0,unload:0};return {
  chance:['slash','pierce'].includes(p.position.damageType)?traitValue(p,['target_parry_percentage_points'])/100-traitValue(p,['target_block_chance_reduction_for_slash_or_pierce']):0,
  unload:p.position.damageType==='blunt'?traitValue(p,['target_unload_percentage_points'])/100-traitValue(p,['target_unloading_reduction_for_unblocked_blunt_segment']):0};}
 function blockedAttackBonus(ctx){
  const a=ctx.weaponAction||ctx.resourceResult?.weaponAction;
  if(!a||!ctx.parrySucceeded)return;
  const bonus=(a.position.definition.componentEffects||[]).filter(e=>e.name==='破架').reduce((n,e)=>n+e.strengthPercent/100,0);
  if(!bonus)return;
  const old=ctx.outgoingMultiplier||1,ratio=(old+bonus)/old;
  ctx.blockedWeaponDamageBonus=bonus;ctx.rawDamage*=ratio;
  if(ctx.typedDamage)ctx.typedDamage=g.CombatDamage.scale(ctx.typedDamage,ratio);
  // Successful parry still nullifies the segment, including this conditional bonus.
 }
 function contactLoss(p,blocked,defending){
  let factor=1-traitValue(p,['all_contact_loss_reduction_fraction','all_contact_durability_loss_reduction'])+traitValue(p,['component_contact_durability_loss_increase']);
  if(defending)factor-=traitValue(p,['defending_parry_loss_reduction_fraction']);
  else factor-=traitValue(p,['attack_contact_loss_reduction_fraction']);
  if(p.durability>0&&p.durability<=p.maxDurability*.25)factor-=traitValue(p,['low_durability_contact_loss_reduction_fraction']);
  const base=blocked?2:1,value=p.item.forged_component.contact_loss[blocked?'blocked':'ordinary'];
  return Math.round(Math.max(base*.5,value*factor)*100);
 }
 function wear(part,units){
  const f=part.forged_component,b=bindings()[part.item_id];
  f.durability_units=Math.max(0,Math.round(f.durability_current*100)-units);f.durability_current=f.durability_units/100;
  if(f.durability_units===0&&!f.zero_durability_result){
   const index=b.group==='H'?0:Math.floor(Math.random()*3);
   const names=b.group==='H'?['柄件损坏']:b.group==='B'?['卷刃','弯曲','崩刃']:b.group==='T'?(b.positions[0].damageType==='pierce'?['钝尖','弯曲','断尖']:['压塌','弯曲','崩缺']):['压损','弯曲','崩损'];
   f.zero_durability_result={index,name:names[index],tick:tick()};
  }
 }
 function getInstances(owner){return g.BuffSystem?.getState?.().instancesByOwner?.[owner]||[];}
 function applyStatus(owner,id,name,type,value,duration,onset){
  const bs=g.BuffSystem;if(!bs)return;
  const shock=id==='buff_weapon_shock';
  if(shock)id+='_'+(tick()%2);
  if(id==='buff_ore_guard_pressure'||shock){
   const old=getInstances(owner).find(b=>b.buff_id===id&&b.expires_at_tick>tick());
   if(old&&Math.abs(old.template.effects[0].params.delta_per_stack??old.template.effects[0].params.delta_percent)>Math.abs(value))return;
  }
  registerBuffs();
  bs.applyBuff(owner,id,SKILL,{tick:tick()});
  const inst=getInstances(owner).find(x=>x.buff_id===id);
  if(inst){if(shock)inst.started_tick=tick();inst.weapon_effect_value=value;inst.template=copy(inst.template);inst.template.effects[0].params={delta_per_stack:value,delta_percent:value};}
 }
 function unloadBonus(owner){return getInstances(owner).reduce((sum,b)=>sum+(b.expires_at_tick>tick()? (b.template?.effects||[]).filter(e=>e.type==='weapon_unload_delta_percent').reduce((n,e)=>n+e.params.delta_per_stack*b.stacks/100,0):0),0);}
 function registerBuffs(){
  // Saved instances retain their template, but these IDs also need lookup entries on reload.
  const bs=g.BuffSystem;if(!bs)return;
  for(const [id,name,type,value,duration,onset] of [
   ['buff_weapon_basic_aim','定准','hit_chance_delta_percent',5,3],
   ['buff_weapon_basic_guard_shaken','震架','weapon_unload_delta_percent',-5,4],
   ['buff_weapon_basic_hampered','掣肘','hit_chance_delta_percent',-5,4],
   ['buff_weapon_basic_recover_guard','收势','weapon_unload_delta_percent',5,3],
   ['buff_ore_guard_pressure','压架','parry_chance_delta_percent',-3,4],
   // BuffSystem retains an instance through its expiry tick: onset 1 / duration 1
   // therefore affects exactly the following tick, never the tick after that.
   ['buff_weapon_shock_0','震荡','battle_move_speed_delta_percent',-5,1,1],
   ['buff_weapon_shock_1','震荡','battle_move_speed_delta_percent',-5,1,1]]){
   if(!bs.getBuffTemplate?.(id))bs.registerRuntimeBuffTemplate({buff_id:id,name,desc:name,dispel_pool:value<0?'non_beneficial':'beneficial',durationTicks:duration,onsetTicks:onset||0,maxStacks:1,stacksAddOnApply:1,triggerTags:['weapon_status_manual'],consumeLayersFixed:0,effects:[{type,params:{delta_per_stack:value,delta_percent:value}}]});
  }
 }
 function afterAttack(ctx,a){
  const root=a.root,s=runtime(root),p=a.position,b=p.definition,segments=ctx.segmentsResults||[ctx];
  s.pending=s.pending.filter(x=>!a.consumed.includes(x.key));
  for(const key of a.consumed)if(key.startsWith('front:'))s.frontCharge[key.slice(6)]=[];
  if(a.repeatIndex===0&&a.advanceCycle!==false)s.attackCursor=(s.attackOrder.indexOf(a.slot)+1)%order.length;
  const allowed=!ctx.blockTargetEffects&&!ctx.forceZeroDamageByResourceInsufficient;
  if(!allowed)return;
  const target=g.CombatEnemies?.ownerOf?g.CombatEnemies.ownerOf(ctx.defender):ctx.defender?.kind==='enemy'?String(ctx.defender.enemyId):'player';
  const hit=segments.some(x=>x.hitRollSuccess),damaged=segments.some(x=>x.hitRollSuccess&&x.finalDamage>0);
  const buff=(id)=>g.BuffSystem?.applyBuff(target,id,SKILL,{tick:tick()});
  const id=a.move.id;
  if(id==='weapon_basic_front_thrust')applyStatus('player','buff_weapon_basic_aim','定锋','hit_chance_delta_percent',5,3);
  if(id==='weapon_basic_hilt_thrust')applyStatus('player','buff_weapon_basic_recover_guard','回护','weapon_unload_delta_percent',5,3);
  if(id==='weapon_basic_side_cleave'&&segments.some(x=>x.hitRollSuccess&&x.parrySucceeded))applyStatus(target,'buff_weapon_basic_guard_shaken','架势松动','weapon_unload_delta_percent',-5,4);
  if(id==='weapon_basic_side_swing'&&hit)buff('buff_bruised');
  if(id==='weapon_basic_hilt_strike'&&hit)buff('buff_off_balance');
  if(id==='weapon_basic_side_peck'&&segments.some(x=>x.hitRollSuccess&&x.finalDamage>0&&['left_arm','right_arm'].includes(x.hitPart)))applyStatus(target,'buff_weapon_basic_hampered','手臂受制','hit_chance_delta_percent',-5,4);
  for(const e of b.componentEffects||[]){
   if(e.name==='接力')putPending(root,'relay:'+p.item.instance_id,{source:p.item.instance_id,kind:'position',target:a.slot==='side1'?'side2':'side1',damage:e.strengthPercent/100});
   if(e.name==='震荡'&&hit)applyStatus(target,'buff_weapon_shock','震荡','battle_move_speed_delta_percent',-e.strengthPercent,1,1);
  }
  if(b.group==='H'&&p.durability>0&&b.designId==='H04')putPending(root,'hilt_follow',{source:p.item.instance_id,kind:'nonhilt',damage:.08});
  if(b.group==='M'){
   const key=b.designId.split('-')[0],source=p.item.instance_id;
   if(['M01','M02'].includes(key)&&a.slot!=='front')putPending(root,'multi:'+source,{source,kind:'position',target:a.slot==='side1'?'side2':'side1',damage:.06});
   if(['M03','M04','M06'].includes(key)&&a.slot===(key==='M06'?'side2':'side1'))putPending(root,'multi:'+source,{source,kind:'position',target:key==='M06'?'side1':'side2',damage:.08});
   if(['M05','M07','M08'].includes(key)&&a.slot!=='front'&&!s.pending.some(x=>x.key==='front:'+source)){
    const charge=s.frontCharge[source]||[];if(!charge.includes(a.slot))charge.push(a.slot);s.frontCharge[source]=charge;
    if(charge.includes('side1')&&charge.includes('side2'))putPending(root,'front:'+source,{source,kind:'front',damage:.1});
   }
  }
  if(!hit){const amount=traitValue(p,['next_attack_hit_percentage_points'])/100+traitValue(p,['next_actual_move_hit_bonus_after_all_segments_miss']);
   if(amount)putPending(root,'ore_hit:'+p.item.instance_id,{source:p.item.instance_id,kind:'ore_hit',hit:amount,expires:tick()+8});}
  if(damaged){const amount=traitValue(p,['target_parry_debuff_percentage_points']);if(amount)applyStatus(target,'buff_ore_guard_pressure','压架','parry_chance_delta_percent',amount,4);}
 }
 function afterGuard(guard,success){
  const p=guard.position;runtime(guard.root).guardCursor=guard.nextCursor;
  if(!success)return;
  for(const e of p.definition.componentEffects||[])if(e.name==='回击')putPending(guard.root,'riposte:'+p.item.instance_id,{source:p.item.instance_id,kind:'position',target:p.slot,damage:e.strengthPercent/100});
  const damage=traitValue(p,['next_attack_damage_bonus_fraction','next_actual_move_damage_bonus_after_own_successful_block']);
  if(damage)putPending(guard.root,'ore_damage:'+p.item.instance_id,{source:p.item.instance_id,kind:'ore_damage',damage,expires:tick()+4});
 }
 function finish(ctx){
  if(ctx._segmentOfAction)return;
  const a=ctx.weaponAction||ctx.resourceResult?.weaponAction;
  const segments=ctx.segmentsResults||[ctx];
  if(ctx.simultaneousDryRun)return;
  const commit=()=>{
   if(a&&!a.committed){a.committed=true;afterAttack(ctx,a);}
   for(const seg of segments){
    const guard=seg.weaponGuard;
    if(guard&&!guard.committed){guard.committed=true;afterGuard(guard,seg.parrySucceeded);if(seg.parrySucceeded)queueWear(guard.position.item,guard.loss);}
   }
   if(a&&!a.wearCommitted){a.wearCommitted=true;for(const seg of segments)if(seg.hitRollSuccess)queueWear(a.part,seg.parrySucceeded?a.blockedContact:a.contact);}
  };
  const source=g.CombatMetaSkills?.currentSource();
  const scoped=()=>g.CombatMetaSkills?g.CombatMetaSkills.withSource(source,commit):commit();
  if(transaction)transaction.commits.push(scoped);else scoped();
 }
 function queueWear(part,units){if(transaction){const id=part.instance_id,e=transaction.wear.get(id)||{part,units:0};e.units+=units;transaction.wear.set(id,e);}else wear(part,units);}
 function beginSimultaneous(){transaction={commits:[],wear:new Map(),guardCursor:{}};}
 function endSimultaneous(){
  if(!transaction)return;
  const tx=transaction;
  try{for(const commit of tx.commits)commit();for(const e of tx.wear.values())wear(e.part,e.units);}finally{transaction=null;}
 }
 function diqiCost(breathBar,move){
  const costs=breathBar?.weapon_diqi_cost||{};
  return costs[move.id]||(move.action_tags||move.required_limb_tags||[]).map(t=>costs[t]).find(Boolean)||costs['*']||move.diqi_cost||null;
 }
 function range(breathBonus){return 1+Math.max(0,Number(breathBonus)||0,...Array.from(rangeModifiers.values(),fn=>Number(fn())||0));}
 function setAttackOrder(next){
  const e=equipped();if(!e||!Array.isArray(next)||next.length!==4||new Set(next).size!==4||next.some(p=>!order.includes(p)))return false;
  const s=runtime(e.item),pending=s.attackOrder[s.attackCursor];if(next.every((p,i)=>p===s.attackOrder[i]))return false;
  s.attackOrder=next.slice();s.attackCursor=next.indexOf(pending);return true;
 }
 function powerLevel(item,slot){return clamp(Math.floor(Number(item.weapon_moves?.[slot]?.power_level)||10),1,12);}
 function setPowerLevel(slot,value){
  const e=equipped(),v=Number(value);if(!e||!order.includes(slot)||!Number.isInteger(v)||v<1||v>12||powerLevel(e.item,slot)===v)return false;
  e.item.weapon_moves=e.item.weapon_moves||{};
  e.item.weapon_moves[slot]={...(e.item.weapon_moves[slot]||{}),power_level:v};return true;
 }
 function view(){
  const e=equipped();if(!e)return null;
  const a=active(),c=g.ForgingRules.coverage(e.item),s=runtime(e.item);
  return {active:!!a,hand:e.limbId==='lhand'?'左手':'右手',rows:s.attackOrder.map((slot,index)=>{
   const p=position({...e,coverage:c},slot);
   if(!p)return {slot,label:{front:'前端',side1:'侧一',side2:'侧二',hilt:'手柄'}[slot],name:'未装配',next:false,durability:'',broken:false};
   const known=g.ForgingSystem?.exactKnown(p.item),move=configuredMove({...e,coverage:c},slot)?.move;
   return {slot,label:{front:'前端',side1:'侧一',side2:'侧二',hilt:'手柄'}[slot],name:move?.name||'',next:!!a&&index===s.attackCursor,powerLevel:powerLevel(e.item,slot),
    durability:known?p.durability.toFixed(2)+' / '+p.maxDurability.toFixed(2):'',broken:p.durability===0};})};
 }
 g.ModularWeaponCombat={ROOT,SKILL,isWeapon,skill,moves,active,equipped,intent,intentAt,configuredIntentAt,setMoveConfig,validIntent,prepareAttack,position,zeroProfile,
  validateEquip,onEquip,reset,clearTransient,endCombat,setMode,speedPercent,selectGuard,guardBonus,targetDefense,finish,
  beginSimultaneous,endSimultaneous,diqiCost,unloadBonus,registerBuffs,blockedAttackBonus,range,view,setAttackOrder,setPowerLevel,
  registerRangeModifier:(id,fn)=>rangeModifiers.set(id,fn),removeRangeModifier:id=>rangeModifiers.delete(id),
  registerGuardSelector:(id,fn)=>selectors.set(id,fn),removeGuardSelector:id=>selectors.delete(id)};
 if(g.CombatEngagement)g.CombatEngagement.onChange(e=>{if(!e.inCombat)endCombat();});
})(window);
