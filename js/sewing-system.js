/* Sewing instances, knowledge and personal work. No loot distribution is defined here. */
(function (g) {
 'use strict';
 const parts=['chest','abdomen','arm_l','arm_r','leg_l','leg_r'];
 const labels=['胸片','腹片','左袖','右袖','左裤腿','右裤腿'];
 const styles={
  light:{name:'轻便套装',outer:[5,4,2,2,7,7],liner:[0,0,0,0,0,0],fill:[0,0,0,0,0,0],pockets:[0,0,0,0,2,2],cold:6,heat:6,bonus:[0,3]},
  work:{name:'工装套装',outer:[6,5,4,4,8,8],liner:[5,4,0,0,0,0],fill:[0,0,0,0,0,0],pockets:[2,2,0,0,1,1],cold:10,heat:3,bonus:[2,0]},
  winter:{name:'御寒套装',outer:[7,6,5,5,9,9],liner:[6,5,4,4,8,8],fill:[3,3,2,2,4,4],pockets:[0,2,0,0,1,1],cold:24,heat:0,bonus:[6,0]}
 };
 // defense points, cold/heat, kg/unit, shield, silica reductions, discount, research, input, output, ticks
 const materials={
  textile_cotton_cloth:[[8,3,2],1,0,.02,40,[.11,.09,.09],.55,200,'textile_cotton_fiber',1,10,4],
  textile_hemp_cloth:[[8,3,2],0,1.5,.025,35,[.18,.16,.09],.55,200,'textile_hemp_fiber',1,10,4],
  textile_wool_cloth:[[8,3,4],3,-2,.035,15,[.35,.30,.43],.2,400,'hus_wool',2,10,6],
  textile_silk_cloth:[[8,3,2],.5,.5,.012,60,[.06,.06,.04],.7,400,'cocoons',16,10,6],
  leather_cow_soft:[[12,5,4],1.8,-1.5,.065,20,[.52,.46,.43],0,400,'hus_beef_hide',1,40,12],
  leather_sheep_soft:[[12,5,4],1.3,-.8,.045,15,[.43,.37,.35],.2,400,'hus_mutton_hide',1,15,6],
  filling_cotton:[[0,0,8],.5,-.35,.05,3,[.06,.06,.25],0,100,'textile_cotton_fiber',2,10,3],
  filling_wool:[[0,0,8],.7,-.5,.05,2,[.10,.10,.34],0,100,'hus_wool',3,10,3],
  filling_silk:[[0,0,8],.4,-.2,.05,8,[.04,.04,.16],.5,200,'cocoons',60,10,5]
 };
 const thickness={thin:[.75,.8,.75,1.1,1.2],standard:[1,1,1,1,1],thick:[1.5,1.1,1.35,.75,.8]};
 const copy=x=>JSON.parse(JSON.stringify(x)), IE=()=>g.InventoryEquipment;
 const flag=k=>g.NPCSystem.getFlagValue(k), set=(k,v)=>g.NPCSystem.setDemoFlag(k,v);
 const roll=()=> (80+Math.floor(Math.random()*41))/100;
 const fail=m=>{throw Error(m);};
 let job=null;
 function knowledge(){return copy(flag('sewing_knowledge')||{patterns:{},materials:{}});}
 function patternKey(style,part){return style+':'+part.replace(/_[lr]$/,'');}
 function level(style,part){return Math.min(3,knowledge().patterns[patternKey(style,part)]||0);}
 function body(){const s=g.Survival.getState(),h=g.Survival.getHeightCm(),w=g.Survival.getWeightKg();return {height_cm:h,weight_kg:w,bmi:w/Math.pow(h/100,2),gender_value:s.gender_value};}
 function dimensions(b){return {height_cm:b.height_cm,weight_kg:b.weight_kg,bmi:b.weight_kg/Math.pow(b.height_cm/100,2)};}
 function layersFor(style,part){const s=styles[style],i=parts.indexOf(part);return s&&i>=0?['outer','fill','liner'].filter(k=>s[k][i]>0):[];}
 function validatePlan(style,part,plan){
  const keys=layersFor(style,part);if(!keys.length)fail('无效部件结构。');
  if(!plan||Object.keys(plan).length!==keys.length)fail('层次与版型不符。');
  keys.forEach(k=>{const l=plan[k];if(!l||!thickness[l.thickness])fail('请选择厚度。');
   if(k==='liner'?l.thickness!=='standard':style==='winter'?l.thickness==='thin':l.thickness==='thick')fail('该版型不支持此厚度。');
   const mix=l.mix,ids=Object.keys(mix||{});if(!ids.length||ids.length>(k==='fill'?2:1))fail('材料组合不合法。');
   let sum=0;ids.forEach(id=>{if(!materials[id]||id.startsWith('filling_')!==(k==='fill')||!Number.isInteger(mix[id])||mix[id]<=0||mix[id]>100||mix[id]%10)fail('填充以10%为一档，材料须符合层次。');sum+=mix[id];});if(sum!==100)fail('配比必须合计100%。');
  });return keys;
 }
 function defaultPlan(style,part){const out={};layersFor(style,part).forEach(k=>out[k]={thickness:'standard',mix:{[k==='fill'?'filling_cotton':'textile_cotton_cloth']:100}});return out;}
 function costs(style,part,plan,only){const out={};validatePlan(style,part,plan).filter(k=>!only||k===only).forEach(k=>{const l=plan[k],n=Math.ceil(styles[style][k][parts.indexOf(part)]*thickness[l.thickness][0]);Object.keys(l.mix).forEach(id=>out[id]=(out[id]||0)+n);});return out;}
 function makePart(style,part,plan,size,cut,midpoint){
  validatePlan(style,part,plan);if(!size||!(size.height_cm>0)||!(size.weight_kg>0)||!['male','female'].includes(cut))fail('请先设置人台尺寸与剪裁。');
  const layers=copy(plan);Object.values(layers).forEach(l=>{l.defense=midpoint?1:roll();l.thermal=midpoint?1:roll();});
  return IE().ensureItemInstanceIdentity({item_id:'sewing_part_'+style+'_'+part,count:1,sewing:{version:1,style,part,cut,size:dimensions(size),layers,researched:false,known:{structure:true,cut:true,size:true,layers:true,performance:true}}});
 }
 function outfitStyle(o){const ps=parts.map(p=>o.sewing_parts&&o.sewing_parts[p]);return ps.every(p=>p&&p.sewing&&p.sewing.style===ps[0].sewing.style)?ps[0].sewing.style:'mixed';}
 function refreshOutfit(o){o.item_id='sewing_outfit_'+outfitStyle(o);return o;}
 function makeOutfit(ps){const o={item_id:'sewing_outfit_mixed',count:1,sewing_parts:{},modules:{}};ps.forEach(p=>{if(!p.sewing||o.sewing_parts[p.sewing.part])fail('部件位置重复。');o.sewing_parts[p.sewing.part]=p;});return IE().ensureItemInstanceIdentity(refreshOutfit(o));}
 function birthOutfit(){const b=body();return makeOutfit(parts.map(p=>makePart('light',p,defaultPlan('light',p),b,b.gender_value===100?'female':'male',true)));}
 function fit(p,b){b=b||body();const s=p.sewing,size=s.size,dh=Math.abs(b.height_cm/size.height_cm-1),db=Math.abs(b.bmi/(size.weight_kg/Math.pow(size.height_cm/100,2))-1);let i=dh<=.02&&db<=.08?0:dh<=.05&&db<=.2?1:2;if((b.gender_value===0&&s.cut==='female')||(b.gender_value===100&&s.cut==='male'))i=Math.min(2,i+1);return {factor:[1,.85,.65][i],mood:[0,-20,-50][i],label:['合身','不太合身','明显不合身'][i]};}
 function stats(p){
  const s=p.sewing,i=parts.indexOf(s.part),sty=styles[s.style];let points=[0,0,0],keep=[1,1,1],shield=0,cold=0,heat=0,weight=0,discountMass=0;
  Object.entries(s.layers).forEach(([k,l])=>{const t=thickness[l.thickness],f=k==='liner'?.5:1,n=sty[k][i],units=Math.ceil(n*t[0]);let r=[0,0,0];
   Object.entries(l.mix).forEach(([id,pct])=>{const m=materials[id],v=pct/100,w=units*m[3]*f*v;weight+=w;discountMass+=w*m[6];shield+=m[4]*t[4]*f*v;
    for(let d=0;d<3;d++){points[d]+=m[0][d]*t[1]*f*l.defense*v;r[d]+=m[5][d]*t[1]*f*v;}
    const area=k==='fill'?n:n*.1;cold+=m[1]*area*t[2]*f*l.thermal*v;heat+=m[2]*area*(m[2]>0?t[3]:t[2])*f*l.thermal*v;
   });for(let d=0;d<3;d++)keep[d]*=1-Math.min(1,r[d]);
  });const cap=[.2,.2,.1,.1,.2,.2][i];
  return {base:points.map(x=>x/(100+x)),silica:keep.map(x=>s.soak?(1-x)*s.soak.defense:0),shield:s.soak?shield*(i===2||i===3?.5:1)*s.soak.shield:0,weight,discountMass:s.soak?discountMass:0,soakedWeight:s.soak?weight:0,cold:Math.min(cold,sty.cold*cap),heat:heat>0?Math.min(heat,sty.heat*cap):heat,pockets:sty.pockets[i],coverage:s.style==='light'&&(i===2||i===3)?.5:1};
 }
 function outfitStats(o){let out={shield:0,weight:0,cold:0,heat:0,pockets:0,discount:0,mood:0,cut:'mixed'},mass=0,dm=0,male=0,female=0;const b=body();Object.values(o&&o.sewing_parts||{}).forEach(p=>{const a=stats(p);['shield','weight','cold','heat','pockets'].forEach(k=>out[k]+=a[k]);mass+=a.soakedWeight;dm+=a.discountMass;out.mood=Math.min(out.mood,fit(p,b).mood);p.sewing.cut==='female'?female++:male++;});out.discount=mass?dm/mass:0;out.cut=male>female?'male':female>male?'female':'mixed';if(out.cut==='female')out.mood+=b.gender_value===0?-80:b.gender_value<100?30:0;const style=outfitStyle(o||{});if(styles[style]){out.cold+=styles[style].bonus[0];out.heat+=styles[style].bonus[1];}return out;}
 function worn(){const o=IE().getState().equipment.clothing;return o&&o.sewing_parts?outfitStats(o):{cold:0,heat:0,mood:0};}
 function reduce(o,part,type,moduleR){const p=o.sewing_parts[part];if(!p)return 0;const a=stats(p),d=['slash','pierce','blunt'].indexOf(type);if(d<0)return 0;return Math.min(.75,1-(1-a.base[d])*(1-a.silica[d])*(1-moduleR))*a.coverage*fit(p).factor;}
 function owned(){const s=IE().getState(),out=[];['pocket','vest','backpack','vehicle'].forEach(c=>(s['inventory_'+c]||[]).forEach((x,i)=>{if(!x)return;out.push({item:x,container:c,index:i,parent:null});Object.values(x.sewing_parts||{}).forEach(p=>out.push({item:p,container:c,index:i,parent:x}));}));return out;}
 function record(id){return owned().find(r=>r.item.instance_id===id);}
 function requireRecord(id){const r=record(id);if(!r)fail('物品已移动，或仍穿在身上。请先脱下。');return r;}
 function knowledgeGain(p){const gains={};Object.entries(p.sewing.layers).forEach(([k,l])=>{const n=Math.ceil(styles[p.sewing.style][k][parts.indexOf(p.sewing.part)]*thickness[l.thickness][0]);Object.entries(l.mix).forEach(([id,v])=>gains[id]=(gains[id]||0)+n*v/10);});Object.keys(gains).forEach(id=>gains[id]=Math.floor(gains[id]));return gains;}
 function safeDetach(r,part){const host=r.parent||r.item,target=part||(r.item.sewing&&r.item.sewing.part);if(Object.entries(host.modules||{}).some(([key,m])=>{if(!m)return false;const t=IE().getModuleTemplate(m.item_id);return key===target||t&&Array.isArray(t.occupies)&&t.occupies.includes('clothing.'+target);}))fail('请先卸下占用该部位的防护改件。');}
 function takeRecord(r){if(r.parent){delete r.parent.sewing_parts[r.item.sewing.part];refreshOutfit(r.parent);return r.item;}const result=IE().takeItemFromContainer(r.container,r.index);if(!result.success)fail('无法取出物品。');return result.item;}
 function give(x){const result=IE().putItemIntoDefaultContainer(x);if(!result.placed){const p=g.GameEngine.getState();if(!IE().addItemToGround(p.mapId,p.x,p.y,x))fail('无法安放产物。');}}
 function pay(c){Object.entries(c).forEach(([id,n])=>{if(!IE().removeCarriedItemsByTemplateId(id,n,{strict:true}).ok)fail('材料不足。');});}
 function enough(c){Object.entries(c).forEach(([id,n])=>{if(IE().countCarriedItemsByTemplateId(id)<n)fail('材料不足：'+name(id)+' × '+n);});}
 function name(id){return IE().getDisplayName(IE().getItemTemplate(id),0,IE().getCharacterForDisplay());}
 function save(){if(!g.SaveSystem||!g.SaveSystem.saveNow())fail('保存失败，当前操作已停止。');}
 function transaction(fn){const inv=copy(IE().getState()),npc=copy(g.NPCSystem.getDemoState());try{fn();save();}catch(e){IE().setState(inv);g.NPCSystem.setDemoState(npc);throw e;}}
 function access(){if(!g.SewingStationPanel||!g.SewingStationPanel.isOpen()||!g.SewingStationPanel.canAccess())fail('请在缝纫台旁亲自操作。');if(g.Survival.isDead&&g.Survival.isDead())fail('当前不能操作。');if(g.Survival.canPerformStaminaOrEnergyAction&&!g.Survival.canPerformStaminaOrEnergyAction())fail('当前身体状况无法工作。');if(g.CombatEngagement&&g.CombatEngagement.isPlayerInCombat())fail('战斗中不能缝纫。');}
 function measureAtTools(){try{const p=g.FacilityUnlockConfig.projects.sewing_scale;if(!g.FacilityUnlock.canAccess(p)||!flag('sewing_tape_unlocked'))fail('请在已装配的量具旁操作。');if(g.CombatEngagement&&g.CombatEngagement.isPlayerInCombat())fail('战斗中不能测量。');const b=dimensions(body());if(!flag('sewing_scale_unlocked')){delete b.weight_kg;delete b.bmi;}g.Survival.advanceTick({source:'sewing_measure'});transaction(()=>set('sewing_measurement',b));return {ok:true,message:'记录身高'+b.height_cm+'厘米'+(b.weight_kg?'，体重'+b.weight_kg+'公斤':'。装配体重秤后可补充体重')+'。'};}catch(e){return {ok:false,message:e.message};}}
 function quote(a){
  access();const current=g.Survival.getState();if(current.isResting||current.is_study_active||current.is_sit_meditation_active||current.is_stamina_regen_action_active)fail('请先停止休息、学习或调息。');let ticks=1,energy=0,stamina=1,cost={},warning='',r=a.id?requireRecord(a.id):null,p=r&&r.item,s=p&&p.sewing,k=knowledge(),commit;
  if(a.type==='measure'){if(!flag('sewing_scale_unlocked'))fail('先装配体重秤。');commit=()=>set('sewing_measurement',dimensions(body()));}
  else if(a.type==='inspect'){
   if(!s)fail('请选择部件。');commit=()=>s.known=Object.assign({},s.known,{structure:true,cut:true,outer:true});
  }else if(a.type==='mannequin'){
   const m=flag('sewing_measurement'),old=flag('sewing_mannequin_dimensions');if(!m)fail('请先测量。');if(old&&old.height_cm===m.height_cm&&old.weight_kg===m.weight_kg)fail('人台尺寸已相同。');
   // Same interchangeable material points used by facility construction, selected in UI.
   const offers=a.materials||{};['wood','fiber'].forEach(group=>{let need=2;g.FacilityUnlockConfig.materials.filter(x=>x[1]===group&&x[0]!=='hus_wool').forEach(x=>{const n=offers[x[0]]||0;if(!Number.isSafeInteger(n)||n<0)fail('材料件数不合法。');const take=Math.min(n,Math.ceil(Math.max(0,need)/x[2]));if(take)cost[x[0]]=take;need-=take*x[2];});if(need>0)fail('请选择木作与纤维材料。');});ticks=3;commit=()=>{pay(cost);set('sewing_mannequin_dimensions',dimensions(m));};
  }else if(a.type==='craft'){
   if(level(a.style,a.part)<3)fail('尚未掌握这个版型。');const size=flag('sewing_mannequin_dimensions');if(!size)fail('请先按测量记录更新人台。');validatePlan(a.style,a.part,a.plan);cost=costs(a.style,a.part,a.plan);ticks=[3,3,2,2,4,4][parts.indexOf(a.part)]*Object.keys(a.plan).length;commit=()=>{const made=makePart(a.style,a.part,a.plan,size,a.cut);pay(cost);give(made);if(a.forSet)job.created.push(made.instance_id);};
  }else if(a.type==='process'){
   const m=materials[a.material];if(!m||(k.materials[a.material]||0)<m[7])fail('尚未掌握这项材料工艺。');ticks=m[11];if(m[8]==='cocoons'){let left=m[9];['textile_cocoon_domestic','textile_cocoon_wild'].forEach(id=>{const n=Math.min(left,IE().countCarriedItemsByTemplateId(id));if(n)cost[id]=n;left-=n;});if(left)fail('蚕茧不足。');}else cost[m[8]]=m[9];commit=()=>{pay(cost);for(let i=0;i<m[10];i++)give({item_id:a.material,count:1});};
  }else if(a.type==='pattern'){
   if(!s||s.researched||level(s.style,s.part)>=3)fail('这个样本不再提供版型知识。');ticks=6;stamina=0;energy=2;commit=()=>{const key=patternKey(s.style,s.part);k.patterns[key]=Math.min(3,(k.patterns[key]||0)+1);s.researched=true;s.known=Object.assign({},s.known,{structure:true,cut:true});set('sewing_knowledge',k);};
  }else if(a.type==='research'){
   let gains;if(s){safeDetach(r);gains=knowledgeGain(p);ticks=2*Object.keys(s.layers).length;warning='拆开后整个部件及其中材料都会被消耗。';}else if(p&&materials[p.item_id]){gains={[p.item_id]:10};stamina=0;warning='这份面料或填充会被消耗。';}else fail('只能研究完成的部件、面料或填充。');energy=2;
   if(!Object.entries(gains).some(([id,n])=>n>0&&(k.materials[id]||0)<materials[id][7]))fail('这些材料工艺已经掌握，无需消耗样本。');commit=()=>{takeRecord(r);Object.entries(gains).forEach(([id,n])=>k.materials[id]=Math.min(materials[id][7],(k.materials[id]||0)+n));set('sewing_knowledge',k);};
  }else if(a.type==='soak'){
   if(!s||s.soak)fail('每个部件只能浸泡一次。');if(!flag('sewing_bucket_unlocked'))fail('先装配浸泡桶。');const leaves=/^arm_/.test(s.part)?1:2;ticks=leaves*2;if((flag('sewing_bucket_stock')||0)<leaves)fail('桶内硅叶不足。');cost={silica_leaf:leaves};commit=()=>{set('sewing_bucket_stock',flag('sewing_bucket_stock')-leaves);s.soak={shield:roll(),defense:roll()};s.known=Object.assign({},s.known,{soak:true});};
  }else if(a.type==='modify'){
   if(!s||level(s.style,s.part)<1)fail('研究版型后才能改造。');validatePlan(s.style,s.part,a.plan);if(a.layer&&!layersFor(s.style,s.part).includes(a.layer))fail('结构中没有这个层次。');if(!a.layer&&!flag('sewing_mannequin_dimensions'))fail('人台尚未定尺寸。');if(!['male','female'].includes(a.cut))fail('请选择剪裁。');
   cost=costs(s.style,s.part,a.plan,a.layer);ticks=[3,3,2,2,4,4][parts.indexOf(s.part)]*(a.layer?1:Object.keys(a.plan).length);warning=a.layer?'原有这一层材料将废弃。':'重新支付全部用料，原材料废弃；研究及浸泡记录保留。';commit=()=>{pay(cost);Object.keys(a.plan).filter(x=>!a.layer||x===a.layer).forEach(x=>s.layers[x]=Object.assign(copy(a.plan[x]),{defense:roll(),thermal:roll()}));if(!a.layer){s.size=dimensions(flag('sewing_mannequin_dimensions'));s.cut=a.cut;}if(a.layer){s.known=Object.assign({},s.known,{layerKeys:Object.assign({},s.known&&s.known.layerKeys,{[a.layer]:true})});}else{s.known=Object.assign({},s.known,{structure:true,cut:true,layers:true,size:true,performance:true});}};
  }else if(a.type==='detach'){
   if(!s||!r.parent)fail('请选择衣服中的部件。');safeDetach(r);commit=()=>give(takeRecord(r));
  }else if(a.type==='assemble_created'){
   if(!job||job.created.length!==6)fail('请先完成六个部件。');ticks=6;
   commit=()=>{const pos=g.GameEngine.getState(),ps=job.created.map(id=>{const r=record(id);if(r)return takeRecord(r);const ground=IE().getGroundItemsAt(pos.mapId,pos.x,pos.y),index=ground.findIndex(p=>p.instance_id===id);if(index<0)fail('已完成部件被移走，请手动组装。');return IE().removeItemFromGround(pos.mapId,pos.x,pos.y,index);});give(makeOutfit(ps));};
  }else if(a.type==='assemble'){
   if(!s||r.parent)fail('请选择独立部件。');const dest=a.target?requireRecord(a.target):null;if(dest&&(!dest.item.sewing_parts||dest.parent))fail('请选择衣服。');if(dest&&dest.item.sewing_parts[s.part])fail('请先拆下该部位原件。');if(dest)safeDetach(dest,s.part);commit=()=>{const child=takeRecord(r);if(dest){dest.item.sewing_parts[s.part]=child;refreshOutfit(dest.item);}else give(makeOutfit([child]));};
  }else fail('未知操作。');
  if(a.type!=='soak')enough(cost);return {ticks,energy,stamina,cost,warning,commit};
 }
 function preview(a){try{const q=quote(a);delete q.commit;return Object.assign({ok:true},q);}catch(e){return {ok:false,message:e.message};}}
 function estimate(a){
  try{
   if(!['craft','modify'].includes(a.type))return null;
   const existing=a.id?requireRecord(a.id).item:null;
   if(existing&&level(existing.sewing.style,existing.sewing.part)<1)return null;
   if(existing&&a.layer&&!existing.sewing.known?.layers)return null;
   const style=existing?existing.sewing.style:a.style,part=existing?existing.sewing.part:a.part;
   validatePlan(style,part,a.plan);
   const values=[.8,1.2].map(coef=>{
    const layers=existing?copy(existing.sewing.layers):copy(a.plan);
    Object.keys(a.plan).filter(k=>!a.layer||k===a.layer).forEach(k=>layers[k]=Object.assign(copy(a.plan[k]),{defense:coef,thermal:coef}));
    return stats({sewing:{style,part,layers,soak:existing&&existing.sewing.soak}});
   });return {cold:values.map(v=>v.cold).sort((a,b)=>a-b),heat:values.map(v=>v.heat).sort((a,b)=>a-b),weight:values[0].weight,pockets:values[0].pockets,base:values.map(v=>v.base)};
  }catch(e){return null;}
 }
 function start(actions){try{if(job)fail('请先完成或停止当前工作。');if(!Array.isArray(actions)||!actions.length||actions.length>100)fail('操作数量不合法。');const first=copy(actions[0]);quote(first);job={actions:copy(actions),index:0,elapsed:0,created:[]};return {ok:true,message:'开始操作。'};}catch(e){return {ok:false,message:e.message};}}
 function step(){try{if(!job)fail('当前没有工作。');const a=job.actions[job.index],q=quote(a),S=g.Survival;if(S.getStamina()<(S.getActionStaminaCost?S.getActionStaminaCost(q.stamina):q.stamina)||S.getEnergy()<q.energy)fail('体力或精力不足，已停止。');if(q.stamina)S.consumeStamina(q.stamina);if(q.energy)S.consumeEnergy(q.energy);S.advanceTick({source:'sewing'});job.elapsed++;
   if(job.elapsed>=q.ticks){transaction(()=>quote(a).commit());job.index++;job.elapsed=0;if(job.index>=job.actions.length){job=null;return {ok:true,done:true,message:['craft','process','assemble','assemble_created','detach'].includes(a.type)?'工作完成，产物已收入物品栏；装不下的放在脚边。':'操作完成，结果已保存。'};}}else save();return {ok:true,message:'正在操作'};
  }catch(e){job=null;return {ok:false,message:e.message};}}
 function cancel(){job=null;return {ok:true,message:'已停止。完成的成果保留，当前未完成的材料没有扣除。'};}
 function jobState(){if(!job)return null;const q=preview(job.actions[job.index]);return {index:job.index,total:job.actions.length,remaining:Math.max(0,(q.ticks||1)-job.elapsed)*10};}
 function itemName(x){const t=IE().getItemTemplate(x.item_id);if(x.sewing&&!(x.sewing.known||{}).structure)return t&&t.placeholder_name||'衣服部件';if(x.sewing_parts&&Object.values(x.sewing_parts).some(p=>!(p.sewing.known||{}).structure))return '尚未检查的衣服';const base=name(x.item_id);return x.sewing_parts&&Object.keys(x.sewing_parts).length<6?'不完整的'+base:base;}
 function describe(x){const s=x.sewing;if(!s)return x.sewing_parts?Object.values(x.sewing_parts).map(p=>describe(p)).join('\n') : IE().getDisplayDesc(IE().getItemTemplate(x.item_id),0,IE().getCharacterForDisplay());const known=s.known||{},text=[known.structure?styles[s.style].name+' · '+labels[parts.indexOf(s.part)]:'尚未检查结构的衣服部件'];if(known.cut)text.push(s.cut==='male'?'男装剪裁':'女装剪裁');if(known.size)text.push(fit(x).label);if(known.layers||known.outer||known.layerKeys)Object.entries(s.layers).filter(([key])=>known.layers||known.layerKeys&&known.layerKeys[key]||known.outer&&key==='outer').forEach(([key,l])=>text.push(({outer:'面料',liner:'内衬',fill:'填充'})[key]+'：'+Object.entries(l.mix).map(([id,v])=>name(id)+(Object.keys(l.mix).length>1?' '+v+'%':'')).join(' / ')));if(known.soak&&s.soak){const a=stats(x);text.push('已硅叶处理，不可重复浸泡');text.push('全局盾量贡献 '+Math.floor(a.shield)+'；硅叶减伤 '+a.silica.map(n=>Math.round(n*100)+'%').join(' / '));}if(known.performance){const a=stats(x);text.push('耐寒 '+a.cold.toFixed(1)+'℃ / 耐热 '+a.heat.toFixed(1)+'℃');text.push('天然减伤（劈砍／穿刺／钝击） '+a.base.map(n=>Math.round(n*100)+'%').join(' / '));}return text.join('\n');}
 // Generation contract for future loot designers: deliberately does not register drops.
 function generate(options){options=options||{};const keys=Object.keys(styles),chosen=options.style||keys[Math.floor(Math.random()*keys.length)],mixed=options.mixed===true;const ps=parts.map((p,i)=>{const sty=mixed?(i===0?chosen:i===1?keys[(keys.indexOf(chosen)+1)%3]:keys[Math.floor(Math.random()*3)]):chosen;const plan=defaultPlan(sty,p);Object.entries(plan).forEach(([key,l])=>{const ids=Object.keys(materials).filter(id=>id.startsWith('filling_')===(key==='fill'));l.mix={[ids[Math.floor(Math.random()*ids.length)]]:100};l.thickness=key==='liner'?'standard':(sty==='winter'?['standard','thick']:['thin','standard'])[Math.floor(Math.random()*2)];});const x=makePart(sty,p,plan,{height_cm:150+Math.floor(Math.random()*46),weight_kg:45+Math.floor(Math.random()*56)},Math.random()<.5?'male':'female');x.sewing.known={};return x;});return makeOutfit(ps);}
 g.SewingSystem={parts,labels,styles,materials,thickness,knowledge,level,body,layersFor,defaultPlan,costs,makePart,makeOutfit,birthOutfit,generate,fit,stats,outfitStats,worn,reduce,owned,record,name,itemName,describe,preview,estimate,start,step,cancel,jobState,measureAtTools};
})(window);
