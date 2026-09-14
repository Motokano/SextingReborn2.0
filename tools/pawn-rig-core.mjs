export const rig = {
 id:'shared-humanoid-rig-v1', status:'calibration candidate; numeric contacts verified by tests; visual approval pending',
 units:'rig units', axes:{x:'character left',y:'up',z:'toward camera'},
 rotations:'right-handed; column-major rigid 4x4 matrices; local = inverse(parent world) * world',
 projection:{x:[1,0,0],y:[0,-1,0.45],scale:72/65,tileWidthPx:144},
 base:{radius:39/(2*(72/65)),topY:0,thickness:2},
 lengths:{abdomen:10,chest:12,head:9,upperArm:13,forearm:13,thigh:12,shin:12},
 radii:{head:8,abdomen:5,chest:7,hand:2,shoe:2},
 versionPolicy:'Shared by player and ordinary NPCs. Appearance never participates in solving. No image measurements.',
};
export const add=(a,b)=>a.map((v,i)=>v+b[i]);
export const sub=(a,b)=>a.map((v,i)=>v-b[i]);
export const mul=(a,s)=>a.map(v=>v*s);
export const dot=(a,b)=>a.reduce((v,x,i)=>v+x*b[i],0);
export const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export const norm=a=>Math.hypot(...a);
const unit=a=>mul(a,1/norm(a));
const rad=d=>d*Math.PI/180;
const identity=p=>[1,0,0,0,0,1,0,0,0,0,1,0,...p,1];
export function frame(p,axis) {
 const y=unit(axis), seed=Math.abs(y[0])<0.95?[1,0,0]:[0,0,1];
 const z=unit(cross(seed,y)),x=cross(y,z);
 return [...x,0,...y,0,...z,0,...p,1];
}
export function transform(m,p){return [0,1,2].map(i=>m[i]*p[0]+m[i+4]*p[1]+m[i+8]*p[2]+m[i+12]);}
export function product(a,b){return Array.from({length:16},(_,i)=>{const r=i%4,c=Math.floor(i/4);return [0,1,2,3].reduce((s,k)=>s+a[r+k*4]*b[k+c*4],0)});}
function inverse(m){const o=identity([0,0,0]);for(let c=0;c<3;c++)for(let r=0;r<3;r++)o[r+c*4]=m[c+r*4];const t=transform(o,m.slice(12,15));o.splice(12,3,...mul(t,-1));return o;}
function angles(m){ // XYZ Euler, R = Rz * Ry * Rx; matrices remain authoritative.
 const y=Math.asin(Math.max(-1,Math.min(1,-m[2])));
 const x=Math.abs(Math.cos(y))>1e-8?Math.atan2(m[6],m[10]):0;
 const z=Math.abs(Math.cos(y))>1e-8?Math.atan2(m[1],m[0]):Math.atan2(-m[4],m[5]);
 return [x,y,z].map(v=>v*180/Math.PI);
}
function ik(a,b,l1,l2,pole){
 const d=norm(sub(b,a));
 if(d>l1+l2-1e-7||d<Math.abs(l1-l2)+1e-7)throw Error('Unreachable IK');
 const axis=unit(sub(b,a)), raw=sub(pole,mul(axis,dot(pole,axis)));
 const bend=unit(raw), along=(l1*l1-l2*l2+d*d)/(2*d), height=Math.sqrt(Math.max(0,l1*l1-along*along));
 return add(a,add(mul(axis,along),mul(bend,height)));
}
function direction(flex,lean){return [Math.sin(rad(lean))*Math.cos(rad(flex)),Math.cos(rad(lean))*Math.cos(rad(flex)),Math.sin(rad(flex))];}
export function solveState(state){
 const side=state.pose==='P5',standing=state.pose==='P0',brace=state.pose==='P1';
 const sign=state.mirrorPoseGeometry?1:-1;
 const lean=state.pose==='P4'?sign*8:0;
 const root=side?[10,7,0]:[0,standing?24:brace?7:5,0];
 const targets=state.poseTargets, cap=targets.totalTorsoFlexLimit, sum=targets.abdomenFlex+targets.chestFlex;
 const clamp=sum>cap?cap/sum:1;
 for(let attempt=0;attempt<=100;attempt++){
  const factor=side?0:(100-attempt)/100;
  const abdomenFlex=targets.abdomenFlex*clamp*factor,chestFlex=targets.chestFlex*clamp*factor;
  const af=side?[-1,0,0]:direction(abdomenFlex,lean);
  const cf=side?[-1,0,0]:direction(abdomenFlex+chestFlex,lean);
  const waist=add(root,mul(af,10)), neck=add(waist,mul(cf,12));
  const headFlex=targets.headFlex*factor;
  const hf=side?[-Math.sqrt(1-4/81),2/9,0]:direction(abdomenFlex+chestFlex+headFlex,lean);
  const head=add(neck,mul(hf,9));
  const nodes=[];
  const put=(id,parent,p,axis,part,length=0)=>{
   const world=axis?frame(p,axis):identity(p);
   const par=nodes.find(n=>n.id===parent);
   const local=par?product(inverse(par.worldMatrix),world):world;
   nodes.push({id,parent,part,visible:part==='base'||state.visibleParts.includes(part),length,worldMatrix:world,localMatrix:local,localEulerXYZDeg:angles(local)});
  };
  put('root',null,root,[0,1,0],'abdomen');
  put('abdomen','root',root,af,'abdomen',10);
  put('chest','abdomen',waist,cf,'chest',12);
  put('head','chest',neck,hf,'head',9);
  const chestFrame=nodes.find(n=>n.id==='chest').worldMatrix;
  const contacts=[];
  let feasible=true;
  for(const lr of ['l','r']){
   const s=lr==='l'?1:-1,hand=lr+'hand',foot=lr+'foot';
   const shoulder=transform(chestFrame,[s*8,9,0]),hip=add(root,[s*4,0,0]);
   const armActive=state.activeContacts.includes(hand);
   const action=state.handActions[hand];
   let wrist;
   if(armActive)wrist=[s*15,2,1];
   else if(action)wrist=add(action==='guard_chest'?add(waist,mul(cf,6)):add(root,mul(af,5)),[s*2,0,6]);
   else wrist=add(shoulder,[s*3,-23,2]);
   const ankle=standing?[s*5,2,0]:[s*8,2,8];
   for(const chain of [
    {part:hand,a:shoulder,b:wrist,l:13,pole:[s*1,0,0.5],ids:[lr+'UpperArm',lr+'Forearm',lr+'Palm'],parent:'chest'},
    {part:foot,a:hip,b:ankle,l:12,pole:[0,0,1],ids:[lr+'Thigh',lr+'Shin',lr+'Sole'],parent:'root'}
   ]){
    // Missing modules keep a well-defined hidden bind chain; no IK or contact is needed.
    const visible=state.visibleParts.includes(chain.part);
    let joint,end=chain.b;
    try {joint=visible?ik(chain.a,end,chain.l,chain.l,chain.pole):add(chain.a,[0,-chain.l,0]);}
    catch {feasible=false;break;}
    if(!visible)end=add(joint,[0,-chain.l,0]);
    put(chain.ids[0],chain.parent,chain.a,sub(joint,chain.a),chain.part,chain.l);
    put(chain.ids[1],chain.ids[0],joint,sub(end,joint),chain.part,chain.l);
    put(chain.ids[2],chain.ids[1],end,[0,1,0],chain.part);
    if(state.activeContacts.includes(chain.part))contacts.push({part:chain.part,type:'active',node:chain.ids[2],local:[0,-2,0],target:[end[0],0,end[2]]});
   }
   if(!feasible)break;
  }
  if(!feasible)continue;
  if(state.passiveContacts.includes('abdomen'))contacts.push({part:'abdomen',type:'passive',node:'root',local:[0,-root[1],0],target:[root[0],0,root[2]],surface:side?'shared side support pad':'pelvis seat pad'});
  if(state.passiveContacts.includes('chest'))contacts.push({part:'chest',type:'passive',node:'chest',local:[0,6,7],target:[waist[0]-6,0,waist[2]],surface:'shared side support pad'});
  return {id:state.id,destroyMask:state.destroyMask,pose:state.pose,mirrorPoseGeometry:state.mirrorPoseGeometry,visibleParts:state.visibleParts,injuryLayers:state.injuryLayers,handActions:state.handActions,requestedTargets:targets,resolvedFlexDeg:{abdomen:abdomenFlex,chest:chestFlex,head:headFlex},contactAmplitudeFactor:factor,adjustment:side?'Torso and head flex clamped to zero to retain side support and head clearance; local injury effects remain.':factor<1?'Reduced to preserve fixed bone lengths and contacts.':null,nodes,contacts,headCenter:head};
 }
 throw Error('No contact solution '+state.id);
}
