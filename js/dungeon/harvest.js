/* SPDX-License-Identifier: GPL-3.0-only */
(()=>{'use strict';
const config={tickMs:1500,skillMaxLevel:100,skillMaxReduction:.30,toolReduction:0,
 profiles:{food:{cost:0.6,uses:[6,10]},herb:{cost:0.6,uses:[3,5]},root:{cost:0.6,uses:[3,5]},salt:{cost:0.6,uses:[4,6]},clay:{cost:1,uses:[2,3]},ore:{cost:1,uses:[1,2]},shrub:{cost:0.6,uses:[3,5]},deadwood:{cost:0.6,uses:[3,5]},timber:{cost:1,uses:[2,3]},rare:{cost:0.6,uses:[1,3]}}};
// Only the materials already used by the ruins generator. This registry is NOT
// appended to the container/corpse random loot pool. Byproducts await balancing.
const entries=[
 ['red','wild_fruit_red','红火莓','fruit','food'],['purple','wild_fruit_purple','紫苏果','fruit','food'],['yellow','wild_fruit_yellow','黄肚柑','fruit','food'],
 ['grass','herb_green','青草尖','herb','food'],['leaf','herb_leaf_fresh','清香叶','herb','food'],['sweet','herb_sweet','甘花茎','herb','food'],
 ['bitter','herb_bitter','涩堇草','herb','herb'],['root','herb_root_bitter','苦根草','root','root'],['vine','herb_vine_red','赤花藤','herb','herb'],
 ['shiitake','herb_shiitake','香菇','mushroom','food'],['floral','herb_mushroom_floral','花菇','mushroom','rare'],
 ['chili','herb_chili_wild','野山椒','spice','food'],['plum','herb_sour_plum','酸梅','fruit','food'],['pecan','herb_pecan','山核桃','nut','food'],
 ['cocoon','textile_cocoon_wild','野蚕茧','cocoon','herb'],
 ...[['parsley','herb_parsley','平叶欧芹'],['thyme','herb_thyme','百里香'],['oregano','herb_oregano','牛至'],['rosemary','herb_rosemary','迷迭香'],['sage','herb_sage','鼠尾草'],['bay','herb_bay_leaf','月桂叶'],['dill','herb_dill','莳萝']].map(e=>[...e,'herb','food']),
 ['clay','ore_clay_raw','陶土','clay','clay'],['salt','ore_salt_rock','岩盐','salt','salt'],['limestone','ore_limestone','石灰石','stone','ore'],['copper','ore_copper_raw','粗铜矿石','ore','ore'],['iron','ore_iron_raw','铁质矿石','ore','ore'],
 ['bamboo','wood_bamboo_green','青竹杆','bamboo','timber'],['birch','wood_birch','桦木','wood','timber'],['oak','wood_oak','橡木','wood','timber'],['beech','wood_zelkova','榉木','wood','timber'],
 ['firewood','wood_firewood','柴火','wood','herb'],['shrub','wood_shrub_dry','干枯灌木','wood','shrub'],['deadwood','wood_firewood_dry','干木材','wood','deadwood']
];
const definitions=Object.fromEntries(entries.map(([id,itemId,name,icon,profile])=>[id,{id,itemId,name,icon,profile,key:'resource:'+itemId}]));
const items=Object.fromEntries(Object.values(definitions).map(d=>[d.key,{name:d.name,icon:d.icon,item_id:d.itemId,rarity:'common',qty:1}]));
const skill=p=>p.id==='firewood'?'gathering':({gather:'gathering',mine:'mining',wood:'logging'})[p.type];
const action=p=>({gathering:'采集',mining:'采矿',logging:'伐木'})[skill(p)];
function initialize(s){
 s.player.skills.gathering??=0;s.player.harvestProficiency??={gathering:0,mining:0,logging:0};s.harvestAction=null;s.harvestInterrupted=null;s.lastHarvest=null;
 s.harvestPoints=(s.map.resources||[]).map(n=>{
  const d=definitions[n.id];if(!d)throw Error('资源未配置：'+n.id);
  const c=config.profiles[d.profile],rng=RuinsContainerSearch.random(RuinsContainerSearch.identity(s.map)+'|harvest|'+n.uid+'|'+n.cell);
  const total=c.uses[0]+Math.floor(rng()*(c.uses[1]-c.uses[0]+1));
  return {...n,product:d.key,baseCost:c.cost,total,remaining:total,used:false};
 });
}
function accessible(s,p){return !s.ended&&!!p&&s.harvestPoints.includes(p)&&p.access.includes(s.player.cell)&&RuinsEncounter.lineOfSight(s,s.player.cell,p.cell);}
function threatened(s){const E=RuinsEncounter;return s.enemies.some(e=>E.sees(s,s.player,e.cell))||E.perception(s).known.some(Boolean)||s.enemies.some(e=>e.state==='chase'||e.state==='search');}
// Intermediate levels use a configurable linear preview curve; rounding and
// tool stacking are not formal balance decisions. Defaults preview no tool.
function cost(s,p){const level=Math.max(0,Math.min(config.skillMaxLevel,Number(s.player.skills[skill(p)])||0));const tool=Math.max(0,Math.min(1,Number(s.player.harvestToolReduction?.[skill(p)]??config.toolReduction)||0));return Math.round(config.profiles[definitions[p.id].profile].cost*(1-config.skillMaxReduction*level/config.skillMaxLevel)*(1-tool)*(s.actionCostMultiplier??1)*100)/100;}
function reason(s,p){
 if(!accessible(s,p))return'无法采收';if(!p.remaining)return'已采尽';if(threatened(s))return'遭遇敌人';
 if(s.player.vitals?.satiety<=0)return'饥饿';if(s.bag.length>=RuinsContainerSearch.config.capacity)return'背包已满';
 const fee=cost(s,p);if(!Number.isFinite(fee)||fee<0||!Number.isFinite(s.player.stamina)||s.player.stamina<fee)return'体力不足';return'';
}
function cancel(s,why='paused'){s.harvestAction=null;s.harvestInterrupted=why;}
function begin(s,uid){const p=s.harvestPoints.find(p=>p.uid===uid);if(reason(s,p))return false;s.harvestInterrupted=null;s.harvestAction={uid,cell:s.player.cell,tick:s.tick};return true;}
function ready(s,uid){const a=s.harvestAction,p=s.harvestPoints.find(p=>p.uid===uid);return !!a&&a.uid===uid&&a.cell===s.player.cell&&a.tick===s.tick&&!reason(s,p);}
function complete(s,uid){const p=s.harvestPoints.find(p=>p.uid===uid),a=s.harvestAction;
 if(!a||a.uid!==uid||a.cell!==s.player.cell||a.tick+1!==s.tick||reason(s,p)){cancel(s,'interrupted');return false;}
 const before=s.player.stamina,fee=cost(s,p),index=p.total-p.remaining;
 s.player.stamina=Math.round((before-fee)*100)/100;p.remaining--;p.used=p.remaining===0;
 s.bag.push({key:p.product,qty:1,source:'harvest:'+uid,index});
 s.player.harvestProficiency[skill(p)]=(s.player.harvestProficiency[skill(p)]||0)+1;
 s.lastHarvest={uid,product:p.product,before,after:s.player.stamina,cost:fee,remaining:p.remaining,tick:s.tick};
 s.harvestAction=null;globalThis.RuinsExpedition?.record(s,'point','harvest:'+uid);return true;
}
function snapshot(s){return{version:1,points:(s.harvestPoints||[]).map(p=>({uid:p.uid,id:p.id,cell:p.cell,baseCost:p.baseCost,total:p.total,remaining:p.remaining})),last:s.lastHarvest,proficiency:s.player.harvestProficiency};}
function restore(s,data){
 s.player.skills.gathering??=0;s.player.harvestProficiency??={gathering:0,mining:0,logging:0};cancel(s);
 if(data?.version!==1)return false;
 for(const p of s.harvestPoints){const q=data.points?.find(q=>q.uid===p.uid&&q.id===p.id&&q.cell===p.cell);if(!q||!Number.isSafeInteger(q.total)||q.total<1||!Number.isSafeInteger(q.remaining)||q.remaining<0||q.remaining>q.total||!Number.isFinite(q.baseCost)||q.baseCost<=0)continue;Object.assign(p,{total:q.total,remaining:q.remaining,baseCost:q.baseCost,used:q.remaining===0});}
 s.player.skills.gathering??=0;s.player.harvestProficiency??={gathering:0,mining:0,logging:0};
 for(const k of ['gathering','mining','logging'])if(Number.isSafeInteger(data.proficiency?.[k])&&data.proficiency[k]>=0)s.player.harvestProficiency[k]=data.proficiency[k];
 s.lastHarvest=data.last&&s.harvestPoints.some(p=>p.uid===data.last.uid)?structuredClone(data.last):null;cancel(s);return true;
}
globalThis.RuinsHarvest={config,definitions,items,skill,action,initialize,accessible,threatened,cost,reason,begin,ready,complete,cancel,snapshot,restore};
})();
