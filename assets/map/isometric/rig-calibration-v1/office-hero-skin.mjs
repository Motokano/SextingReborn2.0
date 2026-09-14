const project=p=>[p[0],-p[1]+.45*p[2]];
const origin=n=>n.worldMatrix.slice(12,15);
const endpoint=n=>[0,1,2].map(i=>n.worldMatrix[i+12]+n.worldMatrix[i+4]*n.length);
const lerp=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
export function renderOfficeHero(rig,state){
 const n=Object.fromEntries(state.nodes.map(n=>[n.id,n]));
 const ink='#282926',id=state.id;
 const xy=p=>p.map(x=>x.toFixed(4)).join(' ');
 const path=(d,fill,stroke=ink,w=.7)=>'<path d="'+d+'" fill="'+fill+'" stroke="'+stroke+'" stroke-width="'+w+'" stroke-linejoin="round" stroke-linecap="round"/>';
 const stroke=(a,b,w,c)=>'<path d="M '+xy(a)+' L '+xy(b)+'" fill="none" stroke="'+c+'" stroke-width="'+w+'" stroke-linecap="round"/>';
 function band(a,b,t,width,height,color){const p=lerp(a,b,t),dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy),nx=-dy/len,ny=dx/len;return stroke([p[0]+nx*width/2,p[1]+ny*width/2],[p[0]-nx*width/2,p[1]-ny*width/2],height,color)}
 function limb(part,upper,lower,kind){
  if(!n[upper].visible)return '';
  const a=project(origin(n[upper])),b=project(endpoint(n[upper])),c=project(endpoint(n[lower]));
  const w=kind==='arm'?6.6:7.3,fill=kind==='arm'?'url(#sweater'+id+')':'url(#trousers'+id+')';
  let s=stroke(a,b,w+1,ink)+stroke(b,c,w+1,ink)+stroke(a,b,w,fill)+stroke(b,c,w,fill);
  s+=stroke(lerp(a,b,.18),lerp(a,b,.75),.65,kind==='arm'?'#d2d0c8':'#656462');
  if(kind==='arm')s+=band(b,c,.91,5.8,2,'#b9d5ea')+band(b,c,.83,5.8,.7,'#767970');
  return '<g data-part="'+part+'" data-module="'+kind+'">'+s+'</g>';
 }
 const root=project(origin(n.abdomen)),waist=project(origin(n.chest)),neck=project(origin(n.head));
 const torsoDX=neck[0]-root[0],torsoDY=neck[1]-root[1],tl=Math.hypot(torsoDX,torsoDY),normal=[-torsoDY/tl,torsoDX/tl];
 const shift=(p,w)=>[p[0]+normal[0]*w,p[1]+normal[1]*w];
 const shoulder=lerp(waist,neck,.76),bottom=lerp(root,waist,-.4);
 const torsoPath='M '+xy(shift(bottom,-7.5))+' Q '+xy(shift(waist,-7.8))+' '+xy(shift(shoulder,-8.7))+' Q '+xy(shift(neck,-6))+' '+xy(neck)+' Q '+xy(shift(neck,6))+' '+xy(shift(shoulder,8.7))+' Q '+xy(shift(waist,7.8))+' '+xy(shift(bottom,7.5))+' Q '+xy(lerp(root,waist,-.5))+' '+xy(shift(bottom,-7.5))+' Z';
 let body=limb('rfoot','rThigh','rShin','leg')+limb('lfoot','lThigh','lShin','leg');
 for(const side of ['r','l'])if(n[side+'Sole'].visible){const p=project(origin(n[side+'Sole']));body+='<g data-part="'+side+'foot"><ellipse cx="'+p[0]+'" cy="'+(p[1]-.2)+'" rx="4.6" ry="2.2" fill="url(#shoe'+id+')" stroke="'+ink+'" stroke-width=".7"/><ellipse cx="'+(p[0]-.8)+'" cy="'+(p[1]-.9)+'" rx="2.2" ry=".65" fill="#6b6b64" opacity=".45"/></g>'}
 const back=[],front=[];
 for(const side of ['r','l']){
  const part=side+'hand',art=limb(part,side+'UpperArm',side+'Forearm','arm');
  (state.handActions[part]?front:back).push(art);
 }
 body+=back.join('');
 body+='<g data-part="chest abdomen">'+path(torsoPath,'url(#sweater'+id+')');
 body+=stroke(shift(lerp(root,waist,-.27),-7.2),shift(lerp(root,waist,-.27),7.2),2.5,'#b9d5ea');
 body+=stroke(shift(lerp(root,waist,-.10),-7.1),shift(lerp(root,waist,-.10),7.1),1.2,'#888981');
 body+=stroke(shift(lerp(waist,neck,.25),-6.4),shift(lerp(waist,neck,.55),-6.7),.6,'#cecdc5');
 // Collar follows the chest bone without changing its pivot or length.
 const down=[-torsoDX/tl,-torsoDY/tl],off=(x,y)=>[neck[0]+normal[0]*x+down[0]*y,neck[1]+normal[1]*x+down[1]*y];
 body+=path('M '+xy(off(-5,0))+' L '+xy(off(-.4,2.7))+' L '+xy(off(-3,5.6))+' L '+xy(off(-6.4,1.9))+' Z','#c5def0');
 body+=path('M '+xy(off(5,0))+' L '+xy(off(.4,2.7))+' L '+xy(off(3,5.6))+' L '+xy(off(6.4,1.9))+' Z','#c5def0');
 body+='</g>'+front.join('');
 for(const side of ['r','l'])if(n[side+'Palm'].visible){const p=project(origin(n[side+'Palm']));body+='<g data-part="'+side+'hand"><ellipse cx="'+p[0]+'" cy="'+p[1]+'" rx="2.8" ry="2" fill="url(#face'+id+')" stroke="'+ink+'" stroke-width=".7"/></g>'}
 const h=project(state.headCenter),angle=Math.atan2(h[1]-neck[1],h[0]-neck[0])*180/Math.PI+90;
 body+='<g data-part="head" transform="translate('+xy(h)+') rotate('+angle+')">';
 body+='<ellipse rx="8.8" ry="8.2" fill="url(#face'+id+')" stroke="'+ink+'" stroke-width=".9"/>';
 body+=path('M -8.4 1.6 C -11 -1.8 -9.1 -5.2 -6.9 -6.2 C -6.1 -9.7 -1.4 -10.2 1.7 -9 C 6.1 -9.5 10 -5.7 8.8 -1.3 L 7.1 3 L 6 .3 L 5.8 -2.6 C 3.1 -.2 .6 -1.4 -.6 -2.7 C -3.2 -.2 -5.6 -.5 -7 -1 Z','url(#hair'+id+')');
 body+=path('M -7 -4.6 Q -3.2 -8.4 1.3 -7.5 M -5 -2.6 Q -1.4 -6.5 3.4 -5.9','none','#555754',1.3);
 body+='</g>';
 for(const injury of state.injuryLayers){
  const part=injury.part,j=n[part],q=project(part==='head'?lerp(origin(j),state.headCenter,.88):lerp(origin(j),endpoint(j),.5));
  body+='<g data-injury="'+part+'" opacity=".8">'+path('M '+xy([q[0]-2,q[1]-.7])+' l 3.8 1.1 m -3.2 1 l 3.2 -1.8','none','#9a5751',1.2)+'</g>';
 }
 const defs='<linearGradient id="sweater'+id+'" x2="1" y2=".4"><stop stop-color="#858780"/><stop offset=".38" stop-color="#c0c0b8"/><stop offset=".7" stop-color="#b0b1a9"/><stop offset="1" stop-color="#8c8f85"/></linearGradient><linearGradient id="trousers'+id+'"><stop stop-color="#303330"/><stop offset=".45" stop-color="#51514a"/><stop offset="1" stop-color="#30332f"/></linearGradient><radialGradient id="face'+id+'" cx=".35" cy=".35"><stop stop-color="#ffe5b7"/><stop offset="1" stop-color="#e6c494"/></radialGradient><linearGradient id="hair'+id+'" x2=".6" y2="1"><stop stop-color="#4f514d"/><stop offset=".55" stop-color="#303330"/><stop offset="1" stop-color="#1c211e"/></linearGradient><linearGradient id="shoe'+id+'" x2="0" y2="1"><stop stop-color="#56574f"/><stop offset="1" stop-color="#20251f"/></linearGradient>';
 return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 144 128" data-skin="office-hero-v1" data-state="'+state.id+'"><defs>'+defs+'<g id="body'+id+'">'+body+'</g><filter id="shadow'+id+'"><feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 .20 0"/></filter></defs><g transform="translate(72 78) scale('+rig.projection.scale+')"><use href="#body'+id+'" transform="matrix(1 0 -.48 -.24 0 0)" filter="url(#shadow'+id+')"/><ellipse cy="2" rx="'+rig.base.radius+'" ry="5" fill="#282d27"/><ellipse rx="'+rig.base.radius+'" ry="4" fill="#75796c" stroke="'+ink+'" stroke-width=".7"/><use href="#body'+id+'"/></g></svg>';
}
