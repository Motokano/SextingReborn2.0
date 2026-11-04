import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
const dir=new URL('../'+(process.argv[2]||'assets/dungeon/grid-scene-v1/').replace(/\/?$/,'/'),import.meta.url);
const production=await fs.readFile(new URL('production.json',dir),'utf8').then(JSON.parse).catch(()=>null);
const selected=production?.items?.every(p=>p.unsearched&&p.searched)?new Set(production.items.flatMap(p=>[p.unsearched+'.png',p.searched+'.png'])):null;
const sha=async path=>createHash('sha256').update(await fs.readFile(path)).digest('hex');
const records=[];
for(const name of await fs.readdir(new URL('prompts/',dir))){
 if(!name.endsWith('.json'))continue;
 const path=new URL('prompts/'+name,dir),record=JSON.parse(await fs.readFile(path,'utf8'));
 if(!record.source)throw Error('Missing source: '+name);
 records.push({name,path,record,sha256:await sha(record.source)});
}
const reused={'broken-fan.png':'../street-thug-boss-room-v6/stopped-fan.png','worn-mat.png':'../street-thug-boss-room-v6/worn-mat.png'};
const assets=[];
for(const name of await fs.readdir(dir)){
 if(!name.endsWith('.png'))continue;
 const hash=await sha(new URL(name,dir)),matches=records.filter(r=>r.sha256===hash);
 if(reused[name]){
  if(hash!==await sha(new URL(reused[name],dir)))throw Error('Reuse changed: '+name);
  assets.push({file:name,sha256:hash,source:reused[name],mode:'approved-v6-reuse'});
 }else{
  if(matches.length!==1)throw Error('Expected exact generated source for '+name+', found '+matches.length);
  const r=matches[0];if(!selected||selected.has(name))r.applied=name;
  assets.push({file:name,selected:!selected||selected.has(name),sha256:hash,source:r.record.source,promptRecord:'prompts/'+r.name,mode:'built-in image_gen',exactPromptAvailable:typeof r.record.prompt==='string'});
 }
}
for(const r of records){
 r.record.status=r.applied?'registered-current':'superseded-source-retained';
 if(r.applied)r.record.appliedFile=r.applied;
 await fs.writeFile(r.path,JSON.stringify(r.record,null,2)+'\n');
}
await fs.writeFile(new URL('provenance.json',dir),JSON.stringify({version:1,generatedCurrent:assets.filter(a=>a.mode==='built-in image_gen'&&a.selected!==false).length,retainedCandidates:assets.filter(a=>a.selected===false).length,reusedCurrent:assets.filter(a=>a.mode==='approved-v6-reuse').length,assets},null,2)+'\n');
console.log('Verified source hashes for '+assets.length+' PNGs.');
