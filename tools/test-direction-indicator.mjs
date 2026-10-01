import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const projectionSource=fs.readFileSync('js/core/map-projection.js','utf8');
const app=fs.readFileSync('js/scene-app.js','utf8');
const update=app.match(/function updatePlayerDirectionIndicator\(\) \{[\s\S]*?\n    \}/)[0];
const dirs=[[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1]];
for(const mode of ['legacy','isometric']){
 const ctx={URLSearchParams,location:{search:'?view='+mode}}; vm.createContext(ctx);vm.runInContext(projectionSource,ctx);
 const element={style:{}};ctx.window=ctx;ctx.document={getElementById:()=>element};ctx.CELL_PX=101;ctx.normalizeFacingDir=x=>x;
 vm.runInContext(update,ctx);
 const p=ctx.MapProjection.create({width:3,height:3},101);
 for(let d=0;d<8;d++){
  ctx.currentFacingDir=d;vm.runInContext('updatePlayerDirectionIndicator()',ctx);
  const match=element.style.transform.match(/^matrix\(([^)]+)\)$/);
  assert.ok(match, mode+' '+d+': the entire triangle must use ground projection');
  const [a,b,c,e,x,y]=match[1].split(',').map(Number);
  const v=p.directionVector(...dirs[d]);
  const sx=p.isIsometric?(p.tileWidth/2-2)/(p.tileWidth/2):1;
  const sy=p.isIsometric?(p.tileHeight/2-2)/(p.tileHeight/2):1;
  assert.ok(Math.abs(x+6*c-v.x/2*sx)<1e-7 && Math.abs(y+6*e-v.y/2*sy)<1e-7,'base center touches selected tile boundary');
  const tangent=p.directionVector(-dirs[d][1],dirs[d][0]);
  assert.ok(Math.abs(a*tangent.y*sy-b*tangent.x*sx)<1e-7,'base is parallel to projected ground edge');
  assert.ok((-c*v.x-e*v.y)>0,'tip points outward');
 }
}
console.log('PASS projected triangle base, orientation and contact: eight directions in both views');
