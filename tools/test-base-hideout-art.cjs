const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),path=require('path');
const game=path.resolve(__dirname,'..'),formal=true;
const output=formal?path.join(game,'assets/map/hideout-v1'):path.resolve(__dirname,'../../outputs/hideout-art-v1');
const artFile=formal?path.join(game,'js/core/base-hideout-art.js'):path.join(output,'base-hideout-art.js');
const rendererFile=formal?path.join(game,'js/core/tile-renderer-v2.js'):path.join(__dirname,'staged/tile-renderer-v2.js');
const maps=['Inside','Outside'].map(n=>JSON.parse(fs.readFileSync(!formal&&n==='Outside'&&fs.existsSync(path.join(__dirname,'staged/M0_Base_Outside_lv_1.json'))?path.join(__dirname,'staged/M0_Base_Outside_lv_1.json'):path.join(game,'data/maps/M0_Base_'+n+'_lv_1.json'),'utf8').replace(/^\uFEFF/,'')));
const baseline=JSON.stringify(maps),calls=[],pending=[],requests=[];
function context(id){return new Proxy({createLinearGradient(){return{addColorStop(){}}},createRadialGradient(...args){calls.push({id,k:'createRadialGradient',args});return{addColorStop(){}}}}, {get(o,k){return o[k]||((...args)=>{calls.push({id,k,args});if(['transform','translate','scale'].includes(k))assert(args.every(Number.isFinite),'finite projection');});},set(o,k,v){calls.push({id,k:'set:'+k,args:[v]});o[k]=v;return true;}});}
const sandbox={console,Map,Set,WeakMap,Math,Date,URLSearchParams,location:{search:''},localStorage:{getItem(){return null},setItem(){}},document:{documentElement:{classList:{toggle(){}}},createElement(){return{style:{},getContext(){return this.ctx||=context(this.id)}}}},Image:class{set src(src){this.srcValue=src;this.naturalWidth=src.includes('props-atlas')?1774:src.includes('fixtures-atlas')?1312:1254;this.naturalHeight=src.includes('props-atlas')?887:src.includes('fixtures-atlas')?1199:1254;requests.push(src);const file=src.startsWith('assets/map/hideout-v1/')?path.join(output,path.basename(src)):path.join(game,src);assert(fs.existsSync(file),src+' exists');pending.push(()=>this.onload?.());}},requestAnimationFrame(){return 1},cancelAnimationFrame(){}};
sandbox.window=sandbox;vm.createContext(sandbox);
for(const file of [path.join(game,'js/core/map-projection.js'),artFile,rendererFile])vm.runInContext(fs.readFileSync(file,'utf8'),sandbox);
const art=sandbox.BaseHideoutArt;
assert(!art.supports({map_id:'M0_Field_01'}));assert(!art.supports({map_id:art.config.indoor,dungeon:true}));
assert.equal(art.materialAt(maps[0],11,15,{}),4,'bed floor is wood');assert.equal(art.materialAt(maps[0],12,15,{}),3,'stove floor is ceramic');assert.equal(art.materialAt(maps[0],5,11,{}),2,'forge floor is steel');
assert(!art.isStructure(maps[0],5,11),'station cell not converted to a wall');assert(!art.isStructure(maps[0],8,12),'NPC cell not converted to a wall');assert(art.isDisabled(maps[0],9,0),'wall beside the gym stays disabled');
const host={style:{},appendChild(){},getBoundingClientRect(){return{left:0,top:0}}},renderer=sandbox.TileRendererV2.create(host);
let visible=true;const input={map:maps[0],st:{x:11,y:13},viewport:{width:5000,height:5000},staticMetaAt:()=>({walkable:true}),dynamicMetaAt:()=>({walkable:true,terrainVisible:visible,sceneryVisible:visible}),staticDataKey:'unchanged'};
renderer.render(input);assert(calls.some(c=>c.k==='fill'),'fallback draws without waiting for images');while(pending.length)pending.shift()();
assert.equal(requests.filter(v=>v.startsWith('assets/map/hideout-v1/')).length,9,'one lazy request per art asset');
for(const map of maps){
  for(const portal of map.portals){
    assert.equal(art.materialAt(map,portal.x,portal.y,{portal}),9,'inside and outside entrances share the special tile');
    calls.length=0;art.floor(context('portal'),map,portal.x,portal.y,{portal},sandbox.MapProjection.create(map,144/Math.SQRT2,'isometric'));
    assert(calls.some(c=>c.k==='drawImage'&&c.args[0].srcValue?.includes('transition-tile')),'portal tile image drawn');
  }
}
renderer.render(input);
assert(calls.some(c=>c.id==='map-grid-canvas-dynamic'&&c.k==='drawImage'&&c.args[0].srcValue?.includes('props-atlas')),'visible props drawn');
const dummy=maps[0].enemies.find(e=>e.enemy_id==='enemy.training_dummy_wooden'),projection=sandbox.MapProjection.create(maps[0],144/Math.SQRT2,'isometric');
assert(art.object(context('dummy'),maps[0],dummy.x,dummy.y,{enemy:true,enemyId:null,sceneryVisible:true},projection),'identified fixed dummy keeps its shape before detail/name radius');
assert(!art.object(context('dummy'),maps[0],dummy.x,dummy.y,{enemy:true,enemyId:null,sceneryVisible:false},projection),'unidentified dummy remains hidden');
calls.length=0;renderer.render(input);assert(!calls.some(c=>c.id==='map-grid-canvas-static'&&c.k==='drawImage'),'unchanged static terrain cached');
visible=false;calls.length=0;renderer.render(input);assert(!calls.some(c=>c.id==='map-grid-canvas-dynamic'&&c.k==='drawImage'),'unseen scenery and raised walls do not leak');
for(const map of maps){input.map=map;renderer.render(input);const c=renderer.getCellCenter(7,13);assert.equal(JSON.stringify(renderer.hitTest(c.x,c.y)),JSON.stringify({x:7,y:13}),'art preserves picking');}
assert.equal(JSON.stringify(maps),baseline,'map coordinates, blocks, portals and facilities not modified');
const yard=maps[1],yp=sandbox.MapProjection.create(yard,144/Math.SQRT2,'isometric');
const blocked=new Set(yard.blocks.map(p=>p.x+','+p.y));
for(const key of [...art.config.yard.trees,...art.config.yard.roofVents,...Object.keys(art.config.yard.storage)])assert(blocked.has(key),'solid decoration stays in existing blocked cells: '+key);
for(const key of Object.keys(art.config.yard.storage)){
  const [x,y]=key.split(',').map(Number);
  assert(!art.isStructure(yard,x,y),'standalone props must not generate walls or roofs');
  assert(!(yard.portals||[]).some(q=>q.x===x&&q.y===y),'prop does not occupy a portal');
  assert(!(yard.entities||[]).some(q=>q.x===x&&q.y===y),'prop does not overwrite a functional point');
}
const disabledCells=new Set((yard.disabled||[]).map(q=>q.x+','+q.y));
const walkable=(x,y)=>x>=0&&y>=0&&x<yard.width&&y<yard.height&&!blocked.has(x+','+y)&&!disabledCells.has(x+','+y);
const reached=new Set(['7,5']),queue=[[7,5]];
for(let i=0;i<queue.length;i++){const [x,y]=queue[i];for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){if(!dx&&!dy)continue;const key=(x+dx)+','+(y+dy);if(reached.has(key)||!walkable(x+dx,y+dy)||(dx&&dy&&(!walkable(x+dx,y)||!walkable(x,y+dy))))continue;reached.add(key);queue.push([x+dx,y+dy]);}}
for(let y=0;y<yard.height;y++)for(let x=0;x<yard.width;x++)if(walkable(x,y))assert(reached.has(x+','+y),'new props preserve courtyard connectivity: '+x+','+y);
for(let y=4;y<=15;y++)assert(!blocked.has('7,'+y),'central route stays traversable');
assert.equal(art.materialAt(yard,6,10,{}),16,'pond keeps its original interaction location');
calls.length=0;art.wall(context('yard'),yard,7,15,{terrainVisible:true},yp);
assert(!calls.some(c=>c.k==='drawImage'),'fence leaves the exit opening clear');
calls.length=0;art.object(context('yard'),yard,2,13,{sceneryVisible:true,gathering:true},yp);
assert(calls.some(c=>c.k==='drawImage'&&c.args[0].srcValue?.includes('courtyard-plants')),'existing gatherable plants receive matching art');
calls.length=0;art.object(context('yard'),yard,2,13,{sceneryVisible:true,gathering:false},yp);
assert(!calls.some(c=>c.k==='drawImage'),'missing/depleted resource does not retain an active plant');
calls.length=0;art.wall(context('yard'),yard,5,4,{terrainVisible:false},yp);art.object(context('yard'),yard,14,2,{sceneryVisible:false},yp);
assert.equal(calls.length,0,'unseen roof, window and tree are hidden');
console.log('PASS base-only scope, matching material zones, lazy textures, fallback, static caching, invisible scenery, cell picking and unchanged map data');
console.log('PASS courtyard footprints, entrance route, original pond position, exit gap, gathering visibility and unseen building/tree gates');

