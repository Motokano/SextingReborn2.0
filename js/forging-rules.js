/* Pure forging calculations. Knowledge controls presentation, never material outcomes. */
(function(g){
 'use strict';
 const axes=['hardness','toughness','deformationResistance','density'];
 const round=n=>Math.round((n+Number.EPSILON)*100)/100;
 const cfg=()=>g.ForgingConfig;
 function material(part,recipe){
  const totals=Object.fromEntries(axes.map(a=>[a,0]));let count=0;
  for(const [feed,n] of Object.entries(recipe||{})){
   const route=cfg().bindings.feedRoutes[feed];
   if(!route||!Number.isSafeInteger(n)||n<=0)throw Error('请选择整份的铸造用料。');
   count+=n;for(const a of axes)totals[a]+=cfg().ores[route.rawItemId].scores[a]*n;
  }
  if(count<1||count>part.capacity)throw Error('投料超出部件容量。');
  const ratios=Object.fromEntries(axes.map(a=>[a,totals[a]/part.requirements[a]]));
  const {hardness:h,toughness:t,deformationResistance:a,density:d}=ratios;
  const change=Math.sign(totals.density-part.requirements.density)*Math.floor((Math.abs(totals.density-part.requirements.density)*100+1e-9)/(part.requirements.density*15));
  return {totals,ratios,count,eligible:axes.every(a=>totals[a]*10>=part.requirements[a]*3),
   power:Math.min(1.5,1-.8*Math.max(1-h,0)+.5*Math.max(h-1,0)+.2*(d-1)),
   durability:Math.min(1.5,.3+.5*t+.2*d),loss:Math.max(.5,1.7-.5*a-.2*d),
   weight:part.baseline.weightKg*d,strength:Math.max(10,part.baseline.innateStrength+change)};
 }
 function traitCandidates(part,recipe){
  const quantities={};for(const [id,n] of Object.entries(recipe))quantities[cfg().bindings.feedRoutes[id].rawItemId]=n;
  if(Object.keys(quantities).length===1){const id=Object.keys(quantities)[0],t=cfg().ores[id].trait;return {positive:true,choices:[{id:t.id,name:t.name,stat:t.stat,value:t.fullStrength*quantities[id]/part.capacity,sourceOres:[id],kind:'intrinsic'}]};}
  const positive=cfg().combinations.positive.filter(t=>{const triple=t.ores.length===3;return t.ores.every(id=>(quantities[id]||0)*100>=part.capacity*(triple?20:25))&&t.ores.reduce((s,id)=>s+(quantities[id]||0),0)*100>=part.capacity*(triple?90:75);});
  if(positive.length)return {positive:true,choices:positive.map(t=>({...t,value:t.value*t.ores.reduce((s,id)=>s+quantities[id],0)/part.capacity,sourceOres:t.ores,kind:'combination'}))};
  return {positive:false,choices:cfg().combinations.negative.filter(t=>t.eligible==='all'||part.positions.some(p=>p.blockEligible)).map(t=>({...t,sourceOres:Object.keys(quantities),kind:'negative'}))};
 }
 function result(part,recipe,completion,roll){
  const m=material(part,recipe);if(!m.eligible)throw Error('材料尚不能成形。');
  const q=Math.max(0,Math.min(1,completion/100)),craft=.25+.75*q,c=traitCandidates(part,recipe);
  const trait=c.positive&&q<1?null:c.choices[Math.min(c.choices.length-1,Math.floor(roll*c.choices.length))];
  // Max durability defects belong to the finished item, and are applied once here.
  const max=round(part.baseline.durabilityMax*m.durability*craft*(trait?.stat==='component_max_durability_reduction'?1-trait.value:1));
  return {version:1,design_id:part.designId,recipe:{...recipe},completion:q*100,
   final_weight_kg:m.weight,final_innate_strength:m.strength,
   final_position_powers:part.positions.map(p=>({...p,power:round(p.basePower*m.power*craft)})),
   durability_max:max,durability_current:max,durability_max_units:Math.round(max*100),durability_units:Math.round(max*100),
   contact_loss:{ordinary:round(part.baseline.ordinaryContactLoss*m.loss*(2-q)),blocked:round(part.baseline.blockedContactLoss*m.loss*(2-q))},
   ore_trait:trait||null,zero_durability_result:null};
 }
 function repair(component,level){
  const max=Math.round(component.durability_max*100),cur=Math.round(component.durability_current*100);
  const target=Math.round(max*(Math.max(1,Math.min(100,level))+98)/198),delta=(target-cur)/100;
  return {target:target/100,delta,ticks:Math.ceil(delta/10),baseStamina:delta*.2,xp:delta*.1};
 }
 function coverage(host){
  const positions={},parts=[],errors=[];
  for(const [anchor,connection] of Object.entries(host.connections||{})){
   const item=connection.part,b=item&&cfg().components[item.item_id],placement=b?.placements.find(p=>p.anchor===anchor);
   if(!placement||!item.forged_component){errors.push('invalid_component');continue;}
   parts.push(item);
   for(const slot of placement.occupies){if(positions[slot])errors.push('overlap');positions[slot]={item,anchor,position:b.positions.find(p=>p.slot===slot||p.slot==='side')};}
  }
  const missing=['front','side1','side2','hilt'].filter(s=>!positions[s]);
  return {positions,parts,missing,errors,complete:!errors.length&&!missing.length,
   strength:Math.max(10,...parts.map(p=>p.forged_component.final_innate_strength)),
   weight:parts.reduce((s,p)=>s+p.forged_component.final_weight_kg,0),
   speed:parts.reduce((s,p)=>s+cfg().components[p.item_id].baseline.speedPercent,0)};
 }
 g.ForgingRules={axes,round,material,traitCandidates,result,repair,coverage};
})(window);
