// Local, disposable workshop prototype. Does not read or write the game save.
export function createWorkshop(data, createForge) {
 const axes=['hardness','toughness','deformationResistance','density'];
 const ores=new Map(data.ores.map(x=>[x.id,x])),parts=new Map(data.components.map(x=>[x.id,x]));
 const round=n=>Math.round((n+Number.EPSILON)*100)/100;
 const state={view:'prepare',componentId:'B01',selectedOre:'ore_iron_raw',recipe:{},inventory:{},items:[],assembly:{front:null,side1:null,side2:null,hilt:null},strength:20,session:null,serial:0,log:[]};
 for(const ore of data.ores){const known=ore.id==='ore_iron_raw';state.inventory[ore.id]={raw:6,feed:known?18:0,identified:known,assayed:known,traitKnown:known};}
 const note=text=>{state.log.unshift(text);state.log=state.log.slice(0,30);return {ok:true,message:text};};
 const fail=message=>({ok:false,message});
 const inventory=id=>state.inventory[id];
 const oreName=id=>inventory(id).identified?ores.get(id).displayName:ores.get(id).rawItem.identity.placeholder_name;
 const component=()=>parts.get(state.componentId);
 const active=()=>!!state.session&&!state.session.finished;
 const count=()=>Object.values(state.recipe).reduce((s,n)=>s+n,0);
 const feedList=(recipe=state.recipe)=>Object.entries(recipe).filter(([,n])=>n>0).map(([id,count])=>({id,count}));
 const fullyKnown=(recipe=state.recipe)=>feedList(recipe).every(f=>inventory(f.id).assayed);
 function material(part,recipe){
  const totals=Object.fromEntries(axes.map(a=>[a,feedList(recipe).reduce((s,f)=>s+ores.get(f.id).scores[a]*f.count,0)]));
  const ratios=Object.fromEntries(axes.map(a=>[a,totals[a]/part.requirements[a]]));
  const {hardness:h,toughness:t,deformationResistance:a,density:d}=ratios;
  const powerFactor=Math.min(1.5,1-.8*Math.max(1-h,0)+.5*Math.max(h-1,0)+.2*(d-1));
  const durabilityFactor=Math.min(1.5,.3+.5*t+.2*d),lossFactor=Math.max(.5,1.7-.5*a-.2*d);
  // Integer score differences keep exact 15% boundaries stable.
  const densityDelta=totals.density-part.requirements.density;
  const change=Math.sign(densityDelta)*Math.floor((Math.abs(densityDelta)*100+1e-9)/(part.requirements.density*15));
  return {totals,ratios,powerFactor,durabilityFactor,lossFactor,weight:part.weight*d,strength:Math.max(10,part.strength+change),eligible:axes.every(a=>totals[a]*10>=part.requirements[a]*3)};
 }
 function changeComponent(id){
  if(active())return fail('本炉仍在加工，请先收工。');
  if(!parts.has(id))return fail('没有这张图纸。');
  state.componentId=id;state.recipe={};state.session=null;state.view='prepare';return note('已选 '+component().name+'。');
 }
 function identify(id){
  const inv=inventory(id);if(!inv)return fail('没有这个样本。');
  if(active())return fail('请先收工，再回备料间。');
  if(inv.identified)return fail('已经辨认过这个样本。');
  inv.identified=true;return note('你辨认出'+oreName(id)+'，确认了它可以加工成铸造用料。');
 }
 function process(id){
  const inv=inventory(id);if(active())return fail('请先收工。');
  if(!inv?.identified)return fail('先观察辨认这份实物。');
  if(inv.raw<1)return fail('这份原矿已经用完。');
  inv.raw--;inv.feed+=4;return note(oreName(id)+'：加工1块原矿，得到4份用料。');
 }
 function assay(id,kind){
  const inv=inventory(id);if(active())return fail('请先收工。');
  if(!inv?.identified)return fail('先观察辨认这份实物。');
  if(!['axes','trait'].includes(kind))return fail('请选择试验。');
  const key=kind==='axes'?'assayed':'traitKnown';if(inv[key])return fail('这项试验已经完成，无需重复耗料。');
  if(inv.feed<1)return fail('需要1份加工料，请先加工原矿。');
  inv.feed--;inv[key]=true;trimRecipe(id);
  return note(oreName(id)+(kind==='axes'?'：消耗1份加工料，亲手测得四项材性。':'：消耗1份加工料，试条验证了「'+ores.get(id).trait.name+'」的作用。'));
 }
 function trimRecipe(id){if((state.recipe[id]||0)>inventory(id).feed)state.recipe[id]=inventory(id).feed;}
 function setFeed(id,amount){
  if(active())return fail('这一炉用料已封存。');
  if(!inventory(id)?.identified)return fail('先辨认这份实物。');
  if(!Number.isInteger(amount)||amount<0)return fail('按整份投入材料。');
  if(amount>inventory(id).feed)return fail('加工料不足。');
  if(count()-(state.recipe[id]||0)+amount>component().capacity)return fail('已经达到这件部件的投料容量。');
  state.recipe[id]=amount;return {ok:true};
 }
 function fillIron(){
  if(active())return fail('请先收工。');
  const id='ore_iron_raw';state.recipe={[id]:Math.min(component().capacity,inventory(id).feed)};return note('已用铁料填入当前容量。');
 }
 function readiness(){
  if(active())return {ok:false,message:'本炉正在加工。'};
  if(!count())return {ok:false,message:'先为这件部件配料。'};
  if(!fullyKnown())return {ok:false,message:'先完成所选用料的材性试验，再核对成形条件。',needsAssay:true};
  if(count()>component().capacity||feedList().some(f=>f.count>inventory(f.id).feed))return {ok:false,message:'投料超出容量或库存。'};
  const m=material(component(),state.recipe),names={hardness:'硬度',toughness:'韧性',deformationResistance:'抗变形',density:'密度'};
  const missing=axes.filter(a=>m.totals[a]*10<component().requirements[a]*3);
  return {ok:!missing.length,message:missing.length?missing.map(a=>names[a]+'未达到30%').join('、')+'，调整配料后再开炉。':'四项已过成形线，可以开炉。',material:m};
 }
 function start(seed){
  const ready=readiness();if(!ready.ok)return fail(ready.message);
  if(!Number.isInteger(seed))seed=Math.floor(Math.random()*4294967296)>>>0;
  let rng=seed>>>0;const random=()=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng/4294967296;};
  const part=component(),forge=createForge(part.level),specials=forge.randomSpecials(random);
  const recipe={...state.recipe};for(const f of feedList(recipe))inventory(f.id).feed-=f.count;
  state.session={componentId:part.id,recipe,material:ready.material,seed,board:forge.create(specials,seed),history:[],finished:false,itemId:null};
  state.view='forge';return note(part.name+'已开炉，实际扣除'+count()+'份用料。');
 }
 const forge=()=>state.session?createForge(parts.get(state.session.componentId).level):null;
 function strike(action){
  if(!active())return fail('当前没有待加工的部件。');
  if(action.kind==='finish')return finish();
  const f=forge(),s=state.session,reason=f.reason(s.board,action);if(reason)return fail(reason);
  s.history.push({board:f.clone(s.board),action:{...action}});s.board=f.apply(s.board,action);return {ok:true};
 }
 function undo(){
  if(!active()||!state.session.history.length)return fail('没有可撤销的操作。');
  state.session.board=state.session.history.pop().board;return note('已撤销上一步，随机机会也恢复到当时的状态。');
 }
 function actualStats(part,m,q){
  const craft=.5+.5*q;
  return {powers:part.positions.map(p=>({...p,potential:round(p.basePower*m.powerFactor),actual:round(p.basePower*m.powerFactor*craft)})),maxDurability:round(part.durability*m.durabilityFactor*craft),potentialDurability:round(part.durability*m.durabilityFactor),lossFactor:m.lossFactor*(2-q),potentialLossFactor:m.lossFactor,weight:m.weight,strength:m.strength,speed:part.speed};
 }
 function finish(){
  if(!active())return fail('这一炉已经收工。');
  const s=state.session,f=forge(),part=parts.get(s.componentId),q=f.completion(s.board)/100;
  const item={id:'part-'+(++state.serial),componentId:part.id,recipe:{...s.recipe},completion:q,stars:f.stars(s.board),seed:s.seed,stats:actualStats(part,s.material,q),traits:q===1?feedList(s.recipe).map(x=>({oreId:x.id,traitId:ores.get(x.id).trait.id,share:x.count/part.capacity,value:ores.get(x.id).trait.fullStrength*x.count/part.capacity})):[]};
  item.durability=item.stats.maxDurability;state.items.push(item);s.finished=true;s.board=f.apply(s.board,{kind:'finish'});s.itemId=item.id;
  return {...note(part.name+'收工，完成度'+Math.round(q*100)+'%，已放入部件架。'),item};
 }
 function leaveFinished(){
  if(active())return fail('请先完成这一炉。');
  state.session=null;for(const id of Object.keys(state.recipe))trimRecipe(id);state.view='prepare';return {ok:true};
 }
 function displayTraits(item){return item.traits.filter(t=>inventory(t.oreId).traitKnown);}
 function slotsFor(part,slot){
  if(part.category==='M')return part.positions.map(p=>p.slot);
  if(['B','D'].includes(part.category))return ['side1','side2'].includes(slot)?[slot]:[];
  return part.category==='T'&&slot==='front'?['front']:part.category==='H'&&slot==='hilt'?['hilt']:[];
 }
 function equip(itemId,slot){
  if(!Object.hasOwn(state.assembly,slot))return fail('没有这个安装位置。');
  if(!itemId){const old=state.assembly[slot];for(const s of Object.keys(state.assembly))if(state.assembly[s]===old)state.assembly[s]=null;return {ok:true};}
  const item=state.items.find(x=>x.id===itemId);if(!item)return fail('部件不在架上。');
  const part=parts.get(item.componentId),slots=slotsFor(part,slot);if(!slots.includes(slot))return fail('这个部件不能安装在此处。');
  const conflicts=new Set(slots.map(s=>state.assembly[s]).filter(Boolean));conflicts.add(itemId);
  for(const s of Object.keys(state.assembly))if(conflicts.has(state.assembly[s]))state.assembly[s]=null;
  for(const s of slots)state.assembly[s]=itemId;return note('已装入'+part.name+'。');
 }
 function assembly(){
  const items=[...new Set(Object.values(state.assembly).filter(Boolean))].map(id=>state.items.find(x=>x.id===id));
  const complete=Object.values(state.assembly).every(Boolean),strength=Math.max(10,...items.map(i=>i.stats.strength));
  const usable=complete&&state.strength>=strength/2,factor=usable?Math.min(1,state.strength/strength):0;
  const speed=items.reduce((s,i)=>s+i.stats.speed+i.traits.filter(t=>t.oreId==='ore_titanium_raw').reduce((a,t)=>a+t.value,0),0);
  const speedKnown=items.every(i=>i.traits.every(t=>inventory(t.oreId).traitKnown));
  return {complete,usable,factor,strength,weight:items.reduce((s,i)=>s+i.stats.weight,0),speed,speedKnown,items,positions:Object.entries(state.assembly).map(([slot,id])=>{const item=items.find(i=>i.id===id);if(!item)return {slot};const p=item.stats.powers.find(p=>p.slot===slot)||item.stats.powers[0];return {slot,item,power:p.actual*factor,damageType:p.damageType};})};
 }
 function restock(){for(const inv of Object.values(state.inventory))inv.raw+=6;return note('试玩补给：每份实物样本补入6块原矿，已有认识保留。');}
 return {state,axes,ores,parts,component,inventory,oreName,count,feedList,fullyKnown,material,actualStats,active,identify,process,assay,setFeed,fillIron,changeComponent,readiness,start,forge,strike,undo,finish,leaveFinished,displayTraits,slotsFor,equip,assembly,restock};
}