// Regression: a player behind the building must stand on ground, not on a roof.
const behind={x:7,y:0},front={x:7,y:7};
assert(art.inFrontOfPlayer(yard,7,2,yp,behind),'nearer building is foreground for rear path');
assert(!art.inFrontOfPlayer(yard,7,2,yp,front),'building behind front-door player stays below pawn');
assert(!art.inFrontOfPlayer(maps[0],7,2,yp,behind),'indoor scene is not changed');
const legacy=sandbox.MapProjection.create(yard,101,'legacy');
assert(!art.inFrontOfPlayer(yard,7,2,legacy,behind),'legacy scene has no raised foreground');
calls.length=0;art.floor(context('foundation'),yard,7,2,{},yp);
assert(!calls.some(c=>c.k==='drawImage'&&c.args[0].srcValue.includes('courtyard-materials')),'raised roof texture is never repeated on foundation');
const shown={terrainVisible:true,sceneryVisible:true};
calls.length=0;art.wall(context('back'),yard,7,2,shown,yp,true);art.object(context('back'),yard,7,2,shown,yp,true);
assert(!calls.some(c=>c.k==='drawImage'),'foreground building is omitted from background, avoiding a duplicate roof below the cutaway');
calls.length=0;art.foreground(context('front'),yard,7,2,{terrainVisible:false,sceneryVisible:false},yp,behind);
assert.equal(calls.length,0,'foreground respects terrain visibility');
calls.length=0;art.foreground(context('front'),yard,7,2,shown,yp,behind);art.revealPlayer(context('front'),yard,yp,behind);
assert(calls.some(c=>c.k==='drawImage'),'foreground contains visible building');
assert(calls.some(c=>c.k==='set:globalCompositeOperation'&&c.args[0]==='destination-out'),'local cutaway reveals ground instead of painting a pawn on top of the roof');
const foreHost={...host,children:[],appendChild(c){this.children.push(c)}};
const rearRenderer=sandbox.TileRendererV2.create(host,{combatHost:foreHost});
rearRenderer.render({...input,map:yard,st:behind,dynamicMetaAt:()=>shown});while(pending.length)pending.shift()();
calls.length=0;rearRenderer.render({...input,map:yard,st:behind,dynamicMetaAt:()=>shown});
const foreground=foreHost.children.find(c=>c.id==='map-grid-canvas-foreground');
assert(foreground&&foreground.style.zIndex==='20','foreground shares DOM player context, below combat');
assert(calls.some(c=>c.id==='map-grid-canvas-foreground'&&c.k==='drawImage'),'occluding architecture is actually routed to the foreground');
const roofDraws=calls.filter(c=>['map-grid-canvas-dynamic','map-grid-canvas-foreground'].includes(c.id)&&c.k==='drawImage'&&c.args[0].srcValue.includes('courtyard-materials')&&c.args[1]===7&&c.args[2]===7);
assert.equal(roofDraws.length,yard.blocks.filter(c=>art.isStructure(yard,c.x,c.y)).length,'exactly one raised roof per building cell across both depth layers');
rearRenderer.setCamera(150,-220);assert.equal(foreground.style.transform,host.style.transform,'camera and foreground remain aligned');
host.style.transition='transform 0.15s ease-out';
rearRenderer.setCamera(200,-170);
for(const surface of foreHost.children){assert.equal(surface.style.transition,host.style.transition,'detached surfaces inherit camera easing');assert.equal(surface.style.transform,host.style.transform);}
host.style.transition='none';rearRenderer.setCamera(140,-210);
assert.equal(foreground.style.transition,'none','instant camera mode stays synchronized');
const nestedHost={...host,style:{},children:[],appendChild(c){this.children.push(c)}};
const nestedRenderer=sandbox.TileRendererV2.create(nestedHost,{combatHost:nestedHost});
nestedRenderer.setCamera(45,30);
assert(nestedHost.children.every(c=>!c.style.transform),'nested canvases inherit camera once, without double translation');
calls.length=0;rearRenderer.render({...input,map:yard,st:front,dynamicMetaAt:()=>shown});
assert(!calls.some(c=>c.id==='map-grid-canvas-foreground'&&c.k==='drawImage'),'front-door player is not covered by rear architecture');
rearRenderer.render({...input,map:maps[0],dynamicMetaAt:()=>shown});
assert.equal(foreground.style.visibility,'hidden');assert.equal(foreground.width,1,'leaving courtyard releases extra full-map canvas storage without cancelling camera motion');
console.log('PASS rear/front depth order, one roof layer, clear ground footprint, fog gates, camera alignment and indoor cleanup');

