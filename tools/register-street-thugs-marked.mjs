// Read-only PNG inspection and preview registration. Never modifies source artwork.
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {inspectPng} from './inspect-device-png.mjs';

const dir='assets/map/isometric/street-thugs-marked-v1/';
const generation=JSON.parse(fs.readFileSync(dir+'generation.json','utf8'));
const enemyIds={'tier-1':['enemy.street_thug_tier1','enemy.street_thug'],'tier-2':['enemy.street_thug_tier2'],'tier-3':['enemy.street_thug_tier3'],boss:['enemy.street_thug_boss']};
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const entries=generation.assets.map(a=>{
  const original=inspectPng(a.source),marked=inspectPng(a.marked);
  assert(marked.transparentFraction>.4);
  assert(marked.cornerAlpha.every(n=>n===0));
  assert.equal(sha(a.generated),sha(a.marked),'Keep generated PNG bytes unchanged');
  let normalSpec={src:a.source,crop:a.crop,anchor:a.anchor,scaleAt144:a.scale};
  let markedSpec={...normalSpec,src:a.marked};
  if(a.id==='tier-3'){
    // Generation changed canvas and uniformly rescaled the pawn. Match its measured
    // silhouette width and bottom contact, without any nonuniform stretch or pixel edits.
    normalSpec.crop=original.crop;
    const ratio=original.crop[2]/marked.crop[2];
    markedSpec={src:a.marked,crop:marked.crop,
      anchor:[marked.crop[0]+(a.anchor[0]-original.crop[0])/ratio,marked.crop[1]+marked.crop[3]],
      scaleAt144:a.scale*ratio};
  }else if(a.id==='boss'){
    normalSpec.crop=markedSpec.crop=[40,201,1488,642];
  }
  const pack=(spec,info)=>({...spec,pngSize:[info.width,info.height],alphaBounds:info.crop,
    transparentFraction:info.transparentFraction,cornerAlpha:info.cornerAlpha,sha256:sha(spec.src)});
  return {id:a.id,enemyIds:enemyIds[a.id],name:a.name,normal:pack(normalSpec,original),marked:pack(markedSpec,marked),
    prompt:dir+a.id+'-prompt.txt',generated:a.generated,
    references:a.references.map(path=>({path,sha256:sha(path)}))};
});
const manifest={version:1,date:'2026-11-03',status:'story-gated-runtime',tileWidth:144,pawnScale:1.25,
  groundOffsetY:10,marker:'two crossed matte brown packing-tape strips on exposed clothing',
  note:'Native orientation, uniform scale, separate ground shadow. Third-tier canvas differs; registration matches the existing pawn dimensions. Generated edits have minor detail differences; not lossless overlays. Runtime display is gated by the saved story flag 血腥开关; the flag is off by default.',
  entries};
fs.writeFileSync(dir+'manifest.json',JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify(entries.map(e=>({id:e.id,size:e.marked.pngSize,crop:e.marked.crop,anchor:e.marked.anchor,scale:e.marked.scaleAt144,sourcePixelsPreserved:true})),null,2));
