import fs from 'node:fs/promises';
import {groundRegistration} from './street-thug-boss-room-projection.mjs';
const root=new URL('../assets/dungeon/street-thug-boss-room-v6/',import.meta.url);
const source=JSON.parse(await fs.readFile(new URL('../street-thug-boss-room-v5/manifest.json',root),'utf8'));
const checks=JSON.parse(await fs.readFile(new URL('asset-checks.json',root),'utf8'));
// Rigid floor contacts are remeasured after generative editing. Texture edits
// can still change framing; crop size must never determine the display scale.
const edits={
 dining:{src:'factory-desk.png',feet:[[87,779],[626,1107],[1165,777]],probe:[[87,583],[87,779]]},
 sleeping:{src:'steel-cot.png'},chair:{src:'vinyl-armchair.png'},
 sideboard:{src:'metal-sideboard.png',feet:[[195,907],[620,1162],[1065,911]],probe:[[620,956],[620,1162]]},
 cargo:{src:'transit-rack.png',feet:[[113,945],[456,1185],[1172,716]],probe:[[456,872],[456,1185]]},
 mat:{src:'worn-mat.png'},
 'den-private':{src:'private-cache.png'},'den-private-searched':{src:'private-cache-searched.png'}
};
function update(a){
 const e=edits[a.id]||{},out={...a,...e};delete out.feet;
 const c=checks[out.src.replace('.png','')],b=c.bbox;
 const x=Math.max(0,b[0]-3),y=Math.max(0,b[1]-3);
 out.crop=[x,y,Math.min(c.size[0],b[2]+3)-x,Math.min(c.size[1],b[3]+3)-y];
 if(e.feet){const [l,n,r]=e.feet;out.anchor=[(l[0]+r[0])/2,(l[1]+r[1])/2];out.bodyWidth=r[0]-l[0];out.groundSlopes=[(n[1]-l[1])/(n[0]-l[0]),(r[1]-n[1])/(r[0]-n[0])];out.contacts={left:l,near:n,right:r};}
 return out;
}
const manifest={...source,status:'lived-in-grid-first-room-review',props:source.props.map(update),containers:source.containers.map(c=>({...c,unsearched:update(c.unsearched),searched:update(c.searched)})),
 narrativeSources:['docs/design/30-story-outline-blackout.md','docs/design/45-battery-economy.md'],
 note:'Occupied industrial room: localized use, repair and uneven daily clutter, with clear walking routes. Original generated PNGs retained, source foot contacts remeasured. Registration preserves upright verticals; AI paintings retain small residual contact/contour differences. These are review assets, not changes to formal fourth-floor generation.'};
await fs.writeFile(new URL('manifest.json',root),JSON.stringify(manifest,null,2)+'\n');
const contacts=[];
for(const a of [...manifest.props,...manifest.containers.flatMap(c=>[c.unsearched,c.searched])]){
 if(!a.contacts)continue;
 const matrix=groundRegistration(a.groundSlopes),scale=a.width/a.bodyWidth,[w,h]=a.footprint;
 const expected={left:[-36*(w+h),144/Math.SQRT2*(h-w)/4],near:[36*(w-h),144/Math.SQRT2*(w+h)/4],right:[36*(w+h),144/Math.SQRT2*(w-h)/4]};
 const errors=Object.fromEntries(Object.entries(a.contacts).map(([id,p])=>{const dx=p[0]-a.anchor[0],dy=p[1]-a.anchor[1],target=expected[id];return[id,Math.hypot(dx*scale-target[0],(matrix[1]*dx+matrix[3]*dy)*scale-target[1])];}));
 contacts.push({id:a.id,errorsPx:errors,maxErrorPx:Math.max(...Object.values(errors))});
}
await fs.writeFile(new URL('ground-contact-checks.json',root),JSON.stringify({referenceTileWidth:144,note:'Measured visible contacts only; hidden rear foot and all contour edges are not asserted exact.',contacts},null,2)+'\n');
console.log('Saved v6 manifest: 14 selected PNGs, same floor footprints and collision layout.');
