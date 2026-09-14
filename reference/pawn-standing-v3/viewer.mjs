const bind=await fetch('standing-bind.json').then(r=>r.json());
const original=new Image(),sheet=new Image();original.src=bind.source;sheet.src=bind.texture;await Promise.all([original.decode(),sheet.decode()]);
const $=s=>document.querySelector(s),ctx=$('#assembled').getContext('2d');
$('#original').getContext('2d').drawImage(original,0,0);
function show(){ctx.clearRect(0,0,...bind.canvas);const split=+$('#explode').value;
for(const p of bind.pieces){const [x,y,w,h]=p.box;ctx.save();const dx=p.id==='base'?0:(x+w/2-607.5)*split*.007,dy=p.id==='base'?split*1.1:(y+h/2-647.5)*split*.003;ctx.translate(x+dx+w*p.pivot[0],y+dy+h*p.pivot[1]);ctx.rotate(p.angleDeg*Math.PI/180);ctx.imageSmoothingQuality='high';if(p.clipPolygon){ctx.beginPath();p.clipPolygon.forEach(([u,v],i)=>ctx[i?'lineTo':'moveTo']((u-p.pivot[0])*w,(v-p.pivot[1])*h));ctx.closePath();ctx.clip()}const c=p.clip||[0,0,1,1];ctx.beginPath();ctx.rect((c[0]-p.pivot[0])*w,(c[1]-p.pivot[1])*h,(c[2]-c[0])*w,(c[3]-c[1])*h);ctx.clip();ctx.drawImage(sheet,...p.crop,-w*p.pivot[0],-h*p.pivot[1],w,h);ctx.restore()}
if($('#overlay').checked){ctx.save();ctx.globalAlpha=.4;ctx.drawImage(original,0,0);ctx.restore()}}
$('#overlay').oninput=show;$('#explode').oninput=show;$('#restore').onclick=()=>{$('#overlay').checked=false;$('#explode').value=0;show()};
for(const p of bind.pieces){const box=document.createElement('div');box.className='part';const canvas=document.createElement('canvas');canvas.width=p.crop[2];canvas.height=p.crop[3];canvas.getContext('2d').drawImage(sheet,...p.crop,0,0,canvas.width,canvas.height);const label=document.createElement('div');label.textContent=p.name;box.append(canvas,label);$('#parts').append(box)}show();
