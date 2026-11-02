/* SPDX-License-Identifier: GPL-3.0-only
 * Four states of one provisioning crate. Use a single scale and ground anchor;
 * visible parcels express depletion, not an exposed harvest counter.
 */
(()=>{'use strict';
const src='assets/dungeon/outpost-decor-v1/canteen-food-states-v1.png';
const frames=[
 {bounds:[108,20,625,482],anchor:[420,392]},
 {bounds:[818,20,625,482],anchor:[1128,392]},
 {bounds:[108,503,625,483],anchor:[420,877]},
 {bounds:[818,503,625,483],anchor:[1128,877]}
];
let image=null,invalidate=()=>{};
const state=p=>p.foodCrate?(p.search?.opened?3:0):p.used||p.remaining===0?3:!Number.isFinite(p.total)||p.remaining===p.total?0:p.remaining/p.total<=.5?2:1;
const blank='data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
const containerAsset={id:'canteen-food-crate-v1',name:'食材筐',unsearched:{src:blank},searched:{src:blank}};
function load(){if(globalThis.DungeonGridArt?.asset('canteen-food-crate')){DungeonGridArt.load('canteen-food-crate');containerAsset.unsearched=DungeonGridArt.legacy('canteen-food-crate','normal');containerAsset.searched=DungeonGridArt.legacy('canteen-food-crate','searched');return null;}if(!image&&typeof Image!=='undefined'){image=new Image();image.onload=()=>{
 // Reuse the atlas frames for existing image slots; never display all four states.
 for(const [key,index]of [['unsearched',0],['searched',3]]){const [x,y,w,h]=frames[index].bounds,c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(image,x,y,w,h,0,0,w,h);containerAsset[key].src=c.toDataURL('image/png');}
 invalidate();};image.src=src;}return image;}
function draw(ctx,p,x,y,s,highlight=false){if(globalThis.DungeonGridArt?.asset('canteen-food-crate')){load();if(highlight){ctx.save();ctx.beginPath();ctx.ellipse(x,y,s*.6,s*.3,0,0,Math.PI*2);ctx.fillStyle='#e6ce9636';ctx.fill();ctx.restore();}DungeonGridArt.draw(ctx,'canteen-food-crate',['normal','partial','low','searched'][state(p)],x,y,s,{point:p});return;}const im=load();if(!im?.complete||!im.naturalWidth)return;const a=frames[state(p)],[bx,by,bw,bh]=a.bounds,[cx,cy]=a.anchor,f=s*.92/625;
 ctx.save();if(highlight){ctx.beginPath();ctx.ellipse(x,y+s*.08,s*.4,s*.25,0,0,Math.PI*2);ctx.fillStyle='#e6ce9636';ctx.fill();}
 const u=.51,v=-.55,d=Math.SQRT2/(u-v),b=1/Math.SQRT2-d*u;
 ctx.translate(x,y);ctx.transform(1,b,0,d,0,0);
 ctx.drawImage(im,bx,by,bw,bh,(bx-cx)*f,(by-cy)*f,bw*f,bh*f);ctx.restore();
}
globalThis.RuinsCanteenArt={src,frames,state,draw,load,containerAsset,setInvalidation:fn=>{invalidate=fn;load();}};
})();
