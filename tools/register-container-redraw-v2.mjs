// Register the reviewed native art; do not edit or resample PNGs.
import fs from 'node:fs/promises';
const root=new URL('../',import.meta.url),read=async p=>JSON.parse(await fs.readFile(new URL(p,root),'utf8')),write=(p,v)=>fs.writeFile(new URL(p,root),JSON.stringify(v,null,2)+'\n');
const dir='assets/dungeon/containers-v2/',production=await read(dir+'production.json'),checks=await read(dir+'asset-checks.json'),main=await read('assets/dungeon/grid-scene-v1/registration.json'),{measurements}=await read('reference/dungeon-grid-scene-v1/qa/containers-v2-contact-measurements.json');
const overrides={'discarded-toolbox':'discarded-toolbox-clean','reused-fridge-searched':'reused-fridge-searched-right'},rows=[];
for(const m of measurements){
 const item=production.items[m.index],old=main.find(p=>p.id===item.id);if(!old)throw Error('Missing existing gameplay ID: '+item.id);
 const p={...old,sourceRoot:dir,tileWidth:m.width,projectionMode:'native',contactKind:m.round?'round silhouette':'ground corners',heightReference:'144px grid, 125% player; manually reviewed body or wheelbase contacts; uniform scale only; opened lids and doors excluded from scale'};
 for(const [j,state]of ['unsearched','searched'].entries()){
  const requested=item.file+(j?'-searched':''),file=overrides[requested]||requested,[w,h]=checks[file].size,s=Math.min(280/w,280/h),x=(m.index%2?598:16)+j*280+(280-w*s)/2,y=(m.index%4<2?95:431)+(280-h*s)/2;
  p[state]={file,contacts:m.points[j].map(([a,b])=>[Math.round((a-x)/s),Math.round((b-y)/s)])};item[state]=file;
 }
 item.tileWidth=m.width;item.status='integrated';rows.push(p);Object.assign(old,p);
}
production.status='integrated-awaiting-visual-review';production.selectedStateCount=rows.length*2;
await write(dir+'registration.json',rows);await write(dir+'production.json',production);await write('assets/dungeon/grid-scene-v1/registration.json',main);
console.log('Registered '+rows.length+' containers / '+rows.length*2+' redrawn native states.');
