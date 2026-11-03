import assert from 'node:assert/strict';
import fs from 'node:fs';
import {boot} from './dungeon/fixture.mjs';
const f=await boot(false);
try{
 const g=f.g,D=g.DungeonRuntime,E=g.GameEngine;await D.ready;
 g.CharacterAttributes.setState({character_creation_completed:true});E.setState('M0_Field_02',7,7);assert.ok(D.enter());
 // A controlled drop pool keeps this presentation check independent of item-catalog edits.
 const itemId=g.InventoryEquipment.getAllItemIds().find(id=>id.includes('battery'));assert.ok(itemId);
 D.config().pool.batches=[{id:'corpse-art-test',items:[{item_id:itemId,stock:20,rarity:'common'}]}];
 // Start from a valid generated expedition, then isolate one boss death.
 const enemy=D.getSim().enemies[0];enemy.enemyId='enemy.street_thug_boss';D.getSim().enemies=[enemy];
 E.getMap().enemies=E.getMap().enemies.filter(e=>e.dungeonUid===enemy.uid);E.getMap().enemies[0].enemy_id=enemy.enemyId;
 assert.equal(g.TileRendererV2.getPawnDisplayScale(),1.25);
 const record=E.getMap().enemies[0];D.killed(record);E.getMap().enemies=[];
 const s=D.getSim(),p=s.corpses[0];assert.equal(s.enemies.length,0);assert.equal(p.kind,'corpse');assert.equal(p.marked,false);
 g.Image=class{complete=true;naturalWidth=1243;naturalHeight=1266;set src(v){this._src=v;this.onload?.();}get src(){return this._src;}};
 const draws=[],translations=[],ctx=new Proxy({drawImage(...v){draws.push(v);},translate(...v){translations.push(v);}},{get:(o,k)=>o[k]??(()=>{})});
 const pr={isIsometric:true,tileWidth:144,cellCenter:()=>({x:300,y:400})};
 D.inspect=()=>({terrain:true,identify:true,dynamic:true});
 const paint=()=>{draws.length=0;translations.length=0;g.DungeonArt.object(ctx,record.x,record.y,pr);return draws.find(v=>v[0].src?.includes('corpse-bag-v3'));};
 let body=paint();assert.equal(body[0].src,g.DungeonCorpseArt.source(false));
 assert.deepEqual(translations.at(-1),[300,408],'single bag is centered and shares pawn ground anchor');
 assert.ok(Math.abs(body[7]*890/896-57.5)<1e-8,'base matches enlarged characters');
 E.setState(D.getRun().mapId,record.x,record.y);assert.ok(D.mark(p.uid),'real mark action succeeds');
 body=paint();assert.equal(body[0].src,g.DungeonCorpseArt.source(true),'marked state switches to the paired new asset');
 const enlarged=body[7];g.PawnDisplayScale=1;body=paint();assert.ok(Math.abs(enlarged/body[7]-1.25)<1e-8);
 D.inspect=()=>({terrain:true,identify:true,dynamic:false});assert.equal(paint(),undefined,'no corpse or shadow leaks out of visibility');
 for(const marked of [false,true]){const png=fs.readFileSync(g.DungeonCorpseArt.source(marked));assert.equal(png[25],6,'real alpha');assert.equal(png.readUInt32BE(16),1243);assert.equal(png.readUInt32BE(20),1266);}
 assert.ok(fs.readFileSync('js/dungeon/panel.js','utf8').includes('image.src=DungeonCorpseArt.source(true)'),'opening panel uses the same marked art');
 assert.deepEqual(f.errors,[]);console.log('PASS: boss defeat, real corpse marking, both new sprites, centered base, 125%/100% display, visibility, recovery image and RGBA sources.');
}finally{await f.close();}
