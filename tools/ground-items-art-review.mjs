import {loadReviewArt} from './ground-items-art-draw.mjs';
try{
 const art=await loadReviewArt(),ctx=document.querySelector('canvas').getContext('2d'),p=MapProjection.create({width:4,height:4},144/Math.SQRT2,'isometric');let grid=true,contacts=false;
 function poly(points,fill,stroke){ctx.beginPath();points.forEach((p,i)=>ctx[i?'lineTo':'moveTo'](p.x,p.y));ctx.closePath();ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1;ctx.stroke();}}
 function render(){
  ctx.setTransform(2,0,0,2,0,0);ctx.clearRect(0,0,1160,610);ctx.fillStyle='#293d31';ctx.fillRect(0,0,660,610);ctx.fillStyle='#334034';ctx.fillRect(676,0,484,610);
  ctx.fillStyle='#eddfbf';ctx.font='bold 17px Microsoft YaHei';ctx.fillText('144px棋格 · 125%主角',22,35);ctx.fillText('原图细节',698,35);
  ctx.save();ctx.translate(25,18);for(let y=0;y<4;y++)for(let x=0;x<4;x++)poly(p.cellPolygon(x,y),(x+y)%2?'#506048':'#4c5b43',grid?'#a3b18b88':null);
  const pc=p.cellCenter(1,2),bc=p.cellCenter(2,1),ic=p.cellCenter(2,2);art.backpack(ctx,bc.x,bc.y);art.player(ctx,pc.x,pc.y);art.pile(ctx,ic.x,ic.y,{contacts});ctx.restore();
  ctx.fillStyle='#d8d9c4';ctx.font='14px Microsoft YaHei';ctx.fillText('主角 · 已定稿背包 · 散落杂物',24,558);ctx.fillText('杂物宽40px · 低矮轮廓 · 独立贴地阴影',24,583);
  const a=art.manifest.asset,[bx,by,bw,bh]=a.crop,f=Math.min(430/bw,410/bh);ctx.drawImage(art.image,bx,by,bw,bh,700,155,bw*f,bh*f);
  window.reviewReady=true;window.reviewMetrics={tileWidth:p.tileWidth,tileHeight:p.tileHeight,playerBaseWidth:57.5,pileWidth:a.bodyWidthAt144,pileVisibleHeight:(a.alphaBounds[3]-a.alphaBounds[1])*a.scaleAt144,scale:a.scaleAt144};
 }
 document.querySelector('#grid').onclick=e=>{grid=!grid;e.target.textContent=grid?'隐藏格线':'显示格线';render();};document.querySelector('#contacts').onclick=e=>{contacts=!contacts;e.target.textContent=contacts?'隐藏接地点':'显示接地点';render();};
 document.querySelector('#status').textContent='';render();
}catch(e){document.querySelector('#status').textContent=e.message;window.reviewError=e.message;console.error(e);}
