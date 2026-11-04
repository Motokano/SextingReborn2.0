import fs from 'node:fs/promises';
const root=new URL('../assets/dungeon/street-thug-boss-room-v5/',import.meta.url);
const checks=JSON.parse(await fs.readFile(new URL('asset-checks.json',root),'utf8'));
// Measured visible ground contacts: left, nearest, right. These are source
// painting measurements, never inferred from crop width or PNG frame margins.
const data=[
 ['dining','factory-desk-low',[1,1],[[195,825],[628,1072],[1065,827]],[[195,666],[195,825]],[0,1]],
 ['chair','vinyl-armchair',[.60,.60],[[331,858],[648,1080],[957,866]],[[648,938],[648,1080]],[0,1]],
 ['sleeping','steel-cot',[1,2],[[101,866],[462,1120],[1134,652]],[[101,758],[101,866]],[1,0]],
 ['sideboard','metal-sideboard-low',[1,1],[[228,920],[619,1145],[1037,920]],[[228,740],[228,920]],[0,1]],
 ['fan','stopped-fan',[.125,.125],[[436,955],[650,1060],[865,950]],null,[0,1]],
 ['cargo','transit-rack',[1,2],[[150,935],[464,1146],[1135,710]],[[464,850],[464,1146]],[1,0]],
 ['mat','worn-mat',[2,1],[[63,493],[818,1029],[1182,791]],null,null],
 ['rubble','corner-rubble',[.9,.9],null,null,null],
 ['den-private','private-cache-low',[.92,.92],[[192,850],[625,1085],[1050,850]],[[625,896],[625,1085]],[0,1]],
 ['den-private-searched','private-cache-searched-low',[.92,.92],[[211,949],[609,1180],[1018,944]],[[609,1000],[609,1180]],[0,1]],
 ['den-basket','stolen-basket',[.9,.7],[[180,772],[688,1050],[1077,830]],[[688,760],[688,1050]],[1,0]],
 ['den-basket-searched','stolen-basket-searched',[.9,.7],[[180,772],[688,1050],[1077,830]],[[688,760],[688,1050]],[1,0]]
];
const make=([id,file,footprint,feet,probe,nativeFront])=>{
 const bb=checks[file].bbox,crop=[Math.max(0,bb[0]-3),Math.max(0,bb[1]-3),bb[2]-bb[0]+6,bb[3]-bb[1]+6];
 const out={id,src:file+'.png',crop,width:72*(footprint[0]+footprint[1]),footprint,probe,nativeFront};
 if(feet){const [l,n,r]=feet;out.anchor=[(l[0]+r[0])/2,(l[1]+r[1])/2];out.bodyWidth=r[0]-l[0];out.groundSlopes=[(n[1]-l[1])/(n[0]-l[0]),(r[1]-n[1])/(r[0]-n[0])];out.contacts={left:l,near:n,right:r};}
 else{out.anchor=[636,780];out.bodyWidth=849;}
 return out;
};
const rows=data.map(make),props=rows.filter(a=>!a.id.startsWith('den-'));
const containers=['den-private','den-basket'].map(id=>{const unsearched=rows.find(a=>a.id===id),searched=rows.find(a=>a.id===id+'-searched');return{id,width:unsearched.width,footprint:unsearched.footprint,nativeFront:unsearched.nativeFront,unsearched,searched};});
const manifest={version:1,status:'grid-first-cartoon-room-review',referenceTileWidth:144,styleReferences:['reference/street-thugs-v1/tier-1.png','assets/map/isometric/interactive-devices-v1/bed.png','assets/map/isometric/interactive-devices-v1/pharmacy.png','assets/map/isometric/interactive-devices-v1/warehouse.png'],props,containers,textures:{wall:'painted-plaster.png',floor:'painted-concrete.png'},note:'Original generated PNGs retained. Ground contacts measured on rigid source edges; one vertical-preserving registration aligns board axes. Generative paintings retain small residual contact errors, not pixel-exact geometry. Upper/lower container bodies are calibrated separately. Footprint fractions describe actual painted base; allocated collision cells are unchanged.'};
await fs.writeFile(new URL('manifest.json',root),JSON.stringify(manifest,null,2)+'\n');
console.log('Saved v5 artwork manifest: '+props.length+' props, 2 containers × 2 states, 2 textures.');
