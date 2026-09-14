const P=p=>[p[0],-p[1]+.45*p[2]];
const pos=n=>n.worldMatrix.slice(12,15);
const end=n=>[0,1,2].map(i=>n.worldMatrix[i+12]+n.worldMatrix[i+4]*n.length);
const fmt=p=>P(p).join(',');
const palette=[{skin:'#efd2a4',cloth:'#969994',pants:'#343c43',hair:'#24292c'},{skin:'#ac785a',cloth:'#607d8b',pants:'#3d414e',hair:'#493029'}];
export function renderPawnSvg(rig,state,skin,wire,uid,board=true){
 const colors=palette[skin],nodes=Object.fromEntries(state.nodes.map(n=>[n.id,n]));
 const line=(a,b,w,c)=>'<line x1="'+P(a)[0]+'" y1="'+P(a)[1]+'" x2="'+P(b)[0]+'" y2="'+P(b)[1]+'" stroke="'+c+'" stroke-width="'+w+'" stroke-linecap="round"/>';
 let body='';
 for(const suffix of ['Thigh','Shin','UpperArm','Forearm'])for(const side of ['r','l']){
  const n=nodes[side+suffix];if(!n.visible)continue;
  const w=suffix==='Thigh'||suffix==='Shin'?5.5:4.5,col=suffix==='Thigh'||suffix==='Shin'?colors.pants:colors.cloth;
  body+=line(pos(n),end(n),w+1,'#242921')+line(pos(n),end(n),w,col);
 }
 const a=nodes.abdomen,c=nodes.chest;
 for(const [n,w] of [[a,state.pose==='P5'?14:10],[c,14]])body+=line(pos(n),end(n),w+1,'#242921')+line(pos(n),end(n),w,colors.cloth);
 for(const side of ['r','l'])for(const suffix of ['Palm','Sole']){
  const n=nodes[side+suffix];if(!n.visible)continue;
  const p=P(pos(n));body+='<ellipse cx="'+p[0]+'" cy="'+p[1]+'" rx="'+(suffix==='Palm'?2:3.2)+'" ry="2" fill="'+(suffix==='Palm'?colors.skin:colors.pants)+'" stroke="#222b25" stroke-width=".6"/>';
 }
 const head=P(state.headCenter),neck=P(pos(nodes.head)),rotation=Math.atan2(head[1]-neck[1],head[0]-neck[0])*180/Math.PI+90;
 body+='<g transform="translate('+head.join(' ')+') rotate('+rotation+')"><circle r="8" fill="'+colors.skin+'" stroke="#252a25" stroke-width=".7"/><path d="M -8 0 Q -10 -9 0 -8 Q 9 -10 8 0 L 4 -3 L 0 -1 L -3 -3 Z" fill="'+colors.hair+'"/></g>';
 for(const injury of state.injuryLayers){
  const n=nodes[injury.part],p=injury.part==='head'?state.headCenter:[0,1,2].map(i=>pos(n)[i]+(end(n)[i]-pos(n)[i])*.55);
  const q=P(p);body+='<path d="M '+(q[0]-2)+' '+(q[1]-1)+' l 4 2 m -3 1 l 2 -3" stroke="#a74f48" stroke-width="1.1"/>';
 }
 let overlay='';
 if(wire){
  for(const n of state.nodes.filter(n=>n.visible)){
   overlay+=line(pos(n),end(n),.55,'#11f4c0');
   const p=P(pos(n));overlay+='<circle cx="'+p[0]+'" cy="'+p[1]+'" r=".9" fill="#082f39"><title>'+n.id+' · '+n.localEulerXYZDeg.map(x=>x.toFixed(3)).join(' / ')+'°</title></circle>';
  }
  for(const contact of state.contacts){const q=P(contact.target);overlay+='<circle cx="'+q[0]+'" cy="'+q[1]+'" r="1.5" fill="'+(contact.type==='active'?'#ffc845':'#ec86ee')+'"/>';}
 }
 return '<svg viewBox="0 0 144 128" xmlns="http://www.w3.org/2000/svg" aria-label="'+state.id+'">'+(board?'<path d="M0 78L72 42L144 78L72 114Z" fill="#424c40" stroke="#69725b" stroke-width=".6"/>':'')+'<g transform="translate(72 78) scale('+rig.projection.scale+')"><defs><g id="b'+uid+'">'+body+'</g><filter id="s'+uid+'"><feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 .20 0"/></filter></defs><use href="#b'+uid+'" transform="matrix(1 0 -.48 -.24 0 0)" filter="url(#s'+uid+')"/><ellipse cy="2" rx="'+rig.base.radius+'" ry="5" fill="#252d2b"/><ellipse rx="'+rig.base.radius+'" ry="4" fill="#717a70" stroke="#252d2b" stroke-width=".7"/><use href="#b'+uid+'"/>'+overlay+'</g></svg>';
}
