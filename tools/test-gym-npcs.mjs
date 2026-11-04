import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {makeLayoutMap,validateLayout,layoutSolids,stationCells,findLayoutPath} from './gym-hideout-layout.mjs';
const read=p=>fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''),json=p=>JSON.parse(read(p));
const layout=json('data/gym-layout.json');
const floor=layout.stations.find(s=>s.id==='floor'),cable=layout.stations.find(s=>s.id==='cable');
async function boot(){
  let actor={...layout.player,mapId:layout.mapId},dead=false,coma=false,job=null,snapshot;
  const calls=[],levels=Object.fromEntries(layout.stations.map(s=>[s.id,1]));
  const g=vm.createContext({console,document:{querySelectorAll:()=>[]},fetch:async path=>({ok:true,json:async()=>json(path)}),localStorage:{getItem:()=>null,setItem:()=>{throw Error('NPC menu must not save');}}});
  g.window=g;g.SceneCtx={E:{getState:()=>actor}};
  g.Survival={isDead:()=>dead,getState:()=>({isComa:coma})};
  for(const f of ['js/dungeon/ui-icons.js','js/npc-system.js','js/gym-facility.js'])vm.runInContext(read(f),g,{filename:f});
  g.NPCSystem.menu.attachView(s=>{snapshot=s;for(const b of s.buttons)g.RuinsUIIcons.svg(b.icon);});
  const host={position:()=>actor,placement:id=>layout.stations.find(s=>s.id===id),level:id=>levels[id],job:()=>job,action:()=>({station:'floor'}),open:(id,action)=>{calls.push([id,action]);return true;}};
  g.GymFacility.bind(host);
  return {g,calls,levels,host,get view(){return snapshot;},position:p=>{actor={...actor,...p};},dead:v=>{dead=v;},coma:v=>{coma=v;},job:v=>{job=v;}};
}
test('all eight registered NPCs load real menus, icons, build and upgrade dispatch',async()=>{
  const h=await boot(),{g}=h;
  for(const station of layout.stations){
    const id=g.GymFacility.npcId(station.id);
    await g.NPCSystem.preloadNpc(id);
    h.position({x:station.x-1,y:station.y});
    await g.NPCSystem.openMenu(id);
    assert.equal(h.view.open,true,id);assert.equal(h.view.compact,true);
    assert.deepEqual(Array.from(h.view.buttons,b=>b.text),['训练','升级']);
    assert.equal(h.view.hint,'');assert.equal(h.calls.length,0,'looking does not execute');
    g.NPCSystem.menu.choose(1);assert.deepEqual(h.calls.pop(),[station.id,'upgrade']);assert.equal(h.view.open,false);
    h.levels[station.id]=0;await g.NPCSystem.openMenu(id);
    assert.deepEqual(Array.from(h.view.buttons,b=>b.text),['建造']);
    g.NPCSystem.menu.choose(0);assert.deepEqual(h.calls.pop(),[station.id,'build']);
    h.levels[station.id]=1;
  }
});
test('remote, footprint, off-map, coma, death and stale menu choices cannot operate',async()=>{
  const h=await boot(),{g}=h,id=g.GymFacility.npcId('floor');
  for(const p of [{x:0,y:0},{x:floor.x,y:floor.y},{x:floor.x,y:floor.y+1},{x:floor.x-1,y:floor.y-1},{x:floor.x-1,y:floor.y,mapId:'elsewhere'}]){
    h.position({...p,mapId:p.mapId||layout.mapId});await g.NPCSystem.openMenu(id);assert.equal(h.view.open,false);
  }
  h.position({x:floor.x-1,y:floor.y,mapId:layout.mapId});
  for(const flag of ['dead','coma']){h[flag](true);await g.NPCSystem.openMenu(id);assert.equal(h.view.open,false);h[flag](false);}
  await g.NPCSystem.openMenu(id);h.position({x:floor.x-1,y:floor.y+1});g.NPCSystem.menu.choose(0);assert.equal(h.calls.length,0,'moving even to another valid neighbour invalidates old choice');
  await g.NPCSystem.openMenu(id);h.dead(true);g.NPCSystem.menu.choose(1);assert.equal(h.calls.length,0);
  h.dead(false);g.NPCSystem.menu.close();g.NPCSystem.menu.choose(0);assert.equal(h.calls.length,0);
  g.GymFacility.bind(null);await g.NPCSystem.openMenu(id);assert.equal(h.view.open,false,'unbound formal game does not expose prototype actions');
});
test('busy menu only resumes current training and rejects late upgrades',async()=>{
  const h=await boot(),{g}=h,id=g.GymFacility.npcId('floor');h.position({x:floor.x-1,y:floor.y});
  await g.NPCSystem.openMenu(id);h.job({kind:'train',actionId:'pushup'});g.NPCSystem.menu.choose(1);assert.equal(h.calls.length,0);
  await g.NPCSystem.openMenu(id);assert.deepEqual(Array.from(h.view.buttons,b=>[b.text,b.disabled]),[['查看训练',false],['升级',true]]);
  g.NPCSystem.menu.choose(0);assert.deepEqual(h.calls.pop(),['floor','train']);
  h.position({x:cable.x-1,y:cable.y});await g.NPCSystem.openMenu(g.GymFacility.npcId('cable'));assert.ok(h.view.buttons.every(b=>b.disabled));
});
test('sealed gym keeps internal approaches and leaves the bed and original exits accessible outside',()=>{
  const source=json('data/maps/M0_Base_Inside_lv_1.json'),map=makeLayoutMap(source,layout),solid=layoutSolids(map,layout);
  const result=validateLayout(source,layout);assert.equal(result.facilities,8);assert.equal(result.decorations,3);assert.equal(result.occupiedCells,23);
  const start=layout.player;
  for(const s of layout.stations){
    const neighbours=stationCells(s).flatMap(p=>[[1,0],[-1,0],[0,1],[0,-1]].map(([dx,dy])=>({x:p.x+dx,y:p.y+dy})));
    const route=findLayoutPath(map,solid,start,neighbours);assert.ok(route,s.id);for(const p of route)assert.ok(!solid.has(p.x+','+p.y));
  }
  assert.ok(solid.has('9,7'));assert.equal(findLayoutPath(map,solid,start,[{x:10,y:7}]),null);
  for(const p of map.portals)assert.ok(findLayoutPath(map,solid,{x:10,y:7},[p]));
  assert.ok(findLayoutPath(map,solid,{x:10,y:7},[{x:10,y:14}]));
  assert.ok(!source.disabled.some(p=>p.x===1&&p.y===1),'gym deployed to formal map');
});
