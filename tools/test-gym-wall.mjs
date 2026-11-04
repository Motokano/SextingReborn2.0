import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('visible sealed wall face and cap are clickable without revealing unseen walls',()=>{
 const g=vm.createContext({console});g.window=g;
 for(const file of ['js/core/map-projection.js','js/core/base-hideout-art.js'])vm.runInContext(fs.readFileSync(file,'utf8'),g);
 const map=JSON.parse(fs.readFileSync('data/maps/M0_Base_Inside_lv_1.json','utf8'));
 for(const cellPx of [72/Math.SQRT2,144/Math.SQRT2]){
  const p=g.MapProjection.create(map,cellPx,'isometric'),pts=p.cellPolygon(9,7),h=p.tileHeight*.6;
  const face={x:(pts[1].x+pts[2].x)/2,y:(pts[1].y+pts[2].y)/2-h/2};
  const cap={...p.cellCenter(9,7)};cap.y-=h;
  for(const point of [face,cap]){
   assert.deepEqual(JSON.parse(JSON.stringify(g.BaseHideoutArt.pickInspectableWall(map,p,()=>({terrainVisible:true}),point.x,point.y))),{x:9,y:7});
   assert.equal(g.BaseHideoutArt.pickInspectableWall(map,p,()=>({terrainVisible:false}),point.x,point.y),null);
  }
  const floor=p.cellCenter(10,7);
  assert.equal(g.BaseHideoutArt.pickInspectableWall(map,p,()=>({terrainVisible:true}),floor.x,floor.y),null,'nearby floor remains selectable');
 }
});
