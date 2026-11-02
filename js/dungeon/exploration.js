/* SPDX-License-Identifier: GPL-3.0-only */
(()=>{'use strict';
const E=RuinsEncounter,R=RuinsSettlement;
const kinds=['entry','exit','loot','water','food','medical','rest','gather','mine','wood','insight'];
const identity=s=>RuinsContainerSearch.identity(s.map);
function initialize(s){s.exploration={version:1,identity:identity(s),tiles:Array(s.map.tiles.length).fill(-1),marks:{},gates:{}};return s.exploration;}
function terrain(s,k){
 const t=s.map.tiles[k];
 if(t===R.VOID)return -1;
 if(s.map.decorBlocked?.has(k)||s.map.workshopBlocked?.has(k)||s.map.clinicBlocked?.has(k)||s.map.canteenBlocked?.has(k))return 3;
 if(t===1)return 3;
 if(t===4)return s.doors.find(d=>d.cell===k)?.closed?5:6;
 if(t===2)return 2;
 if(t===3)return 4;
 return s.map.road?.[k]?0:1;
}
function landmarks(s){
 return [{key:'entry',cell:s.map.entry,kind:'entry',state:'ready'},{key:'exit',cell:s.map.exit,kind:'exit',state:'ready'},
 ...(s.lootPoints||[]).map(p=>({key:'loot:'+p.uid,cell:p.cell,kind:'loot',state:p.search?.complete&&p.search.items.every(i=>i.claimed)?'spent':p.search?.opened?'opened':'ready'})),
 ...(s.recoveryPoints||[]).map(p=>({key:'recovery:'+p.uid,cell:p.cell,kind:({stove:'food',water:'water',medical:'medical',rest:'rest'})[RuinsRecovery.kind(p)],state:p.used?'spent':'ready'})),
 ...(s.insightPoints||[]).map(p=>({key:'insight:'+p.uid,cell:p.cell,kind:'insight',state:p.used?'spent':'ready'})),
 ...(s.harvestPoints||s.map.resources||[]).map(p=>({key:'resource:'+p.cell,cell:p.cell,kind:p.type,state:p.used?'spent':p.remaining<p.total?'opened':'ready'}))].filter(p=>Number.isInteger(p.cell)&&p.cell>=0&&p.cell<s.map.tiles.length);
}
function observe(s){
 if(s.ended)return false;
 const memory=s.exploration||initialize(s),field=E.sightField(s,s.player);let changed=false;
 const w=s.map.width,h=s.map.height,x=s.player.cell%w,y=Math.floor(s.player.cell/w),radius=Math.ceil(E.visionProfile(s).visual);
 for(let yy=Math.max(0,y-radius);yy<=Math.min(h-1,y+radius);yy++)for(let xx=Math.max(0,x-radius);xx<=Math.min(w-1,x+radius);xx++){
  const k=yy*w+xx;
  if(!field.at(k).terrain)continue;
  const value=terrain(s,k);if(value!==memory.tiles[k]){memory.tiles[k]=value;changed=true;}
 }
 for(const d of s.doors||[])if(field.at(d.cell).terrain&&!memory.gates[d.cell]){memory.gates[d.cell]={dx:d.dx,dy:d.dy};changed=true;}
 for(const p of landmarks(s)){
  if(!kinds.includes(p.kind)||!field.at(p.cell).identify)continue;
  const old=memory.marks[p.key];
  if(!old||old.cell!==p.cell||old.kind!==p.kind||old.state!==p.state){memory.marks[p.key]={cell:p.cell,kind:p.kind,state:p.state};changed=true;}
 }
 return changed;
}
function snapshot(s){return structuredClone(s.exploration||initialize(s));}
function restore(s,data){
 if(!data||data.version!==1||data.identity!==identity(s)||!Array.isArray(data.tiles)||data.tiles.length!==s.map.tiles.length||!data.tiles.every(t=>Number.isInteger(t)&&t>=-1&&t<=6))return false;
 const allowed=new Map(landmarks(s).map(p=>[p.key,p]));
 const marks={};for(const [key,p]of Object.entries(data.marks||{})){const actual=allowed.get(key);if(actual&&p&&p.cell===actual.cell&&p.kind===actual.kind&&kinds.includes(p.kind)&&['ready','opened','spent'].includes(p.state)&&data.tiles[p.cell]>=0)marks[key]={cell:p.cell,kind:p.kind,state:p.state};}
 const gates={};for(const d of s.doors||[]){const old=data.gates?.[d.cell];if(old&&old.dx===d.dx&&old.dy===d.dy&&[5,6].includes(data.tiles[d.cell]))gates[d.cell]={dx:d.dx,dy:d.dy};}
 s.exploration={version:1,identity:identity(s),tiles:data.tiles.slice(),marks,gates};return true;
}
function view(s){
 const memory=s.exploration||initialize(s),field=E.sightField(s,s.player),cells=[],visible=new Set();
 for(let k=0;k<memory.tiles.length;k++)if(memory.tiles[k]>=0){const current=field.at(k).terrain;if(current)visible.add(k);cells.push({cell:k,type:memory.tiles[k],current,gate:memory.gates[k]});}
 return {cells,marks:Object.values(memory.marks).map(p=>({...p,current:field.at(p.cell).identify})),enemies:s.enemies.filter(e=>field.at(e.cell).identify).map(e=>({cell:e.cell})),visible,known:cells.length};
}
globalThis.RuinsExploration={initialize,observe,snapshot,restore,view};
})();
