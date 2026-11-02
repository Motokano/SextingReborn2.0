import {createDungeonOverview} from './dungeon-map-overview.mjs';
import {dressStudyRoom} from './recipe-study-room-art-preview.mjs';
const $=id=>document.getElementById(id);let g,reveal=true,serial=1,full=false,overview;
const query=new URLSearchParams(location.search);if(query.has('seed'))$('seed').value=query.get('seed');
const studyArt=query.get('studyArt')==='1';
if(studyArt){
 document.title=document.querySelector('h1').textContent='资料室 · 陈设搭配预览';
 document.querySelector('main>p').textContent='旧铁档案架、图筒架和补面矮凳，与原资料台搭配。';
 const note=document.createElement('p');note.id='study-art-note';$('board-title').before(note);
 const link=document.createElement('a');link.href='recipe-study-room-art-review.html';link.textContent='查看三件陈设原图';document.querySelector('main>nav').prepend(link);
}
if(['1','2','3','4'].includes(query.get('floor')))$('floor').value=query.get('floor');
if(query.get('view')==='dungeon')$('overview').open=true;
const areas=new Map();let areaIndex=0;
const roomArea=(r,m)=>r.id===m.bossRoom?.roomId?'头目小屋':r.recipeStudyRoom?'资料室':r.workshop?'车间':r.clinic?'诊疗室':r.canteen?'食堂':r.resourceType?'资源庭院':r.outpostType?'据点房':'普通房';
function listAreas(){
 const m=g.DungeonRuntime.getSim().map;areas.clear();
 if(m.bossRoom)areas.set('头目小屋',[{cell:m.rooms.find(r=>r.id===m.bossRoom.roomId).center}]);
 areas.set('入口',[{cell:m.entry}]);areas.set('撤离口',[{cell:m.exit}]);
 const group=(name,p)=>{if(!areas.has(name))areas.set(name,[]);areas.get(name).push(p);};
 for(const r of m.rooms){if(r.id===m.bossRoom?.roomId)continue;const name=roomArea(r,m);const cell=r.inner.find(k=>g.RuinsSettlement.walkable(m.collision[k]));if(cell!==undefined){group(name,{cell});const ruin={doorless:'无门房间','open-foundation':'无墙遗址',breached:'缺墙房间'}[r.enclosure];if(ruin)group(ruin,{cell});}}
 for(const p of m.lootPoints)if(p.roomId===undefined)group('室外容器',p);
 for(const p of m.recoveryPoints)group('恢复设施',p);
 for(const p of m.insightPoints)group(p.kind==='recipe'?'配方资料台':'领悟设施',p);
 for(const e of m.enemies)if(/^enemy\.street_thug_tier[123]$/.test(e.enemyId))group(e.name,{cell:g.RuinsEncounter.neighbours(e.cell,m).find(k=>g.RuinsSettlement.walkable(g.DungeonRuntime.getSim().staticTiles[k])&&!m.enemies.some(n=>n.cell===k))??e.cell});
 for(const [i,k] of (m.path||[]).entries())if(i%12===6)group('道路与林地',{cell:k});
 $('area').replaceChildren(...[...areas].map(([name,points])=>{const o=document.createElement('option');o.value=name;o.textContent=name+'（'+points.length+'）';return o;}));areaIndex=0;
}
function visit(next=false){const points=areas.get($('area').value)||[];if(!points.length)return;areaIndex=next?(areaIndex+1)%points.length:0;const D=g.DungeonRuntime,m=D.getSim().map,p=points[areaIndex],cells=[p.cell,...g.RuinsResources.neighbours(p.cell,m)],cell=cells.find(k=>g.RuinsSettlement.walkable(D.getSim().staticTiles[k]));if(cell===undefined)return;g.GameEngine.setState(D.getRun().mapId,cell%m.width,Math.floor(cell/m.width));g.SceneCtx.setFacingDir(0);refresh();$('result').textContent=$('area').value+' · '+(areaIndex+1)+' / '+points.length+' · '+(studyArt?'陈设搭配预览 · 144px棋格 · 人物125%':'正式地图与实际素材');}
function size(){const frame=$('game'),scale=full?Math.min(1,$('board').clientWidth/1400):1;frame.style.width=full?'1400px':'100%';frame.style.height=full?'1000px':'720px';frame.style.transform=`scale(${scale})`;$('board').style.height=(full?1000*scale:720)+'px';if(g)refresh();}
new ResizeObserver(size).observe($('board'));
function refresh(){g.DungeonRuntime.refresh();overview?.schedule();}
function stand(inside){const m=g.DungeonRuntime.getSim().map,[l,t]=m.bossRoom.origin;g.GameEngine.setState(g.DungeonRuntime.getRun().mapId,l+(inside?3:4),t+(inside?4:10));g.SceneCtx.setFacingDir(0);$('area').value='头目小屋';$('result').textContent='头目小屋 · '+(inside?'屋内':'门外')+' · 固定布局，外圈地面随环境衔接';refresh();}
async function generate(){
 const target=Number($('floor').value);document.querySelectorAll('button,select').forEach(b=>b.disabled=true);$('status').textContent='正在生成并检查第'+target+'层…';await new Promise(requestAnimationFrame);
 try{
  const D=g.DungeonRuntime,E=g.GameEngine;D.restore(null);g.RuinsSeed.create=()=>$('seed').value.trim()||'fixed-den-review-1';
  g.CharacterAttributes.setState({character_creation_completed:true});g.Survival.setState({isDead:false,qi_li_current:100,diqi_current:1000});E.setState('M0_Field_02',7,7);
  if(!D.enter())throw Error('无法从检查站进入试场');
  for(let floor=1;floor<target;floor++){const m=D.getSim().map;E.setState(D.getRun().mapId,m.exit%m.width,Math.floor(m.exit/m.width));D.sync();if(!D.descend())throw Error('未能抵达选定楼层');}
  if(studyArt){$('study-art-note').textContent='当前楼层没有资料室。';await dressStudyRoom(g);}
  const m=D.getSim().map,room=m.bossRoom&&m.rooms.find(r=>r.id===m.bossRoom.roomId),bypass=g.RuinsSettlement.route(g.RuinsSettlement.closedPassages(m),m.width,m.height,m.entry,m.exit);
  if(!bypass.length||target===4&&(!room||room.inner.length!==40||room.lootPoints.length!==2))throw Error('通路或固定房间检查未通过');
  const spawn=m.bossRoom?.bossSpawn;
  $('status').textContent=`第${target}层 · ${m.width}×${m.height}格 · ${m.rooms.length}间房 · ${m.enemies.length}名敌人 · ${m.lootPoints.length}个容器 · 人物125%`+(spawn?` · 头目${spawn.present?'在场':'不在场'}（出现率${Math.round(spawn.chance*100)}%）`:'');
  const outdoor=m.lootPoints.filter(p=>p.roomId===undefined).length,recoveryOutside=m.recoveryPoints.filter(p=>p.outdoor).length,ruins=m.ruinSummary;
  $('distribution').textContent=`容器：房内${m.lootPoints.length-outdoor}、室外${outdoor} · 恢复点：房内${m.recoveryPoints.length-recoveryOutside}、房边${recoveryOutside}`+(ruins?` · 无门${ruins.doorless}间、无墙${ruins['open-foundation']}间、缺墙${ruins.breached}间`:'');
  const budget=m.populationBudget;if(budget)$('distribution').textContent+=` ｜ 敌人：房外${budget.nonRoom}、房内${budget.rooms.reduce((n,r)=>n+r.count,0)}、头目${budget.bosses} ｜ 混混/打手/老练：${[1,2,3].map(t=>m.enemies.filter(e=>e.enemyId==='enemy.street_thug_tier'+t).length).join('/')}`;
  const address=new URL(location.href);address.searchParams.set('seed',$('seed').value);address.searchParams.set('floor',String(target));history.replaceState(null,'',address);
  $('inside').hidden=$('outside').hidden=!m.bossRoom;
  listAreas();if(query.get('view')==='dungeon'||!m.bossRoom){$('area').value='入口';visit();}else stand(true);
  if(areas.has(query.get('area'))){$('area').value=query.get('area');visit();}
  // Share an exact visual regression location without altering a normal save.
  if(query.has('at')){const at=query.get('at').split(',').map(Number),[x,y]=at;if(at.length===2&&Number.isInteger(x)&&Number.isInteger(y)&&x>=0&&y>=0&&x<m.width&&y<m.height&&g.RuinsSettlement.walkable(D.getSim().staticTiles[y*m.width+x])){E.setState(D.getRun().mapId,x,y);if(areas.has(query.get('area')))$('area').value=query.get('area');$('result').textContent='局部复核 · '+x+','+y+' · 正式地图与实际素材';refresh();}}
  if(query.has('prop')){
   const id=query.get('prop'),p=m.workshopObstacles.find(p=>p.kind===id),occupied=new Set(m.enemies.map(e=>e.cell));
   const candidates=p&&[...new Set(p.footprint.flatMap(k=>g.RuinsResources.neighbours(k,m)))].filter(k=>!p.footprint.includes(k)&&!occupied.has(k)&&g.RuinsSettlement.walkable(D.getSim().staticTiles[k]));
   // Stand on the operator side, keeping both actor and prop in the camera.
   candidates?.sort((a,b)=>(b%m.width+Math.floor(b/m.width))-(a%m.width+Math.floor(a/m.width)));
   const cell=candidates?.[0];
   if(cell!==undefined){E.setState(D.getRun().mapId,cell%m.width,Math.floor(cell/m.width));$('area').value='车间';$('result').textContent='车床实景 · 2×1格 · 人物125% · 原图等比显示';refresh();}
   else $('result').textContent='本种子未找到指定设施，请切换地图区域查看。';
  }
  if(query.has('container')){
   const id=query.get('container'),p=m.lootPoints.find(p=>p.assetId===id);
   const cell=p&&g.RuinsResources.neighbours(p.cell,m).find(k=>g.RuinsSettlement.walkable(D.getSim().staticTiles[k]));
   if(cell!==undefined){E.setState(D.getRun().mapId,cell%m.width,Math.floor(cell/m.width));$('result').textContent='容器实景 · '+(g.DungeonGridArt.catalog[id]?.name||id)+' · 正式生成位置';refresh();}
   else $('result').textContent='本种子未找到指定容器，请切换地图区域查看。';
  }
  if(query.get('studyReward')==='potential'){
   // This iframe uses memory-only storage; the scenario never edits a player save.
   const p=D.getSim().insightPoints.find(g.RuinsRecipeStudy.isPoint);if(!p)throw Error('本层没有资料台');
   for(const id of p.recipeIds)g.ManufacturingKnowledge.grant(id);
   const cell=p.access[0];E.setState(D.getRun().mapId,cell%m.width,Math.floor(cell/m.width));g.SceneCtx.setFacingDir(g.RuinsEncounter.direction(cell,p.cell,m.width));refresh();g.DungeonPanel.openPoint('recipe',p.uid);
   g.document.body.classList.add('study-reward-preview');
   $('result').textContent='全配方已掌握 · 一次性潜能奖励试玩';
  }
  overview?.schedule();
 }catch(e){$('status').textContent='生成未完成：'+e.message;console.error(e);}finally{document.querySelectorAll('button,select').forEach(b=>b.disabled=false);}
}
try{
 const frame=$('game'),loaded=new Promise(resolve=>frame.onload=resolve);frame.src='street-thug-boss-room-game.html?no_reload';await loaded;g=frame.contentWindow;await g.AppBoot.ready;await g.DungeonRuntime.ready;
 g.document.getElementById('character-creation-overlay')?.classList.add('hidden');g.MapProjection.setMode('isometric');new g.ResizeObserver(()=>g.SceneRenderer.render()).observe(g.document.getElementById('map-container'));
 const D=g.DungeonRuntime,inspect=D.inspect,dynamic=D.dynamicMeta;D.updateAI=()=>({moves:[],attacks:[]});
 D.inspect=k=>reveal?{terrain:D.getSim()?.map.tiles[k]!==g.RuinsSettlement.VOID,raw:true,dynamic:true,identify:true,detail:true}:inspect(k);
 D.dynamicMeta=(x,y)=>{const meta=dynamic(x,y);if(!reveal)return meta;const s=D.getSim(),enemy=g.GameEngine.getMap().enemies.find(e=>e.x===x&&e.y===y);return {...meta,terrainVisible:s.map.tiles[y*s.map.width+x]!==g.RuinsSettlement.VOID,enemy:!!enemy,enemyId:enemy?.enemy_id,unknownPresence:false};};
 overview=createDungeonOverview(g,$('overview-map'),cell=>{const D=g.DungeonRuntime,m=D.getSim().map,room=m.rooms.find(r=>r.inner.includes(cell));g.GameEngine.setState(D.getRun().mapId,cell%m.width,Math.floor(cell/m.width));$('area').value=room?roomArea(room,m):'道路与林地';refresh();$('result').textContent='全景定位 · '+cell%m.width+','+Math.floor(cell/m.width);$('board-title').scrollIntoView({behavior:'smooth',block:'start'});});
 const render=g.SceneRenderer.render;g.SceneRenderer.render=function(...args){const value=render.apply(this,args);overview.schedule();return value;};
 $('generate').textContent='重新生成这一层';$('generate').onclick=generate;$('floor').onchange=generate;$('next').onclick=()=>{$('seed').value='dungeon-art-review-'+Date.now()+'-'+(++serial);generate();};
 $('visit').onclick=()=>visit();$('adjacent').onclick=()=>visit(true);$('area').onchange=()=>visit();
 $('scale').onclick=()=>{full=!full;$('scale').textContent=full?'区域全景 · 切回正常大小':'正常大小 · 查看区域全景';size();};
 $('inside').onclick=()=>stand(true);$('outside').onclick=()=>stand(false);
 $('sight').onclick=()=>{reveal=!reveal;$('sight').textContent=reveal?'布局总览 · 切换真实视野':'真实视野 · 查看布局总览';refresh();};
 $('searched').onclick=()=>{const s=D.getSim();for(const p of s.lootPoints){p.search.opened=!p.search.opened;p.search.complete=p.search.opened;}for(const p of [...s.recoveryPoints,...s.insightPoints])p.used=!p.used;refresh();};
 await generate();
}catch(e){$('status').textContent='试场加载失败：'+e.message;console.error(e);}
