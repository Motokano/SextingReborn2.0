import fs from 'node:fs';
import crypto from 'node:crypto';
import {inspectPng} from './inspect-device-png.mjs';
const base='assets/map/isometric/hideout-facilities-v2/';
const calibration=JSON.parse(fs.readFileSync(base+'calibration.json','utf8'));
const sources=JSON.parse(fs.readFileSync(base+'generation.json','utf8'));
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const assets=sources.map(source=>{
 const c=calibration[source.key],info=inspectPng(source.file),[l,f,r]=[c.left,c.front,c.right];
 const back=[l[0]+r[0]-f[0],l[1]+r[1]-f[1]],anchor=[(l[0]+r[0])/2,(l[1]+r[1])/2];
 const slopeResidual=(a,b)=>((b[1]-a[1])-Math.abs(b[0]-a[0])/Math.SQRT2)*c.scale;
 return {key:source.key,state:source.state,file:source.file,label:c.label,crop:info.crop,anchor,groundCenter:anchor,
  groundContacts:[back,r,f,l],width:info.crop[2]*c.scale,scaleAt144:c.scale,
  logicalFootprint:c.logicalFootprint||[1,1],offset:c.offset||[0,0],openFootprint:!!c.openFootprint,
  groundSpanPx:[(Math.max(back[0],r[0],f[0],l[0])-Math.min(back[0],r[0],f[0],l[0]))*c.scale,(Math.max(back[1],r[1],f[1],l[1])-Math.min(back[1],r[1],f[1],l[1]))*c.scale],
  heightReference:{kind:c.kind,points:c.heightSample,pixels:(c.heightSample[1][1]-c.heightSample[0][1])*c.scale},
  registrationNote:c.compound?'Compound object boundary; back point inferred, not a rectangular-plane fit.':c.round?'Support feet registration; do not fit or stretch round barrel contour.':'Three visible ground contacts estimated manually; back contact inferred by parallelogram.',
  nativeAxisResidualPx:c.compound||c.round?null:[slopeResidual(l,f),slopeResidual(r,f)],
  contentSha256:sha(source.file),sourceSha256:sha(source.source),png:{width:info.width,height:info.height,transparentFraction:info.transparentFraction,cornerAlpha:info.cornerAlpha}};
});
const manifest={version:2,standard:'docs/design/77-grid-scene-art-standard.md',tileWidth:144,pawnScale:1.25,assets};
fs.writeFileSync(base+'manifest.json',JSON.stringify(manifest,null,2)+'\n');
const compact=Object.fromEntries(assets.map(a=>[a.key+'Hideout'+(a.state==='damaged'?'Damaged':''),{crop:a.crop,anchor:a.anchor,groundCenter:a.groundCenter,groundContacts:a.groundContacts,width:a.width,label:a.label,offset:a.offset,openFootprint:a.openFootprint,source:a.file}]));
const block='        // BEGIN GENERATED HIDEOUT FACILITIES V2\n        var hideoutSpecs = '+JSON.stringify(compact)+';\n        Object.keys(hideoutSpecs).forEach(function (key) {\n            pawnSpecs[key] = hideoutSpecs[key];\n            spriteSources[key] = hideoutSpecs[key].source;\n            deviceFootprints[key] = [0,0];\n        });\n        // END GENERATED HIDEOUT FACILITIES V2';
const target='js/core/tile-renderer-v2.js';let code=fs.readFileSync(target,'utf8');
if(code.includes('// BEGIN GENERATED HIDEOUT FACILITIES V2'))code=code.replace(/        \/\/ BEGIN GENERATED HIDEOUT FACILITIES V2[\s\S]*?        \/\/ END GENERATED HIDEOUT FACILITIES V2/,block);
else code=code.replace('        function deviceAppearanceKey(key, npcId) {',block+'\n        function deviceAppearanceKey(key, npcId) {');
fs.writeFileSync(target,code);
console.log('Registered '+assets.length+' original transparent assets, native uniform scales and measured contacts.');
