const $=id=>document.getElementById(id),catalog=DungeonGridArt.catalog,production=await fetch('assets/dungeon/containers-v2/production.json').then(r=>r.json()),entries=production.items.map(p=>[p.id,catalog[p.id]]),images=new Map();
const old=(await fetch('reference/dungeon-grid-scene-v1/qa/containers-before-catalog.json').then(r=>r.json())).catalog;
const load=async src=>{if(images.has(src))return images.get(src);const im=new Image();im.src=src;await im.decode();images.set(src,im);return im;};
const atlas=await fetch('assets/map/isometric/player-atlas-v1/manifest.json').then(r=>r.json()),pose=atlas.states[0],player=await load('assets/map/isometric/player-atlas-v1/'+pose.file);
let page=Math.max(0,Math.min(7,Number(new URLSearchParams(location.search).get('page'))||0)),before=false,flip=false;
const projection=MapProjection.create({width:1,height:1},144/Math.SQRT2,'isometric'),center=projection.cellCenter(0,0),cards=[];
function ground(ctx,x,y){const q=projection.cellPolygon(0,0);ctx.beginPath();for(let i=0;i<q.length;i++)ctx[i?'lineTo':'moveTo'](q[i].x-center.x+x,q[i].y-center.y+y);ctx.closePath();ctx.fillStyle='#455644';ctx.fill();ctx.strokeStyle='#90a17a70';ctx.stroke();}
function pawn(ctx){const [bx,by,bw,bh]=pose.crop,[ax,ay]=pose.anchor,f=atlas.displayBaseWidth/pose.baseWidth*1.25;ctx.drawImage(player,bx,by,bw,bh,175-ax*f,175-ay*f,bw*f,bh*f);}
function prior(ctx,id,state,x,y){const p=old[id],a=p[state],im=images.get(a.src);if(!im)return;const [bx,by,bw,bh]=a.crop,[cx,cy]=a.anchor,f=144*p.tileWidth/a.bodyWidth,[u,v]=a.groundSlopes,d=Math.SQRT2/(u-v);ctx.save();ctx.translate(x,y);if(flip)ctx.scale(-1,1);ctx.transform(1,Math.SQRT1_2-d*u,0,d,0,0);ctx.drawImage(im,bx,by,bw,bh,(bx-cx)*f,(by-cy)*f,bw*f,bh*f);ctx.restore();}
function render(){
 for(let i=0;i<cards.length;i++){const c=cards[i],item=entries[page*4+i];c.el.hidden=!item;if(!item)continue;const [id,p]=item,ctx=c.ctx;c.title.textContent=p.name;ctx.clearRect(0,0,350,210);ground(ctx,87,122);ground(ctx,263,122);
 for(const [state,x]of [['unsearched',87],['searched',263]]){if(before)prior(ctx,id,state,x,122);else DungeonGridArt.draw(ctx,id,state,x,122,144/Math.SQRT2,{flip});}
 pawn(ctx);ctx.fillStyle='#d7d0b9';ctx.font='12px Microsoft YaHei';ctx.textAlign='center';ctx.fillText('未搜',87,200);ctx.fillText('搜空',263,200);ctx.fillText('主角',175,200);c.caption.textContent=before?'重画前 · 旧素材':'全新重画 · 两态保持箱身比例';}
 $('status').textContent=(before?'重画前':'全新重画')+' · '+(page+1)+' / '+Math.ceil(entries.length/4)+' 页 · 31种容器 / 62种状态';$('prev').disabled=page===0;$('next').disabled=(page+1)*4>=entries.length;
}
for(let i=0;i<4;i++){const el=document.createElement('article');el.className='card';const title=document.createElement('h2'),canvas=document.createElement('canvas'),caption=document.createElement('p');canvas.width=700;canvas.height=420;canvas.setAttribute('aria-label','容器未搜和搜空两态与主角比例对照');const ctx=canvas.getContext('2d');ctx.scale(2,2);el.append(title,canvas,caption);$('cards').append(el);cards.push({el,title,ctx,caption});}
await Promise.all(entries.flatMap(([id,p])=>['unsearched','searched'].flatMap(state=>[load(p[state].src),load(old[id][state].src)])));
DungeonGridArt.setInvalidation(render);$('before').onclick=()=>{before=!before;$('before').textContent=before?'查看新版':'查看重画前';render();};$('flip').onclick=()=>{flip=!flip;render();};
for(const [id,delta]of [['prev',-1],['next',1]])$(id).onclick=()=>{page+=delta;render();history.replaceState(null,'',new URL('tools/dungeon-container-review.html?no_reload&page='+page,document.baseURI));};render();
