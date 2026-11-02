/* SPDX-License-Identifier: GPL-3.0-only */
(()=>{'use strict';
const R=globalThis.RuinsSettlement,catalog=globalThis.RuinsLootCatalog;
// Placement and action duration are preview tuning, not item/drop-table rules.
const config={minPoints:12,maxPoints:16,spacing:5,doorBuffer:2};
// Map presentation only. Keep the full-size catalogue art for search windows.
// Both searched states share their object's scale, rather than filling a cell.
const mapScales=Object.freeze({
 'overturned-cart-v1':.88,'abandoned-chest-v1':.75,'abandoned-cargo-v1':.85,
 'damaged-barrel-v1':.75,'lost-backpack-v1':.65,'discarded-toolbox-v1':.65,
 'collapsed-shelf-v1':.82,'reused-fridge-v1':.80,'salvaged-shopping-cart-v1':.78,
 'reused-plastic-drum-v1':.75,'reused-washer-drum-v1':.72,'patched-suitcase-v1':.68,
 'repaired-cooler-v1':.68,'rice-cooker-cache-v1':.65,'pressure-pot-cache-v1':.65,
 'computer-tower-cabinet-v1':.68,'wheelie-bin-cache-v1':.75,'postbox-cache-v1':.78,
 'factory-locker-cache-v1':.80,'vending-machine-cupboard-v1':.80,'pram-cargo-basket-v1':.75,
 'wire-cage-trolley-v1':.80,'stacked-plastic-crates-v1':.75,'sideways-oil-drum-cabinet-v1':.75,
 'cable-spool-shelf-v1':.78,'milk-churn-storage-v1':.68,'motorcycle-topbox-cache-v1':.65,
 'tire-storage-basket-v1':.70,'aluminum-flight-case-v1':.70,'marine-buoy-cache-v1':.70,
 'patched-bulk-sack-v1':.78,'canteen-food-crate-v1':.92
});
const images=new Map();let invalidate=()=>{};
const distance=(a,b,w)=>Math.max(Math.abs(a%w-b%w),Math.abs(Math.floor(a/w)-Math.floor(b/w)));
function neighbours(k,m){const x=k%m.width,y=Math.floor(k/m.width),out=[];for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if((dx||dy)&&x+dx>=0&&y+dy>=0&&x+dx<m.width&&y+dy<m.height)out.push((y+dy)*m.width+x+dx);return out;}
function populate(m){
 const tiles=R.closedPassages(m),flow=R.flood(tiles,m.width,m.height,m.entry),reserved=[m.entry,m.exit,...m.doors];
 const candidates=[];
 for(let k=0;k<tiles.length;k++){
  if(tiles[k]!==0||m.owner[k]>=0||flow.dist[k]<0||reserved.some(r=>distance(r,k,m.width)<=config.doorBuffer))continue;
  const around=neighbours(k,m),wall=around.some(a=>m.tiles[a]===1),edge=around.some(a=>m.tiles[a]===R.VOID||!m.road[a]);
  if(!wall&&!edge)continue;
  const access=around.filter(a=>R.canStep(tiles,m.width,m.height,a,k));if(access.length<3)continue;
  const jitter=R.hash(m.seed+'-loot-'+m.floor+'-'+k)/4294967296;
  candidates.push({cell:k,score:(wall?3:0)+(m.road[k]?0:2)+jitter*3});
 }
 candidates.sort((a,b)=>b.score-a.score||a.cell-b.cell);
 const count=config.minPoints+R.hash(m.seed+'-loot-count-'+m.floor)%(config.maxPoints-config.minPoints+1),points=[];
 let reached=flow.reached;
 for(const c of candidates){
  if(points.length>=count)break;
  if(points.some(p=>distance(p.cell,c.cell,m.width)<config.spacing))continue;
  tiles[c.cell]=6;const next=R.flood(tiles,m.width,m.height,m.entry);
  // A container may occupy its own square, never disconnect another square.
  if(next.reached!==reached-1){tiles[c.cell]=0;continue;}
  reached=next.reached;points.push(c);
 }
 const shuffled=catalog.slice().sort((a,b)=>R.hash(m.seed+'-'+m.floor+'-kind-'+a.id)-R.hash(m.seed+'-'+m.floor+'-kind-'+b.id));
 points.sort((a,b)=>flow.dist[a.cell]-flow.dist[b.cell]||a.cell-b.cell);
 m.lootPoints=points.map((p,i)=>({uid:'loot-'+i,cell:p.cell,assetId:shuffled[i%shuffled.length].id,name:shuffled[i%shuffled.length].name,index:i+1,searched:false}));
 for(const p of m.lootPoints)m.collision[p.cell]=6;
 const openTiles=m.collision.slice(),openFlow=R.flood(openTiles,m.width,m.height,m.entry);
 if(openFlow.reached!==openTiles.filter(R.walkable).length)throw Error('搜刮点阻断了通路。');
 for(const p of m.lootPoints){
  const accessTiles=tiles.slice();accessTiles[p.cell]=0;
  p.access=neighbours(p.cell,m).filter(k=>R.canStep(accessTiles,m.width,m.height,k,p.cell)&&openFlow.dist[k]>=0);
  if(!p.access.length)throw Error('搜刮点缺少操作位置。');
 }
 m.path=R.route(tiles,m.width,m.height,m.entry,m.exit);
 if(!m.path.length)throw Error('搜刮点阻断了撤离通路。');
 return m;
}
function accessible(s,p){
 if(!p||distance(s.player.cell,p.cell,s.map.width)!==1)return false;
 const E=globalThis.RuinsEncounter,t=E.collision(s,null,false);t[p.cell]=0;
 return R.canStep(t,s.map.width,s.map.height,s.player.cell,p.cell)&&E.lineOfSight(s,s.player.cell,p.cell)&&E.inspect(s,s.player,p.cell).identify;
}
function nearby(s){return(s.lootPoints||[]).filter(p=>accessible(s,p));}
function asset(p){const boss=globalThis.DungeonBossRoomArt?.asset(p.assetId);if(boss)return boss;const a=p.foodCrate?RuinsCanteenArt.containerAsset:catalog.find(a=>a.id===p.assetId),g=globalThis.DungeonGridArt;return g?.asset(p.assetId)?{...a,unsearched:g.legacy(p.assetId,'unsearched'),searched:g.legacy(p.assetId,'searched')}:a;}
function art(p){const state=p.search?.opened?'searched':'unsearched';return globalThis.DungeonGridArt?.legacy(p.assetId,state)||asset(p)[state];}
function load(p){
 if(globalThis.DungeonBossRoomArt?.asset(p.assetId)){DungeonBossRoomArt.load(p.assetId);return;}
 if(p.foodCrate){RuinsCanteenArt.load();return;}
 if(globalThis.DungeonGridArt?.asset(p.assetId)){DungeonGridArt.load(p.assetId);return;}
 const a=asset(p);if(typeof Image==='undefined')return;
 for(const state of ['unsearched','searched']){
  const source=a[state].src;if(images.has(source))continue;
  const image=new Image();images.set(source,image);image.onload=()=>invalidate();image.onerror=()=>console.error('搜刮棋子加载失败：'+source);image.src=source;
 }
}
function draw(ctx,p,x,y,scale,selected=false,progress=null){
 if(globalThis.DungeonBossRoomArt?.drawLoot(ctx,p,x,y,scale,selected,progress))return;
 if(p.foodCrate){RuinsCanteenArt.draw(ctx,p,x,y,scale,selected);if(progress!==null){ctx.fillStyle='#17271f';ctx.fillRect(x-scale*.5,y+scale*.33,scale,4);ctx.fillStyle='#e1c894';ctx.fillRect(x-scale*.5,y+scale*.33,scale*progress,4);}return;}
 load(p);const info=art(p),im=images.get(info.src),size=scale*(mapScales[p.assetId]??.75);
 if(selected){ctx.save();ctx.strokeStyle='#f2d39a';ctx.fillStyle='#e3bb6824';ctx.lineWidth=1.5;ctx.beginPath();ctx.ellipse(x,y,scale*.65,scale*.32,0,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.restore();}
 if(globalThis.DungeonGridArt?.asset(p.assetId)){DungeonGridArt.draw(ctx,p.assetId,p.search?.opened?'searched':'unsearched',x,y,scale,{point:p});}
 else if(im?.complete&&im.naturalWidth){
  const [bx,by,bw,bh,cx,bottom,baseWidth]=info.bounds,f=size*1.12/baseWidth;
  ctx.save();ctx.translate(x,y+size*.025);ctx.scale(size*.43,size*.17);
  const shade=ctx.createRadialGradient(0,0,0,0,0,1);shade.addColorStop(0,'#101a1490');shade.addColorStop(1,'#101a1400');
  ctx.fillStyle=shade;ctx.fillRect(-1,-1,2,2);ctx.restore();
  ctx.drawImage(im,bx,by,bw,bh,x+(bx-cx)*f,y+size*.16+(by-bottom)*f,bw*f,bh*f);
 }else{ctx.fillStyle='#d3b27e';ctx.fillRect(x-size*.25,y-size*.4,size*.5,size*.4);}
 if(progress!==null){ctx.fillStyle='#17271f';ctx.fillRect(x-scale*.5,y+scale*.33,scale,4);ctx.fillStyle='#e1c894';ctx.fillRect(x-scale*.5,y+scale*.33,scale*progress,4);}
}
globalThis.RuinsLoot={catalog,config,mapScales,populate,nearby,accessible,asset,art,load,draw,setInvalidation:fn=>invalidate=fn};
})();
