import fs from 'node:fs';
import crypto from 'node:crypto';
import {inspectPng} from './inspect-device-png.mjs';
import {GYM_FOOTPRINTS} from './gym-art.mjs';
const base='assets/map/isometric/gym-facilities-v1/';
const calibrations=JSON.parse(fs.readFileSync(base+'calibration.json','utf8'));
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const records=fs.readdirSync(base+'records').filter(f=>f.endsWith('.json')).map(f=>JSON.parse(fs.readFileSync(base+'records/'+f,'utf8')));
if(!process.argv.includes('--partial')){
 const required=['floor','pullup','dumbbell','barbell','cable','leg','neck','hands','ankle','toes'].flatMap(key=>[1,2,3,4].map(level=>key+'-'+level)).concat('handsfeet-1');
 const keys=records.map(r=>r.key+'-'+r.level);
 if(keys.length!==required.length||new Set(keys).size!==required.length||required.some(k=>!keys.includes(k)))throw new Error('Expected 41 unique current assets');
 for(const r of records)if(['neck','leg','hands','ankle','toes'].includes(r.key)&&r.revision!==2)throw new Error('Superseded non-realistic artwork: '+r.key+'-'+r.level);
}
const assets=[];
for(const record of records){
 const c=calibrations[record.key+'-'+record.level];if(!c){if(process.argv.includes('--partial'))continue;throw new Error('Missing calibration '+record.key+'-'+record.level);}
 const info=inspectPng(record.file),contentSha256=sha(record.file),sourceSha256=sha(record.source);
 if(contentSha256!==sourceSha256)throw new Error('Original changed: '+record.file);
 // The image tool can leave a 1/255 alpha rounding trace at a corner; keep
 // the original bytes and reject visible backgrounds rather than editing it.
 if(info.transparentFraction<.15||info.cornerAlpha.some(a=>a>1))throw new Error('Transparency: '+record.file);
 const xs=c.contacts.map(p=>p[0]),ys=c.contacts.map(p=>p[1]);
 assets.push({key:record.key,level:record.level,file:record.file,crop:info.crop,anchor:c.anchor,groundCenter:c.anchor,groundContacts:c.contacts,scaleAt144:c.scale,width:info.crop[2]*c.scale,logicalFootprint:GYM_FOOTPRINTS[record.key]||[0,0],openFootprint:!!c.open,groundSpanPx:[(Math.max(...xs)-Math.min(...xs))*c.scale,(Math.max(...ys)-Math.min(...ys))*c.scale],heightReference:{...c.height,pixels:(c.height.points[1][1]-c.height.points[0][1])*c.scale},contentSha256,sourceSha256,png:{width:info.width,height:info.height,transparentFraction:info.transparentFraction,cornerAlpha:info.cornerAlpha},registrationNote:'Manual ground contacts / native orientation / uniform scale. Geometry and character comparison reviewed separately; candidate art, not user-approved.'});
}
fs.writeFileSync(base+'manifest.json',JSON.stringify({version:1,status:'candidate',standard:'docs/design/77-grid-scene-art-standard.md',tileWidth:144,pawnScale:1.25,assets},null,2)+'\n');
console.log('Registered '+assets.length+' original transparent gym assets.');
