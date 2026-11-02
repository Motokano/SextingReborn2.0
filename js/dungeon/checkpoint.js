/* The checkpoint uses real NPC, dungeon and save services; no demo inventory. */
(()=>{'use strict';
const E=()=>globalThis.GameEngine,D=()=>globalThis.DungeonRuntime;
let definition=null,walkTimer=null,walkEpoch=0;
const id=()=>D()?.config()?.entryNpcId||'npc.checkpoint.ruins';
function isKeeper(npcId){return npcId===id();}
function records(){return E()?.getMap()?.npcs?.filter(n=>isKeeper(n.npc_id))||[];}
function blocks(x,y){return records().some(n=>n.x===x&&n.y===y);}
function canStep(from,x,y){return !(x!==from.x&&y!==from.y&&(blocks(x,from.y)||blocks(from.x,y)));}
function nearby(){const p=E()?.getState();if(!p||D()?.active()||!D()?.config()?.entryMaps.includes(p.mapId))return null;
 return records().find(n=>Math.max(Math.abs(n.x-p.x),Math.abs(n.y-p.y))===1&&
  (n.x===p.x||n.y===p.y||E().isWalkable(n.x,p.y)&&E().isWalkable(p.x,n.y)))||null;
}
function canAccess(){return !!nearby()&&!globalThis.Survival?.isDead?.()&&!globalThis.Survival?.isComa?.()&&
 !!globalThis.CharacterAttributes?.isCharacterCreationCompleted?.()&&globalThis.NPCSystem?.isNpcPresentNow(id())!==false;}
function outstanding(){return (D()?.getRecovered()||[]).filter(b=>!b.opened||b.allocation?.player.some(i=>!i.claimed)).length;}
function open(def){if(!canAccess())return false;definition=def;cancelApproach();globalThis.DungeonPanel?.showCheckpoint();return true;}
function title(){return definition?.displayTitle||'检查站看守';}
function greeting(){return definition?.checkpoint?.greeting||'封好口的，我给你带回来。没封的，不归我管。';}
// Quest content remains owned by its future provider, just like DungeonContent.hasClue/apply.
function tasks(){const c=globalThis.DungeonContent;if(!canAccess()||typeof c?.checkpointTasks!=='function'||typeof c?.performCheckpointTask!=='function')return[];
 const rows=c.checkpointTasks(id());return Array.isArray(rows)?rows.filter(t=>t&&typeof t.id==='string'&&typeof t.name==='string'&&['available','ready'].includes(t.state)):[];}
function task(taskId){if(!tasks().some(t=>t.id===taskId))return false;const result=globalThis.SaveSystem.runAtomic(()=>{
 if(!canAccess()||!tasks().some(t=>t.id===taskId))return false;
 return globalThis.DungeonContent.performCheckpointTask(id(),taskId)===true;
 });return result.saved&&result.value===true;}
function cancelApproach(){walkEpoch++;clearTimeout(walkTimer);walkTimer=null;}
function routeTo(target){const map=E().getMap(),start=E().getState(),q=[{x:start.x,y:start.y}],prev=new Map([[start.x+','+start.y,null]]);
 const safe=(x,y)=>x>=0&&y>=0&&x<map.width&&y<map.height&&E().canStandAt(x,y)&&!E().getPortalAt(x,y);
 for(let i=0;i<q.length;i++){const p=q[i];if(Math.max(Math.abs(p.x-target.x),Math.abs(p.y-target.y))===1&&
  (p.x===target.x||p.y===target.y||E().isWalkable(target.x,p.y)&&E().isWalkable(p.x,target.y))){const out=[];let at=p;while(prev.get(at.x+','+at.y)){out.unshift(at);at=prev.get(at.x+','+at.y);}return out;}
  for(const [dx,dy]of [[0,1],[-1,0],[1,0],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]){const x=p.x+dx,y=p.y+dy,k=x+','+y;if(prev.has(k)||!safe(x,y)||dx&&dy&&(!safe(p.x+dx,p.y)||!safe(p.x,p.y+dy)))continue;prev.set(k,p);q.push({x,y});}
 }return null;
}
function approach(x,y){if(!blocks(x,y)||D().active()||globalThis.DungeonPanel?.isEntryOpen())return false;
 if(globalThis.SceneApp?.guardPlayerActionBlocked?.(globalThis.SceneApp.ACTION_TYPES.NPC_INTERACT))return false;
 cancelApproach();const target=records().find(n=>n.x===x&&n.y===y),route=routeTo(target);if(!route)return false;
 const token=walkEpoch,mapId=E().getState().mapId;let expected={...E().getState()};
 function step(){const s=E().getState();if(token!==walkEpoch||document.hidden||s.mapId!==mapId||s.x!==expected.x||s.y!==expected.y||globalThis.Survival?.isDead?.()||globalThis.Survival?.isComa?.())return cancelApproach();
  const next=route.shift();if(!next){walkTimer=null;if(canAccess())globalThis.SceneCtx?.actions?.interactNpc(id());return;}
  if(!E().canStandAt(next.x,next.y)||!canStep(s,next.x,next.y)||next.x!==s.x&&next.y!==s.y&&(!E().canStandAt(next.x,s.y)||!E().canStandAt(s.x,next.y)))return cancelApproach();
  globalThis.SceneCtx?.actions?.tryIntentMove(next.x,next.y,next.x-s.x,next.y-s.y,'checkpoint');
  const actual=E().getState();if(actual.mapId!==mapId||actual.x!==next.x||actual.y!==next.y)return cancelApproach();
  expected={...actual};walkTimer=setTimeout(step,140);
 }step();return true;
}
document.addEventListener('keydown',cancelApproach,true);document.addEventListener('pointerdown',cancelApproach,true);
document.addEventListener('visibilitychange',()=>{if(document.hidden)cancelApproach();});
globalThis.DungeonCheckpoint={id,isKeeper,blocks,canStep,nearby,canAccess,outstanding,open,title,greeting,tasks,task,approach,cancelApproach};
})();
