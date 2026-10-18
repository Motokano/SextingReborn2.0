/* Design 70 §13/15. Definitions live on CombatVariants, never on fallback moves.
 * Queue entries identify an installation, not an enemy. All timers use world ticks.
 * No concrete metaskill is supplied here: the confirmed rules define a scheduler,
 * not a list of player skills or resource thresholds. */
(function (g) {
 'use strict';
 const limbs=['lhand','rhand','lfoot','rfoot'];
 const body={lhand:'left_arm',rhand:'right_arm',lfoot:'left_leg',rfoot:'right_leg'};
 const clone=x=>JSON.parse(JSON.stringify(x));
 const now=()=>Number(g.GameTime.getState().totalTicks)||0;
 const policies=new Map();
 let state=fresh(),source=null,restoring=0,notifying=false,nextHint=null;
 function fresh(){return {version:1,queue:[],cooldowns:{},retiredCooldowns:{},edges:{},observed:{},tainted:{},batch:null,serial:0,actionSerial:0,eventTick:-1,seenEvents:[],usedTick:-1};}
 function withSource(value,fn){const old=source;source=old||value||null;try{return fn();}finally{source=old;}}
 function definition(id){
  const v=g.CombatVariants?.getVariant(id),d=v?.metaskill;
  if(!validDefinition(d))return null;
  if(d.activation_policy&&!policies.has(d.activation_policy))return null;
  return d;
 }
 function validTest(t,depth=0){
  if(!t||typeof t!=='object'||depth>16)return false;
  if(t.all_of||t.any_of){const arr=t.all_of||t.any_of;return Array.isArray(arr)&&arr.length>0&&arr.every(c=>validTest(c,depth+1));}
  if(t.not)return validTest(t.not,depth+1);
  return typeof t.path==='string'&&/^(self|event)\./.test(t.path)&&!t.path.split('.').some(p=>['__proto__','prototype','constructor'].includes(p))
   &&['eq','neq','gt','gte','lt','lte','in'].includes(t.op)&&Object.hasOwn(t,'value');
 }
 function validDefinition(d){
  return !!(d&&['replace','append'].includes(d.mode)&&['in_combat','always'].includes(d.enabled_when)&&d.condition
   &&['event','state'].includes(d.condition.kind)&&Array.isArray(d.condition.listen)&&d.condition.listen.length>0&&d.condition.listen.every(n=>typeof n==='string')
   &&validTest(d.condition.test)&&['cooldown_ticks','max_pending'].every(k=>d[k]==null||Number.isSafeInteger(d[k])&&d[k]>=(k==='max_pending'?1:0))
   &&(d.condition.repeat_interval_ticks==null||Number.isSafeInteger(d.condition.repeat_interval_ticks)&&d.condition.repeat_interval_ticks>0)
   &&(d.resource_waivers==null||Array.isArray(d.resource_waivers)&&d.resource_waivers.every(k=>['qi','diqi'].includes(k))));
 }
 function moveOf(i){return g.CombatSkills?.getSkill(i?.skillId)?.moves?.find(m=>m.id===i.moveId)||null;}
 function unlocked(v){const I=g.InventoryEquipment;return g.CombatVariants.isVariantUnlocked(v,{getSkillLevel:I.getSkillLevel,
  getMoveUsage:id=>I.getSkillsState()[id]?.move_usage||{},CombatSkills:g.CombatSkills});}
 function bindings(){
  const I=g.InventoryEquipment,c=I.getCombatState(),rows=[],W=g.ModularWeaponCombat;
  function add(i,ids,location){
   const move=moveOf(i);if(!move||i.skillId===W?.SKILL)return;
   ids.forEach((id,index)=>{id=String(id||'').replace(/^variant:/,'');const v=g.CombatVariants.getVariant(id),d=definition(id);
    if(!d||!['active_moves','both'].includes(v.assist_scope||'active_moves')||!unlocked(v)||!g.CombatVariants.allowsMove(v,{moveId:move.id,moveTags:move.action_tags||move.required_limb_tags||[],damageType:move.damage_type}))return;
    const key=location+':'+index+':'+id;
    rows.push({key,variantId:id,definition:d,intent:{...i},mode:i.weaponId?'weapon':'unarmed',position:i.weaponPosition||i.limbId,socket:index});
   });
  }
  for(const limb of limbs){
   const skillId=c.limbs[limb]?.active,sk=g.CombatSkills.getSkill(skillId);
   if(sk?.category!=='unarmed')continue;
   const moveId=I.peekMoveIdForLimb(limb);if(!moveId)continue;
   add({skillId,moveId,limbId:limb,advanceCursor:true,powerLevel:I.getMoveSlotPowerLevel(limb,0)},(c.move_sequences[limb]||[]).slice(1),'unarmed:'+limb);
  }
  const e=W?.equipped();
  if(e)for(const pos of ['front','side1','side2','hilt']){
   const i=W.configuredIntentAt(pos);if(i)add(i,e.item.weapon_moves?.[pos]?.variants||[],'weapon:'+e.item.instance_id+':'+pos);
  }
  return rows;
 }
 function mode(){return g.ModularWeaponCombat?.active()?'weapon':'unarmed';}
 function orderedPositions(which,rotate){
  const W=g.ModularWeaponCombat,I=g.InventoryEquipment;
  let order=which==='weapon'?(W?.equipped()?.item.weapon_combat?.attackOrder||['front','side1','side2','hilt']).slice():I.getLimbStrikeOrderSlice();
  const n=rotate?(which==='weapon'?W?.equipped()?.item.weapon_combat?.attackCursor:I.getLimbStrikeOrderCursor())||0:0;
  return order.slice(n).concat(order.slice(0,n));
 }
 function selfSnapshot(){
  const s=g.Survival.getState(),out={qi:s.qi_li_current,diqi:s.diqi_current,qi_max:g.Survival.getQiLiMax(),diqi_max:s.diqi_max_effective,
   mode:mode(),survival:s,buff_stacks:{},body_destroyed:{}};
  for(const b of g.BuffSystem?.getState()?.instancesByOwner?.player||[])out.buff_stacks[b.buff_id]=(out.buff_stacks[b.buff_id]||0)+b.stacks;
  for(const part of Object.values(body))out.body_destroyed[part]=!!g.CharacterAttributes?.isBodyPartDestroyedForParry(part);
  return out;
 }
 function paths(test,out=[]){
  if(!test||typeof test!=='object')return out;
  if(test.path)out.push(String(test.path));
  for(const k of ['all_of','any_of'])for(const c of test[k]||[])paths(c,out);
  if(test.not)paths(test.not,out);return out;
 }
 function read(obj,path){let cur=obj;for(const key of path.split('.')){if(['__proto__','prototype','constructor'].includes(key))return undefined;cur=cur?.[key];}return cur;}
 function test(t,ctx){
  if(!t||typeof t!=='object')return false;
  if(t.all_of)return Array.isArray(t.all_of)&&t.all_of.length>0&&t.all_of.every(c=>test(c,ctx));
  if(t.any_of)return Array.isArray(t.any_of)&&t.any_of.some(c=>test(c,ctx));
  if(t.not)return !test(t.not,ctx);
  const lhs=read(ctx,String(t.path||'')),rhs=t.value;
  if(lhs===undefined)return false;
  switch(t.op){case 'eq':return lhs===rhs;case 'neq':return lhs!==rhs;case 'gt':return Number(lhs)>Number(rhs);case 'gte':return Number(lhs)>=Number(rhs);
   case 'lt':return Number(lhs)<Number(rhs);case 'lte':return Number(lhs)<=Number(rhs);case 'in':return Array.isArray(rhs)&&rhs.includes(lhs);default:return false;}
 }
 function context(event={}){const self=selfSnapshot();return {self,event};}
 function sourceForPaths(condition,ctx){
  let blocked=!!source;
  for(const path of paths(condition.test).filter(p=>p.startsWith('self.'))){
   let value=read(ctx,path);if(value===undefined&&path.startsWith('self.buff_stacks.'))value=0;
   const serial=JSON.stringify(value)??'undefined';
   if(state.observed[path]!==serial){state.observed[path]=serial;state.tainted[path]=source||null;}
   if(state.tainted[path])blocked=true;
   if(path.startsWith('self.buff_stacks.')){
    const id=path.slice('self.buff_stacks.'.length);
    if(g.BuffSystem.getState()?.instancesByOwner?.player?.some(b=>b.buff_id===id&&b.metaskill_source))blocked=true;
    if(read(ctx,path)===undefined)ctx.self.buff_stacks[id]=0;
   }
  }
  return blocked;
 }
 function stateTainted(condition){
  return paths(condition.test).some(path=>state.tainted[path]||path.startsWith('self.buff_stacks.')
   &&g.BuffSystem.getState()?.instancesByOwner?.player?.some(b=>b.buff_id===path.slice('self.buff_stacks.'.length)&&b.metaskill_source));
 }
 function policy(entry){return policies.get(entry.definition?.activation_policy);}
 function enqueue(b,ctx){
  const d=b.definition,t=now(),limit=Math.max(1,Math.floor(Number(d.max_pending)||1));
  if((state.cooldowns[b.key]??-1)>t||state.queue.filter(e=>e.key===b.key).length>=limit)return false;
  const p=policy(b);if(p?.canActivate&&!p.canActivate(ctx,b))return false;
  const e={id:++state.serial,key:b.key,variantId:b.variantId,mode:b.mode,position:b.position,socket:b.socket,
   intent:clone(b.intent),definition:clone(d),activatedAt:t,readyAt:t+1,receipt:null};
  // Costs and refunds belong to the definition's policy. Their causal descendants
  // are metaskill effects too; paying an activation cost cannot activate another one.
  withSource('metaskill:'+e.id,()=>{if(p?.onActivate)e.receipt=p.onActivate(ctx,b)??null;captureChanges();});
  state.queue.push(e);state.cooldowns[b.key]=t+Math.max(0,Math.floor(Number(d.cooldown_ticks)||0));
  sortBatch(t);return true;
 }
 function sortBatch(t){
  const batch=state.queue.filter(e=>e.activatedAt===t);
  if(!batch.length)return;
  if(state.batch?.tick!==t){
   const current=mode(),orders={unarmed:orderedPositions('unarmed',current==='unarmed'),weapon:orderedPositions('weapon',current==='weapon')};
   if(nextHint?.tick===t&&nextHint.mode===current)orders[current]=nextHint.order;
   state.batch={tick:t,mode:current,orders};
  }
  const anchor=state.batch,rank=e=>[e.mode===anchor.mode?0:1,anchor.orders[e.mode].indexOf(e.position),e.socket];
  batch.sort((a,b)=>{const x=rank(a),y=rank(b);return x[0]-y[0]||x[1]-y[1]||x[2]-y[2]||a.id-b.id;});
  let n=0;state.queue=state.queue.map(e=>e.activatedAt===t?batch[n++]:e);
 }
 function prepareMain(i){
  const which=i.weaponId?'weapon':'unarmed',order=orderedPositions(which,false),index=order.indexOf(i.weaponPosition||i.limbId),n=(index+1)%order.length;
  nextHint={tick:now(),mode:which,order:order.slice(n).concat(order.slice(0,n))};
 }
 function notify(name,event={}){
  if(restoring)return;
  if(notifying){captureChanges();return;}
  if(state.eventTick!==now()){state.eventTick=now();state.seenEvents=[];}
  if(event.event_id){const key=name+':'+event.event_id;if(state.seenEvents.includes(key))return;state.seenEvents.push(key);}
  notifying=true;
  try{
   const rows=bindings(),t=now();
   if(!rows.length)return;
   const initial=context({...event,name});
   for(const b of rows)sourceForPaths(b.definition.condition,initial);
   // Track provenance even if this notification is not among a condition's listeners.
   // A later world-tick scan must not reinterpret a meta-caused state as a fresh trigger.
   for(const b of rows){
    const ctx=context({...event,name});
    const c=b.definition.condition,blocked=sourceForPaths(c,ctx);
    if(!c.listen.includes(name))continue;
    const truth=test(c.test,ctx),old=state.edges[b.key];
    if(c.kind==='state'){
     const edge=old||{truth:false,lastActivation:-1};
     const interval=Math.max(0,Math.floor(Number(c.repeat_interval_ticks)||0));
     const eligible=truth&&(!edge.truth||(interval>0&&!edge.blocked&&t-edge.lastActivation>=interval));
     state.edges[b.key]={...edge,truth,blocked:truth&&(stateTainted(c)||!!(edge.truth&&edge.blocked)||!!(source&&!edge.truth))};
     if(!blocked&&!state.edges[b.key].blocked&&eligible&&enabled(b.definition)&&enqueue(b,ctx))state.edges[b.key].lastActivation=t;
    }else if(truth&&!blocked&&enabled(b.definition))enqueue(b,ctx);
   }
  }finally{notifying=false;}
 }
 function enabled(d){return d.enabled_when==='always'||d.enabled_when==='in_combat'&&g.CombatEngagement.isPlayerInCombat();}
 function captureChanges(){
  const ctx=context();for(const b of bindings()){
   const c=b.definition.condition;sourceForPaths(c,ctx);
   if(stateTainted(c)&&c.kind==='state'&&test(c.test,ctx))state.edges[b.key]={...(state.edges[b.key]||{lastActivation:-1}),truth:true,blocked:true};
  }
 }
 function legal(i,target,checkRange=true){
  if(!i||i.skip||g.Survival.getState().isDead)return false;
  if(i.weaponId){if(!g.ModularWeaponCombat.validIntent(i,true))return false;}
  else {
   const I=g.InventoryEquipment,CS=g.CombatSkills,c=I.getCombatState(),sk=CS.getSkill(i.skillId);
   if(!['unarmed','weapon'].includes(sk?.category)||c.limbs[i.limbId]?.active!==i.skillId||I.peekMoveIdForLimb(i.limbId)!==i.moveId
     ||g.CharacterAttributes.isBodyPartDestroyedForParry(body[i.limbId]))return false;
   const m=CS.getUnlockedMoves(i.skillId,I.getSkillLevel(i.skillId)).find(m=>m.id===i.moveId);
   if(!m||!CS.moveAllowedOnLimbByTagKeys(m,g.getLimbActionTags?.(i.limbId)||CS.getDefaultLimbTagKeysForLimbId(i.limbId)))return false;
  }
  if(!checkRange||!target)return true;
  const p=g.GameEngine.getState(),m=moveOf(i),distance=Math.max(Math.abs(p.x-target.x),Math.abs(p.y-target.y));
  const range=i.weaponId?g.ModularWeaponCombat.range(g.CombatBreath.active()?.range_bonus):g.CombatBreath.range(m);
  return distance>=1&&distance<=range;
 }
 function cancel(entry,reason){
  state.queue=state.queue.filter(e=>e.id!==entry.id);
  withSource('metaskill:'+entry.id,()=>policy(entry)?.onCancel?.(entry.receipt,reason,entry));
 }
 function select(normal,target){
  const plan={normal,main:normal,entry:null,previousMode:mode(),started:false};
  if(state.usedTick===now())return plan;
  const mounted=new Map(bindings().map(b=>[b.key,b]));
  for(const e of state.queue.slice()){
   if(e.readyAt>now())continue;
   const b=mounted.get(e.key);
   if(!b||JSON.stringify(b.definition)!==JSON.stringify(e.definition)||b.intent.moveId!==e.intent.moveId||b.intent.skillId!==e.intent.skillId){cancel(e,'configuration');continue;}
   if(!legal(e.intent,target,e.definition.mode==='replace')){cancel(e,'unavailable');continue;}
   if(e.definition.recheck_on_execute&&!test(e.definition.condition.test,context({name:'execute'}))){cancel(e,'condition');continue;}
   plan.entry=e;
   if(e.definition.mode==='replace'){
    plan.main={...b.intent,metaSource:'metaskill:'+e.id,costWaivers:e.definition.resource_waivers||[]};
    withSource(plan.main.metaSource,()=>g.ModularWeaponCombat?.setMode(e.mode));
   }
   break;
  }
  return plan;
 }
 function hasAttackOpportunity(normal,target){
  return legal(normal,target,true)||bindings().some(b=>b.definition.mode==='replace'
   &&state.queue.some(e=>e.key===b.key&&e.readyAt<=now())&&legal(b.intent,target,true));
 }
 function consume(plan){
  if(!plan?.entry||plan.started)return;
  plan.started=true;state.usedTick=now();state.queue=state.queue.filter(e=>e.id!==plan.entry.id);
  withSource('metaskill:'+plan.entry.id,()=>policy(plan.entry)?.onSelected?.(plan.entry.receipt,plan.entry));
 }
 function beginTriggered(plan){
  if(!plan?.entry||plan.triggered)return;
  plan.triggered=true;
  withSource('metaskill:'+plan.entry.id,()=>policy(plan.entry)?.onExecute?.(plan.entry.receipt,plan.entry));
 }
 function cancelSelected(plan,reason){
  if(!plan?.entry||plan.triggered||plan.cancelled)return;
  plan.cancelled=true;
  withSource('metaskill:'+plan.entry.id,()=>policy(plan.entry)?.onCancel?.(plan.entry.receipt,reason,plan.entry));
 }
 function suspend(plan){
  if(!plan?.started&&plan?.entry?.definition.mode==='replace')withSource('metaskill:'+plan.entry.id,()=>g.ModularWeaponCombat?.setMode(plan.previousMode));
 }
 function reselect(plan,target,pick){
  suspend(plan);
  if(plan.entry)cancel(plan.entry,'unavailable');
  return select(pick(),target);
 }
 function appendIntent(plan,target){
  const e=plan?.entry;if(!e||e.definition.mode!=='append'||!plan.started)return null;
  const live=bindings().find(b=>b.key===e.key);
  if(!live||!legal(live.intent,target,true)){cancelSelected(plan,'append_unavailable');return null;}
  if(e.definition.recheck_on_execute&&!test(e.definition.condition.test,context({name:'execute'}))){cancelSelected(plan,'condition');return null;}
  return {...live.intent,advanceCursor:false,advanceWeaponCursor:false,allowInactiveWeapon:true,metaSource:'metaskill:'+e.id,costWaivers:e.definition.resource_waivers||[]};
 }
 function advance(i){
  if(i?.weaponId||!i?.advanceCursor)return;
  g.InventoryEquipment.advanceLimbStrikeOrderAfterAttack(i.limbId);
  g.InventoryEquipment.advanceMoveSequenceCursorForLimb(i.limbId);
 }
 function completed(ctx){
  if(ctx.simultaneousDryRun||ctx._segmentOfAction||ctx.notExecuted||ctx.resourceResult?.notExecuted)return;
  const own=ctx.attacker?.kind==='player',segments=ctx.segmentsResults||[ctx];
  const data={event_id:'action:'+ctx._metaActionSerial,actor:own?'player':'enemy',skill_id:ctx.skillId,move_id:ctx.moveId,limb_id:ctx.limbId,
   hit:segments.some(s=>s.hitRollSuccess),damage:segments.reduce((n,s)=>n+(s.finalDamage||0),0),parried:segments.some(s=>s.parrySucceeded)};
  notify(own?'action_completed':'incoming_action_completed',data);
  if(own&&data.hit)notify('hit',data);
  if(!own&&data.parried)notify('parry',data);
  if(!own&&data.damage>0)notify('damage_taken',data);
  sortBatch(now());
 }
 function configSignature(){return JSON.stringify(bindings().map(b=>[b.key,b.intent.skillId,b.intent.moveId,b.intent.powerLevel,b.definition,g.InventoryEquipment.getVariantEffectParamOverride(b.variantId),b.variantId]));}
 function configChanged(before){
  if(restoring||before===configSignature())return false;
  const old=before?JSON.parse(before):[],rows=bindings(),oldKeys=new Set(old.map(r=>r[0])),newKeys=new Set(rows.map(b=>b.key));
  for(const row of old)if(!newKeys.has(row[0]))retireCooldown(row[0],row[6]);
  for(const b of rows)if(!oldKeys.has(b.key)){
   const pool=state.retiredCooldowns[b.variantId]||[];pool.sort((a,b)=>b.until-a.until);
   const credit=pool.shift();if(credit)state.cooldowns[b.key]=Math.max(state.cooldowns[b.key]||0,credit.until);
  }
  for(const e of state.queue.slice())cancel(e,'configuration');
  // Preserve edge history on existing sockets (and cooldowns on removed sockets).
  // New installations begin from their current state, not a fabricated rising edge.
  const ctx=context();for(const b of bindings())if(!state.edges[b.key]&&b.definition.condition.kind==='state'){
   sourceForPaths(b.definition.condition,ctx);state.edges[b.key]={truth:test(b.definition.condition.test,ctx),lastActivation:-1,blocked:!!source};
  }
  return true;
 }
 function retireCooldown(key,variantId){
  const until=state.cooldowns[key]||0;if(until<=now())return;
  const pool=state.retiredCooldowns[variantId]||(state.retiredCooldowns[variantId]=[]);
  if(!pool.some(e=>e.key===key))pool.push({key,until});
 }
 function weaponChanged(id,positions){
  if(restoring||typeof id!=='string'||!id)return;
  for(const b of bindings())if(b.intent.weaponId===id&&(!positions||positions.includes(b.position)))retireCooldown(b.key,b.variantId);
  for(const e of state.queue.slice())if(e.intent.weaponId===id&&(!positions||positions.includes(e.position)))cancel(e,'weapon_changed');
 }
 function disengage(){
  if(restoring)return;
  for(const e of state.queue.slice())cancel(e,'disengaged');
  const I=g.InventoryEquipment;I.setCombatState({limb_strike_order_cursor:0,move_sequence_cursors:{lhand:0,rhand:0,lfoot:0,rfoot:0}});
  const W=g.ModularWeaponCombat,e=W?.equipped();
  if(e){e.item.weapon_combat.attackCursor=0;e.item.weapon_combat.guardCursor=0;W.setMode('weapon');W.active();}
 }
 function validate(s){
  if(s==null)return true;
  return s.version===1&&Array.isArray(s.queue)&&s.queue.length<=4096&&s.queue.every(e=>e&&Number.isSafeInteger(e.id)&&e.id>0&&typeof e.key==='string'
   &&['weapon','unarmed'].includes(e.mode)&&validDefinition(e.definition)&&Number.isSafeInteger(e.readyAt)&&Number.isSafeInteger(e.activatedAt)&&e.readyAt===e.activatedAt+1&&typeof e.intent?.moveId==='string'
   &&typeof e.intent.skillId==='string'&&limbs.includes(e.intent.limbId)&&typeof e.variantId==='string'&&Number.isInteger(e.socket))
   &&new Set(s.queue.map(e=>e.id)).size===s.queue.length&&['cooldowns','retiredCooldowns','edges','observed','tainted'].every(k=>s[k]&&typeof s[k]==='object'&&!Array.isArray(s[k]))
   &&Number.isSafeInteger(s.serial)&&s.serial>=Math.max(0,...s.queue.map(e=>e.id))&&Number.isInteger(s.usedTick)
   &&Number.isSafeInteger(s.actionSerial)&&s.actionSerial>=0&&Number.isInteger(s.eventTick)&&Array.isArray(s.seenEvents)&&s.seenEvents.every(k=>typeof k==='string')
   &&(s.batch===null||s.batch&&Number.isInteger(s.batch.tick)&&['unarmed','weapon'].includes(s.batch.mode)
    &&['unarmed','weapon'].every(k=>Array.isArray(s.batch.orders?.[k])&&s.batch.orders[k].length===4&&new Set(s.batch.orders[k]).size===4))
   &&Object.values(s.cooldowns).every(t=>Number.isSafeInteger(t)&&t>=0)
   &&Object.values(s.retiredCooldowns).every(arr=>Array.isArray(arr)&&arr.every(e=>typeof e.key==='string'&&Number.isSafeInteger(e.until)&&e.until>=0))
   &&Object.values(s.edges).every(e=>e&&typeof e.truth==='boolean'&&typeof e.blocked==='boolean'&&Number.isInteger(e.lastActivation))
   &&Object.values(s.observed).every(v=>typeof v==='string')&&Object.values(s.tainted).every(v=>v===null||typeof v==='string');
 }
 function setState(s){
  if(!validate(s))return false;state=s?clone(s):fresh();nextHint=null;
  if(!s){const ctx=context();for(const b of bindings())if(b.definition.condition.kind==='state'){
   sourceForPaths(b.definition.condition,ctx);state.edges[b.key]={truth:test(b.definition.condition.test,ctx),lastActivation:-1,blocked:false};
  }}return true;
 }
 g.CombatMetaSkills={definition,bindings,mode,moveOf,legal,hasAttackOpportunity,select,prepareMain,consume,beginTriggered,cancelSelected,suspend,reselect,appendIntent,advance,completed,notify,sortBatch,
  withSource,currentSource:()=>source,registerActivationPolicy:(id,p)=>policies.set(id,p),configSignature,configChanged,weaponChanged,
  getState:()=>clone(state),setState,validate,reset:()=>{state=fresh();nextHint=null;},beginRestore:()=>{restoring++;},endRestore:()=>{restoring=Math.max(0,restoring-1);},isRestoring:()=>restoring>0};
 g.CombatEngagement.onChange(e=>{if(!e.inCombat)disengage();});
 // Preserve causal context across the existing public combat boundaries, including
 // deferred simultaneous commits. Internal multi-hit calls inherit this context.
 const CP=g.CombatPipeline,CMR=g.CombatMeleeResolve;
 for(const name of ['applyDeferredResourceSpendFromResolveResult','finishActionResources']){
  const fn=CMR[name];CMR[name]=r=>withSource(r?.metaSource,()=>fn(r));
 }
 for(const name of ['runPipeline','flushPendingBuffApplies','finalizeSimultaneousStrike']){
  const fn=CP[name];CP[name]=function(...args){
   const ctx=args[name==='runPipeline'?1:0],wasCommitted=ctx?.simultaneousCommitted;
   if(name==='runPipeline'&&ctx&&!ctx._metaActionSerial){ctx._metaActionSerial=++state.actionSerial;ctx.eventIdSuffix=(ctx.eventIdSuffix||'')+'_a'+ctx._metaActionSerial;}
   return withSource(ctx?.metaSource||ctx?.resourceResult?.metaSource,()=>{
    const result=fn(...args);
    if(name==='runPipeline'&&!ctx.simultaneousDryRun)completed(result||ctx);
    if(name==='finalizeSimultaneousStrike'&&!wasCommitted&&ctx.simultaneousCommitted)completed({...ctx,simultaneousDryRun:false});
    return result;
   });
  };
 }
 // Configuration writes all share the same lifecycle. The scene/UI owns action
 // charging; internal cursor advances and restoring a save must never charge one.
 const I=g.InventoryEquipment;
 for(const name of ['setCombatState','setVariantEffectParamOverride','clearVariantEffectParamOverride']){
  const fn=I[name];I[name]=function(...args){const before=configSignature();const result=fn(...args);configChanged(before);return result;};
 }
 const advanceTick=g.GameTime.advanceTicks;
 g.GameTime.advanceTicks=function(n){const before=now();sortBatch(before);const r=advanceTick(n);if(now()>before){nextHint=null;notify('world_tick',{tick:now()});}return r;};
 for(const name of ['addQiLi','consumeQiLi','drainQiLi','consumeDiqi','addDiqiCurrent','setState','applyBreathInitialState']){
  const fn=g.Survival[name];if(!fn)continue;
  g.Survival[name]=function(...args){const before=g.Survival.getState(),r=fn(...args),after=g.Survival.getState();
   if(before.qi_li_current!==after.qi_li_current||before.diqi_current!==after.diqi_current)notify('resource_changed',{qi:after.qi_li_current,diqi:after.diqi_current});return r;};
 }
})(window);
