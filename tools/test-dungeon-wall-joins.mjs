import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const g=vm.createContext({console});g.window=g;
for(const file of ['vendor/settlemaker','engine','scene-architecture'])vm.runInContext(fs.readFileSync('js/dungeon/'+file+'.js','utf8'),g);
const m=g.RuinsSettlement.make('fixed-den-review-2|4|0','city'),A=g.DungeonSceneArchitecture,before=JSON.stringify(m);
// Exact workshop frontage in the user's screenshot. Its raster steps all belong
// to the same slanted building side, including the short perpendicular returns.
for(const [x,y] of [[47,38],[48,38],[49,39],[50,39],[51,39],[52,40],[53,40],[54,41]]){
 const p=A.plan(m,y*m.width+x);assert.ok(p);assert.ok(p.boxes.every(b=>b.z===A.cutaway),'frontage at '+x+','+y+' must not grow a full-height fin');
}
for(const [x,y] of [[50,28],[51,28],[52,29],[53,29],[54,29],[55,30]])assert.ok(A.plan(m,y*m.width+x).boxes.every(b=>b.z===A.height),'rear wall stays full height across stair steps');
// Exercise the renderer's actual solid union, not only the individual strip sizes.
let corners=0,faces=0;
for(const k of m.rooms.find(r=>r.id===3).cells){const p=A.plan(m,k);if(!p)continue;if(p.boxes.length>1)corners++;
 const mesh=A.mesh(m,k),own=p.boxes.map(b=>({...b,x0:b.x0+p.x,x1:b.x1+p.x,y0:b.y0+p.y,y1:b.y1+p.y}));
 const height=(x,y)=>Math.max(0,...own.filter(b=>x>b.x0+1e-7&&x<b.x1-1e-7&&y>b.y0+1e-7&&y<b.y1-1e-7).map(b=>b.z));
 for(const f of mesh){faces++;const c=f.points.reduce((p,q)=>p.map((v,i)=>v+q[i]/4),[0,0,0]);if(f.type==='top')assert.equal(c[2],height(c[0],c[1]),'no cap hidden inside another strip');
  else{const dx=f.axis==='x'?1e-5:0,dy=f.axis==='y'?1e-5:0;assert.ok(height(c[0]-dx,c[1]-dy)>=c[2]);assert.ok(height(c[0]+dx,c[1]+dy)<c[2],'no internal face crossing a corner');}
 }
 const tops=mesh.filter(f=>f.type==='top');for(let a=0;a<tops.length;a++)for(let b=a+1;b<tops.length;b++){
  const bounds=f=>[Math.min(...f.points.map(p=>p[0])),Math.max(...f.points.map(p=>p[0])),Math.min(...f.points.map(p=>p[1])),Math.max(...f.points.map(p=>p[1]))],u=bounds(tops[a]),v=bounds(tops[b]);
  assert.ok(Math.min(u[1],v[1])-Math.max(u[0],v[0])<1e-7||Math.min(u[3],v[3])-Math.max(u[2],v[2])<1e-7,'corner caps do not overlap');
 }
}
assert.ok(corners>4&&faces>30);assert.equal(JSON.stringify(m),before,'wall correction does not change the generated room');
console.log('PASS: exact reported workshop frontage, continuous rear walls, joined corner surfaces, nonoverlapping caps, unchanged layout.');
