/* SPDX-License-Identifier: GPL-3.0-only */
(()=>{'use strict';
const config={emptyChance:.4,nonEmptyWeights:[.6,.3,.1],openingTicks:1,emptyTicks:1,tickMs:1500,takeMs:550,capacity:6};
const rarityTicks={common:1,uncommon:2,rare:3,exceptional:5,legendary:8};
// Preview contents only. This does not define the game's item pool or rarity odds.
const items={
 old_coin:{name:'旧币',icon:'currency',rarity:'common',qty:5},
 old_battery:{name:'旧电池',icon:'battery',rarity:'uncommon',qty:1},
 sealed_chip:{name:'封存芯片',icon:'circuit',rarity:'rare',qty:1},
 precision_core:{name:'精密核心',icon:'precision_core',rarity:'exceptional',qty:1},
 ancient_relic:{name:'古代遗物',icon:'gem',rarity:'legendary',qty:1}
};
const item=key=>items[key]||globalThis.RuinsHarvest?.items[key];
function random(seed){let a=RuinsSettlement.hash(seed);return()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
function drawCount(rng){if(rng()<config.emptyChance)return 0;const r=rng();let sum=0;for(let i=0;i<config.nonEmptyWeights.length;i++){sum+=config.nonEmptyWeights[i];if(r<sum)return i+1;}return 3;}
const identity=m=>JSON.stringify(m.mixedSignature?[m.seed,m.preset,m.floor,m.mixedSignature]:[m.seed,m.preset,m.floor]);
function create(){return{opened:false,locked:false,openingTicksPaid:0,complete:false,cursor:0,fraction:0,items:[]};}
function rollContents(map,p){const rng=random(identity(map)+'|'+p.uid+'|'+p.cell+'|contents'),count=drawCount(rng),keys=Object.keys(items);
 return Array.from({length:count},()=>{const key=keys[Math.floor(rng()*keys.length)];return{key,qty:items[key].qty,ticks:0,requiredTicks:null,revealed:false,claimed:false};});
}
function initialize(s){s.bag=[];for(const p of s.lootPoints)p.search=create(s.map,p);}
function openTick(s,uid){const p=s.lootPoints.find(p=>p.uid===uid);if(!p||!RuinsLoot.accessible(s,p)||p.search.opened)return false;
 const q=p.search;q.fraction=0;q.openingTicksPaid++;
 s.lastLootEvent={uid,revealed:null,empty:false,opened:false};
 if(q.openingTicksPaid>=config.openingTicks){
  q.items=rollContents(s.map,p);q.locked=true;q.opened=true;q.complete=q.items.length===0;
  s.lastLootEvent.empty=q.complete;s.lastLootEvent.opened=true;
  globalThis.RuinsExpedition?.record(s,'point','loot:'+uid);
 }return true;
}
function prepareItem(p){const q=p.search,item=q.items[q.cursor];if(q.opened&&item&&!item.requiredTicks)item.requiredTicks=rarityTicks[items[item.key].rarity];}
function workProgress(p){const q=p.search;if(q.complete)return 1;if(!q.opened)return(q.openingTicksPaid+q.fraction)/config.openingTicks;const item=q.items[q.cursor];return item?Math.min(1,(item.ticks+q.fraction)/(item.requiredTicks||rarityTicks[items[item.key].rarity])):0;}
function searchTick(s,uid){const p=s.lootPoints.find(p=>p.uid===uid);if(!p||!RuinsLoot.accessible(s,p)||p.search.complete)return false;
 const q=p.search;if(!q.opened||!q.locked||!q.items[q.cursor])return false;
 prepareItem(p);q.fraction=0;s.lastLootEvent={uid,revealed:null,empty:false,opened:false};
 const item=q.items[q.cursor];item.ticks++;if(item.ticks>=item.requiredTicks){item.revealed=true;s.lastLootEvent.revealed=q.cursor++;q.complete=q.cursor===q.items.length;}
 return true;
}
function claim(s,uid,index){const p=s.lootPoints.find(p=>p.uid===uid),item=p?.search.items[index];
 if(!p||!RuinsLoot.accessible(s,p)||!item?.revealed||item.claimed||s.bag.length>=config.capacity)return false;
 item.claimed=true;s.bag.push({key:item.key,qty:item.qty,source:uid,index});return true;
}
function label(p){if(!p.search.opened)return'未搜索';if(!p.search.complete)return'搜索未完';return p.search.items.some(i=>!i.claimed)?'有物品':'空';}
function actionLabel(p){return p.search.opened?'查看':'搜索';}
function snapshot(s){globalThis.RuinsExploration?.observe(s);return{version:2,identity:identity(s.map),points:s.lootPoints.map(p=>({uid:p.uid,cell:p.cell,assetId:p.assetId,search:p.search})),bag:s.bag,harvest:globalThis.RuinsHarvest?.snapshot(s),recovery:globalThis.RuinsRecovery?.snapshot(s),insight:globalThis.RuinsInsight?.snapshot(s),exploration:globalThis.RuinsExploration?.snapshot(s),reward:s.reward,world:{tick:s.tick,night:s.night,player:s.player,doors:s.doors,enemies:s.enemies,defeated:s.defeated||[]}};}
function restore(s,data,world=true){
 if(!data||![1,2].includes(data.version)||data.identity!==identity(s.map)||data.points?.length!==s.lootPoints.length||!Array.isArray(data.bag)||data.bag.length>config.capacity)return false;
 const valid=data.points.every((p,i)=>{const q=p.search,target=s.lootPoints[i];return p.uid===target.uid&&p.cell===target.cell&&p.assetId===target.assetId&&q&&Array.isArray(q.items)&&q.items.length<=3&&Number.isInteger(q.cursor)&&q.cursor>=0&&q.cursor<=q.items.length&&Number.isFinite(q.fraction)&&q.fraction>=0&&q.fraction<1&&q.items.every(v=>items[v.key]&&v.qty>0&&Number.isInteger(v.ticks)&&v.ticks>=0);});
 if(!valid||!data.bag.every(i=>item(i.key)&&i.qty>0&&(!globalThis.RuinsHarvest?.items[i.key]||i.qty===1)))return false;
 for(let i=0;i<s.lootPoints.length;i++){
  let q=structuredClone(data.points[i].search);
  if(data.version===1){
   // Old opened containers keep every revealed/claimed item and paid search tick.
   if(q.opened){q.locked=true;q.openingTicksPaid=config.openingTicks;for(const item of q.items)item.requiredTicks=item.ticks?rarityTicks[items[item.key].rarity]:null;}
   else{const fraction=q.fraction;q=create();q.fraction=fraction;}
  }s.lootPoints[i].search=q;
 }
 s.bag=structuredClone(data.bag);
 if(world&&data.world&&data.world.doors.length===s.doors.length){
  const previous=new Map(data.world.enemies.map(e=>[e.uid,e]));
  const dead=new Set((data.world.defeated||[]).filter(id=>s.map.enemies.some(e=>e.uid===id)));
  const compatible=previous.size===data.world.enemies.length&&[...previous.keys()].every(id=>s.enemies.some(e=>e.uid===id)&&!dead.has(id))&&s.enemies.every(e=>previous.has(e.uid)||dead.has(e.uid)||e.roaming);
  if(compatible){for(const key of ['tick','night','player','doors'])s[key]=structuredClone(data.world[key]);s.defeated=[...dead];const retained=new Set();s.enemies=s.enemies.filter(e=>!dead.has(e.uid)).map(e=>{const old=previous.get(e.uid);if(old&&(!e.roaming||old.patrolLayoutKey===e.patrolLayoutKey)){retained.add(e.uid);return {...e,...structuredClone(old)};}return e;});globalThis.RuinsWanderers?.restoreAdded(s,retained);}
 }
 if(!world){s.defeated=(data.world?.defeated||[]).filter(id=>s.map.enemies.some(e=>e.uid===id));s.enemies=s.enemies.filter(e=>!s.defeated.includes(e.uid));}
 globalThis.RuinsRecovery?.restore(s,data.recovery);
 globalThis.RuinsHarvest?.restore(s,data.harvest);
 globalThis.RuinsInsight?.restore(s,data.insight);
 globalThis.RuinsExploration?.restore(s,data.exploration);
 globalThis.RuinsExpedition?.restore(s,data.reward);
 return true;
}
function save(s){try{localStorage.setItem('ruins-containers-v1:'+identity(s.map),JSON.stringify(snapshot(s)));}catch{}globalThis.RuinsContainerSearch.onSave?.(s);}
function load(s){try{return restore(s,JSON.parse(localStorage.getItem('ruins-containers-v1:'+identity(s.map))));}catch{return false;}}
globalThis.RuinsContainerSearch={config,rarityTicks,items,item,random,drawCount,identity,create,rollContents,initialize,openTick,prepareItem,workProgress,searchTick,claim,label,actionLabel,snapshot,restore,save,load};
})();
