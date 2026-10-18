import {readFile,writeFile} from 'node:fs/promises';
import {createBladeForge} from './blade-forging/core.mjs';
import {createWorkshop} from './forging-workshop/core.mjs';
const read=path=>readFile(new URL(path,import.meta.url),'utf8');
const [base,extra,requirements,levels,stats,html,css,js,fx,symbols,symbolCSS]=await Promise.all([
 '../docs/design/examples/weapon-forging-ores-v1.json','../docs/design/examples/weapon-ore-intrinsic-traits-v1.json',
 '../docs/design/examples/weapon-forging-material-requirements-v1.json','./blade-forging/levels.json',
 '../docs/design/weapon-component-final-stats-draft.md','./forging-workshop/game.html','./forging-workshop/game.css','./forging-workshop/game.js','./blade-forging/effects.js','./blade-forging/symbols.js','./blade-forging/symbols.css'
].map(read));
const b=JSON.parse(base),e=JSON.parse(extra),req=JSON.parse(requirements),catalog=JSON.parse(levels);
const statMap=new Map();
const position=(text,slot)=>{const m=text.match(/(钝击|劈|刺) (\d+)/);return m?{slot,damageType:m[1],basePower:+m[2]}:null;};
for(const line of stats.split(/\r?\n/)){
 const cells=line.split('|').map(x=>x.trim());
 const single=cells[2]?.match(/^([BTDH]\d{2}) /),multi=cells[1]?.match(/^(M\d{2}-T[1-6]) /);
 if(single){const id=single[1],category=id[0],slot=category==='T'?'front':category==='H'?'hilt':'side';statMap.set(id,{positions:[position(cells[3],slot)],strength:+cells[4],weight:+cells[5],durability:+cells[6],speed:parseFloat(cells[7]),canBlock:['B','D'].includes(category)||category==='H'&&cells[8]==='是'});}
 if(multi){statMap.set(multi[1],{positions:[position(cells[2],'front'),position(cells[3],'side1'),position(cells[4],'side2')].filter(Boolean),strength:+cells[5],weight:+cells[6],durability:+cells[7],speed:parseFloat(cells[8]),canBlock:true});}
}
const components=catalog.levels.map(level=>({...req.components.find(c=>c.id===level.id),...statMap.get(level.id),category:level.category,level}));
if(components.length!==83||components.some(c=>!c.positions?.length||!c.weight||!c.durability))throw Error('Incomplete 83-part stats');
const ores=[...b.ores,...e.oreAdditions].map(o=>({...o,trait:e.intrinsicTraits.find(t=>t.oreId===o.id)}));
const data={version:1,ores,components,categories:catalog.categories,chapters:catalog.chapters};
const script=createBladeForge.toString()+'\n'+createWorkshop.toString()+'\nconst WORKSHOP_DATA='+JSON.stringify(data).replace(/</g,'\\u003c')+';\n'+symbols+'\n'+fx+'\n'+js;
const output=html.replace('/* INLINE_STYLE */',()=>css+'\n'+symbolCSS).replace('/* INLINE_SCRIPT */',()=>script);
if(/<script[^>]+src=|<link[^>]+href=|fetch\(/.test(output))throw Error('Standalone output has external dependency');
for(const name of ['forging-workshop-demo.html','百炼工坊-完整铸造试玩.html'])await writeFile(new URL('./'+name,import.meta.url),output);
await writeFile(new URL('./forging-workshop/catalog.json',import.meta.url),JSON.stringify(data,null,2)+'\n');
console.log('Built independent workshop: 12 ores, 83 parts, '+Buffer.byteLength(output)+' bytes.');
