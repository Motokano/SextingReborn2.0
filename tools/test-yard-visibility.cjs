const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),path=require('path');
const game=path.resolve(__dirname,'..'),formal=true;
const sceneFile=formal?path.join(game,'js/scene-renderer.js'):path.join(__dirname,'staged/scene-renderer.js');
const artFile=formal?path.join(game,'js/core/base-hideout-art.js'):path.resolve(__dirname,'../../outputs/hideout-art-v1/base-hideout-art.js');
const source=fs.readFileSync(sceneFile,'utf8').replace(/\r/g,''),ops=[],styles=[],painted=[];let minute=0,dir=4;
const cfg=JSON.parse(fs.readFileSync(path.join(game,'data/survival-config.json'),'utf8'));
const canvas=new Proxy({save(){},restore(){},fillRect(...args){ops.push('fillRect');painted.push({args,style:this.fillStyle});},createRadialGradient(){ops.push('gradient');return{addColorStop(){}};}},{get(o,k){return o[k]||(()=>ops.push(k));},set(o,k,v){if(k==='fillStyle')styles.push(v);o[k]=v;return true;}});
const c={console,document:{getElementById:()=>({})},PlayerFacing:{getDir:()=>dir},GameTime:{getState:()=>({minuteOfDay:minute})},Survival:{getConfigValue:k=>cfg[k]}};
c.window=c;vm.createContext(c);vm.runInContext(fs.readFileSync(artFile,'utf8'),c);vm.runInContext(source,c);
const yard={map_id:'M0_Base_Outside_lv_1',width:16,height:16};
const frame={ctx:canvas,map:yard,state:{x:8,y:8},cellPx:101,cellCenter:()=>({x:300,y:300}),mapWidthPx:2300,mapHeightPx:1700,groundVisibilityHandled:true};
for(minute of [0,720,1260]){
  ops.length=0;styles.length=0;c.SceneRenderer.renderEffects(frame);
  assert(!ops.includes('gradient'),'courtyard lighting has no moving visibility hole');
  assert(!ops.includes('beginPath'),'upper layer must not cut raised scenery');
  assert.equal(ops.filter(v=>v==='fillRect').length,1,'one continuous day/night tint');
  const alpha=Number(styles[0].match(/,([\d.]+)\)$/)[1]);assert(alpha>0&&alpha<=.34);
}
function groundMasks(m,d){minute=m;dir=d;painted.length=0;ops.length=0;c.SceneRenderer.renderGroundEffects(frame);return new Set(painted.filter(p=>p.style==='rgba(6, 8, 14, 0.960)').map(p=>(p.args[0]-1)/101+','+(p.args[1]-1)/101));}
const south=groundMasks(720,4),north=groundMasks(720,0),night=groundMasks(0,4);
assert(south.size>0&&south.size<256,'courtyard ground is no longer fully visible');
assert(!south.has('8,13')&&south.has('8,3'),'front road visible, rear distant road hidden');
assert(north.has('8,13')&&!north.has('8,3'),'turning reverses visible terrain');
assert(!south.has('8,7'),'rear adjacent stepping tile stays visible');
assert(night.size>south.size&&night.has('8,13'),'night reduces the visible distance using existing configuration');
ops.length=0;c.SceneRenderer.renderGroundEffects({...frame,map:{...yard,map_id:'M0_Field_01'}});assert.equal(ops.length,0,'field has no extra ground pass');
ops.length=0;c.SceneRenderer.renderEffects({...frame,groundVisibilityHandled:false});assert(ops.filter(v=>v==='fillRect').length>1,'missing ground pass falls back to fog instead of exposing map');
ops.length=0;c.SceneRenderer.renderEffects({...frame,map:{...yard,map_id:'M0_Field_01'}});
assert(ops.includes('gradient'),'field keeps original radial night layer');
assert(ops.filter(v=>v==='fillRect').length>1,'field keeps per-cell fog');
ops.length=0;c.CombatFxRuntime={render(){}};c.SceneRenderer.renderCombatEffects(frame);
assert(ops.filter(v=>v==='fillRect').length>1,'unseen combat effects remain masked even in courtyard');
let dungeonFog=0;c.DungeonRuntime={active:()=>true};c.DungeonArt={fog(){dungeonFog++;}};
c.SceneRenderer.renderEffects({...frame,map:{...yard,dungeon:true}});assert.equal(dungeonFog,1,'dungeon uses its own unchanged exploration fog');
c.DungeonRuntime={active:()=>false};

// Execute the actual metadata function against controlled nearby/hidden entities.
// Only engine inputs are stubbed; visibility branches come from the live source.
const metaSource=source.match(/getDynamicMetaAt: (function \(gx, gy\) \{[\s\S]*?)\n            },\n            onTileClick:/)[1]+'\n}';
Object.assign(c,{map:yard,st:{x:0,y:0,mapId:yard.map_id},getCtx:()=>({}),
 E:{isAdjacent:()=>false,isWalkable:()=>true,getPortalAt:()=>null,getEntityAt:()=> 'gathering_grass',getInteractNpcIdAt:()=> 'npc.test',getEnemyAt:()=> 'enemy.test'},IE:{getGroundItemsAt:()=>[{item_id:'hidden'}],getItemTemplate:()=>({})},
 visionProfile:{visualRadius:3,identifyRadius:2,detailRadius:1,adjacentDetailRadius:1},facingCfgForVisionMeta:{enabled:true},occlusionUiCfgForMeta:{enabled:true,stripDynamicOnRearAdjacent:true},
 chebyshevDistance:(x,y,a,b)=>Math.max(Math.abs(x-a),Math.abs(y-b)),getFacingVisionMultiplier:()=>1,isInFieldOfView:()=>true,isRearAdjacentTriple:()=>false,resolvePlayerFacingDir:()=>0,
 hasGroundVisibility:map=>c.BaseHideoutArt.usesGroundVisibility(map)});
const meta=vm.runInContext('('+metaSource+')',c);
const hidden=meta(12,12);assert(!hidden.environmentVisible);assert(!hidden.terrainVisible&&!hidden.sceneryVisible);assert(!hidden.npc&&!hidden.enemy&&!hidden.gathering&&!hidden.groundCount);
const near=meta(1,0);assert(near.npc&&near.enemy&&near.gathering&&near.groundCount===1);
c.isRearAdjacentTriple=()=>true;const rear=meta(1,0);assert(!rear.sceneryVisible&&!rear.npc&&!rear.enemy&&!rear.gathering&&!rear.groundCount);
c.map={...yard,map_id:'M0_Field_01'};assert(!meta(12,12).environmentVisible);
console.log('PASS real courtyard directional ground masks, nighttime range, whole-shell upper lighting, fallback fog and hidden dynamic entities; field/dungeon/combat unchanged');
