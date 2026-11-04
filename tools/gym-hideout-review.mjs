import {loadGymArt,GYM_FOOTPRINTS} from './gym-art.mjs';
import {STATIONS} from './gym-prototype-data.mjs';
import {makeLayoutMap,validateLayout,insideBounds,key,stationCells,layoutSolids,findLayoutPath} from './gym-hideout-layout.mjs';
import {loadGymRoomArt} from './gym-room-art.mjs';
import {mountGymPrototype} from './gym-prototype.mjs';

const $=id=>document.getElementById(id),world=$('world'),viewport=$('viewport'),plan=$('plan');
try {
  const read=async url=>{const r=await fetch(url);if(!r.ok)throw Error('无法载入布局');return r.json();};
  const [source,layout,art,pm,room]=await Promise.all([
    read('data/maps/M0_Base_Inside_lv_1.json'),read('data/gym-layout.json'),loadGymArt(),read('assets/map/isometric/player-atlas-v1/manifest.json'),loadGymRoomArt()
  ]);
  const validation=validateLayout(source,layout),map=makeLayoutMap(source,layout);
  const stations=layout.stations.map(s=>({...s,name:STATIONS.find(t=>t.id===s.id).name,footprint:GYM_FOOTPRINTS[s.id]}));
  const ps=pm.states[0],playerImage=new Image();playerImage.src='assets/map/isometric/player-atlas-v1/'+ps.file;await playerImage.decode();
  const disabled=new Set(map.disabled.map(p=>key(p.x,p.y))),blocks=new Set(map.blocks.map(p=>key(p.x,p.y)));
  const npcAt=new Map(map.npcs.map(p=>[key(p.x,p.y),p])),enemyAt=new Map(map.enemies.map(p=>[key(p.x,p.y),p]));
  const portalAt=new Map(map.portals.map(p=>[key(p.x,p.y),p]));
  const stationFields={cooking:'cookingStation',pharmacy:'pharmacyStation',compost:'compostStation',agriculture:'agricultureStation',livestock:'livestockStation',bed:'bedStation',warehouse:'warehouseStation'};
  function metaAt(x,y){
    const k=key(x,y),npc=npcAt.get(k),enemy=enemyAt.get(k),m={disabled:disabled.has(k),terrainVisible:!disabled.has(k),sceneryVisible:!disabled.has(k),walkable:!blocks.has(k),portal:portalAt.has(k),npc:!!npc,npcId:npc?.npc_id,npcLabel:map.annotations[k]||(npc?'林经理':''),enemy:!!enemy,enemyId:enemy?.enemy_id};
    for(const [type,field]of Object.entries(stationFields))if(map[type+'_station_interact_npc_by_cell']?.[k]){m[field]=true;m.npcId=map[type+'_station_interact_npc_by_cell'][k];m.npcLabel=map.annotations[k];}
    return m;
  }
  room.install(map,layout);
  const renderer=TileRendererV2.create(world,{cellPx:144/Math.SQRT2});
  const projection=MapProjection.create(map,144/Math.SQRT2,'isometric');
  const project=(x,y,z=0)=>{const p=projection.cellCenter(x-.5,y-.5);return {x:p.x,y:p.y-z};};
  let view='gym',demo,selected='',walking=false,sceneHost;
  const actor={...layout.player,mapId:layout.mapId},visual={...actor},labels=new Map();
  function drawPawn(ctx){
    const c=projection.cellCenter(visual.x,visual.y),[bx,by,bw,bh]=ps.crop,f=pm.displayBaseWidth/ps.baseWidth*1.25;
    const ax=bx+ps.anchor[0],ay=by+ps.anchor[1];
    ctx.drawImage(playerImage,bx,by,bw,bh,c.x+(bx-ax)*f,c.y+(by-ay)*f,bw*f,bh*f);
  }
  function poly(ctx,points){ctx.beginPath();points.forEach((p,i)=>ctx[i?'lineTo':'moveTo'](p.x,p.y));ctx.closePath();}
  function gymLayer({ctx}){
    const levels=demo?.state.levels||{};
    room.fittings(ctx,project,layout);
    const objects=stations.map(s=>({depth:s.x+s.y+(s.footprint[0]+s.footprint[1])/2-1,draw:()=>art.station(ctx,s.id,levels,project,s.x,s.y,{ghost:demo&&!levels[s.id]})}));
    for(const s of layout.decorations){const p=project(s.x+s.footprint[0]/2,s.y+s.footprint[1]/2);objects.push({depth:s.x+s.y+(s.footprint[0]+s.footprint[1])/2-1,draw:()=>room.sprite(ctx,s.id,p.x,p.y)});}
    objects.push({depth:visual.x+visual.y,draw:()=>drawPawn(ctx)});
    objects.sort((a,b)=>a.depth-b.depth).forEach(o=>o.draw());
  }
  renderer.setEffectsRenderer(gymLayer);
  renderer.render({map,st:layout.player,viewport:{width:projection.widthPx,height:projection.heightPx},staticMetaAt:metaAt,dynamicMetaAt:metaAt});
  function label(name,x,y,cls='',id=''){
    const el=document.createElement(id?'button':'div');el.className='label '+cls;
    const text=document.createElement('span');text.textContent=name;el.append(text);
    if(id){el.classList.add('gym-pawn');el.dataset.station=id;el.dataset.npc=GymFacility.npcId(id)||'npc.station.bed_base';el.disabled=true;el.onclick=e=>{e.stopPropagation();sceneHost?.approach(id);};labels.set(id,el);}
    const p=project(x,y);el.style.left=p.x+'px';el.style.top=(p.y+23)+'px';$('labels').append(el);
  }
  for(const s of stations)label(s.name,s.x+s.footprint[0]/2,s.y+s.footprint[1]/2,'',s.id);
  label('床',11.5,15,'existing','bed');
  function drawPlan(){
    const ratio=Math.min(devicePixelRatio||1,2),w=viewport.clientWidth,h=viewport.clientHeight;
    plan.width=w*ratio;plan.height=h*ratio;const ctx=plan.getContext('2d');ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,w,h);
    const size=Math.min((w-70)/16,(h-65)/16),ox=(w-size*16)/2,oy=(h-size*16)/2+8;
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='11px Microsoft YaHei';ctx.fillStyle='#8b9886';
    for(let n=0;n<16;n++){ctx.fillText(n,ox+(n+.5)*size,oy-14);ctx.fillText(n,ox-17,oy+(n+.5)*size);}
    for(let y=0;y<16;y++)for(let x=0;x<16;x++){
      const k=key(x,y),isGym=insideBounds(x,y,layout.selectedBounds),rubber=layout.rubberZones.some(r=>insideBounds(x,y,r));
      ctx.fillStyle=disabled.has(k)?'#19211e':blocks.has(k)?'#44433a':isGym?(rubber?'#272c27':'#5c5e4c'):'#303f36';ctx.fillRect(ox+x*size+1,oy+y*size+1,size-2,size-2);
      ctx.strokeStyle='#4b594744';ctx.strokeRect(ox+x*size+.5,oy+y*size+.5,size-1,size-1);
    }
    function title(text,x,y,width=1,height=1,color='#e9e0c1'){
      ctx.font=Math.max(9,Math.min(12,size*.27))+'px Microsoft YaHei';ctx.fillStyle=color;
      const lineLength=width===1?3:6,lines=[];for(let i=0;i<text.length;i+=lineLength)lines.push(text.slice(i,i+lineLength));
      lines.forEach((line,i)=>ctx.fillText(line,ox+(x+width/2)*size,oy+(y+height/2)*size+(i-(lines.length-1)/2)*13));
    }
    for(const [k,text]of Object.entries(map.annotations)){
      const [x,y]=k.split(',').map(Number);if(disabled.has(k))continue;
      ctx.fillStyle='#5a5840';ctx.fillRect(ox+x*size+3,oy+y*size+3,size-6,size-6);title(text,x,y);
    }
    title('林经理',8,12,1,1,'#c6b5dc');
    for(const p of map.portals){ctx.strokeStyle='#8eb4b8';ctx.lineWidth=2;ctx.strokeRect(ox+p.x*size+4,oy+p.y*size+4,size-8,size-8);title(p.label==='出门'?'出门':'测试',p.x,p.y,1,1,'#aec9cf');}
    for(const s of stations){
      const [sw,sh]=s.footprint;ctx.fillStyle='#706443';ctx.fillRect(ox+s.x*size+2,oy+s.y*size+2,sw*size-4,sh*size-4);
      ctx.strokeStyle='#d6bb77';ctx.lineWidth=1.5;ctx.strokeRect(ox+s.x*size+2,oy+s.y*size+2,sw*size-4,sh*size-4);title(s.name,s.x,s.y,sw,sh,'#fff0c4');
    }
    for(const s of layout.decorations){const [sw,sh]=s.footprint;ctx.fillStyle='#435158';ctx.fillRect(ox+s.x*size+2,oy+s.y*size+2,sw*size-4,sh*size-4);title(s.name,s.x,s.y,sw,sh,'#bbd4d1');}
    for(const p of [layout.door,...layout.connection]){ctx.fillStyle='#6d8e5b';ctx.fillRect(ox+p.x*size+1,oy+p.y*size+1,size-2,size-2);}
    title('通道',8,7,2,1,'#f0f5dc');
    const r=layout.selectedBounds;ctx.strokeStyle='#e3c36e';ctx.lineWidth=2;ctx.strokeRect(ox+r[0]*size,oy+r[1]*size,(r[2]-r[0]+1)*size,(r[3]-r[1]+1)*size);
  }
  function fit(){
    const flat=view==='plan';plan.hidden=!flat;world.hidden=flat;
    for(const v of ['plan','all','gym'])$(v+'-view').setAttribute('aria-pressed',String(view===v));
    $('level').disabled=flat||walking||!!demo?.state.job||$('interaction').open||NPCSystem.isMenuOpen();
    if(flat){drawPlan();return;}
    let bounds={x:0,y:0,w:projection.widthPx,h:projection.heightPx};
    if(view==='gym'){
      const pts=[project(0,0),project(9.8,0),project(9.8,10),project(0,10)];
      const left=Math.min(...pts.map(p=>p.x))-40,top=Math.min(...pts.map(p=>p.y))-105;
      bounds={x:left,y:top,w:Math.max(...pts.map(p=>p.x))-left+40,h:Math.max(...pts.map(p=>p.y))-top+65};
    }
    const scale=Math.min((viewport.clientWidth-24)/bounds.w,(viewport.clientHeight-24)/bounds.h);
    world.style.transform=`translate(${(viewport.clientWidth-bounds.w*scale)/2-bounds.x*scale}px,${(viewport.clientHeight-bounds.h*scale)/2-bounds.y*scale}px) scale(${scale})`;
  }
  for(const v of ['plan','all','gym'])$(v+'-view').onclick=()=>{view=v;fit();};
  $('level').onchange=()=>{if(!demo||walking||demo.state.job||$('interaction').open||NPCSystem.isMenuOpen())return;const level=Number($('level').value);for(const s of stations)demo.state.levels[s.id]=level;for(const part of ['hands','ankle','toes'])demo.state.levels['handsfeet_'+part]=level;window.GymPrototype.refresh();};
  new ResizeObserver(fit).observe(viewport);fit();
  async function sceneFactory(host){
    demo=host.demo;
    const solid=layoutSolids(map,layout),places=[...stations,{id:'bed',x:11,y:14,footprint:[1,2]}];
    let animation=0,serial=0;
    function refresh(){
      for(const [id,el]of labels){el.disabled=walking||(!host.canMove()&&!demo.state.job);el.classList.toggle('selected',selected===id);el.classList.toggle('unbuilt',id!=='bed'&&!demo.state.levels[id]);}
      $('level').disabled=view==='plan'||walking||!!demo.state.job||$('interaction').open||NPCSystem.isMenuOpen();
      $('inventory').disabled=walking||!!demo.state.job;
      renderer.renderFxLayer();if(view==='plan')drawPlan();
    }
    function walk(route,done){
      if(!route)return;
      const token=++serial;walking=true;host.onMoving(true);refresh();
      function step(){
        if(token!==serial)return;
        if(!route.length){walking=false;host.onMoving(false);refresh();done?.();return;}
        const from={...actor},to=route.shift(),start=performance.now();
        function frame(now){
          if(token!==serial)return;
          if(document.hidden){Object.assign(visual,actor);walking=false;host.onMoving(false);refresh();return;}
          const t=Math.min(1,(now-start)/160);visual.x=from.x+(to.x-from.x)*t;visual.y=from.y+(to.y-from.y)*t;renderer.renderFxLayer();
          if(t<1)animation=requestAnimationFrame(frame);else{Object.assign(actor,to);step();}
        }
        animation=requestAnimationFrame(frame);
      }
      step();
    }
    function approach(id){
      if(walking)return;
      if(!host.canMove()){
        const j=demo.state.job,owner=j&&(j.kind==='train'?demo.getAction(j.actionId).station:'bed');
        if(j&&id===owner&&!$('interaction').open&&!NPCSystem.isMenuOpen())host.onInteract(id);
        return;
      }
      const place=places.find(s=>s.id===id);if(!place)return;
      const targets=stationCells(place).flatMap(p=>[[1,0],[-1,0],[0,1],[0,-1]].map(([dx,dy])=>({x:p.x+dx,y:p.y+dy})));
      const route=findLayoutPath(map,solid,actor,targets);if(!route)return;
      selected=id;walk(route,()=>host.onInteract(id));
    }
    viewport.addEventListener('click',e=>{
      if(view==='plan'||e.target.closest('button')||walking||!host.canMove())return;
      const r=world.getBoundingClientRect(),scale=r.width/projection.widthPx;
      const p=projection.pick((e.clientX-r.left)/scale,(e.clientY-r.top)/scale);if(!p||solid.has(key(p.x,p.y)))return;
      selected='';walk(findLayoutPath(map,solid,actor,[p]));
    });
    sceneHost={refresh,approach,getActor:()=>({...actor}),getPlacement:id=>places.find(s=>s.id===id),clearSelection:()=>{selected='';refresh();},reset:()=>{serial++;cancelAnimationFrame(animation);walking=false;selected='';Object.assign(actor,layout.player);Object.assign(visual,actor);host.onMoving(false);refresh();}};
    return sceneHost;
  }
  await mountGymPrototype({sceneFactory,initialScenario:'built'});
  document.body.dataset.ready='true';document.body.dataset.validation=JSON.stringify(validation);
}catch(error){$('error').textContent=error.message;console.error(error);}
