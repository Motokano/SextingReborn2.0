/* SPDX-License-Identifier: GPL-3.0-only */
(()=>{'use strict';
const R=RuinsSettlement,RS=RuinsResources;
const config={ticks:1,uses:1,tickMs:1100}; // Interaction timing is preview tuning.
const catalog=[{id:'desk',name:'残页书桌',file:'fragment-desk',bounds:[[182,94,999,966,685,1059,872,1294,1216],[120,89,1074,1047,661,1135,939,1293,1216]]},{id:'stump',name:'练武残桩',file:'practice-stump',bounds:[[410,64,492,1019,662,1082,469,1294,1216],[401,64,517,1057,663,1120,490,1293,1216]]}];
const random=seed=>RuinsContainerSearch.random(seed);
const settings=map=>(map.contentConfig||RuinsContentConfig.defaults).insight;
function quota(map){const rnd=random(map.seed+'-insight-count-'+map.floor),chance=settings(map).chance;return map.rooms.reduce(n=>n+Number(rnd()<chance),0);}
function pickType(rnd,rules){let roll=rnd()*catalog.reduce((n,p)=>n+rules.weights[p.id],0);for(const p of catalog){roll-=rules.weights[p.id];if(roll<0)return p;}return catalog.filter(p=>rules.weights[p.id]>0).at(-1);}
function populate(map){
 map.insightPoints=[];map.insightRooms=[];if(!map.contentVersion)return map;
 const rules=settings(map),target=quota(map),rnd=random(map.seed+'-insight-kind-'+map.floor);
 const rooms=map.rooms.filter(r=>!r.reservedEmpty&&!r.enemyCount&&!r.nodes?.length&&!r.mixedType&&!(map.contentConfig.version>=13&&r.largeRoomState)).sort((a,b)=>Math.abs(a.inner.length-16)-Math.abs(b.inner.length-16)||R.hash(map.seed+'-insight-room-'+a.id)-R.hash(map.seed+'-insight-room-'+b.id));
 for(const room of rooms){
  if(map.insightPoints.length>=target)break;
  const floor=new Set(room.inner),landings=RS.neighbours(room.door,map).filter(k=>floor.has(k));
  const choices=room.inner.filter(k=>!landings.includes(k)&&RuinsEncounter.dist(k,room.door,map.width)>=2&&R.walkable(map.collision[k])).sort((a,b)=>Number(RS.neighbours(b,map).some(k=>map.tiles[k]===1))-Number(RS.neighbours(a,map).some(k=>map.tiles[k]===1))||a-b);
  for(const cell of choices){
   const before=map.collision[cell];map.collision[cell]=6;const flow=R.flood(map.collision,map.width,map.height,map.entry),access=RS.neighbours(cell,map).filter(k=>flow.dist[k]>=0);
   const valid=access.length&&flow.reached===map.collision.filter(R.walkable).length&&room.inner.filter(k=>R.walkable(map.collision[k])).length>=room.inner.length*.6;
   if(!valid){map.collision[cell]=before;continue;}
   const type=pickType(rnd,rules),p={uid:'insight-'+room.id,id:type.id,name:type.name,amount:rules.rewards[type.id],roomId:room.id,cell,access,used:false};
   room.insightType=type.id;room.insightPoints=[p];map.insightPoints.push(p);map.insightRooms.push(room);break;
  }
 }
 map.insightTarget=target;map.mixedSignature+=':content-v1:'+R.hash(JSON.stringify(map.insightPoints.map(p=>[p.id,p.cell])));
 map.path=R.route(R.closedPassages(map),map.width,map.height,map.entry,map.exit);if(!map.path.length)throw Error('领悟点阻断撤离通路');return map;
}
function initialize(s){s.insightPoints=structuredClone(s.map.insightPoints||[]);}
function accessible(s,p){return !s.ended&&!!p&&s.insightPoints.includes(p)&&RuinsLoot.accessible(s,p);}
function use(s,uid){const p=s.insightPoints.find(p=>p.uid===uid);if(!p||p.used||globalThis.RuinsRecipeStudy?.isPoint(p)||!accessible(s,p))return false;p.used=true;RuinsExpedition.record(s,'point','insight:'+p.uid);return true;}
function snapshot(s){return(s.insightPoints||[]).map(p=>({uid:p.uid,cell:p.cell,id:p.id,used:!!p.used}));}
function restore(s,data){if(!Array.isArray(data))return false;const byId=new Map(data.map(p=>[p.uid,p]));for(const p of s.insightPoints||[]){const old=byId.get(p.uid);if(old&&old.cell===p.cell&&old.id===p.id)p.used=old.used===true;}return true;}
function art(p){if(globalThis.RuinsRecipeStudy?.isPoint(p))return RuinsRecipeStudy.art(p);const a=catalog.find(a=>a.id===p.id);return globalThis.DungeonGridArt?.legacy(a.file,p.used?'used':'normal')||{src:'assets/dungeon/insight/'+a.file+(p.used?'-used':'')+'-v2.png',bounds:a.bounds[p.used?1:0]};}
const images=new Map();let invalidate=()=>{};
function load(p){if(typeof Image==='undefined')return;for(const used of [false,true]){const {src}=art({...p,used});if(images.has(src))continue;const im=new Image();im.onload=()=>invalidate();im.onerror=()=>console.error('领悟棋子加载失败：'+src);im.src=src;images.set(src,im);}}
function draw(ctx,p,x,y,scale){const id=globalThis.RuinsRecipeStudy?.isPoint(p)?'recipe-study':catalog.find(a=>a.id===p.id)?.file;if(globalThis.DungeonGridArt?.asset(id)){DungeonGridArt.draw(ctx,id,p.used?'used':'normal',x,y,scale,{point:p});return;}load(p);const a=art(p),im=images.get(a.src);if(!im?.complete||!im.naturalWidth)return;const [bx,by,bw,bh,cx,bottom,ref]=a.bounds,f=Math.min(scale*.95/ref,scale*1.48/bh);ctx.drawImage(im,bx,by,bw,bh,x+(bx-cx)*f,y+scale*.16+(by-bottom)*f,bw*f,bh*f);}
function thumbnail(p){const a=art(p),b=a.bounds;return '<svg class="recovery-thumb" viewBox="'+b.slice(0,4).join(' ')+'" aria-hidden="true"><image href="'+a.src+'" width="'+b[7]+'" height="'+b[8]+'"/></svg>';}
globalThis.RuinsInsight={config,catalog,quota,populate,initialize,accessible,use,snapshot,restore,art,load,draw,thumbnail,setInvalidation:fn=>invalidate=fn};
})();
