/* SPDX-License-Identifier: GPL-3.0-only */
(()=>{'use strict';
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};

// Edit these defaults for new expeditions. Tickets supply resolved per-run overrides.
const legacyV2=freeze({
 version:2,
 rooms:{emptyChance:.20,doorlessChance:.35},
 resourceRooms:{minRatio:.10,maxRatio:.20},
 insight:{chance:.05,weights:{desk:1,stump:1},rewards:{desk:500,stump:1000}}
});
const legacyV3=freeze({...structuredClone(legacyV2),version:3,outposts:{
 enabled:true,minCount:1,maxCount:2,minArea:49,maxArea:104,targetArea:72,
 largeArea:70,lootEnemies:3,largeEnemies:4,restEnemies:3,minRestEnemies:2,
 lootPoints:2,largeLootPoints:3,restChance:.3,reserveEnemies:2,
 entrySteps:3,pointDoorBuffer:3,minEnemySpacing:2,maxEnemySpacing:6,
 pointSpacing:2,pointClusterRadius:5,freeRatio:.6,pointAccess:2,layoutAttempts:1800
}});
const legacyV4=freeze({...structuredClone(legacyV3),version:4,outpostDecor:{
 enabled:true,minFurniture:3,maxFurniture:5,minMats:1,maxMats:2,
 cellsPerFurniture:18,wallBand:1,doorBuffer:3,pointBuffer:2,enemyBuffer:2,
 groupRadius:3,groupSpacing:4,groupSize:3,
 floor:{enabled:true,textureSpan:4,largeArea:70,accentRatio:.28,weights:{timber:1,concrete:1,industrial:1}}
}});
const legacyV5=freeze({...structuredClone(legacyV4),version:5,outpostDecor:{
 ...structuredClone(legacyV4.outpostDecor),
 barriers:{enabled:true,piles:true,minGroups:1,maxGroups:3,largeArea:70,minLength:2,maxLength:4,wallClearance:1,groupSpacing:3,doorBuffer:4,enemyBuffer:1}
}});
const legacyV6=freeze({...structuredClone(legacyV5),version:6,outpostDecor:{
 ...structuredClone(legacyV5.outpostDecor),
 partitions:{enabled:true,maxBands:2,gapWidth:2,maxGapWidth:4,doorBuffer:3,minCells:4,maxBlockedRatio:.32,minExtraSteps:3,minRouteRatio:1.3}
}});
const legacyV7=freeze({...structuredClone(legacyV6),version:7,workshop:{
 enabled:true,chance:.45,maxPerFloor:1,minArea:64,maxArea:104,minEnemies:3,maxEnemies:4,
 largeArea:80,lootPoints:2,aisleWidth:2,doorBuffer:3,layoutAttempts:1800
}});
const legacyV8=freeze({...structuredClone(legacyV7),version:8,workshop:{...structuredClone(legacyV7.workshop),terrain:{enabled:true,minBands:2,maxBands:2,gapWidth:2,maxGapWidth:3,minBandCells:4,maxBlockedRatio:.32,minExtraSteps:3,minRouteRatio:1.35,maxCoreCandidates:18,maxPlans:24}}});
const legacyV9=freeze({...structuredClone(legacyV8),version:9,clinic:{enabled:true,chance:.45,maxPerFloor:1,minArea:70,maxArea:100,minEnemies:3,maxEnemies:4,largeArea:84,doorBuffer:3,freeRatio:.6,maxBlockedRatio:.30,maxCandidates:90,layoutAttempts:1600}});

const legacyV10=freeze({...structuredClone(legacyV9),version:10,canteen:{enabled:true,chance:.55,maxPerFloor:1,minArea:80,maxArea:100,minEnemies:3,maxEnemies:4,largeArea:90,minLoot:1,maxLoot:2,foodPoints:2,tableDoorBuffer:2,doorBuffer:3,freeRatio:.6,maxBlockedRatio:.32,minExtraSteps:2,maxCandidates:80,layoutAttempts:2400}});

const legacyV11=freeze({...structuredClone(legacyV10),version:11,containers:{
 "enabled": true,
 "content": {
  "primary": 3,
  "related": 2,
  "other": 1,
  "forbidden": 0
 },
 "placement": {
  "canteen": {
   "food": 6,
   "personal": 0,
   "tools": 0,
   "storage": 2,
   "freight": 0,
   "salvage": 0
  },
  "workshop": {
   "food": 0,
   "personal": 1,
   "tools": 6,
   "storage": 3,
   "freight": 0,
   "salvage": 1
  },
  "clinic": {
   "food": 3,
   "personal": 2,
   "tools": 3,
   "storage": 0,
   "freight": 0,
   "salvage": 0
  },
  "loot": {
   "food": 1,
   "personal": 2,
   "tools": 2,
   "storage": 5,
   "freight": 1,
   "salvage": 1
  },
  "recovery": {
   "food": 2,
   "personal": 3,
   "tools": 1,
   "storage": 3,
   "freight": 0,
   "salvage": 1
  },
  "residential": {
   "food": 2,
   "personal": 4,
   "tools": 1,
   "storage": 3,
   "freight": 0,
   "salvage": 1
  },
  "street": {
   "food": 1,
   "personal": 2,
   "tools": 1,
   "storage": 4,
   "freight": 4,
   "salvage": 3
  },
  "woodland": {
   "food": 1,
   "personal": 3,
   "tools": 1,
   "storage": 2,
   "freight": 1,
   "salvage": 4
  }
 },
 "themeBoosts": {
  "canteen": {
   "food": 2,
   "household": 1,
   "personal": 1,
   "repair": 1,
   "electronics": 1,
   "materials": 1,
   "medical": 1,
   "misc": 1
  },
  "workshop": {
   "food": 1,
   "household": 1,
   "personal": 1,
   "repair": 2,
   "electronics": 1,
   "materials": 1,
   "medical": 1,
   "misc": 1
  },
  "clinic": {
   "food": 1,
   "household": 1,
   "personal": 1,
   "repair": 1,
   "electronics": 1,
   "materials": 1,
   "medical": 2,
   "misc": 1
  },
  "loot": {
   "food": 1,
   "household": 1,
   "personal": 1,
   "repair": 1,
   "electronics": 1,
   "materials": 1,
   "medical": 1,
   "misc": 1
  },
  "recovery": {
   "food": 1,
   "household": 1,
   "personal": 1,
   "repair": 1,
   "electronics": 1,
   "materials": 1,
   "medical": 1,
   "misc": 1
  },
  "residential": {
   "food": 1,
   "household": 1,
   "personal": 1,
   "repair": 1,
   "electronics": 1,
   "materials": 1,
   "medical": 1,
   "misc": 1
  },
  "street": {
   "food": 1,
   "household": 1,
   "personal": 1,
   "repair": 1,
   "electronics": 1,
   "materials": 1,
   "medical": 1,
   "misc": 1
  },
  "woodland": {
   "food": 1,
   "household": 1,
   "personal": 1,
   "repair": 1,
   "electronics": 1,
   "materials": 1,
   "medical": 1,
   "misc": 1
  }
 }
}});

const legacyV12=freeze({...structuredClone(legacyV11),version:12,foodCrates:{
 previewItems:{'resource:herb_shiitake':{category:'food',stock:1},'resource:herb_chili_wild':{category:'food',stock:1},household_porcelain:{category:'household',stock:1},old_battery:{category:'electronics',stock:1}}
}});
const legacyV13=freeze({...structuredClone(legacyV12),version:13,largeRooms:{
 enabled:true,minArea:49,maxArea:200,
 states:{full:40,light:40,abandoned:20},
 themes:{loot:2,recovery:1,workshop:2,clinic:2,canteen:2},
 reserveEnemies:2,reserveOutdoorContainers:4,
 light:{minEnemies:0,maxEnemies:2,minContainers:1,maxContainers:2}
}});
const legacyV14=freeze({...structuredClone(legacyV13),version:14,
 rooms:{emptyChance:.20,doorlessChance:.30},
 ruins:{largeRoomArea:49,smallWalllessChance:.15,largeDoorlessChance:.08,largeDamagedChance:.05,breachMin:2,breachMax:4},
 poi:{outdoorContainersMin:1,outdoorContainersMax:3,maxRoomContainers:3,nearRoomDistance:2,outdoorRecoveryChance:.12,maxOutdoorRecovery:1}
});
const legacyV15=freeze({...structuredClone(legacyV14),version:15,recipeStudy:{enabled:false,count:1,recipeIds:[]}});
const defaults=freeze({...structuredClone(legacyV15),version:16,recipeStudy:{enabled:false,chance:.03,recipeIds:[]}});

// Historical values only: never rebalance this snapshot. Saves made before the
// configuration system must regenerate exactly the same layout and rewards.
const legacyV1=freeze({version:1,resourceRooms:{minRatio:.10,maxRatio:.20},insight:{chance:.05,weights:{desk:1,stump:1},rewards:{desk:500,stump:1000}}});

function merge(base,patch,path=''){
 if(!patch||typeof patch!=='object'||Array.isArray(patch))throw Error('内容配置必须为对象：'+(path||'root'));
 const out=structuredClone(base);
 for(const key of Object.keys(patch)){
  if(!Object.hasOwn(base,key))throw Error('未知内容配置：'+path+key);
  out[key]=Array.isArray(base[key])?structuredClone(patch[key]):base[key]&&typeof base[key]==='object'?merge(base[key],patch[key],path+key+'.'):patch[key];
 }
 return out;
}
function normalize(value){
 if(!value||!Number.isInteger(value.version)||value.version<1||value.version>16)throw Error('不支持的内容配置版本');
 const c=merge(baseFor(value.version),value);
 const number=(n,label,min,max=Infinity)=>{if(typeof n!=='number'||!Number.isFinite(n)||n<min||n>max)throw Error('无效内容配置：'+label);};
 for(const key of ['minRatio','maxRatio'])number(c.resourceRooms[key],'resourceRooms.'+key,0,1);
 if(c.version>=2)for(const key of ['emptyChance','doorlessChance'])number(c.rooms[key],'rooms.'+key,0,1);
 if(c.version>=3){
  const o=c.outposts;if(typeof o.enabled!=='boolean')throw Error('无效据点开关');
  for(const key of ['minCount','maxCount','minArea','maxArea','targetArea','largeArea','lootEnemies','largeEnemies','restEnemies','minRestEnemies','lootPoints','largeLootPoints','reserveEnemies','entrySteps','pointDoorBuffer','minEnemySpacing','maxEnemySpacing','pointSpacing','pointClusterRadius','pointAccess','layoutAttempts']){
   number(o[key],'outposts.'+key,0,10000);if(!Number.isSafeInteger(o[key]))throw Error('据点数量及格数须为整数：'+key);
  }
  number(o.restChance,'outposts.restChance',0,1);number(o.freeRatio,'outposts.freeRatio',.6,1);
  if(o.minCount>o.maxCount||o.maxCount>4||o.minArea>o.maxArea||o.minArea<6||o.maxArea>200||o.lootEnemies<3||o.largeEnemies<o.lootEnemies||o.largeEnemies>6||o.minRestEnemies<2||o.restEnemies<o.minRestEnemies||o.restEnemies>6||o.lootPoints<2||o.largeLootPoints<o.lootPoints||o.largeLootPoints>4||o.entrySteps<3||o.pointDoorBuffer<3||o.minEnemySpacing<2||o.maxEnemySpacing<o.minEnemySpacing||o.pointSpacing<2||o.pointAccess<1||o.pointAccess>4||o.layoutAttempts<1)throw Error('据点配置超出安全范围');
 }
 if(c.version>=4){
  const d=c.outpostDecor;if(typeof d.enabled!=='boolean')throw Error('无效据点装饰开关');
  for(const key of Object.keys(d).filter(k=>!['enabled','floor','barriers','partitions'].includes(k))){number(d[key],'outpostDecor.'+key,0,100);if(!Number.isSafeInteger(d[key]))throw Error('装饰数量与格数须为整数：'+key);}
  if(d.minFurniture>d.maxFurniture||d.maxFurniture>8||d.minMats>d.maxMats||d.maxMats>3||d.cellsPerFurniture<10||d.wallBand<1||d.wallBand>2||d.doorBuffer<3||d.pointBuffer<2||d.enemyBuffer<2||d.groupRadius<2||d.groupRadius>4||d.groupSpacing<3||d.groupSize<1||d.groupSize>4)throw Error('装饰配置超出安全范围');
  const f=d.floor;if(typeof f.enabled!=='boolean')throw Error('无效据点地面开关');number(f.textureSpan,'outpostDecor.floor.textureSpan',2,12);number(f.largeArea,'outpostDecor.floor.largeArea',6,200);number(f.accentRatio,'outpostDecor.floor.accentRatio',0,.45);
  if(!Number.isSafeInteger(f.textureSpan)||!Number.isSafeInteger(f.largeArea))throw Error('地面格数须为整数');
  for(const key of Object.keys(f.weights))number(f.weights[key],'outpostDecor.floor.weights.'+key,0,100);
  if(Object.values(f.weights).reduce((a,b)=>a+b,0)<=0)throw Error('据点地面权重总和必须大于零');
  if(c.version>=5){
   const b=d.barriers;if(typeof b.enabled!=='boolean'||typeof b.piles!=='boolean')throw Error('无效据点障碍开关');
   for(const key of Object.keys(b).filter(k=>!['enabled','piles'].includes(k))){number(b[key],'outpostDecor.barriers.'+key,0,200);if(!Number.isSafeInteger(b[key]))throw Error('障碍数量与格数须为整数：'+key);}
   if(b.minGroups>b.maxGroups||b.maxGroups>3||b.largeArea<49||b.minLength<2||b.maxLength<b.minLength||b.maxLength>4||b.wallClearance<1||b.wallClearance>3||b.groupSpacing<3||b.doorBuffer<4||b.enemyBuffer<1||b.enemyBuffer>3)throw Error('据点障碍配置超出安全范围');
  }
  if(c.version>=6){
   const p=d.partitions;if(typeof p.enabled!=='boolean')throw Error('无效据点隔断开关');
   for(const [key,min,max] of [['maxBands',1,2],['gapWidth',2,3],['maxGapWidth',2,6],['doorBuffer',3,6],['minCells',3,12],['minExtraSteps',2,12]]){number(p[key],'outpostDecor.partitions.'+key,min,max);if(!Number.isSafeInteger(p[key]))throw Error('隔断格数须为整数：'+key);}
   if(p.maxGapWidth<p.gapWidth)throw Error('隔断缺口范围无效');
   number(p.maxBlockedRatio,'outpostDecor.partitions.maxBlockedRatio',.1,.35);number(p.minRouteRatio,'outpostDecor.partitions.minRouteRatio',1.1,3);
  }
 }
 if(c.resourceRooms.minRatio>c.resourceRooms.maxRatio)throw Error('资源房比例下限不能高于上限');
 if(c.version>=7){
  const p=c.workshop;if(typeof p.enabled!=='boolean')throw Error('无效修理车间开关');number(p.chance,'workshop.chance',0,1);
  for(const [key,min,max]of [['maxPerFloor',0,2],['minArea',64,200],['maxArea',64,200],['minEnemies',3,4],['maxEnemies',3,4],['largeArea',64,200],['lootPoints',2,2],['aisleWidth',2,3],['doorBuffer',3,6],['layoutAttempts',1,10000]]){number(p[key],'workshop.'+key,min,max);if(!Number.isSafeInteger(p[key]))throw Error('车间格数及数量须为整数：'+key);}
  if(p.maxArea<p.minArea||p.maxEnemies<p.minEnemies)throw Error('无效修理车间范围');
  if(c.version>=8){const t=p.terrain;if(typeof t.enabled!=='boolean')throw Error('无效车间地形开关');
   for(const [key,min,max]of [['minBands',2,2],['maxBands',2,2],['gapWidth',2,3],['maxGapWidth',2,4],['minBandCells',3,8],['minExtraSteps',2,8],['maxCoreCandidates',1,40],['maxPlans',1,60]]){number(t[key],'workshop.terrain.'+key,min,max);if(!Number.isSafeInteger(t[key]))throw Error('车间地形格数须为整数');}
   number(t.maxBlockedRatio,'workshop.terrain.maxBlockedRatio',.18,.35);number(t.minRouteRatio,'workshop.terrain.minRouteRatio',1.1,2);if(t.maxGapWidth<t.gapWidth)throw Error('车间缺口范围无效');
  }
 }
 if(c.version>=9){const p=c.clinic;if(typeof p.enabled!=='boolean')throw Error('无效诊疗所开关');number(p.chance,'clinic.chance',0,1);
  for(const [key,min,max]of [['maxPerFloor',0,1],['minArea',70,100],['maxArea',70,120],['minEnemies',3,4],['maxEnemies',3,4],['largeArea',70,120],['doorBuffer',3,6],['maxCandidates',1,160],['layoutAttempts',1,6000]]){number(p[key],'clinic.'+key,min,max);if(!Number.isSafeInteger(p[key]))throw Error('诊疗所数量和格数须为整数');}
  number(p.freeRatio,'clinic.freeRatio',.6,.8);number(p.maxBlockedRatio,'clinic.maxBlockedRatio',.18,.35);if(p.minArea>p.maxArea||p.minEnemies>p.maxEnemies)throw Error('无效诊疗所范围');
 }
 if(c.version>=10){const p=c.canteen;if(typeof p.enabled!=='boolean')throw Error('无效食堂开关');number(p.chance,'canteen.chance',0,1);
  for(const [key,min,max]of [['maxPerFloor',0,1],['minArea',80,120],['maxArea',80,140],['minEnemies',3,4],['maxEnemies',3,4],['largeArea',80,140],['minLoot',1,2],['maxLoot',1,2],['foodPoints',2,2],['tableDoorBuffer',2,4],['doorBuffer',3,6],['minExtraSteps',2,8],['maxCandidates',1,160],['layoutAttempts',1,10000]]){number(p[key],'canteen.'+key,min,max);if(!Number.isSafeInteger(p[key]))throw Error('食堂数量和格数须为整数');}
  number(p.freeRatio,'canteen.freeRatio',.6,.8);number(p.maxBlockedRatio,'canteen.maxBlockedRatio',.18,.35);if(p.minArea>p.maxArea||p.minEnemies>p.maxEnemies||p.minLoot>p.maxLoot)throw Error('无效食堂范围');
 }
 if(c.version>=11){const p=c.containers;if(typeof p.enabled!=='boolean')throw Error('无效容器分类开关');
  for(const [key,v]of Object.entries(p.content))number(v,'containers.content.'+key,0,100);
  if(p.content.forbidden!==0)throw Error('禁入物品权重必须为零');
  for(const [theme,row]of Object.entries(p.placement)){for(const [key,v]of Object.entries(row))number(v,'containers.placement.'+theme+'.'+key,0,100);if(!Object.values(row).some(v=>v>0))throw Error('容器投放权重总和须大于零：'+theme);}
  for(const [theme,row]of Object.entries(p.themeBoosts))for(const [key,v]of Object.entries(row))number(v,'containers.themeBoosts.'+theme+'.'+key,0,100);
 }
 if(c.version>=12){for(const [key,p]of Object.entries(c.foodCrates.previewItems)){
  number(p.stock,'foodCrates.previewItems.'+key+'.stock',0,10000);
  if(!['food','household','personal','repair','electronics','materials','medical','misc'].includes(p.category))throw Error('无效食材筐预览类别');
 }if(!Object.values(c.foodCrates.previewItems).some(p=>p.stock>0))throw Error('食材筐预览物品权重不能全为零');}
 if(c.version>=13){const p=c.largeRooms;
  if(typeof p.enabled!=='boolean')throw Error('无效大型房间开关');
  for(const [key,min,max]of [['minArea',49,200],['maxArea',49,200],['reserveEnemies',0,30],['reserveOutdoorContainers',0,16]]){number(p[key],'largeRooms.'+key,min,max);if(!Number.isSafeInteger(p[key]))throw Error('大型房间数量及格数须为整数');}
  if(p.maxArea<p.minArea)throw Error('无效大型房间面积范围');
  for(const group of ['states','themes']){for(const [key,v]of Object.entries(p[group]))number(v,'largeRooms.'+group+'.'+key,0,10000);if(!Object.values(p[group]).some(v=>v>0))throw Error('大型房间权重总和须大于零');}
  for(const [key,v]of Object.entries(p.light)){number(v,'largeRooms.light.'+key,0,2);if(!Number.isSafeInteger(v))throw Error('零散占用数量须为整数');}
  if(p.light.minEnemies>p.light.maxEnemies||p.light.minContainers>p.light.maxContainers)throw Error('无效零散占用范围');
 }
 if(c.version>=14){
  const r=c.ruins,p=c.poi;
  for(const key of ['smallWalllessChance','largeDoorlessChance','largeDamagedChance'])number(r[key],'ruins.'+key,0,1);
  if(c.rooms.doorlessChance+r.smallWalllessChance>1||r.largeDoorlessChance+r.largeDamagedChance>1)throw Error('开放房间概率之和不能超过一');
  for(const [obj,prefix,key,min,max]of [[r,'ruins','largeRoomArea',20,200],[r,'ruins','breachMin',1,6],[r,'ruins','breachMax',1,6],[p,'poi','outdoorContainersMin',0,3],[p,'poi','outdoorContainersMax',0,3],[p,'poi','maxRoomContainers',1,4],[p,'poi','nearRoomDistance',1,2],[p,'poi','maxOutdoorRecovery',0,1]]){number(obj[key],prefix+'.'+key,min,max);if(!Number.isSafeInteger(obj[key]))throw Error('兴趣点数量与格数须为整数');}
  number(p.outdoorRecoveryChance,'poi.outdoorRecoveryChance',0,1);
  if(r.breachMin>r.breachMax||p.outdoorContainersMin>p.outdoorContainersMax)throw Error('无效废墟兴趣点范围');
 }
 if(c.version>=15){
  if(globalThis.RuinsRecipeStudy)RuinsRecipeStudy.validateConfig(c.recipeStudy);
  else if(c.recipeStudy.enabled)throw Error('缺少资料台模块');
 }
 number(c.insight.chance,'insight.chance',0,1);
 for(const id of ['desk','stump']){
  number(c.insight.weights[id],'insight.weights.'+id,0,Number.MAX_SAFE_INTEGER);
  if(!Number.isSafeInteger(c.insight.rewards[id])||c.insight.rewards[id]<0)throw Error('领悟奖励必须为非负整数：'+id);
 }
 const weight=c.insight.weights.desk+c.insight.weights.stump;
 if(!Number.isFinite(weight)||weight<=0)throw Error('领悟类型总权重必须大于零');
 return freeze(c);
}
function baseFor(version){return [null,legacyV1,legacyV2,legacyV3,legacyV4,legacyV5,legacyV6,legacyV7,legacyV8,legacyV9,legacyV10,legacyV11,legacyV12,legacyV13,legacyV14,legacyV15,defaults][version];}
function resolve({overrides={},ticketOverrides={}}={}){const base=baseFor(overrides.version??16);if(!base)throw Error('不支持的内容配置版本');return normalize(merge(merge(base,overrides),ticketOverrides));}
function signature(config){const text=JSON.stringify(normalize(config));return text===JSON.stringify(legacyV1)?'':':rules:'+text;}
globalThis.RuinsContentConfig={defaults,legacyV1,legacyV2,legacyV3,legacyV4,legacyV5,legacyV6,legacyV7,legacyV8,legacyV9,legacyV10,legacyV11,legacyV12,legacyV13,legacyV14,legacyV15,resolve,normalize,signature};
})();
