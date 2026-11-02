import fs from 'node:fs';
import {createHash} from 'node:crypto';
const root='assets/dungeon/recipe-study-room-art-v1/',ref='reference/recipe-study-room-art-v1/';
const sha=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const checks=JSON.parse(fs.readFileSync(ref+'alpha-checks.json','utf8').replace(/^\uFEFF/,''));
// Approximate foot centers, read from the untouched originals. Hidden rear
// contacts are estimates, never used to warp the source pixels.
const measured=[
 {id:'archive-shelf',name:'旧铁档案架',file:'exec-7412b75b-164a-4812-bd3f-a63e88af6091.png',contacts:[[474,735],[997,1033],[772,1171],[299,874]],anchor:[648,953],scale:.108,heightProbe:[[771,502],[772,1171]],offset:[0,0]},
 {id:'drawing-rolls',name:'旧图筒架',file:'exec-85503a17-9f9c-4311-9778-d46b9caf7ac6.png',contacts:[[515,633],[1059,941],[801,1128],[240,794]],anchor:[650,880],scale:.075,heightProbe:[[530,154],[530,744]],offset:[2,0]},
 {id:'patched-stool',name:'补面矮凳',file:'exec-b21a3560-bdc9-420e-8dcf-14d2ac48e82e.png',contacts:[[620,714],[882,856],[632,1003],[371,851]],anchor:[626,858],scale:.10,heightProbe:[[632,750],[632,1003]],offset:[0,1]}
];
const assets=measured.map(m=>{
 const a=checks.find(a=>a.state===m.id),[x0,y0,x1,y1]=a.alphaBounds;
 const bodyWidth=Math.max(...m.contacts.map(p=>p[0]))-Math.min(...m.contacts.map(p=>p[0]));
 const source=`C:/Users/haoxian.huang/.codex/generated_images/01a199e0-bec6-7310-851c-5de06cae4c7b/${m.file}`;
 if(sha(source)!==a.sha256)throw Error('Original PNG differs: '+m.id);
 const refs=[{path:ref+m.id+'-geometry.png',role:'geometry edit target'},{path:'reference/street-thugs-v1/tier-1.png',role:'approved contour and painted volume reference'},{path:'assets/map/isometric/interactive-devices-v1/toolbench.png',role:'approved material reference, ignore base'},{path:'assets/dungeon/street-thug-boss-room-v6/'+(m.id==='patched-stool'?'factory-desk':'transit-rack')+'.png',role:'approved furnishing reference'}].map(r=>({...r,sha256:sha(r.path)}));
 return{id:m.id,name:m.name,src:root+m.id+'.png',size:[a.width,a.height],crop:[x0-6,y0-6,x1-x0+12,y1-y0+12],anchor:m.anchor,groundContacts:m.contacts,bodyGroundWidth:bodyWidth,scaleAt144:m.scale,bodyGroundWidthAt144:bodyWidth*m.scale,heightProbe:m.heightProbe,physicalHeightProbeAt144:(m.heightProbe[1][1]-m.heightProbe[0][1])*m.scale,logicalFootprint:[1,1],nativeFront:[0,1],fixedFacing:true,projectionMode:'native',offset:m.offset,sha256:a.sha256,originalSource:source,copiedWithoutModification:true,references:refs,prompt:root+'prompt-'+m.id+'.txt'};
});
const manifest={version:1,date:'2026-11-02',tool:'built-in image_gen',status:'approved-runtime',referenceTileWidth:144,referenceTileHeight:144/Math.SQRT2,playerDisplayScale:1.25,transform:'uniform scale and ground anchor only',shadow:'separate render layer',measurementNote:'Foot centers and probes are manually estimated; source alpha and native projection remain untouched. Hidden rear contacts are envelope estimates. Approved placement and blocking are shared by the formal generator and isolated review.',assets};
fs.writeFileSync(root+'manifest.json',JSON.stringify(manifest,null,2)+'\n');
console.log(assets.map(a=>({id:a.id,groundWidth:a.bodyGroundWidthAt144,physicalHeight:a.physicalHeightProbeAt144,alpha:checks.find(c=>c.state===a.id).transparent/(a.size[0]*a.size[1])})));
