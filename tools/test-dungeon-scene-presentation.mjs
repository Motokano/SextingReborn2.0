import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const g=vm.createContext({console});
for(const name of ['engine','grid-scene-catalog','grid-scene-art','scene-surfaces','scene-architecture'])vm.runInContext(fs.readFileSync('js/dungeon/'+name+'.js','utf8'),g);
const plain=v=>JSON.parse(JSON.stringify(v));
const m={width:12,height:12,tiles:Array(144).fill(0),owner:Array(144).fill(-1),road:Array(144).fill(0),woodland:{ground:Array(144).fill('earth')}};
for(let y=3;y<=8;y++)for(let x=3;x<=8;x++){const k=y*12+x;m.owner[k]=1;m.tiles[k]=x===3||x===8||y===3||y===8?1:2;m.woodland.ground[k]='floor';}
m.tiles[8*12+5]=4;m.collision=m.tiles.slice();m.bossRoom={bounds:[3,3,8,8],apron:[2,2,9,9]};
for(let y=0;y<12;y++)for(let x=0;x<12;x++)if(x<2)m.woodland.ground[y*12+x]='moss';
const before=JSON.stringify(m),P=g.DungeonSurfaceStyle,A=g.DungeonSceneArchitecture;
assert.equal(P.profile(m).names[2*12+2],'earth','apron does not become concrete');
assert.equal(P.profile(m).names[3*12+4],'earth','wall footing does not paint an exterior platform');
assert.equal(P.profile(m).names[4*12+4],'floor','interior retains concrete');
for(let y=0;y<11;y++)for(let x=0;x<11;x++){
 const k=y*12+x;if(!P.profile(m).outside(k))continue;
 const c=P.corners(m,k);for(const v of c)assert.equal(Object.values(v).reduce((a,b)=>a+b,0),1);
 if(P.profile(m).outside(k+1)){const n=P.corners(m,k+1);assert.deepEqual(plain(c[1]),plain(n[0]));assert.deepEqual(plain(c[2]),plain(n[3]));}
 if(P.profile(m).outside(k+12)){const n=P.corners(m,k+12);assert.deepEqual(plain(c[3]),plain(n[0]));assert.deepEqual(plain(c[2]),plain(n[1]));}
}
for(let k=0;k<m.tiles.length;k++)if(m.tiles[k]===1){
 const plan=A.plan(m,k);assert.ok(plan,'every rectangular boundary cell joins the wall');
 for(const b of plan.boxes){assert.ok(Math.min(b.x1-b.x0,b.y1-b.y0)<=.180001);assert.ok(b.x0>=-.5&&b.y0>=-.5&&b.x1<=.5&&b.y1<=.5);}
}
assert.equal(A.plan(m,3*12+5).boxes[0].z,A.height);assert.equal(A.plan(m,5*12+8).boxes[0].z,A.cutaway);
const cell=4*12+5,p={cell};m.collision[cell+12]=6;
const partitionMap={...m,clinicWalls:new Set([cell,cell+1,cell+12])},join=A.partitionPlan(partitionMap,cell);
assert.equal(join.boxes.length,2,'partition corner joins both occupied axes');for(const b of join.boxes)assert.ok(Math.min(b.x1-b.x0,b.y1-b.y0)<=.180001,'partition is a wall, not a solid platform');
assert.equal(g.DungeonGridArt.facing('reused-fridge-v1',p,m),true,'blocked +y front prefers open +x');
assert.equal(g.DungeonGridArt.facing('workshop-bench-v1',p,m,false),false,'two-cell axis stays fixed');
assert.equal(g.DungeonGridArt.facing('reused-fridge-v1',{...p,front:[0,1]},m,false),false,'explicit approved facing stays fixed');
m.collision[cell+12]=m.tiles[cell+12];assert.equal(JSON.stringify(m),before,'presentation leaves map, collision and resources unchanged');
// Whole-plane repeats sample matching pixels at their boundaries, including negatives.
const calls=[],surface=(ctx,name,q,uv)=>{calls.push({q,uv});return true;},quad=[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}];
P.sample({},'floor',quad,3,0,surface);P.sample({},'floor',quad,4,0,surface);
assert.equal(calls[0].uv[0]+calls[0].uv[2],calls[1].uv[0]+calls[1].uv[2]);assert.equal(calls[1].q[0].x,1,'next repeat mirrors the sampled plane, not a prop');
console.log('PASS: shared terrain edges, inherited boss apron, fixed interior, thin continuous walls, cutaway heights, usable prop facing, stable multi-cell axes, no gameplay mutation.');
