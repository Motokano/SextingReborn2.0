import {installBossRoomBoard} from './street-thug-boss-room-board-layout.mjs';
import {installBossRoomArt} from './street-thug-boss-room-board-art.mjs';
import {installLayoutEditor} from './street-thug-boss-room-layout-editor.mjs';
const $=id=>document.getElementById(id),frame=$('game');
const reviewParams=new URLSearchParams(location.search);
let full=reviewParams.get('view')!=='normal',reveal=true,combat=false,g,art,editor;
const requestedPawnScale=reviewParams.get('pawn');
let pawnScale=requestedPawnScale==='1'?1:1.25;
function size(){const width=$('board').clientWidth,scale=full?Math.min(1,width/1500):1;frame.style.width=full?'1500px':'100%';frame.style.height=full?'1400px':'720px';frame.style.transform=`scale(${scale})`;$('board').style.height=(full?1400*scale:720)+'px';if(g)g.SceneRenderer.render();}
new ResizeObserver(size).observe($('board'));size();
function message(text){$('message').textContent=text;$('layout-feedback').textContent=text;}
function refresh(){g.DungeonRuntime.refresh();const p=g.GameEngine.getState(),b=g.CombatEnemies.bossInfo('enemy.street_thug_boss',p.mapId,0);$('status').textContent=`${full?'缩小全景':'正常棋盘大小'} · 人物${Math.round(pawnScale*100)}% · ${reveal?'布置总览':'主角真实视野'} · ${combat?'头目行动中':'头目待机'} · 主角位置 ${p.x-3},${p.y-3} · 头目底气 ${b?.diqi??500}/500`;}
function stand(x,y){if(!g.GameEngine.isWalkable(x,y))return message('这个位置已被占用。');g.GameEngine.setState(g.DungeonRuntime.getRun().mapId,x,y);g.SceneCtx.setFacingDir(0);refresh();}
try{
 // A real HTTP document keeps the embedded game's address inspectable. Its
 // first script installs memory storage before any game code can read a save.
 const loaded=new Promise((resolve,reject)=>{frame.onload=resolve;frame.onerror=()=>reject(Error('游戏页面未能载入'));});
 frame.src='tools/street-thug-boss-room-game.html?no_reload';await loaded;
 g=frame.contentWindow;await g.AppBoot.ready;await g.DungeonRuntime.ready;
 g.PawnDisplayScale=pawnScale;
 g.CharacterAttributes.setState({character_creation_completed:true,innate:{jingu:60,flexibility:20,breath:40,dexterity:20,focus:20}});
 g.document.getElementById('character-creation-overlay')?.classList.add('hidden');g.MapProjection.setMode('isometric');
 new g.ResizeObserver(()=>g.SceneRenderer.render()).observe(g.document.getElementById('map-container'));
 art=await installBossRoomArt(g);
 const D=g.DungeonRuntime,E=g.GameEngine,inspect=D.inspect,dynamic=D.dynamicMeta,ai=D.updateAI;
 D.inspect=k=>reveal?{terrain:D.getSim()?.map.tiles[k]!==g.RuinsSettlement.VOID,raw:true,dynamic:true,identify:true,detail:true}:inspect(k);
 D.dynamicMeta=(x,y)=>{const meta=dynamic(x,y);if(!reveal)return meta;const k=y*D.getSim().map.width+x,e=E.getMap().enemies.find(e=>e.x===x&&e.y===y);return{...meta,terrainVisible:D.getSim().map.tiles[k]!==g.RuinsSettlement.VOID,enemy:!!e,enemyId:e?.enemy_id,unknownPresence:false};};
 D.updateAI=o=>combat?ai(o):{moves:[],attacks:[]};
 function reset(){combat=false;installBossRoomBoard(g);for(const id of ['combat_basic_unarmed','combat_basic_breath','combat_basic_footwork'])g.InventoryEquipment.getSkillsState()[id]={level:120,move_usage:{}};g.InventoryEquipment.setCombatState({hubs:{breath:'combat_basic_breath',footwork:'combat_basic_footwork'},limbs:{lhand:{active:'combat_basic_unarmed'},rhand:{active:'combat_basic_unarmed'},lfoot:{active:'combat_basic_unarmed'},rfoot:{active:'combat_basic_unarmed'}}});for(const p of ['head','chest','abdomen','lhand','rhand','lfoot','rfoot'])g.CharacterAttributes.recoverPartDestroy(p,10000);g.Survival.setState({isDead:false,qi_li_current:100,diqi_current:1000});$('ai').textContent='头目待机 · 开始交手';refresh();}
 reset();
 editor=installLayoutEditor({g,art,frame,refresh,message,onMode(editing){
  if(editing){combat=false;reveal=true;$('ai').textContent='头目待机 · 开始交手';$('sight').textContent='布置总览 · 切换主角视野';}
 }});
 if(reviewParams.get('view')==='normal')editor.setEditing(false);
 $('scale').textContent=full?'房间全景 · 切换正常大小':'正常大小 · 查看房间全景';
 await art.renderScaleComparison($('scale-comparison'));
 $('pawn-scale').textContent=pawnScale===1.25?'人物125% · 切回原尺寸':'人物100% · 试放大25%';
 $('pawn-scale').onclick=async()=>{
  pawnScale=pawnScale===1.25?1:1.25;g.PawnDisplayScale=pawnScale;
  await g.PlayerPawnRig.getDialoguePortrait();g.PlayerPawnRig.update(g.document.querySelector('.player-pawn-visual'));
  await art.renderScaleComparison($('scale-comparison'));
  $('pawn-scale').textContent=pawnScale===1.25?'人物125% · 切回原尺寸':'人物100% · 试放大25%';refresh();
 };
 $('proportions').onclick=()=>{$('proportion-review').open=!$('proportion-review').open;if($('proportion-review').open)$('proportion-review').scrollIntoView({block:'start',behavior:'smooth'});};
 $('corpse-preview').onclick=()=>{
  editor.setEditing(false);combat=false;reveal=true;full=false;
  $('ai').textContent='头目待机 · 开始交手';$('scale').textContent='正常大小 · 查看房间全景';
  const s=D.getSim(),prefix='art-review-corpse-';s.corpses=s.corpses.filter(p=>!p.uid.startsWith(prefix));
  for(const [i,x,y,marked]of [[0,7,7,false],[1,8,7,true]])s.corpses.push({uid:prefix+i,kind:'corpse',name:'尸体',cell:y*s.map.width+x,marked,search:{opened:false,complete:false,cursor:0,items:[]}});
  size();stand(6,7);message('主角旁依次是普通袋、带交叉胶带的已标记袋。它们使用正式地图的尸体绘制与遮挡；重置试场可移除样例。');
 };
 $('scale').onclick=()=>{full=!full;$('scale').textContent=full?'房间全景 · 切换正常大小':'正常大小 · 查看房间全景';size();refresh();};
 $('sight').onclick=()=>{editor.setEditing(false);reveal=!reveal;$('sight').textContent=reveal?'布置总览 · 切换主角视野':'主角视野 · 查看完整布置';refresh();};
 $('grid').onclick=()=>{art.grid=!art.grid;$('grid').textContent=art.grid?'隐藏格线':'显示格线';refresh();};
 $('directions').onclick=()=>{art.directions=!art.directions;$('directions').textContent=art.directions?'隐藏家具朝向':'显示家具朝向';refresh();};
 $('ai').onclick=()=>{editor.setEditing(false);combat=!combat;$('ai').textContent=combat?'头目行动中 · 暂停交手':'头目待机 · 开始交手';message(combat?'每次移动或等待都会推进真实战斗。主角基本技能临时设为120，方便试走和交手。':'头目已待机，可以继续观察布置。');refresh();};
 $('reset').onclick=()=>{reset();editor.reapply();};
 for(const id of ['entrance','center','back','pillar'])$(id).onclick=()=>stand(...D.getSim().map.bossRoomReview.observations[id]);
 $('rack').onclick=()=>{full=false;art.grid=true;$('scale').textContent='正常大小 · 查看房间全景';$('grid').textContent='隐藏格线';size();stand(...D.getSim().map.bossRoomReview.observations.rack);message('货架按1×2格底面重画，金色边线标出占地外缘；人物站在取货面前，使用正常棋盘尺寸。');};
 $('door').onclick=()=>{const d=D.getSim().doors[0],p=E.getState();if(p.y*D.getSim().map.width+p.x===d.cell)return message('请先从门格走开。');d.closed=!d.closed;message(d.closed?'铁门已关闭，可切换主角视野检查遮挡。':'铁门已打开。');refresh();};
 $('searched').onclick=()=>{for(const p of D.getSim().lootPoints){p.search.opened=!p.search.opened;p.search.complete=p.search.opened;}refresh();};
 document.querySelectorAll('[data-step]').forEach(b=>b.onclick=()=>{const [dx,dy]=b.dataset.step.split(',').map(Number),p=E.getState(),w=D.getSim().map.width;g.SceneCtx.setFacingDir(g.RuinsEncounter.direction(p.y*w+p.x,(p.y+dy)*w+p.x+dx,w));const moved=E.moveTo(p.x+dx,p.y+dy);message(moved?'移动了一格。':'这里不能通过：目标格或转角被挡住了。');refresh();});
 $('wait').onclick=()=>{g.Survival.advanceTick();refresh();};
 document.querySelectorAll('button').forEach(b=>b.disabled=false);editor.controls();size();refresh();
 if(reviewParams.has('corpse'))$('corpse-preview').click();
}catch(e){$('status').textContent='试场载入失败：'+e.message;console.error(e);}
