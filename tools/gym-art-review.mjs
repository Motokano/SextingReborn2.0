import {loadGymArt,GYM_FOOTPRINTS} from './gym-art.mjs';
import {STATIONS} from './gym-prototype-data.mjs';
const gallery=document.querySelector('#gallery'),contactToggle=document.querySelector('#contacts'),renderers=[];
try{
const art=await loadGymArt(),pm=await fetch('assets/map/isometric/player-atlas-v1/manifest.json').then(r=>r.json()),ps=pm.states[0],pi=new Image();pi.src='assets/map/isometric/player-atlas-v1/'+ps.file;await pi.decode();
function paint(canvas,id,levels){
 const ctx=canvas.getContext('2d'),[w,d]=GYM_FOOTPRINTS[id];ctx.clearRect(0,0,canvas.width,canvas.height);
 const p=(x,y,z=0)=>({x:canvas.width/2+(x-y-(w-d)/2)*72-15,y:190+(x+y-(w+d)/2)*72/Math.SQRT2-z});
 for(let y=-1;y<d+1;y++)for(let x=-1;x<w+1;x++){
  const pts=[p(x,y),p(x+1,y),p(x+1,y+1),p(x,y+1)];ctx.beginPath();pts.forEach((q,i)=>ctx[i?'lineTo':'moveTo'](q.x,q.y));ctx.closePath();ctx.fillStyle=x>=0&&x<w&&y>=0&&y<d?'#304431':'#27392d';ctx.fill();ctx.strokeStyle='#71816539';ctx.lineWidth=.7;ctx.stroke();
 }
 art.station(ctx,id,levels,p,0,0,{contacts:contactToggle.checked});
 const c=p(w+.15,d*(id==='handsfeet'?.9:.5)),[bx,by,bw,bh]=ps.crop,ax=bx+ps.anchor[0],ay=by+ps.anchor[1],f=pm.displayBaseWidth/ps.baseWidth*1.25;
 ctx.drawImage(pi,bx,by,bw,bh,c.x+(bx-ax)*f,c.y+(by-ay)*f,bw*f,bh*f);
}
const only=new URLSearchParams(location.search).get('station');
for(const station of [...STATIONS,{id:'bed',name:'藏身处的床'}].filter(s=>!only||s.id===only)){
 if(station.id==='handsfeet'&&!art.get('hands',1))continue;
 const section=document.createElement('section');section.innerHTML='<h2>'+station.name+'</h2><div class="variants"></div>';gallery.append(section);
 for(const lv of station.id==='bed'?[1]:[1,2,3,4].filter(l=>station.id==='handsfeet'?['hands','ankle','toes'].every(k=>art.get(k,l)):art.get(station.id,l))){
  const card=document.createElement('div');card.className='variant';card.innerHTML='<h3>'+(station.id==='bed'?'现有素材':lv+'级')+'</h3><canvas width="240" height="310"></canvas>';section.lastChild.append(card);
  const levels={[station.id]:lv,handsfeet_hands:lv,handsfeet_ankle:lv,handsfeet_toes:lv};renderers.push(()=>paint(card.lastChild,station.id,levels));
 }
}
if((!only||only==='handsfeet')&&art.get('hands',1)){
const mod=document.createElement('section');mod.innerHTML='<h2>手足附件</h2><div class="modules"></div><canvas class="module-preview" width="440" height="340"></canvas>';gallery.append(mod);
const levels={handsfeet:1,handsfeet_hands:1,handsfeet_ankle:1,handsfeet_toes:1};
for(const [key,label]of [['handsfeet_hands','手部'],['handsfeet_ankle','足踝'],['handsfeet_toes','足趾']]){
 const el=document.createElement('label');el.textContent=label;const select=document.createElement('select');select.setAttribute('aria-label',label+'级别');select.innerHTML=[1,2,3,4].map(n=>'<option value="'+n+'">'+n+'级</option>').join('');el.append(select);mod.querySelector('.modules').append(el);select.onchange=()=>{levels[key]=Number(select.value);paint(mod.lastChild,'handsfeet',levels);};
}
renderers.push(()=>paint(mod.lastChild,'handsfeet',levels));
}
contactToggle.onchange=()=>renderers.forEach(f=>f());renderers.forEach(f=>f());document.body.dataset.ready='true';
}catch(error){document.querySelector('#error').textContent=error.message;console.error(error);}
