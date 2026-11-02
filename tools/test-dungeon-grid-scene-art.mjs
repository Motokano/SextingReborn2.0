import assert from 'node:assert/strict';
import fs from 'node:fs';
import {boot} from './dungeon/fixture.mjs';
const root='assets/dungeon/grid-scene-v1/',manifest=JSON.parse(fs.readFileSync(root+'manifest.json','utf8')),entries=Object.entries(manifest.catalog);
assert.equal(entries.length,60);
const keys=['normal','unsearched','searched','used','partial','low'];let states=0;
for(const [id,p]of entries)for(const key of keys){
 const a=p[key];if(!a)continue;states++;assert.ok(fs.existsSync(a.src),a.src);
 assert.ok(a.crop.every(Number.isFinite)&&a.bodyWidth>0);
 const [l,n,r]=a.contacts,[u,v]=a.groundSlopes,d=Math.SQRT2/(u-v),b=Math.SQRT1_2-d*u;
 if(p.projectionMode!=='native')assert.ok(Math.abs(b+d*u-Math.SQRT1_2)<1e-9&&Math.abs(b+d*v+Math.SQRT1_2)<1e-9,id+' legacy ground calibration follows both grid axes');
 const pos=2*p.tileWidth*(n[0]-l[0])/a.bodyWidth,neg=2*p.tileWidth*(r[0]-n[0])/a.bodyWidth;
 assert.ok(pos<=p.logicalFootprint[0]+.005&&neg<=p.logicalFootprint[1]+.005,id+' ground contacts stay within occupied cells');
}
assert.equal(states,103);
const f=await boot(false);
try{
 const g=f.g;g.Image=class{complete=true;naturalWidth=1536;naturalHeight=1536;};
 g.eval(fs.readFileSync('js/dungeon/grid-scene-art.js','utf8'));
 const drawn=[],transforms=[],rects=[],ctx=new Proxy({drawImage(im,...rect){drawn.push(im.src);rects.push(rect);},transform(...m){transforms.push(m);},createRadialGradient(){return{addColorStop(){}};}},{get(o,k){return o[k]??(()=>{});}});
 const check=(id,state,call)=>{drawn.length=0;call();assert.deepEqual(drawn,[g.DungeonGridArt.asset(id,state).src],id+' '+state+' uses registered image');};
 assert.equal(g.RuinsLoot.catalog.length,31);
 for(const p of g.RuinsLoot.catalog)for(const opened of [false,true]){
  transforms.length=0;rects.length=0;
  const point={assetId:p.id,search:{opened}};check(p.id,opened?'searched':'unsearched',()=>g.RuinsLoot.draw(ctx,point,100,200,144/Math.SQRT2,true,.5));
  assert.equal(g.RuinsLoot.asset(point)[opened?'searched':'unsearched'].src,g.DungeonGridArt.asset(p.id,opened?'searched':'unsearched').src);
  assert.ok(drawn[0].startsWith('assets/dungeon/containers-v2/'),p.id+' uses redrawn art in the real map and loot panel');
  assert.equal(g.DungeonGridArt.catalog[p.id].projectionMode,'native');
  assert.deepEqual(transforms,[],p.id+' must not shear or stretch the painted body');
  const [,,sw,sh,,,dw,dh]=rects[0];assert.ok(Math.abs(dw/sw-dh/sh)<1e-10,p.id+' retains source aspect ratio in both states');
 }
 for(const p of g.RuinsMixed.recoveryCatalog)for(const used of [false,true]){
  check(g.DungeonGridArt.recoveryIds[p.id],used?'used':'normal',()=>g.RuinsMixed.drawRecovery(ctx,{...p,used,src:'old-save.png',usedSrc:'old-save-used.png'},100,200,100));
  assert.ok(g.RuinsMixed.thumbnail({...p,used}).includes(root),'recovery thumbnails resolve saved IDs');
 }
 for(const p of g.RuinsInsight.catalog)for(const used of [false,true])check(p.file,used?'used':'normal',()=>g.RuinsInsight.draw(ctx,{id:p.id,used},100,200,100));
 for(const used of [false,true]){transforms.length=0;rects.length=0;check('recipe-study',used?'used':'normal',()=>g.RuinsInsight.draw(ctx,{id:'recipe-study',used},100,200,144/Math.SQRT2));const [,,sw,sh,,,dw,dh]=rects[0];assert.ok(Math.abs(dw/sw-.12)<1e-10&&Math.abs(dh/sh-.12)<1e-10);assert.deepEqual(transforms,[]);}
 const furnishings=JSON.parse(fs.readFileSync('assets/dungeon/recipe-study-room-art-v1/manifest.json','utf8'));
 for(const a of furnishings.assets){transforms.length=0;rects.length=0;const id='study-art-'+a.id;check(id,'normal',()=>g.RuinsOutpostDecor.draw(ctx,{kind:id,solid:true,front:[0,1]},100,200,144/Math.SQRT2));const [,,sw,sh,,,dw,dh]=rects[0];assert.ok(Math.abs(dw/sw-a.scaleAt144)<1e-10&&Math.abs(dh/sh-a.scaleAt144)<1e-10);assert.deepEqual(transforms,[]);}
 for(const id of Object.keys(g.RuinsOutpostDecor.catalog))check(id,'normal',()=>g.RuinsOutpostDecor.draw(ctx,{kind:id,solid:true,flip:true},100,200,100));
 for(const flip of [false,true]){
  transforms.length=0;rects.length=0;
  check('workshop-machine-v1','normal',()=>g.RuinsOutpostDecor.draw(ctx,{kind:'workshop-machine-v1',solid:true,flip},100,200,144/Math.SQRT2));
  assert.ok(drawn[0].startsWith('assets/dungeon/workshop-lathe-v2/'));
  assert.deepEqual(transforms,[],'redrawn lathe must never stretch or shear');
  const [,,sw,sh,,,dw,dh]=rects[0];assert.ok(Math.abs(dw/sw-dh/sh)<1e-10);
 }
 check('exit-waypost','normal',()=>g.RuinsExitPawn.draw(ctx,100,200,100,{x:100,y:200}));
 for(const [remaining,key]of [[4,'normal'],[3,'partial'],[1,'low'],[0,'searched']])check('canteen-food-crate',key,()=>g.RuinsCanteenArt.draw(ctx,{remaining,total:4},100,200,100));
 for(const opened of [false,true])check('canteen-food-crate',opened?'searched':'normal',()=>g.RuinsLoot.draw(ctx,{foodCrate:true,search:{opened}},100,200,100));
 for(const src of Object.values(g.DungeonGridArt.materials))assert.ok(fs.existsSync(src),src);
 assert.ok(g.RuinsModuleArt.config.woodlandAtlas.includes('woodland-v1'),'natural ground atlas unchanged');
 assert.deepEqual(f.errors,[]);
 console.log('PASS: 60 objects / 103 sprite states, grid footprints, real draw branches, study desk and approved furnishing scales, thumbnails, food depletion, 9 materials.');
}finally{await f.close();}
