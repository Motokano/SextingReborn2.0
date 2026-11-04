const catalog=DungeonGridArt.catalog,wrap=document.querySelector('#cards'),cards=[];
let phase=0,grid=true,flipped=false,page=0,pawnScale=1.25;
const image=async src=>{const im=new Image();im.src=src;await im.decode();return im;};
const m=await fetch('assets/map/isometric/player-atlas-v1/manifest.json').then(r=>r.json()),s=m.states[0];
const player={image:await image('assets/map/isometric/player-atlas-v1/'+s.file),crop:s.crop,anchor:[s.crop[0]+s.anchor[0],s.crop[1]+s.anchor[1]],scale:m.displayBaseWidth/s.baseWidth};
const boss={image:await image('assets/map/isometric/street-thug-boss-v1/standing.png'),crop:[240,40,715,1200],anchor:[597.5,1238],scale:46/715};
const projection=MapProjection.create({width:3,height:3},144/Math.SQRT2,'isometric'),center=projection.cellCenter(1,1);
function pawn(ctx,p,x,y){const [bx,by,bw,bh]=p.crop,[ax,ay]=p.anchor,f=p.scale*pawnScale;ctx.drawImage(p.image,bx,by,bw,bh,x+(bx-ax)*f,y+(by-ay)*f,bw*f,bh*f);}
function poly(ctx,q,fill,line){ctx.beginPath();q.forEach((p,i)=>ctx[i?'lineTo':'moveTo'](p.x,p.y));ctx.closePath();if(fill){ctx.fillStyle=fill;ctx.fill();}if(line){ctx.strokeStyle=line;ctx.stroke();}}
function floor(ctx){for(let y=0;y<3;y++)for(let x=0;x<3;x++){const q=projection.cellPolygon(x,y);poly(ctx,q,(y+x)%2?'#48564a':'#435145',grid?'#83967c65':null);}}
function render(){
 const filter=document.querySelector('#filter').value,visible=cards.filter(c=>filter==='all'||c.entry.category===filter),pages=Math.ceil(visible.length/8);page=Math.min(page,Math.max(0,pages-1));const subset=new Set(visible.slice(page*8,page*8+8));
 for(const c of cards){const {id,entry,ctx,card,caption}=c;card.hidden=!subset.has(c);if(card.hidden)continue;
 ctx.clearRect(0,0,440,400);ctx.save();ctx.translate(220-center.x,240-center.y);floor(ctx);
 if(entry.category==='material'){
  const wall=id.startsWith('wall');
  if(wall){const a=projection.cellPolygon(0,0)[0],b=projection.cellPolygon(0,2)[3];RuinsModuleArt.surface(ctx,id,[{x:a.x,y:a.y-83},{x:b.x,y:b.y-83},b,a],[0,0,1,1],.10);}
  else for(let y=0;y<3;y++)for(let x=0;x<3;x++)RuinsModuleArt.surface(ctx,id,projection.cellPolygon(x,y),[x/3,y/3,1/3,1/3],.06);
  caption.textContent=wall?'连续墙面 · 与棋格共用投影':'连续地面 · 原始材质按整片铺设';
 }else{
  const footprint=flipped?[...entry.logicalFootprint].reverse():entry.logicalFootprint,[fw,fd]=footprint;
  if(grid){const q=[[-fw/2,-fd/2],[fw/2,-fd/2],[fw/2,fd/2],[-fw/2,fd/2]].map(([x,y])=>projection.cellCenter(1+x,1+y));poly(ctx,q,'#d8b45d19','#d8b45d99');}
  const state=id==='canteen-food-crate'?['normal','searched','partial','low'][phase]:phase%2?(entry.searched?'searched':entry.used?'used':'normal'):(entry.unsearched?'unsearched':'normal');
  DungeonGridArt.draw(ctx,id,state,center.x,center.y,144/Math.SQRT2,{flip:flipped,shadow:id!=='worn-mat'});
  const sourceLink=card.querySelector('.source');if(sourceLink)sourceLink.href=DungeonGridArt.asset(id,state).src;
  caption.textContent=({unsearched:'未搜',normal:'正常',searched:'搜空',used:'已用',partial:'剩余一半',low:'少量剩余'}[state])+' · 占格 '+footprint.join('×')+' · 金线为占格边界';
 }
 ctx.restore();pawn(ctx,player,48,330);pawn(ctx,boss,114,330);ctx.fillStyle='#c4ceb9';ctx.font='11px Microsoft YaHei';ctx.textAlign='center';ctx.fillText('主角',48,353);ctx.fillText('头目',114,353);ctx.textAlign='left';ctx.fillText('人物 '+Math.round(pawnScale*100)+'% · 底座 '+(46*pawnScale)+'px',24,377);ctx.fillText('144px / 格',331,353);
 }
 document.querySelector('#status').textContent='56种物件 · 9种墙地材质 · '+(page+1)+' / '+pages+' 页';
 const roomLink=document.querySelector('a[href^="tools/street-thug-boss-room-board.html"]');
 roomLink.href='tools/street-thug-boss-room-board.html?no_reload&temporary&view=normal&pawn='+pawnScale;roomLink.textContent='到实际地图看';
 document.querySelector('#prev').disabled=page===0;document.querySelector('#next').disabled=page>=pages-1;
}
const materials={floor:'旧水泥地','floor-timber':'修补木地板','floor-industrial':'车间旧地面',road:'外部旧路面',wall:'掉皮灰墙','wall-plaster-brick':'露砖灰墙','wall-damp-stone':'潮湿石墙','wall-peeling-workshop':'车间半漆墙',iron:'旧铁门漆面'};
for(const [id,entry]of [...Object.entries(catalog),...Object.entries(materials).map(([id,name])=>[id,{name,category:'material'}])]){
 const card=document.createElement('article');card.className='card';const title=document.createElement('h2');title.textContent=entry.name;const canvas=document.createElement('canvas');canvas.width=880;canvas.height=800;canvas.style.width='440px';canvas.setAttribute('aria-label',entry.name+'棋盘尺寸和人物比例');const ctx=canvas.getContext('2d');ctx.scale(2,2);const caption=document.createElement('p');card.append(title,canvas,caption);
 if(entry.category!=='material'){const link=document.createElement('a');link.href=(entry.normal||entry.unsearched).src;link.target='_blank';link.textContent='查看原图';link.className='source';card.append(link);}
 wrap.append(card);cards.push({id,entry,ctx,card,caption});
}
globalThis.SceneRenderer={render};DungeonGridArt.setInvalidation(render);RuinsModuleArt.setInvalidation(render);
document.querySelector('#state').onclick=()=>{phase=(phase+1)%4;document.querySelector('#state').textContent=['未搜 / 可用 · 切换状态','搜空 / 已用 · 切换状态','食材剩余一半 · 切换状态','食材少量剩余 · 切换状态'][phase];render();};
document.querySelector('#grid').onclick=()=>{grid=!grid;document.querySelector('#grid').textContent=grid?'隐藏格线':'显示格线';render();};
document.querySelector('#flip').onclick=()=>{flipped=!flipped;render();};
document.querySelector('#filter').onchange=()=>{page=0;render();};
document.querySelector('#pawn-scale').onchange=event=>{pawnScale=Number(event.target.value);render();};
document.querySelector('#prev').onclick=()=>{page--;render();window.scrollTo(0,0);};
document.querySelector('#next').onclick=()=>{page++;render();window.scrollTo(0,0);};
render();
