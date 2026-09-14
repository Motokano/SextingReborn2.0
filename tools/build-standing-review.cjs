const fs=require('node:fs');
const root='reference/pawn-standing-v2/';
const old=JSON.parse(fs.readFileSync('reference/pawn-kit-v1/hero/skin.json','utf8'));
// Display measurements in the approved appearance image's own 1215x1295 coordinate space.
// These values are NOT the pose-reference skeleton and do not modify it.
const boxes={
 base:[227,1017,750,220],
 rThigh:[401,788,197,164],lThigh:[588,788,195,164],
 rShin:[397,880,201,119],lShin:[588,880,201,119],
 rSole:[338,916,266,173],lSole:[580,921,260,176],
 rPalm:[300,731,136,134],lPalm:[741,731,136,134],
 rUpperArm:[343,477,146,204],lUpperArm:[690,477,146,204],
 rForearm:[313,583,122,185],lForearm:[743,583,122,185],
 abdomen:[398,634,386,189],chest:[403,470,368,260],
 head:[349,72,465,424]
};
const order=['base','rThigh','lThigh','rShin','lShin','rSole','lSole','rPalm','lPalm','rUpperArm','lUpperArm','rForearm','lForearm','abdomen','chest','head'];
const pieces=order.map(id=>{const src=old.modules.find(m=>m.id===id);const clip=id==='chest'?[0,0,1,.77]:id==='abdomen'?[0,.17,1,1]:id.includes('UpperArm')?[0,0,1,.77]:id.includes('Forearm')?[0,.17,1,1]:id.includes('Thigh')?[0,.12,1,.81]:id.includes('Shin')?[0,.18,1,.87]:id.includes('Palm')?[0,.27,1,1]:id.includes('Sole')?[0,.2,1,1]:[0,0,1,1];return {id,name:src.name,crop:src.crop,box:boxes[id],clip,pivot:[.5,.5],angleDeg:0,layer:order.indexOf(id),status:'manual appearance-space fit; review required'};});
fs.writeFileSync(root+'standing-bind.json',JSON.stringify({version:2,status:'P0 appearance review only; not accepted; no pose retargeting',coordinateSpace:'approved original image pixels; separate from reference skeleton',canvas:[1215,1295],source:'original.png',texture:'parts.png',pieces},null,2));
