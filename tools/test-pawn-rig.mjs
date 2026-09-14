import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {transform,product,norm,sub,dot,cross} from './pawn-rig-core.mjs';
const dir=new URL('../assets/map/isometric/rig-calibration-v1/',import.meta.url);
const rig=JSON.parse(fs.readFileSync(new URL('skeleton.json',dir))),data=JSON.parse(fs.readFileSync(new URL('poses.json',dir)));
const bytes=fs.readFileSync(new URL('../assets/map/isometric/concepts/shared-pose-map-v2.json',import.meta.url));
assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),rig.sourceSha256);
const design=JSON.parse(bytes);
assert.equal(data.states.length,128);assert.equal(new Set(data.states.map(s=>s.id)).size,128);
let maxError=0;
function close(a,b,label){const e=norm(sub(a,b));maxError=Math.max(e,maxError);assert.ok(e<1e-8,label+' '+e);}
for(const state of data.states){
 const expected=design.combinations.find(s=>s.id===state.id);
 assert.deepEqual(state.visibleParts,expected.visibleParts);
 assert.deepEqual(state.handActions,expected.handActions);
 assert.deepEqual(state.contacts.filter(c=>c.type==='active').map(c=>c.part).sort(),[...expected.activeContacts].sort());
 assert.deepEqual(state.contacts.filter(c=>c.type==='passive').map(c=>c.part).sort(),[...expected.passiveContacts].sort());
 assert.ok(state.resolvedFlexDeg.chest+state.resolvedFlexDeg.abdomen<=expected.poseTargets.totalTorsoFlexLimit+1e-9);
 const nodes=Object.fromEntries(state.nodes.map(n=>[n.id,n]));
 for(const n of state.nodes){
  assert.ok(n.worldMatrix.every(Number.isFinite));assert.ok(n.localEulerXYZDeg.every(Number.isFinite));
  const [ax,ay,az]=n.localEulerXYZDeg.map(v=>v*Math.PI/180),cx=Math.cos(ax),sx=Math.sin(ax),cy=Math.cos(ay),sy=Math.sin(ay),cz=Math.cos(az),sz=Math.sin(az);
  const eulerMatrix=[cz*cy,sz*cy,-sy,0,cz*sy*sx-sz*cx,sz*sy*sx+cz*cx,cy*sx,0,cz*sy*cx+sz*sx,sz*sy*cx-cz*sx,cy*cx,0,...n.localMatrix.slice(12,15),1];
  close(eulerMatrix,n.localMatrix,state.id+' Euler round trip '+n.id);
  if(n.parent)close(product(nodes[n.parent].worldMatrix,n.localMatrix),n.worldMatrix,state.id+' hierarchy '+n.id);
  const m=n.worldMatrix,x=m.slice(0,3),y=m.slice(4,7),z=m.slice(8,11);
  close([norm(x),norm(y),norm(z),dot(x,y),dot(x,z),dot(y,z),dot(x,cross(y,z))],[1,1,1,0,0,0,1],state.id+' orthonormal '+n.id);
  const bind=rig.bindPose.find(b=>b.id===n.id);assert.equal(n.length,bind.length);
  assert.equal(n.visible,expected.visibleParts.includes(n.part));
  if(n.visible)assert.ok(m[13]>=0,state.id+' joint below floor '+n.id);
  if(n.length){
   const end=transform(m,[0,n.length,0]);
   const childId=n.id==='abdomen'?'chest':n.id==='chest'?'head':n.id.endsWith('UpperArm')?n.id[0]+'Forearm':n.id.endsWith('Forearm')?n.id[0]+'Palm':n.id.endsWith('Thigh')?n.id[0]+'Shin':n.id.endsWith('Shin')?n.id[0]+'Sole':null;
   if(childId)close(end,nodes[childId].worldMatrix.slice(12,15),state.id+' bone length '+n.id);
   else close(end,state.headCenter,state.id+' head length');
  }
 }
 for(const c of state.contacts){
  assert.ok(nodes[c.node].visible);close(transform(nodes[c.node].worldMatrix,c.local),c.target,state.id+' contact');
  assert.equal(c.target[1],0);assert.ok(Math.hypot(c.target[0],c.target[2])<=rig.base.radius,state.id+' support outside base');
  if(c.type==='active')assert.ok(!expected.destroyed.includes(c.part));
  const base=data.states.find(s=>s.destroyMask===(state.destroyMask&~7));
  close(c.target,base.contacts.find(b=>b.part===c.part&&b.type===c.type).target,state.id+' drifting support');
 }
 assert.ok(state.headCenter[1]>=rig.radii.head,state.id+' head penetrates ground');
}
const normal=data.states[0],headTop=normal.headCenter[1]+rig.radii.head+rig.base.thickness;
close([headTop*rig.projection.scale,rig.base.radius*2*rig.projection.scale],[72,39],'display scale');
console.log('PASS: 128 states; fixed lengths; hierarchy; rigid matrices; fixed active/passive contacts; ground clearance; anatomical visibility; 72px height/39px base. Maximum numeric error:',maxError);
