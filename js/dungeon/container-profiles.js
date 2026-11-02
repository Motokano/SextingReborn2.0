/* SPDX-License-Identifier: GPL-3.0-only
 * Assign container art after the floor's occupied squares are validated.
 * Placement preferences are independent of item eligibility and loot counts.
 */
(()=>{'use strict';
const groups={
 food:{name:'饮食储物',primary:['food'],related:['household'],ids:['reused-fridge-v1','repaired-cooler-v1','rice-cooker-cache-v1','pressure-pot-cache-v1','vending-machine-cupboard-v1','milk-churn-storage-v1']},
 personal:{name:'私人物资',primary:['personal'],related:['household'],ids:['lost-backpack-v1','patched-suitcase-v1','factory-locker-cache-v1','motorcycle-topbox-cache-v1']},
 tools:{name:'工具器材',primary:['repair'],related:['electronics'],ids:['discarded-toolbox-v1','computer-tower-cabinet-v1','aluminum-flight-case-v1','cable-spool-shelf-v1']},
 storage:{name:'通用仓储',primary:['household'],related:['materials'],ids:['abandoned-chest-v1','damaged-barrel-v1','reused-plastic-drum-v1','stacked-plastic-crates-v1','sideways-oil-drum-cabinet-v1','patched-bulk-sack-v1','collapsed-shelf-v1']},
 freight:{name:'搬运货物',primary:['materials'],related:['household'],ids:['overturned-cart-v1','abandoned-cargo-v1','salvaged-shopping-cart-v1','wire-cage-trolley-v1']},
 salvage:{name:'改装藏物',primary:['misc'],related:['household','materials'],ids:['reused-washer-drum-v1','wheelie-bin-cache-v1','postbox-cache-v1','pram-cargo-basket-v1','tire-storage-basket-v1','marine-buoy-cache-v1']}
};
const categories=['food','household','personal','repair','electronics','materials','medical','misc'];
const category=id=>id==='canteen-food-crate-v1'?'food':Object.keys(groups).find(k=>groups[k].ids.includes(id));
// These broad mobile piles remain outdoors; every retained indoor asset still
// uses its approved single-square scale and searched-state anchor.
const outdoorsOnly=new Set(['overturned-cart-v1','abandoned-cargo-v1','collapsed-shelf-v1','salvaged-shopping-cart-v1','wheelie-bin-cache-v1','pram-cargo-basket-v1']);
const clinicIds=new Set(['repaired-cooler-v1','aluminum-flight-case-v1','factory-locker-cache-v1','reused-fridge-v1']);
function context(map,p){
 const room=map.rooms.find(r=>r.id===p.roomId),theme=room?.outpostType;
 return room?{theme:['canteen','workshop','clinic','loot','recovery'].includes(theme)?theme:'residential',indoors:true}: {theme:map.woodland?.forest[p.cell]?'woodland':'street',indoors:false};
}
function draw(list,weight,rng){const sum=list.reduce((n,p)=>n+weight(p),0);if(!(sum>0))return null;let roll=rng()*sum;for(const p of list){roll-=weight(p);if(roll<0)return p;}return list.at(-1);}
function weights(profile,theme,cfg){
 const use=profile==='medical'?{primary:['medical'],related:['household','electronics']}:groups[profile];
 const boosts=cfg.themeBoosts[theme]||{};
 return Object.fromEntries(categories.map(k=>[k,(use.primary.includes(k)?cfg.content.primary:use.related.includes(k)?cfg.content.related:cfg.content.other)*(boosts[k]??1)]));
}
function assign(map){
 const cfg=map.contentConfig?.containers;if(!cfg?.enabled)return map;
 const R=RuinsSettlement,catalog=RuinsLootCatalog;
 if(catalog.some(a=>!category(a.id)))throw Error('容器未登记分类');
 const jobs=map.lootPoints.map(p=>({p,...context(map,p)}));
 const priority=job=>job.theme==='clinic'?0:job.theme==='canteen'?1:job.theme==='workshop'?2:job.indoors?3:4;
 jobs.sort((a,b)=>priority(a)-priority(b)||R.hash(map.seed+'-container-order-'+a.p.uid)-R.hash(map.seed+'-container-order-'+b.p.uid)||a.p.uid.localeCompare(b.p.uid));
 const used=new Set(),plan=[];
 for(const job of jobs){
  if(job.p.foodCrate){plan.push({...job,asset:{id:'canteen-food-crate-v1',name:'食材筐'}});continue;}
  const {p,theme,indoors}=job,rng=RuinsContainerSearch.random(map.seed+'|'+map.floor+'|container-v1|'+p.uid+'|'+p.cell),rates=cfg.placement[theme];
  const available=catalog.filter(a=>!used.has(a.id)&&(!indoors||!outdoorsOnly.has(a.id))&&(theme!=='clinic'||clinicIds.has(a.id)));
  const types=Object.keys(groups).filter(k=>rates[k]>0&&available.some(a=>category(a.id)===k));
  const kind=draw(types,k=>rates[k],rng);
  // Do not silently violate a zero weight or duplicate an exhausted art type.
  // No point is mutated until the complete assignment is available.
  if(!kind)throw Error('容器投放配置无法满足不重复与室内尺寸条件：'+theme);
  const candidates=available.filter(a=>category(a.id)===kind),chosen=draw(candidates,()=>1,rng);used.add(chosen.id);plan.push({...job,asset:chosen});
 }
 for(const {p,theme,asset}of plan){
  const group=category(asset.id),usage=theme==='clinic'?'medical':group;
  Object.assign(p,{assetId:asset.id,name:asset.name,containerCategory:group,containerUse:usage,containerTheme:theme,contentWeights:weights(usage,theme,cfg)});
 }
 map.containerDistribution=Object.fromEntries(Object.keys(groups).map(k=>[k,map.lootPoints.filter(p=>p.containerCategory===k).length]));
 map.mixedSignature+=':containers-v1:'+R.hash(JSON.stringify(map.lootPoints.map(p=>[p.uid,p.cell,p.assetId,p.containerUse,p.containerTheme,p.contentWeights])));
 return map;
}
// Reserved for the real finite inventory. It cannot admit an unconfirmed item.
// The current preview item table and finite-stock implementation remain separate.
function itemWeight(p,itemCategory,remaining,{eligible=false}={}){
 if(!eligible||!Number.isFinite(remaining)||remaining<=0)return 0;
 return remaining*(p.contentWeights?.[itemCategory]??0);
}
globalThis.RuinsContainerProfiles={groups,categories,category,context,weights,assign,itemWeight,outdoorsOnly,clinicIds};
})();
