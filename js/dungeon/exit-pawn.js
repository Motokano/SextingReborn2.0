/* SPDX-License-Identifier: GPL-3.0-only */
(()=>{'use strict';
const art=globalThis.RuinsPOIArtMap['assets/dungeon/passage/exit-waypost-v1.png'];
const src=art.src;
// Object contact anchor and virtual scale reference; no display disk.
const bounds=art.bounds;
let image=null,invalidate=()=>{};
function load(){
 if(image||typeof Image==='undefined')return;
 image=new Image();image.onload=()=>invalidate();
 image.onerror=()=>console.error('Exit pawn failed to load:',src);image.src=src;
}
function draw(ctx,x,y,scale,player=null){
 if(globalThis.DungeonGridArt?.asset('exit-waypost')){ctx.save();if(player&&y>=player.y-.01)ctx.globalAlpha*=.38;DungeonGridArt.draw(ctx,'exit-waypost','normal',x,y,scale);ctx.restore();return;}
 load();
 const [bx,by,bw,bh,cx,bottom,baseWidth]=bounds,f=scale/baseWidth;
 const left=x+(bx-cx)*f,top=y+scale*.16+(by-bottom)*f,width=bw*f,height=bh*f;
 // Only a foreground pawn can obscure the player; keep the shared cell readable too.
 const overlaps=player&&y>=player.y-.01&&left<player.x+scale*.3&&left+width>player.x-scale*.3&&top<player.y+scale*.1&&top+height>player.y-scale*.85;
 ctx.save();ctx.globalAlpha*=overlaps?.38:1;
 if(image?.complete&&image.naturalWidth)ctx.drawImage(image,bx,by,bw,bh,left,top,width,height);
 else {ctx.strokeStyle='#dfbd83';ctx.lineWidth=Math.max(1,scale*.04);ctx.beginPath();ctx.ellipse(x,y,scale*.5,scale*.24,0,0,Math.PI*2);ctx.stroke();}
 ctx.restore();
}
globalThis.RuinsExitPawn={draw,setInvalidation(fn){invalidate=fn;load();}};
})();
