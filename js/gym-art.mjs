// Candidate originals, shared by the gym demo and art review. No saved-game state.
export const GYM_FOOTPRINTS={floor:[1,2],pullup:[2,1],dumbbell:[1,1],barbell:[2,2],cable:[1,2],leg:[1,2],neck:[2,1],handsfeet:[2,2],bed:[1,2],supply:[1,1]};
export async function loadGymArt(){
 const read=async p=>{const r=await fetch(p);if(!r.ok)throw new Error('无法加载棋子：'+p);return r.json();};
 const image=async p=>{const im=new Image();im.src=p;await im.decode();return im;};
 const [manifest,hideout]=await Promise.all([read('assets/map/isometric/gym-facilities-v1/manifest.json'),read('assets/map/isometric/hideout-facilities-v2/manifest.json')]);
 const bed=hideout.assets.find(a=>a.key==='bed'&&a.state==='ready');
 const entries=[...manifest.assets,{...bed,key:'bed',level:1}];
 const sprites=new Map(await Promise.all(entries.map(async a=>{
  const im=await image(a.file),shadow=window.TileRendererV2.makeGroundShadow(im,{...a,width:a.crop[2]*a.scaleAt144,source:a.file},a.shadowOffset||[14,7]);
  return [a.key+':'+a.level,{...a,im,shadow}];
 })));
 const get=(key,level)=>sprites.get(key+':'+Math.max(1,Math.min(4,level||1)));
 function sprite(ctx,key,level,x,y,{ghost=false,contacts=false,shadow=true}={}){
  const a=get(key,level);if(!a)throw new Error('缺少棋子 '+key+':'+level);
  ctx.save();if(ghost)ctx.globalAlpha*=.38;
  if(shadow)ctx.drawImage(a.shadow,x+a.shadow.drawBounds[0],y+a.shadow.drawBounds[1],a.shadow.drawBounds[2],a.shadow.drawBounds[3]);
  const [bx,by,bw,bh]=a.crop,[ax,ay]=a.anchor,f=a.scaleAt144;
  ctx.drawImage(a.im,bx,by,bw,bh,x+(bx-ax)*f,y+(by-ay)*f,bw*f,bh*f);
  if(contacts){ctx.strokeStyle='#ffd675';ctx.lineWidth=.8;ctx.beginPath();a.groundContacts.forEach(([u,v],i)=>ctx[i?'lineTo':'moveTo'](x+(u-ax)*f,y+(v-ay)*f));ctx.closePath();ctx.stroke();}
  ctx.restore();
 }
 function station(ctx,id,levels,project,x,y,options={}){
  const footprint=GYM_FOOTPRINTS[id],level=levels[id]||1;
  if(id==='handsfeet'){
   // Separate attachment sprites follow their own saved prototype module levels.
   const parts=[['handsfeet',1,.6,.48,0],['hands',levels.handsfeet_hands||1,.6,.48,38],['ankle',levels.handsfeet_ankle||1,1.5,.65,0],['toes',levels.handsfeet_toes||1,.62,1.5,0]];
   for(const [key,lv,dx,dy,z]of parts){const p=project(x+dx,y+dy,z);sprite(ctx,key,lv,p.x,p.y,options);}
  }else{const p=project(x+footprint[0]/2,y+footprint[1]/2);sprite(ctx,id,level,p.x,p.y,options);}
 }
 return {manifest,sprites,get,sprite,station};
}
