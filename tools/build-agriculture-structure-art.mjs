import fs from 'node:fs/promises';
import { structureArtIds, structureArtFile } from './agriculture-structure-art.mjs';
const root=new URL('../',import.meta.url);
const defs=JSON.parse(await fs.readFile(new URL('data/agriculture-crop-defs.json',root),'utf8'));
const requirements=defs.crop_structure_requirements;
if(JSON.stringify(Object.keys(requirements).sort())!==JSON.stringify([...structureArtIds].sort()))throw Error('Crop structure illustration coverage mismatch');
const folder=new URL('assets/agriculture/structures-botanical-v1/',root);
await fs.mkdir(folder,{recursive:true});
const structures=[];
for(const [id,cropIds]of Object.entries(requirements)){
 const name=defs.crop_structure_labels[id],file=`${id}.svg`,combinations=[];
 await fs.writeFile(new URL(file,folder),structureArtFile(id,name)+'\n');
 for(const cropId of cropIds){
  const crop=defs.crops[cropId];if(crop?.required_crop_structure_id!==id)throw Error(`Conflicting structure requirement: ${cropId}`);
  const comboFile=`${cropId}--${id}.svg`;
  await fs.writeFile(new URL(comboFile,folder),structureArtFile(id,`${crop.name} · ${name}`,cropId)+'\n');
  combinations.push({cropId,name:crop.name,file:comboFile});
 }
 structures.push({id,name,file,combinations});
}
const dependent=Object.values(defs.crops).filter(c=>c.required_crop_structure_id);
if(dependent.length!==structures.reduce((sum,s)=>sum+s.combinations.length,0))throw Error('Missing crop/structure combination');
await fs.writeFile(new URL('manifest.json',folder),JSON.stringify({version:1,status:'prototype',source:'data/agriculture-crop-defs.json',artSource:'tools/agriculture-structure-art.mjs',viewBox:[0,0,100,100],layers:['structure-back','crop','structure-front'],structures},null,2)+'\n');
console.log(`Exported ${structures.length} structures and ${dependent.length} crop/structure combinations.`);
