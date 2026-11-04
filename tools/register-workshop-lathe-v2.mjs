import fs from 'node:fs/promises';
const root=new URL('../',import.meta.url),file=new URL('assets/dungeon/grid-scene-v1/registration.json',root);
const rows=JSON.parse(await fs.readFile(file,'utf8')),redraw=JSON.parse(await fs.readFile(new URL('assets/dungeon/workshop-lathe-v2/registration.json',root),'utf8'));
for(const p of redraw){const i=rows.findIndex(a=>a.id===p.id);if(i<0)throw Error('Unknown lathe ID '+p.id);rows[i]=p;}
await fs.writeFile(file,JSON.stringify(rows,null,2)+'\n');
console.log('Registered native 2×1 lathe, preserving the saved object ID.');
