// Export the prototype drawings as standalone transparent SVGs, with exact catalog coverage.
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { cropArtIds, cropArtFile } from './agriculture-crop-art.mjs';
const root=new URL('../',import.meta.url);
const defs=JSON.parse(await fs.readFile(new URL('data/agriculture-crop-defs.json',root),'utf8'));
const expected=Object.keys(defs.crops).sort(),actual=[...cropArtIds].sort();
if(JSON.stringify(expected)!==JSON.stringify(actual))throw Error(`Crop artwork coverage mismatch: missing ${expected.filter(id=>!actual.includes(id))}; extra ${actual.filter(id=>!expected.includes(id))}`);
const files=Object.entries(defs.crops).map(([id,crop])=>({id,crop,svg:cropArtFile(id,crop.name)}));
const hashes=new Set(files.map(({svg})=>createHash('sha256').update(svg.replace(/<title>.*?<\/title>/,'')).digest('hex')));
if(hashes.size!==files.length)throw Error('Different crops must not silently reuse the same drawing');
const target=new URL('assets/agriculture/crops-botanical-v1/',root);
await fs.mkdir(target,{recursive:true});
for(const {id,svg}of files)await fs.writeFile(new URL(`${id}.svg`,target),svg+'\n');
const manifest={version:1,status:'prototype',source:'data/agriculture-crop-defs.json',artSource:'tools/agriculture-crop-art.mjs',viewBox:[0,0,100,100],anchor:[50,88],stage:'mature-identification',crops:files.map(({id,crop})=>({id,name:crop.name,group:crop.group,file:`${id}.svg`}))};
await fs.writeFile(new URL('manifest.json',target),JSON.stringify(manifest,null,2)+'\n');
const names={grain:'谷物',veg:'蔬菜',aromatics:'葱姜香草',spice:'香料',fruit:'果实'};
const cols=10,w=1560,h=130+Math.ceil(files.length/cols)*184;
const cards=files.map(({id,crop,svg},i)=>{
 const x=30+(i%cols)*150,y=108+Math.floor(i/cols)*184;
 const drawing=svg.replace('<svg ',`<svg x="14" y="8" width="112" height="112" `);
 return `<g transform="translate(${x} ${y})"><rect width="140" height="174" rx="9" fill="#2c3c2e" stroke="#65764d" stroke-opacity=".32"/><text x="10" y="17" fill="#a3af92" opacity=".55" font-size="9">${String(i+1).padStart(2,'0')}</text>${drawing}<text x="70" y="141" text-anchor="middle" font-size="13" fill="#e6e7d4">${crop.name}</text><text x="70" y="160" text-anchor="middle" font-size="9" fill="#a3af92">${names[crop.group]}</text></g>`;
}).join('');
await fs.writeFile(new URL('contact-sheet.svg',target),`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="Noto Sans SC, Microsoft YaHei, sans-serif"><rect width="${w}" height="${h}" fill="#202d26"/><text x="32" y="55" font-size="28" fill="#e6e7d4">作物图鉴</text><text x="1528" y="51" text-anchor="end" font-size="14" fill="#c8b781">${files.length} 种作物</text><path d="M30 78H1530" stroke="#65764d" stroke-opacity=".5"/>${cards}</svg>\n`);
console.log(`Exported ${files.length} unique crop illustrations; formal catalog coverage ${files.length}/${expected.length}.`);
