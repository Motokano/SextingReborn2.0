import fs from 'node:fs';
// Historical rejected vector-art experiment. Runtime uses player-atlas-v1 (design 58).
import crypto from 'node:crypto';
import {renderOfficeHero} from '../assets/map/isometric/rig-calibration-v1/office-hero-skin.mjs';
const source=new URL('../assets/map/isometric/rig-calibration-v1/',import.meta.url);
const rig=JSON.parse(fs.readFileSync(new URL('skeleton.json',source)));
const bytes=fs.readFileSync(new URL('poses.json',source));
const poses=JSON.parse(bytes);
const out=new URL('../assets/map/isometric/player-office-rig-v1/',import.meta.url);
fs.mkdirSync(out,{recursive:true});
const files=poses.states.map(s=>{
 const filename=s.id+'.svg';
 fs.writeFileSync(new URL(filename,out),renderOfficeHero(rig,s));
 return {mask:s.destroyMask,id:s.id,file:filename};
});
fs.writeFileSync(new URL('manifest.json',out),JSON.stringify({rigId:rig.id,posesSha256:crypto.createHash('sha256').update(bytes).digest('hex'),partOrder:['head','chest','abdomen','lhand','rhand','lfoot','rfoot'],viewBox:[0,0,144,128],baseAnchor:[72,78],files},null,2));
console.log('Generated 128 transparent SVG pawns from the approved rig; no board or debug overlay.');
