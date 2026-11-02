/* One recipe, or a one-time potential reward when its scope is fully known. */
(()=>{'use strict';
const id='recipe-study',K=()=>globalThis.ManufacturingKnowledge,R=()=>globalThis.RuinsSettlement;
function isPoint(p){return p?.id===id;}
function validateConfig(c){
 const rare=c&&Object.hasOwn(c,'chance');
 if(!c||typeof c.enabled!=='boolean'||(rare?(!Number.isFinite(c.chance)||c.chance<0||c.chance>1):(!Number.isSafeInteger(c.count)||c.count<0||c.count>3))||!Array.isArray(c.recipeIds)||c.recipeIds.length>200||new Set(c.recipeIds).size!==c.recipeIds.length)throw Error('资料台配置无效');
 for(const key of c.recipeIds)if(K().recipe(key)?.unlock!=='exploration')throw Error('资料台配方范围含无效或非研究配方：'+key);
 if(c.enabled&&(rare?c.chance>0:c.count>0)&&!c.recipeIds.length)throw Error('资料台开启时必须指定配方范围');
 return c;
}
// One draw per expedition, independent of floor-generation attempts and rewards.
function plan(seed,firstFloor,maxFloor,c){
 validateConfig(c);
 if(!Number.isSafeInteger(firstFloor)||!Number.isSafeInteger(maxFloor)||firstFloor<1||maxFloor<firstFloor)throw Error('资料室楼层范围无效');
 const rnd=R().random(R().hash(seed+'|recipe-study-expedition-v1'));
 const present=c.enabled&&rnd()<c.chance;
 return {version:1,firstFloor,maxFloor,floor:present?firstFloor+Math.floor(rnd()*(maxFloor-firstFloor+1)):0};
}
function reserve(map,studyPlan){
 map.recipeStudyPlan=studyPlan;
 if(studyPlan.floor!==map.floor)return;
 const w=map.width,h=map.height,protectedCells=new Set([map.entry,map.exit,...map.doors]);
 const outside=R().flood(R().closedPassages(map),w,h,map.entry),candidates=[];
 // A fixed 3 x 4 interior, one-cell walls and circulation apron. No existing
 // building or road is carved away; only an unowned vacant parcel is used.
 for(let y=1;y<h-8;y++)for(let x=1;x<w-7;x++){
  let ok=true,connected=false;
  for(let j=0;j<8&&ok;j++)for(let i=0;i<7;i++){
   const k=(y+j)*w+x+i,body=i>=1&&i<=5&&j>=1&&j<=6;
   if(map.owner[k]>=0||protectedCells.has(k)||![0,3,R().VOID].includes(map.tiles[k])||body&&map.road[k]){ok=false;break;}
   if(!body&&outside.dist[k]>=0)connected=true;
  }
  if(ok&&connected)candidates.push({x,y,rank:R().hash(map.seed+'|study-parcel|'+x+','+y)});
 }
 candidates.sort((a,b)=>a.rank-b.rank);
 const roomId=Math.max(0,...map.buildings.map(r=>r.id))+1;
 for(const pos of candidates){
  const cell=(x,y)=>(pos.y+y)*w+pos.x+x,tiles=map.tiles.slice(),inner=[],cells=[];
  for(let j=0;j<8;j++)for(let i=0;i<7;i++){
   const k=cell(i,j),body=i>=1&&i<=5&&j>=1&&j<=6;
   tiles[k]=body?(i===1||i===5||j===1||j===6?1:2):0;
   if(body){cells.push(k);if(tiles[k]===2)inner.push(k);}
  }
  const door=cell(3,6);tiles[door]=4;
  const open=R().flood(tiles,w,h,map.entry);if(open.reached!==tiles.filter(R().walkable).length)continue;
  const closed=tiles.slice();for(const k of [...map.doors,door])closed[k]=1;
  const flow=R().flood(closed,w,h,map.entry);
  if(flow.dist[door+w]<0||flow.dist[map.exit]<0||outside.dist.some((d,k)=>d>=0&&!cells.includes(k)&&flow.dist[k]<0))continue;
  const room={id:roomId,recipeStudyRoom:true,templateId:'recipe-study-room-v1',name:'旧工艺资料室',inner,cells,door,center:cell(3,4),recipeDeskCell:cell(3,2),reservedEmpty:true,enclosure:'intact',hasDoor:true,doorMaterial:'wood',ruined:false};
  map.tiles=tiles;map.rooms.push(room);map.buildings.push(room);map.doors.push(door);
  for(const k of cells){map.owner[k]=roomId;map.road[k]=0;}
  for(let j=0;j<8;j++)for(let i=0;i<7;i++)map.active[cell(i,j)]=1;
  map.voidCells=tiles.filter(t=>t===R().VOID).length;map.recipeStudyRoomId=roomId;
  map.recipeStudyRoom={roomId,bounds:[pos.x+1,pos.y+1,pos.x+5,pos.y+6]};
  return;
 }
 throw Error('未找到可放置独立资料室且保持通路的空地');
}
function populate(map){
 const c=map.contentConfig.recipeStudy,rare=map.contentConfig.version>=16;
 if(!c?.enabled||(!rare&&!c.count)||(rare&&map.recipeStudyPlan?.floor!==map.floor))return map;validateConfig(c);
 const target=rare?1:c.count;
 const points=[...map.resources,...map.lootPoints,...map.recoveryPoints,...map.insightPoints];
 const rooms=rare?map.rooms.filter(r=>r.recipeStudyRoom):map.rooms.filter(r=>!r.reservedEmpty&&!r.enemyCount&&!r.mixedType&&!r.largeRoomState&&!r.outpostType&&!r.insightPoints?.length&&!r.nodes?.length).sort((a,b)=>R().hash(map.seed+'|recipe-room|'+a.id)-R().hash(map.seed+'|recipe-room|'+b.id));
 let count=0;
 for(const room of rooms){
  if(count>=target)break;
  const choices=room.inner.filter(k=>(!rare||k===room.recipeDeskCell&&R().walkable(map.collision[k+map.width]))&&R().walkable(map.collision[k])&&RuinsEncounter.dist(k,room.door,map.width)>=2&&!points.some(p=>RuinsEncounter.dist(k,p.cell,map.width)<2)).sort((a,b)=>Number(RuinsResources.neighbours(b,map).some(k=>map.tiles[k]===1))-Number(RuinsResources.neighbours(a,map).some(k=>map.tiles[k]===1))||(rare?RuinsEncounter.dist(b,room.door,map.width)-RuinsEncounter.dist(a,room.door,map.width):0)||a-b);
  for(const cell of choices){
   const before=map.collision[cell];map.collision[cell]=6;
   const flow=R().flood(map.collision,map.width,map.height,map.entry),access=RuinsResources.neighbours(cell,map).filter(k=>flow.dist[k]>=0);
   if(!access.length||flow.reached!==map.collision.filter(R().walkable).length||room.inner.filter(k=>R().walkable(map.collision[k])).length<room.inner.length*.6){map.collision[cell]=before;continue;}
   const p={uid:'recipe-study-'+room.id,id,kind:'recipe',name:'旧工艺资料台',amount:0,roomId:room.id,cell,access,used:false,recipeIds:[...c.recipeIds],learnedRecipeId:null};
   if(rare)room.reservedEmpty=false;
   room.insightType=id;room.insightPoints=[p];map.insightPoints.push(p);map.insightRooms.push(room);points.push(p);count++;break;
  }
 }
 if(count!==target)throw Error('资料台无法安全放入房间：'+count+'/'+target);
 map.mixedSignature+=':recipe-study:'+R().hash(JSON.stringify(map.insightPoints.filter(isPoint).map(p=>[p.uid,p.cell,p.recipeIds])));
 return map;
}
function eligible(p){return(p?.recipeIds||[]).filter(key=>K().recipe(key)?.unlock==='exploration'&&!K().knows(key));}
function decorate(map){
 const room=map.rooms.find(r=>r.recipeStudyRoom);if(!room||room.studyDecorVersion===1)return map;
 const w=map.width,left=Math.min(...room.inner.map(k=>k%w)),top=Math.min(...room.inner.map(k=>Math.floor(k/w)));
 const props=[['archive-shelf',0,0],['drawing-rolls',2,0],['patched-stool',0,1]].map(([kind,x,y])=>{
  const cell=(top+y)*w+left+x;return{uid:'study-decor-'+room.id+'-'+kind,kind:'study-art-'+kind,roomId:room.id,cell,footprint:[cell],solid:true,opaque:false,front:[0,1]};
 });
 const tiles=map.collision.slice();
 for(const p of props){if(!room.inner.includes(p.cell)||!R().walkable(tiles[p.cell]))throw Error('资料室陈设占格冲突');tiles[p.cell]=6;}
 const flow=R().flood(tiles,w,map.height,map.entry),desk=map.insightPoints.find(p=>p.roomId===room.id&&isPoint(p));
 const access=desk&&RuinsResources.neighbours(desk.cell,map).filter(k=>flow.dist[k]>=0);
 const path=R().route(R().closedPassages({...map,collision:tiles}),w,map.height,map.entry,map.exit);
 if(flow.reached!==tiles.filter(R().walkable).length||!access?.length||!path.length||room.inner.filter(k=>R().walkable(tiles[k])).length<room.inner.length*.6)throw Error('资料室陈设阻挡通路');
 map.outpostDecor??=[];map.decorBlocked??=new Set();map.outpostDecor.push(...props);
 for(const p of props){map.decorBlocked.add(p.cell);map.collision[p.cell]=6;if(map.patrolTiles)map.patrolTiles[p.cell]=6;}
 desk.access=access;room.decorations=props;room.studyDecorVersion=1;map.path=path;
 map.mixedSignature+=':study-decor-v1:'+R().hash(JSON.stringify(props.map(p=>[p.kind,p.cell])));
 return map;
}
function choice(s,p){const ids=eligible(p);if(!ids.length)return null;return ids[R().hash(s.map.seed+'|recipe-choice|'+p.uid)%ids.length];}
// Use the expedition's locked book-desk reward, not the live configuration.
function fallbackPotential(s){return s.map.contentConfig.insight.rewards.desk*3;}
function grant(s,p){
 if(!s.formalRuntime||!isPoint(p)||p.used||!RuinsInsight.accessible(s,p))return null;
 const key=choice(s,p);
 if(key){
  if(!K().grant(key))return null;
  p.learnedRecipeId=key;p.used=true;return K().recipe(key);
 }
 const base=fallbackPotential(s),inventory=globalThis.InventoryEquipment,before=inventory.getPotential();
 if(!Number.isSafeInteger(base)||base<0)return null;
 inventory.addPotential(base);
 p.potentialReward={base,amount:inventory.getPotential()-before};p.used=true;
 return p.potentialReward;
}
function validatePoint(p,rules,insight){
 if(!isPoint(p))return false;
 if(p.kind!=='recipe'||p.amount!==0||typeof p.used!=='boolean'||!Array.isArray(p.recipeIds)||!p.recipeIds.length)return false;
 try{validateConfig({enabled:true,count:1,recipeIds:p.recipeIds});}catch{return false;}
 if(!rules?.enabled||JSON.stringify(p.recipeIds)!==JSON.stringify(rules.recipeIds))return false;
 if(p.potentialReward!==undefined){
  const reward=p.potentialReward;
  return p.used&&p.learnedRecipeId===null&&reward&&Object.keys(reward).sort().join(',')==='amount,base'&&Number.isSafeInteger(reward.base)&&reward.base>=0&&reward.base===insight?.rewards.desk*3&&Number.isSafeInteger(reward.amount)&&reward.amount>=0;
 }
 return p.used?typeof p.learnedRecipeId==='string'&&p.recipeIds.includes(p.learnedRecipeId):p.learnedRecipeId===null;
}
function art(p){return{src:'assets/dungeon/recipe-study-point-v1/'+(p.used?'used':'available')+'.png',bounds:[151,160,976,1006,636,847,864,1254,1254]};}
globalThis.RuinsRecipeStudy={id,isPoint,validateConfig,plan,reserve,populate,decorate,eligible,choice,fallbackPotential,grant,validatePoint,art};
})();
