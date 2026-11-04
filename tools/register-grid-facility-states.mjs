import fs from 'node:fs/promises';
const dir=new URL('../assets/dungeon/grid-scene-v1/',import.meta.url),rows=JSON.parse(await fs.readFile(new URL('registration.json',dir),'utf8'));
for(const p of rows.filter(p=>p.normal)){
 const states=p.id==='canteen-food-crate'?['partial','low','searched']:p.category==='recovery'||p.category==='insight'?['used']:[];
 for(const state of states){const file=p.id+'-'+state;await fs.access(new URL(file+'.png',dir));p[state]={file,contacts:p.normal.contacts};}
}
// Keep the real feet inside their occupied cells; do not scale from lid/handle silhouette.
for(const p of rows){
 let width=p.tileWidth;
 for(const key of ['normal','unsearched','searched','used','partial','low']){
  const a=p[key];if(!a)continue;const [l,n,r]=a.contacts,positive=(n[0]-l[0])/(r[0]-l[0]),negative=1-positive;
  const [fw,fd]=p.logicalFootprint||[1,1];
  width=Math.min(width,.98*fw/(2*positive),.98*fd/(2*negative));
 }
 p.tileWidth=Math.round(width*1000)/1000;
}
await fs.writeFile(new URL('registration.json',dir),JSON.stringify(rows,null,2)+'\n');