assert(art.usesGroundVisibility(yard));
assert(!art.usesGroundVisibility(maps[0]));
assert(!art.usesGroundVisibility({...yard,dungeon:true}));
const known={terrainVisible:false,sceneryVisible:false,environmentVisible:true};
calls.length=0;rearRenderer.render({...input,map:yard,st:behind,dynamicMetaAt:()=>known,environmentShade:'rgba(8,12,24,.3)'});
const completeRoofs=calls.filter(c=>['map-grid-canvas-dynamic','map-grid-canvas-foreground'].includes(c.id)&&c.k==='drawImage'&&c.args[0].srcValue.includes('courtyard-materials')&&c.args[1]===7&&c.args[2]===7);
assert.equal(completeRoofs.length,0,'unseen courtyard is not globally revealed by the former environment flag');
assert(calls.some(c=>c.id==='map-grid-canvas-foreground'&&c.k==='set:globalCompositeOperation'&&c.args[0]==='source-atop'),'ambient tint respects foreground transparency and cutaway');
calls.length=0;art.object(context('known'),yard,3,8,{...known,gathering:true},yp);
assert(!calls.some(c=>c.k==='drawImage'),'unseen resources stay hidden');
calls.length=0;art.wall(context('indoor'),maps[0],9,8,known,projection);
assert.equal(calls.length,0,'outdoor exception cannot reveal indoor terrain');
const glimpse=(x,y)=>({terrainVisible:x===5&&y===4,sceneryVisible:false});
const shell=art.visibleBuildingCells(yard,glimpse);
assert(shell.size>1,'one visible wall reveals the connected building shell');
assert(!shell.has('10,5')&&!shell.has('14,2')&&!shell.has('7,5'),'shell visibility never expands to barrels, trees or road');
calls.length=0;rearRenderer.setGroundEffectsRenderer(args=>{assert(args.groundVisibilityHandled);calls.push({k:'ground-mask'});});
rearRenderer.render({...input,map:yard,st:behind,dynamicMetaAt:glimpse});
const shellDraws=calls.filter(c=>c.k==='drawImage'&&c.args[0].srcValue.includes('courtyard-materials')&&c.args[1]===7&&c.args[2]===7);
assert.equal(shellDraws.length,shell.size,'partly seen shell has no missing roof tiles');
assert(calls.findIndex(c=>c.k==='ground-mask')<calls.findIndex(c=>c.k==='drawImage'),'fog is below raised architecture');
assert(!calls.some(c=>c.k==='drawImage'&&c.args[0].srcValue.includes('courtyard-props')&&c.args[1]===67),'unseen barrels not revealed with building shell');
calls.length=0;rearRenderer.render({...input,map:maps[0],dynamicMetaAt:()=>shown});assert(!calls.some(c=>c.k==='ground-mask'),'indoor uses original fog layer');
console.log('PASS courtyard ground fog order, whole visible shells, hidden shells/props/resources and unchanged other maps');
