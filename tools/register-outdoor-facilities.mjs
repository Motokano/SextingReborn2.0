import fs from 'node:fs';
const manifest=JSON.parse(fs.readFileSync('assets/map/isometric/farm-ranch-5x5-v1/manifest.json','utf8'));
const specs=Object.fromEntries(manifest.assets.map(a=>[a.id+'Outside',{
 source:a.file,crop:a.crop,anchor:a.anchor,groundCenter:a.anchor,
 width:a.crop[2]*a.scaleAt144,label:a.label,groundContacts:a.groundContacts,
 openFootprint:true,shadowBounds:[-380,-280,760,560]
}]));
const start='        // BEGIN GENERATED OUTDOOR FACILITIES',end='        // END GENERATED OUTDOOR FACILITIES';
const block=start+'\n        var outdoorSpecs = '+JSON.stringify(specs)+';\n'+
 '        Object.keys(outdoorSpecs).forEach(function(key){pawnSpecs[key]=outdoorSpecs[key];spriteSources[key]=outdoorSpecs[key].source;deviceFootprints[key]=[0,0];});\n'+end;
const p='js/core/tile-renderer-v2.js';let source=fs.readFileSync(p,'utf8');
if(source.includes(start))source=source.slice(0,source.indexOf(start))+block+source.slice(source.indexOf(end)+end.length);
else source=source.replace('        function deviceAppearanceKey(key, npcId) {',block+'\n        function deviceAppearanceKey(key, npcId) {');
fs.writeFileSync(p,source);
