// Disposable spatial interaction study. Candidate gym originals; approved hideout bed.
// Player atlas stays at the existing 125% display scale.
import {loadGymArt,GYM_FOOTPRINTS} from './gym-art.mjs';
export const PLACEMENTS = [
  {id:'pullup',x:1,y:1}, {id:'cable',x:4,y:1}, {id:'barbell',x:7,y:1},
  {id:'neck',x:1,y:4}, {id:'floor',x:3,y:3}, {id:'leg',x:7,y:4},
  {id:'bed',name:'旧床',x:1,y:7}, {id:'handsfeet',x:4,y:6},
  {id:'dumbbell',x:6,y:6}, {id:'supply',name:'物资架',x:7,y:8}
];
export async function createGymScene({canvas,pawns,container,demo,onInteract,onMoving,canMove}) {
  const ctx=canvas.getContext('2d'), W=9,H=10,half=72,depth=72/Math.SQRT2;
  const load=async src=>{const im=new Image();im.src=src;await im.decode();return im;};
  const pm=await fetch('assets/map/isometric/player-atlas-v1/manifest.json').then(r=>r.json()),ps=pm.states[0];
  const [playerImage,floorImage]=await Promise.all([load('assets/map/isometric/player-atlas-v1/'+ps.file),load('assets/dungeon/grid-scene-v1/floor-industrial.png')]);
  const art=await loadGymArt();
  const items=PLACEMENTS.map(p=>({...p,footprint:GYM_FOOTPRINTS[p.id],name:p.name||demo.station(p.id).name}));
  const occupied=item=>Array.from({length:item.footprint[0]*item.footprint[1]},(_,i)=>({x:item.x+i%item.footprint[0],y:item.y+Math.floor(i/item.footprint[0])}));
  let actor={x:5,y:4},visual={...actor},hover=null,selected=null,path=[],walkToken=0,moving=false,scale=1,ox=0,oy=0,viewWidth=0,viewHeight=0,frame=null;
  const blocked=new Set(items.flatMap(occupied).map(p=>p.x+','+p.y));
  const pos=(x,y,z=0)=>({x:(x-y)*half,y:(x+y)*depth-z});
  const screen=(x,y,z=0)=>{const p=pos(x,y,z);return{x:ox+p.x*scale,y:oy+p.y*scale};};
  function poly(points,fill,stroke='#151e17',line=1.3){ctx.beginPath();points.forEach((p,i)=>ctx[i?'lineTo':'moveTo'](p.x,p.y));ctx.closePath();if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=line;ctx.stroke();}}
  function cell(x,y){return [pos(x,y),pos(x+1,y),pos(x+1,y+1),pos(x,y+1)];}
  function equipment(id,x,y,unbuilt) {
    if(id!=='supply'){art.station(ctx,id,demo.state.levels,pos,x,y,{ghost:unbuilt});return;}
    // The unrelated temporary supply stand retains its original placeholder.
    const origin=pos(x+.5,y+.5);ctx.save();ctx.translate(origin.x,origin.y);
    const p=(u,v,z=0)=>({x:u-v,y:(u+v)/Math.SQRT2-z});
    const wood={top:'#8f7956',left:'#65563d',right:'#4c4533'};
    const box=(u,v,z,w,d,h,c=wood)=>{
      const b=p(u+w,v,z),c0=p(u+w,v+d,z),e=p(u,v+d,z),a1=p(u,v,z+h),b1=p(u+w,v,z+h),c1=p(u+w,v+d,z+h),e1=p(u,v+d,z+h);
      poly([b,c0,c1,b1],c.right);poly([c0,e,e1,c1],c.left);poly([a1,b1,c1,e1],c.top);
    };
    ctx.fillStyle='#040b0750';ctx.beginPath();ctx.ellipse(8,12,57,24,0,0,Math.PI*2);ctx.fill();
    for(const u of [-25,25])for(const v of [-19,19])box(u-3,v-3,0,6,6,32);
    box(-31,-25,32,62,50,7);
    box(-24,-15,39,26,23,19,{top:'#929060',left:'#626c43',right:'#4d583b'});
    box(9,-16,39,16,16,27,{top:'#9fa59a',left:'#687a72',right:'#4a625a'});
    box(-20,8,39,17,12,8,{top:'#716a42',left:'#504d32',right:'#3a402b'});
    ctx.restore();
  }
  function drawPlayer(){
    const c=pos(visual.x+.5,visual.y+.5),[bx,by,bw,bh]=ps.crop,ax=bx+ps.anchor[0],ay=by+ps.anchor[1],f=pm.displayBaseWidth/ps.baseWidth*1.25;
    ctx.fillStyle='#040b0760';ctx.beginPath();ctx.ellipse(c.x,c.y+2,28,11,0,0,Math.PI*2);ctx.fill();
    ctx.drawImage(playerImage,bx,by,bw,bh,c.x+(bx-ax)*f,c.y+(by-ay)*f,bw*f,bh*f);
  }
  function draw(){
    const ratio=Math.min(devicePixelRatio||1,2);ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,viewWidth,viewHeight);ctx.translate(ox,oy);ctx.scale(scale,scale);
    const corners=[pos(0,0),pos(W,0),pos(W,H),pos(0,H)];
    ctx.save();ctx.shadowBlur=45;ctx.shadowColor='#0009';poly(corners,'#485145',null);ctx.restore();
    poly([pos(0,0),pos(W,0),pos(W,0,75),pos(0,0,75)],'#475345');
    poly([pos(0,0),pos(0,H),pos(0,H,75),pos(0,0,75)],'#344537');
    poly([pos(0,0,75),pos(W,0,75),pos(W,-.12,75),pos(-.12,-.12,75)],'#738067');
    poly([pos(0,0,75),pos(0,H,75),pos(-.12,H,75),pos(-.12,-.12,75)],'#5d6f58');
    ctx.save();poly(corners,null,null);ctx.clip();ctx.globalAlpha=.42;ctx.drawImage(floorImage,-H*half,0,(W+H)*half,(W+H)*depth);ctx.restore();
    for(let y=0;y<H;y++)for(let x=0;x<W;x++)poly(cell(x,y),null,'#83907822',.8);
    for(const n of path){const p=pos(n.x+.5,n.y+.5);ctx.fillStyle='#c5b67b75';ctx.beginPath();ctx.ellipse(p.x,p.y,5,3,0,0,Math.PI*2);ctx.fill();}
    for(const item of items){if(item.id===hover||item.id===selected)for(const c of occupied(item))poly(cell(c.x,c.y),'#e1c87716','#c8b679',1.5);}
    const order=items.map(item=>({depth:item.x+item.y+(item.footprint[0]+item.footprint[1])/2-.7,draw:()=>equipment(item.id,item.x,item.y,!['bed','supply'].includes(item.id)&&!demo.state.levels[item.id])}));
    order.push({depth:visual.x+visual.y+.5,draw:drawPlayer});order.sort((a,b)=>a.depth-b.depth).forEach(o=>o.draw());
    poly([pos(W,0),pos(W,H),pos(W,H,-12),pos(W,0,-12)],'#333e2f');
    poly([pos(0,H),pos(W,H),pos(W,H,-12),pos(0,H,-12)],'#27382b');
    ctx.setTransform(ratio,0,0,ratio,0,0);
  }
  function refresh(){
    for(const item of items){const b=pawns.querySelector('[data-pawn="'+item.id+'"]'),c=screen(item.x+item.footprint[0]/2,item.y+item.footprint[1]/2);const built=['bed','supply'].includes(item.id)||demo.state.levels[item.id];
      b.style.left=c.x+'px';b.style.top=(c.y+28*scale)+'px';b.style.height=(140*scale)+'px';b.classList.toggle('unbuilt',!built);b.classList.toggle('selected',item.id===selected);
      const job=demo.state.job,working=job&&(job.kind==='train'?demo.getAction(job.actionId).station===item.id:item.id==='bed');b.classList.toggle('working',!!working);
      b.querySelector('small').textContent=built?'':'待建';
    }draw();
  }
  function resize(){
    const old=viewWidth;viewWidth=canvas.clientWidth;viewHeight=canvas.clientHeight;const ratio=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(viewWidth*ratio);canvas.height=Math.round(viewHeight*ratio);
    const roomWidth=(W+H)*half,roomHeight=(W+H)*depth+110;
    scale=Math.min((viewWidth-70)/roomWidth,(viewHeight-45)/roomHeight);ox=(viewWidth-(W-H)*half*scale)/2;oy=(viewHeight-roomHeight*scale)/2+87*scale;
    refresh();if(!old&&container.scrollWidth>container.clientWidth)container.scrollLeft=(container.scrollWidth-container.clientWidth)/2;
  }
  function route(goal){
    const q=[{...actor}],seen=new Set([actor.x+','+actor.y]),parents=new Map();let end;
    for(let i=0;i<q.length;i++){const p=q[i];if(goal(p)){end=p;break;}for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const n={x:p.x+dx,y:p.y+dy},k=n.x+','+n.y;if(n.x<0||n.x>=W||n.y<0||n.y>=H||blocked.has(k)||seen.has(k))continue;seen.add(k);parents.set(k,p);q.push(n);}}
    if(!end)return null;const result=[];while(end.x!==actor.x||end.y!==actor.y){result.unshift(end);end=parents.get(end.x+','+end.y);}return result;
  }
  function stopWalk(){walkToken++;moving=false;path=[];visual={...actor};if(frame)cancelAnimationFrame(frame);frame=null;onMoving(false);}
  function walk(steps,done){
    stopWalk();if(!steps)return;path=[...steps];if(!path.length){done?.();draw();return;}
    moving=true;onMoving(true);const token=walkToken;
    function step(){if(token!==walkToken)return;const next=path.shift();if(!next){moving=false;onMoving(false);draw();done?.();return;}const start=performance.now(),from={...actor};
      function animate(now){if(token!==walkToken)return;const t=Math.min(1,(now-start)/150);visual={x:from.x+(next.x-from.x)*t,y:from.y+(next.y-from.y)*t};draw();if(t<1)frame=requestAnimationFrame(animate);else{actor={...next};step();}}
      frame=requestAnimationFrame(animate);
    }step();
  }
  function approach(id){const item=items.find(p=>p.id===id);if(!item)return;if(!canMove()){onInteract(id,true);return;}selected=id;refresh();walk(route(p=>occupied(item).some(c=>Math.abs(p.x-c.x)+Math.abs(p.y-c.y)===1)),()=>onInteract(id,false));}
  for(const item of items){const b=document.createElement('button');b.className='pawn-hit';b.dataset.pawn=item.id;b.setAttribute('aria-label',item.name);b.innerHTML='<span class="pawn-label">'+item.name+'<small></small></span>';b.onclick=()=>approach(item.id);b.onpointerenter=()=>{hover=item.id;draw();};b.onpointerleave=()=>{hover=null;draw();};pawns.append(b);}
  canvas.onclick=e=>{
    if(!canMove())return;const rect=canvas.getBoundingClientRect(),px=(e.clientX-rect.left-ox)/scale,py=(e.clientY-rect.top-oy)/scale;
    const x=Math.floor((px/half+py/depth)/2),y=Math.floor((py/depth-px/half)/2);if(x<0||x>=W||y<0||y>=H)return;
    const item=items.find(p=>occupied(p).some(c=>c.x===x&&c.y===y));if(item){approach(item.id);return;}selected=null;refresh();walk(route(p=>p.x===x&&p.y===y));
  };
  const observer=new ResizeObserver(resize);observer.observe(canvas);resize();
  return {refresh,approach,getActor:()=>({...actor,mapId:'M0_Base_Inside_lv_1'}),getPlacement:id=>items.find(p=>p.id===id),get moving(){return moving;},clearSelection(){selected=null;refresh();},reset(){stopWalk();actor={x:5,y:4};visual={...actor};selected=null;refresh();}};
}
