import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {boot} from './ui-game-fixture.mjs';
import {inspectPng} from './inspect-device-png.mjs';
const copy=v=>JSON.parse(JSON.stringify(v));
const mapId='M0_Base_Outside_lv_1';
const map=JSON.parse(fs.readFileSync('data/maps/'+mapId+'.json','utf8'));
test('approved originals, 50 occupied cells and connected courtyard paths',()=>{
 const manifest=JSON.parse(fs.readFileSync('assets/map/isometric/farm-ranch-5x5-v1/manifest.json','utf8'));
 for(const a of manifest.assets){
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(a.file)).digest('hex'),a.sha256);
  const info=inspectPng(a.file);assert.ok(info.transparentFraction>.3);assert.deepEqual(info.cornerAlpha,[0,0,0,0]);
 }
 assert.equal(manifest.assets.find(a=>a.id==='ranch').sha256,'700e6ad0ff3bdf28a4de5140e8e02c413b0bda5edab249800677f970a249687c');
 assert.equal(crypto.createHash('sha256').update(fs.readFileSync('assets/map/isometric/farm-ranch-5x5-v1/ranch-approved.png')).digest('hex'),'763e2a947c99caaa3b83c389faffe40a10e3944a0bb1104eaedeb266a538edb6','previous user source is preserved');
 assert.deepEqual(map.facility_footprints.map(f=>[f.id,f.x,f.y,f.width,f.height]),[['farm',0,8,5,5],['ranch',11,7,5,5]]);
 const occupied=new Set();
 for(const f of map.facility_footprints)for(let y=f.y;y<f.y+f.height;y++)for(let x=f.x;x<f.x+f.width;x++){
  const key=x+','+y;assert.ok(!occupied.has(key));occupied.add(key);
  assert.ok(map.blocks.some(b=>b.x===x&&b.y===y));
  assert.ok(!map.portals.some(b=>b.x===x&&b.y===y));
  assert.equal(map[(f.id==='farm'?'agriculture':'livestock')+'_station_interact_npc_by_cell'][key],f.npc_id);
 }
 assert.equal(occupied.size,50);
 const blocked=new Set(map.blocks.map(p=>p.x+','+p.y)),reachable=new Set(['7,15']),queue=[[7,15]];
 while(queue.length){const [x,y]=queue.shift();for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy,k=nx+','+ny;if(nx<0||ny<0||nx>=16||ny>=16||blocked.has(k)||reachable.has(k))continue;reachable.add(k);queue.push([nx,ny]);}}
 for(const p of map.portals)assert.ok(reachable.has(p.x+','+p.y));
 for(const f of map.facility_footprints)assert.ok([...reachable].some(k=>{const [x,y]=k.split(',').map(Number);return Math.max(f.x-x,0,x-f.x-f.width+1,f.y-y,y-f.y-f.height+1)===1;}));
});
for(const full of [false,true])test(`${full?'Svelte':'native'} outdoor access, stale menus, collision and saved progress`,async()=>{
 const h=await boot(full),g=h.g,E=g.GameEngine;
 try{
  g.DialogueUI.close();g.SceneApp.openCharacterCreationAfterIntro();await h.drain();
  const input=g.document.querySelector('#creation-name');input.value='户外设施验收';input.dispatchEvent(new g.Event('input',{bubbles:true}));await h.drain();g.document.querySelector('#btn-confirm-creation').click();await h.drain();g.DialogueUI.close();
  g.Survival.setState({stamina:100,fatigue:0,satiety:100,thirst:100,isDead:false,isComa:false});
  E.setState('M0_Base_Inside_lv_1',10,14);
  assert.equal(E.getInteractNpcIdAt(10,15),null);assert.equal(E.getInteractNpcIdAt(9,15),null);
  assert.ok(E.isWalkable(10,15));assert.ok(E.isWalkable(9,15));
  g.SceneApp.openAgriculturePanel();g.SceneApp.openLivestockPanel();
  assert.ok(!g.document.querySelector('#modal-agriculture').classList.contains('show'));
  assert.ok(!g.document.querySelector('#modal-livestock').classList.contains('show'));
  for(const f of map.facility_footprints){
   const id=f.id==='farm'?'agriculture':'livestock';E.setState(mapId,7,12);
   for(let y=f.y;y<f.y+5;y++)for(let x=f.x;x<f.x+5;x++){
    assert.equal(E.getInteractNpcIdAt(x,y),f.npc_id);assert.equal(E.isWalkable(x,y),false);assert.equal(E.canStandAt(x,y),false);
    assert.equal(E.jumpTo(x,y),false);
   }
   // Every reachable edge tile shares the original repair and management entry.
   for(let y=f.y-1;y<=f.y+5;y++)for(let x=f.x-1;x<=f.x+5;x++){
    if(x<0||y<0||x>=16||y>=16||!E.isWalkable(x,y))continue;
    if(Math.max(f.x-x,0,x-f.x-4,f.y-y,y-f.y-4)!==1)continue;
    E.setState(mapId,x,y);assert.ok(g.FacilityLabor.nearby(id),`${id} ${x},${y}`);
   }
   const edge=f.id==='farm'?[5,10]:[10,9];E.setState(mapId,...edge);
   assert.equal(g.FacilityLabor.isUnlocked(id),false,'placement does not restore facility');
   g.NPCSystem.setDemoFlag('facility_cleaned:'+id,true);g.NPCSystem.setDemoFlag('facility_restored:'+id,true);
   let menu;const detach=g.NPCSystem.menu.attachView(v=>menu=v);
   E.setState(mapId,7,14);await g.NPCSystem.openMenu(f.npc_id);assert.equal(menu.open,false,'remote menu stays closed');E.setState(mapId,...edge);
   await g.NPCSystem.openMenu(f.npc_id);assert.ok(menu.open);
   const button=menu.buttons.find(b=>/管理/.test(b.text));assert.ok(button);
   E.setState(mapId,7,14);const before=g.GameTime.getState().totalTicks;g.NPCSystem.menu.choose(button.id);assert.equal(g.GameTime.getState().totalTicks,before,'stale menu costs no time');
   assert.ok(!g.document.querySelector('#modal-'+id).classList.contains('show'));
   E.setState(mapId,...edge);await g.NPCSystem.openMenu(f.npc_id);g.NPCSystem.menu.choose(menu.buttons.find(b=>/管理/.test(b.text)).id);await h.drain();
   assert.ok(g.document.querySelector('#modal-'+id).classList.contains('show'),id+' opens at far edge');
   const tick=g.GameTime.getState().totalTicks;E.setState(mapId,7,14);assert.ok(!g.document.querySelector('#modal-'+id).classList.contains('show'));assert.equal(g.GameTime.getState().totalTicks,tick,'forced close is free');detach();
  }
  const a=g.AgricultureMap.ensureState();a.map[3][3].tilled=true;
  g.NPCSystem.setDemoFlag('facility_labor:agriculture',432);g.NPCSystem.setDemoFlag('facility_labor:livestock',123);
  const snap=copy(g.SaveSystem.buildSnapshotForDebug());snap.player.engine={mapId,x:13,y:9};
  assert.equal(g.SaveSystem.applySnapshotForDebug(snap),true);await h.drain();
  assert.equal(E.isWalkable(E.getState().x,E.getState().y),true,'old occupied position moves to usable ground');
  const saved=copy(g.SaveSystem.buildSnapshotForDebug());
  assert.deepEqual(saved.agriculture_map,snap.agriculture_map);assert.deepEqual(saved.livestock,snap.livestock);
  assert.equal(g.FacilityLabor.progress('agriculture'),432);assert.equal(g.FacilityLabor.progress('livestock'),123);
  assert.equal(saved.time.totalTicks,snap.time.totalTicks);assert.deepEqual(h.errors,[]);
 }finally{await h.close();}
});
