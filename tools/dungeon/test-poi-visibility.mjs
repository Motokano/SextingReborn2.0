import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

// Uses the real directional/LOS calculation and the real production painter.
const root=process.env.POI_GAME_ROOT||process.cwd(),art=process.env.POI_ART_FILE||path.join(root,'js/dungeon/art.js');
const calls=[],s={map:{width:21,height:21,tiles:Array(441).fill(2),exit:-1},player:{cell:220,facing:0},doors:[],harvestPoints:[],lootPoints:[],recoveryPoints:[],insightPoints:[],corpses:[]};
const api={setInvalidation(){},draw(){calls.push('pawn');},drawRecovery(){calls.push('pawn');},wall(){calls.push('wall');},door(){calls.push('door');}};
const g=vm.createContext({console,RuinsSettlement:{VOID:0},RuinsModuleArt:api,RuinsHarvestPawns:api,RuinsLoot:api,RuinsMixed:api,RuinsInsight:api,RuinsExitPawn:api,RuinsCanteenArt:api,RuinsOutpostDecor:api});
g.DungeonRuntime={active:()=>false,getSim:()=>s,inspect:k=>g.RuinsEncounter.inspect(s,s.player,k)};
vm.runInContext(fs.readFileSync(path.join(root,'js/dungeon/encounter.js'),'utf8'),g);
vm.runInContext(fs.readFileSync(art,'utf8'),g);
const paint=new Proxy({fillText(t){calls.push(t);}}, {get:(o,k)=>o[k]??(()=>{})});
const pr={isIsometric:true,tileWidth:144,cellCenter:(x,y)=>({x:(x-y)*72,y:(x+y)*51})};
const keys=['harvestPoints','lootPoints','recoveryPoints','insightPoints','exit'];let checks=0;
function put(kind,k,used=false){for(const key of keys.slice(0,4))s[key]=[];s.map.exit=-1;if(kind==='exit')s.map.exit=k;else s[kind]=[{cell:k,used,searched:used,remaining:used?0:3}];}
function draw(k){calls.length=0;g.DungeonArt.object(paint,k%21,Math.floor(k/21),pr);return [...calls];}
function expect(k,expected,label){const actual=draw(k);assert.deepEqual(actual,expected,label);checks++;}
const n=g.RuinsEncounter;
for(const night of [false,true])for(let facing=0;facing<8;facing++)for(const kind of keys)for(const used of [false,true]){
 s.night=night;s.player.facing=facing;s.map.tiles.fill(2);s.doors=[];
 const [dx,dy]=n.dirs[facing],rear=220-dx-dy*21;put(kind,rear,used);
 const sight=n.inspect(s,s.player,rear);assert.ok(sight.terrain&&!sight.dynamic&&!sight.identify);
 expect(rear,['?'],`${kind} rear facing ${facing} night=${night} used=${used}`);
 s.player.facing=(facing+4)%8;expect(rear,['pawn'],`${kind} turn toward`);
 s.player.facing=facing;expect(rear,['?'],`${kind} turn away`);
}
for(const kind of keys){
 s.night=false;s.player.facing=0;s.doors=[];s.map.tiles.fill(2);
 const target=220-3*21;put(kind,target);expect(target,['pawn'],`${kind} visible`);
 s.map.tiles[220-21]=1;expect(target,[],`${kind} wall occlusion`);s.map.tiles[220-21]=2;
 s.doors=[{cell:220-21,closed:true}];expect(target,[],`${kind} closed door`);s.doors[0].closed=false;expect(target,['pawn'],`${kind} open door`);s.doors=[];
 const far=220-10*21;put(kind,far);expect(far,[],`${kind} outside sight`);
 // Back sector, beyond identification but inside terrain visibility.
 const edge=220+2*21;put(kind,edge);expect(edge,['?'],`${kind} unknown back sector`);
 s.night=true;expect(edge,[],`${kind} night shortens visibility`);
}
put('exit',-1);s.player.facing=0;s.night=false;expect(241,[],'empty rear cell remains empty');
assert.equal(n.sees(s,s.player,241),false,'actor perception still hides rear-adjacent targets');
console.log(`PASS ${checks} fixed-POI render checks: unknown / identified / hidden, 8 directions, day/night, used states, walls/doors and unchanged actor perception.`);
