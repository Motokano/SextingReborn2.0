// Agriculture water art. A single transparent canvas spans the connected canals.
// Flow follows the simulation's sourceParent graph; this module never mutates farm state.
const TAU = Math.PI * 2;
const hash = value => { const x = Math.sin(value * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function sampleRoute(nodes) {
  const points = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    const p0 = nodes[Math.max(0, i - 1)], p1 = nodes[i], p2 = nodes[i + 1], p3 = nodes[Math.min(nodes.length - 1, i + 2)];
    for (let j = 0; j < 12; j++) {
      const t = j / 12, t2 = t * t, t3 = t2 * t;
      const axis = k => .5 * (2*p1[k] + (-p0[k]+p2[k])*t + (2*p0[k]-5*p1[k]+4*p2[k]-p3[k])*t2 + (-p0[k]+3*p1[k]-3*p2[k]+p3[k])*t3);
      points.push({x:axis('x'),y:axis('y')});
    }
  }
  points.push(nodes.at(-1));
  let length = 0;
  points.forEach((p,i) => { if(i) length += Math.hypot(p.x-points[i-1].x,p.y-points[i-1].y); p.distance=length; });
  return {points,length};
}

function onRoute(route, distance) {
  const points=route.points;
  let lo=1,hi=points.length-1;
  while(lo<hi){const mid=(lo+hi)>>1;if(points[mid].distance<distance)lo=mid+1;else hi=mid;}
  const a=points[lo-1],b=points[lo],span=b.distance-a.distance;
  const f=span?clamp((distance-a.distance)/span,0,1):0,dx=b.x-a.x,dy=b.y-a.y,m=Math.hypot(dx,dy)||1;
  return {x:a.x+dx*f,y:a.y+dy*f,dx:dx/m,dy:dy/m};
}

export function mountAgricultureWater(map, state, selected) {
  if(!map||typeof Path2D==='undefined')return null;
  const canvas=document.createElement('canvas');
  canvas.className='au-water-fx';canvas.setAttribute('aria-hidden','true');
  map.append(canvas);
  const ctx=canvas.getContext('2d');
  if(!ctx){canvas.remove();return null;}
  const base=document.createElement('canvas'),bed=base.getContext('2d');
  const glow=document.createElement('canvas');glow.width=glow.height=24;
  const glowCtx=glow.getContext('2d'),glowGradient=glowCtx.createRadialGradient(12,12,0,12,12,12);
  glowGradient.addColorStop(0,'rgba(226,255,250,.8)');glowGradient.addColorStop(.2,'rgba(141,225,217,.3)');glowGradient.addColorStop(1,'rgba(98,204,198,0)');
  glowCtx.fillStyle=glowGradient;glowCtx.fillRect(0,0,24,24);
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let disposed=false,frame=0,lastFrame=0,width=0,height=0,dpr=1,tile=40;
  let wetPath=new Path2D(),nodes=[],wetNodes=[],routes=[],particles=[],eddies=[],pool=null;
  const born=performance.now();

  function measure() {
    if(disposed)return;
    width=map.clientWidth;height=map.clientHeight;
    if(!width||!height)return;
    dpr=Math.min(devicePixelRatio||1,2);
    canvas.width=base.width=Math.round(width*dpr);canvas.height=base.height=Math.round(height*dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);bed.setTransform(dpr,0,0,dpr,0,0);
    const lookup=new Map();nodes=[];
    for(const button of map.querySelectorAll('.au-tile.channel,.au-tile.pool')) {
      const [gx,gy]=button.dataset.cell.split(',').map(Number),c=state.map[gy][gx];
      const node={key:`${gx},${gy}`,gx,gy,x:button.offsetLeft+button.offsetWidth/2,y:button.offsetTop+button.offsetHeight/2,size:button.offsetWidth,pool:c.kind==='pool',wet:c.kind==='pool'||Number(c.water)>0,parent:c.sourceParent,children:[]};
      nodes.push(node);lookup.set(node.key,node);
    }
    if(!nodes.length)return;
    tile=nodes[0].size;pool=nodes.find(n=>n.pool);wetNodes=nodes.filter(n=>n.wet);
    for(const n of wetNodes){const parent=lookup.get(n.parent);if(parent?.wet)parent.children.push(n);}
    const connections=[];
    for(const n of nodes)for(const [dx,dy]of [[1,0],[0,1]]){const other=lookup.get(`${n.gx+dx},${n.gy+dy}`);if(other)connections.push([n,other]);}
    const banks=new Path2D();
    for(const [a,b]of connections){banks.moveTo(a.x,a.y);banks.lineTo(b.x,b.y);}
    for(const n of nodes){banks.moveTo(n.x-.01,n.y);banks.lineTo(n.x+.01,n.y);}
    const waterWidth=tile*.56,edgeWidth=tile*.79;
    bed.clearRect(0,0,width,height);bed.lineCap='round';bed.lineJoin='round';
    // Continuous masonry edges, shaded into the ground; no square segment borders.
    bed.save();bed.shadowColor='#091c18b0';bed.shadowBlur=tile*.1;bed.shadowOffsetY=2;
    bed.strokeStyle='#252e29';bed.lineWidth=edgeWidth+3;bed.stroke(banks);bed.restore();
    const stone=bed.createLinearGradient(0,0,width*.8,height);
    stone.addColorStop(0,'#9a997d');stone.addColorStop(.4,'#777c65');stone.addColorStop(1,'#575f4e');
    bed.strokeStyle=stone;bed.lineWidth=edgeWidth;bed.stroke(banks);
    bed.strokeStyle='#333f34';bed.lineWidth=waterWidth+4;bed.stroke(banks);
    bed.strokeStyle='#28332a';bed.lineWidth=waterWidth;bed.stroke(banks);
    if(pool){const s=tile*.9;bed.fillStyle='#9a9b80';bed.beginPath();bed.roundRect(pool.x-s/2,pool.y-s/2,s,s,tile*.12);bed.fill();bed.strokeStyle='#4b5949';bed.lineWidth=2;bed.stroke();}
    // Stone joints stop at the waterline, with moss tint toward the lower edge.
    for(const [a,b]of connections){const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy),nx=-dy/len,ny=dx/len;
      for(const f of [.16,.68])for(const side of [-1,1]){const x=a.x+dx*f,y=a.y+dy*f;
        bed.beginPath();bed.moveTo(x+nx*(waterWidth*.5+2)*side,y+ny*(waterWidth*.5+2)*side);bed.lineTo(x+nx*edgeWidth*.5*side,y+ny*edgeWidth*.5*side);bed.strokeStyle='#253d305a';bed.lineWidth=1;bed.stroke();
      }
    }
    wetPath=new Path2D();
    for(const n of wetNodes){if(n.pool){const s=tile*.73;wetPath.roundRect(n.x-s/2,n.y-s/2,s,s,tile*.09);}else{wetPath.moveTo(n.x+waterWidth/2,n.y);wetPath.arc(n.x,n.y,waterWidth/2,0,TAU);}}
    for(const [a,b]of connections){if(!a.wet||!b.wet)continue;if(a.y===b.y)wetPath.rect(a.x,a.y-waterWidth/2,b.x-a.x,waterWidth);else wetPath.rect(a.x-waterWidth/2,a.y,waterWidth,b.y-a.y);}
    bed.save();bed.clip(wetPath);
    const water=bed.createLinearGradient(0,0,width*.35,height);
    water.addColorStop(0,'#377e7f');water.addColorStop(.45,'#245f64');water.addColorStop(1,'#174548');bed.fillStyle=water;bed.fillRect(0,0,width,height);
    // Submerged irregular stones give the transparent water a visible bed.
    for(let i=0;i<nodes.length*14;i++){const n=nodes[i%nodes.length],x=n.x+(hash(i+7)-.5)*tile*.66,y=n.y+(hash(i+41)-.5)*tile;
      bed.beginPath();bed.ellipse(x,y,.6+hash(i+4)*1.7,.4+hash(i+2),hash(i)*TAU,0,TAU);bed.fillStyle=i%3?'#173f3c60':'#9fb29035';bed.fill();
    }
    bed.restore();
    routes=[];
    for(const leaf of wetNodes.filter(n=>!n.pool&&!n.children.length)){
      const chain=[leaf],seen=new Set([leaf.key]);let n=leaf;
      while(n.parent){const parent=lookup.get(n.parent);if(!parent?.wet||seen.has(parent.key))break;chain.unshift(parent);seen.add(parent.key);n=parent;}
      if(chain.length>1&&chain[0].pool)routes.push(sampleRoute(chain));
    }
    particles=[];
    routes.forEach((route,r)=>{
      const count=Math.min(95,Math.max(1,Math.floor(420/routes.length)),Math.ceil(route.length/(tile*.18)));
      for(let i=0;i<count;i++){const seed=i+r*107;particles.push({route,phase:hash(seed+3),speed:tile*(.39+hash(seed+13)*.39),lane:(hash(seed+23)-.5)*waterWidth*.63,size:.5+hash(seed+29)*1.15,shine:hash(seed+37),seed});}
    });
    eddies=wetNodes.filter(n=>n.children.length>1||n.pool);
    // Canvas remains a purely visual layer; controls and all numbers stay above it.
    canvas.dataset.streams=String(routes.length);
    canvas.dataset.particles=String(particles.length);
    draw(performance.now());
  }

  function draw(now) {
    if(disposed||!width||!height)return;
    const t=reduced.matches?4:now/1000;
    ctx.clearRect(0,0,width,height);ctx.drawImage(base,0,0,width,height);
    ctx.save();ctx.clip(wetPath);ctx.lineCap='round';
    // Broad moving light ribbons distort the color below the faster surface flecks.
    for(const route of routes){
      for(let lane=0;lane<3;lane++){
        ctx.beginPath();
        route.points.forEach((p,i)=>{const next=route.points[Math.min(i+1,route.points.length-1)],dx=next.x-p.x,dy=next.y-p.y,m=Math.hypot(dx,dy)||1;
          const offset=(lane-1)*tile*.14+Math.sin(p.distance/(tile*.63)-t*(1.3+lane*.2))*tile*.035;
          const x=p.x-dy/m*offset,y=p.y+dx/m*offset;if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);
        });
        ctx.strokeStyle=['rgba(116,202,196,.12)','rgba(142,224,213,.19)','rgba(7,49,54,.21)'][lane];ctx.lineWidth=tile*(lane===1?.055:.09);ctx.stroke();
      }
    }
    // Small crescent wavelets advect downstream, spanning cell boundaries.
    for(let r=0;r<routes.length;r++){
      const route=routes[r],count=Math.ceil(route.length/(tile*.62));
      for(let j=0;j<count;j++){
        const distance=(j*tile*.62+t*tile*.49+r*tile*.21)%route.length,p=onRoute(route,distance);
        const pulse=.12+Math.max(0,Math.sin(j*3.1+t*.7))*.16;
        const sway=Math.sin(j*8.2+t*.9)*tile*.1,x=p.x-p.dy*sway,y=p.y+p.dx*sway,w=tile*(.09+hash(j+r)*.08);
        ctx.beginPath();ctx.moveTo(x-p.dy*w-p.dx*1.4,y+p.dx*w-p.dy*1.4);ctx.quadraticCurveTo(x+p.dx*2,y+p.dy*2,x+p.dy*w-p.dx*1.4,y-p.dx*w-p.dy*1.4);
        ctx.strokeStyle=`rgba(171,236,220,${pulse})`;ctx.lineWidth=.65;ctx.stroke();
      }
    }
    ctx.globalCompositeOperation='screen';
    for(const particle of particles){
      const route=particle.route,distance=(particle.phase*route.length+t*particle.speed)%route.length,p=onRoute(route,distance);
      const lane=particle.lane+Math.sin(t*1.2+particle.seed)*tile*.022;
      const x=p.x-p.dy*lane,y=p.y+p.dx*lane,twinkle=.35+.65*Math.pow(Math.max(0,Math.sin(t*2+particle.seed*3.4)),2);
      const fade=clamp(distance/(tile*.4),0,1)*clamp((route.length-distance)/(tile*.4),0,1);
      ctx.globalAlpha=(.32+particle.shine*.45)*twinkle*fade;
      if(particle.shine>.84){const s=particle.size*7;ctx.drawImage(glow,x-s/2,y-s/2,s,s);}
      ctx.strokeStyle=particle.shine>.6?'#cef9ed':'#68c4c2';ctx.lineWidth=particle.size*.7;
      ctx.beginPath();ctx.moveTo(x-p.dx*particle.size*1.5,y-p.dy*particle.size*1.5);ctx.lineTo(x+p.dx*particle.size*.5,y+p.dy*particle.size*.5);ctx.stroke();
      if(particle.shine>.92){ctx.fillStyle='#e3fff3';ctx.beginPath();ctx.arc(x,y,particle.size*.46,0,TAU);ctx.fill();}
    }
    ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
    // Eddies at actual junctions, plus concentric ripples where fresh water enters.
    for(const n of eddies){
      const scale=n.pool?1:.55;
      for(let i=0;i<4;i++){
        const phase=(t*(n.pool?.62:.45)+i*.25)%1,r=tile*(.06+phase*.3)*scale;
        ctx.beginPath();ctx.ellipse(n.x,n.y,r,r*.62,-.15,0,TAU);
        ctx.strokeStyle=`rgba(193,246,227,${(1-phase)*.46*scale})`;ctx.lineWidth=.65;ctx.stroke();
      }
    }
    // Local caustic flashes near the shallow banks, not scattered across the land.
    for(let i=0;i<wetNodes.length*2;i++){
      const n=wetNodes[i%wetNodes.length],shine=Math.pow(Math.max(0,Math.sin(t*1.6+i*2.8)),6);
      const x=n.x+(hash(i+77)-.5)*tile*.49,y=n.y+(hash(i+31)-.5)*tile*.52;
      ctx.strokeStyle=`rgba(211,251,222,${shine*.45})`;ctx.lineWidth=.7;ctx.beginPath();ctx.moveTo(x-2,y);ctx.lineTo(x+2,y);ctx.moveTo(x,y-1);ctx.lineTo(x,y+1);ctx.stroke();
    }
    const [sx,sy]=selected,n=wetNodes.find(n=>n.gx===sx&&n.gy===sy),elapsed=Math.max(0,(now-born)/1000);
    if(n&&elapsed<1.5&&!reduced.matches){const p=elapsed/1.5;ctx.beginPath();ctx.ellipse(n.x,n.y,tile*p*.6,tile*p*.42,0,0,TAU);ctx.strokeStyle=`rgba(224,255,239,${(1-p)*.7})`;ctx.lineWidth=1;ctx.stroke();}
    ctx.restore();
    if(pool){
      // A small visible spillway and a lively spray make the origin legible without arrows.
      const x=pool.x,y=pool.y-tile*.34;
      ctx.fillStyle='#9aab92';ctx.beginPath();ctx.roundRect(x-tile*.1,y-tile*.1,tile*.2,tile*.17,2);ctx.fill();
      ctx.fillStyle='#273f36';ctx.fillRect(x-tile*.06,y-tile*.04,tile*.12,tile*.08);
      const jet=ctx.createLinearGradient(x,y,x+1,y+tile*.28);jet.addColorStop(0,'#82b9b0');jet.addColorStop(.6,'#c0f0df');jet.addColorStop(1,'#75c4bc55');
      ctx.beginPath();ctx.moveTo(x-tile*.045,y+tile*.02);ctx.quadraticCurveTo(x-tile*.06,y+tile*.16,x-tile*.1,y+tile*.29);ctx.lineTo(x+tile*.11,y+tile*.29);ctx.quadraticCurveTo(x+tile*.045,y+tile*.16,x+tile*.045,y+tile*.02);ctx.closePath();ctx.fillStyle=jet;ctx.fill();
      for(let i=0;i<18;i++){
        const phase=(t*.95+hash(i)*3)%1,angle=hash(i+200)*TAU,distance=phase*tile*(.12+hash(i+300)*.15);
        const px=x+Math.cos(angle)*distance,py=pool.y+Math.sin(angle)*distance*.5-Math.sin(phase*Math.PI)*tile*.2;
        ctx.globalAlpha=(1-phase)*(.4+hash(i+90)*.6);ctx.fillStyle='#d4fcf0';ctx.beginPath();ctx.ellipse(px,py,.5+hash(i+22)*.65,.7+hash(i+23)*.8,angle,0,TAU);ctx.fill();
      }
      ctx.globalAlpha=1;
    }
  }

  function animate(now){frame=0;if(disposed||document.hidden||reduced.matches)return;if(now-lastFrame>=1000/30){draw(now);lastFrame=now;}frame=requestAnimationFrame(animate);}
  function resume(){cancelAnimationFrame(frame);frame=0;if(disposed)return;draw(performance.now());if(!document.hidden&&!reduced.matches)frame=requestAnimationFrame(animate);}
  const observer=new ResizeObserver(measure);observer.observe(map);
  document.addEventListener('visibilitychange',resume);reduced.addEventListener('change',resume);
  measure();resume();
  return {refresh:measure,destroy(){disposed=true;cancelAnimationFrame(frame);observer.disconnect();document.removeEventListener('visibilitychange',resume);reduced.removeEventListener('change',resume);canvas.remove();}};
}
