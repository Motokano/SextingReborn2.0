import fs from 'node:fs';
import crypto from 'node:crypto';
import {inspectPng} from './inspect-device-png.mjs';
const base='assets/map/isometric/gym-room-v1/';
const calibration={
  locker:{anchor:[637,1030],scaleAt144:.13,groundContacts:[[595,841],[938,1046],[674,1218],[341,1047]],heightReference:{name:'柜体',px:93.34}},
  bench:{anchor:[745,692],scaleAt144:.13,groundContacts:[[216,577],[433,485],[1264,876],[1015,984]],openFootprint:true,heightReference:{name:'座面',px:28}},
  crate:{anchor:[620,825],scaleAt144:.078,groundContacts:[[600,511],[1106,792],[584,1125],[125,793]],heightReference:{name:'箱体',px:25}},
  fittings_x:{anchor:[620,500],scaleAt144:.16,wallMounted:true},
  fittings_y:{anchor:[625,500],scaleAt144:.16,wallMounted:true}
};
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const assets=[];
for(const id of [...Object.keys(calibration),'wall_material','floor_material']){
  const record=JSON.parse(fs.readFileSync(base+'records/'+id+'.json','utf8').replace(/^\uFEFF/,''));
  const data=fs.readFileSync(record.file),material=id.endsWith('_material');
  const info=material?{width:data.readUInt32BE(16),height:data.readUInt32BE(20)}:inspectPng(record.file);
  if(sha(record.source)!==sha(record.file))throw Error('Original pixels changed '+id);
  if(!material&&(info.transparentFraction<.15||info.cornerAlpha.some(a=>a>1)))throw Error('Alpha '+id);
  assets.push({id,file:record.file,source:record.source,contentSha256:sha(record.file),material,...info,...calibration[id]});
}
fs.writeFileSync(base+'manifest.json',JSON.stringify({version:1,status:'candidate',standard:'docs/design/77-grid-scene-art-standard.md',tileWidth:144,pawnScale:1.25,assets},null,2)+'\n');
console.log('7 original room assets registered; alpha and source hashes verified.');
